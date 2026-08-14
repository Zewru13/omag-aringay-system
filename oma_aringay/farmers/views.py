from django.db import transaction
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from accounts.models import User
from accounts.utils import create_citizen_user
from core.utils import day_range_bounds

from .models import Farmer, FarmCrop, FarmMachinery, FarmParcel
from .serializers import (
    FarmCropSerializer,
    FarmerCreateSerializer,
    FarmerDetailSerializer,
    FarmerListSerializer,
    FarmMachinerySerializer,
    FarmParcelSerializer,
)


class FarmerListView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return FarmerCreateSerializer

        return FarmerListSerializer

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_queryset(self):
        from django.utils.timezone import now
        queryset = Farmer.objects.all().order_by('-date_registered')
        search = self.request.query_params.get('search')
        status_filter = self.request.query_params.get('status')
        gender_filter = self.request.query_params.get('gender')
        is_senior = self.request.query_params.get('is_senior')

        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(middle_name__icontains=search)
                | Q(rsbsa_number__icontains=search)
                | Q(barangay__icontains=search)
            )

        if status_filter:
            status_value = status_filter.lower()
            if status_value in ['active', 'true', '1']:
                queryset = queryset.filter(is_active=True)
            elif status_value in ['inactive', 'false', '0']:
                queryset = queryset.filter(is_active=False)

        if gender_filter:
            queryset = queryset.filter(gender__iexact=gender_filter)

        if is_senior and is_senior.lower() == 'true':
            today = now().date()
            senior_cutoff = today.replace(year=today.year - 60)
            queryset = queryset.filter(birthdate__lte=senior_cutoff)

        is_icc_ip = self.request.query_params.get('is_icc_ip')
        if is_icc_ip is not None:
            queryset = queryset.filter(is_icc_ip_member=(is_icc_ip.lower() in ('true', '1')))

        is_pwd = self.request.query_params.get('is_pwd')
        if is_pwd is not None:
            queryset = queryset.filter(is_pwd=(is_pwd.lower() in ('true', '1')))

        organization_filter = self.request.query_params.get('farmers_organization')
        if organization_filter is not None:
            queryset = queryset.filter(farmers_organization_id=organization_filter)

        registered_from = self.request.query_params.get('registered_from')
        if registered_from:
            bound = day_range_bounds(registered_from)
            if bound:
                queryset = queryset.filter(date_registered__gte=bound)

        registered_to = self.request.query_params.get('registered_to')
        if registered_to:
            bound = day_range_bounds(registered_to, end_of_day=True)
            if bound:
                queryset = queryset.filter(date_registered__lte=bound)

        return queryset

    def perform_create(self, serializer):
        # is_farm_laborer farmers never get a citizen account (no farm of
        # their own to report on — same exclusion create_citizen_accounts
        # applies), regardless of whether a password was submitted.
        with transaction.atomic():
            serializer.save(registered_by=self.request.user)
            farmer = serializer.instance
            password = getattr(farmer, '_citizen_password', '')
            if password and not farmer.is_farm_laborer:
                create_citizen_user(User.LinkedRecordType.FARMER, farmer, password, email=farmer.email)


class FarmerCreateView(generics.CreateAPIView):
    """
    NOTE: not called by any current frontend code — AddFarmerModal.jsx
    posts to '/farmers/' (FarmerListView above), not '/farmers/create/'.
    Kept in the same shape as FarmerListView.perform_create so it doesn't
    silently regress to the old temp-password-free behavior if something
    starts using it.
    """
    queryset = Farmer.objects.all()
    serializer_class = FarmerCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save(registered_by=self.request.user)
            farmer = serializer.instance
            password = getattr(farmer, '_citizen_password', '')
            if password and not farmer.is_farm_laborer:
                create_citizen_user(User.LinkedRecordType.FARMER, farmer, password, email=farmer.email)


class FarmerDetailView(generics.RetrieveUpdateAPIView):
    queryset = Farmer.objects.all()
    serializer_class = FarmerDetailSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def update(self, request, *args, **kwargs):
        if 'is_active' in request.data and request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only an Admin can change a farmer\'s status.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        return super().update(request, *args, **kwargs)


class FarmerDeleteView(generics.DestroyAPIView):
    queryset = Farmer.objects.all()
    serializer_class = FarmerDetailSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    lookup_field = 'id'


class FarmParcelListView(generics.ListCreateAPIView):
    serializer_class = FarmParcelSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FarmParcel.objects.filter(
            farmer_id=self.kwargs['farmer_id'],
        ).order_by('id')

    def perform_create(self, serializer):
        serializer.save(farmer_id=self.kwargs['farmer_id'])


class FarmParcelCreateView(generics.CreateAPIView):
    serializer_class = FarmParcelSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def perform_create(self, serializer):
        serializer.save(farmer_id=self.kwargs['farmer_id'])


class FarmCropListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmCropSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FarmCrop.objects.filter(farm_parcel_id=self.kwargs['parcel_id'])

    def perform_create(self, serializer):
        if serializer.validated_data.get('is_main_crop'):
            FarmCrop.objects.filter(
                farm_parcel_id=self.kwargs['parcel_id'],
                is_main_crop=True,
            ).update(is_main_crop=False)
        serializer.save(farm_parcel_id=self.kwargs['parcel_id'])


class FarmCropDeleteView(generics.DestroyAPIView):
    queryset = FarmCrop.objects.all()
    serializer_class = FarmCropSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    lookup_field = 'id'


class FarmMachineryListCreateView(generics.ListCreateAPIView):
    serializer_class = FarmMachinerySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        return FarmMachinery.objects.filter(farm_parcel_id=self.kwargs['parcel_id'])

    def perform_create(self, serializer):
        serializer.save(farm_parcel_id=self.kwargs['parcel_id'])


class FarmMachineryDeleteView(generics.DestroyAPIView):
    queryset = FarmMachinery.objects.all()
    serializer_class = FarmMachinerySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    lookup_field = 'id'


class FarmerDuplicateCheckView(APIView):
    """GET /api/farmers/check-duplicate/?first_name=&last_name=&birth_date="""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        first_name = request.query_params.get('first_name', '').strip()
        last_name  = request.query_params.get('last_name',  '').strip()
        birth_date = request.query_params.get('birth_date', '').strip()

        if not first_name or not last_name:
            return Response({'duplicates': []})

        qs = Farmer.objects.filter(
            first_name__iexact=first_name,
            last_name__iexact=last_name,
        )
        if birth_date:
            qs = qs.filter(birthdate=birth_date)

        duplicates = [
            {
                'id': f.id,
                'full_name': f.full_name,
                'barangay': f.barangay,
                'rsbsa_number': f.rsbsa_number,
                'birth_date': str(f.birthdate) if f.birthdate else None,
            }
            for f in qs[:5]
        ]
        return Response({'duplicates': duplicates})
