from django.db import transaction
from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from accounts.models import User
from accounts.utils import create_inactive_citizen_shell
from core.utils import day_range_bounds, filter_people_search

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
        from django.utils.timezone import localdate
        queryset = Farmer.objects.all().order_by('-date_registered', '-id')
        search = self.request.query_params.get('search')
        status_filter = self.request.query_params.get('status')
        gender_filter = self.request.query_params.get('gender')
        is_senior = self.request.query_params.get('is_senior')

        if search:
            # Full-name search fix: a single field's icontains against the
            # whole search string can never match "First Last" against
            # separate first_name/last_name columns — build_name_search_q
            # splits on whitespace and requires every token to hit some name
            # field, so "Juan dela Cruz" correctly matches first_name="Juan"
            # + last_name="Dela Cruz". rsbsa_number/barangay stay whole-
            # string OR alternatives alongside the name match, unchanged.
            queryset = filter_people_search(
                queryset, search,
                name_fields=['first_name', 'middle_name', 'last_name'],
                id_fields=['rsbsa_number'],
                other_fields=['barangay'],
            )

        if status_filter:
            status_value = status_filter.lower()
            if status_value in ['active', 'true', '1']:
                queryset = queryset.filter(is_active=True)
            elif status_value in ['inactive', 'false', '0']:
                queryset = queryset.filter(is_active=False)

        if gender_filter:
            queryset = queryset.filter(gender__iexact=gender_filter)

        # Replaces the old FarmParcel.farm_type-based filter (Irrigated/
        # Rainfed/etc.) — that field lives on FarmParcel, not Farmer, and is
        # blank on every real parcel (confirmed against live data), so the
        # old filter never actually narrowed anything. is_farm_laborer is a
        # real Farmer field with real variation in live data (RSBSA/BFAR
        # import's farmworker=YES vs farmer!=YES — see the model's own
        # comment) and already drives this same page's "Farmer Type" badge.
        farmer_type_filter = self.request.query_params.get('is_farm_laborer')
        if farmer_type_filter is not None:
            queryset = queryset.filter(is_farm_laborer=(farmer_type_filter.lower() in ('true', '1')))

        if is_senior and is_senior.lower() == 'true':
            # Senior from the 60th birthday, counted on the Manila calendar day (not the UTC day, which is
            # still "yesterday" for the first 8 hours of each Manila day).
            today = localdate()
            senior_cutoff = today.replace(year=today.year - 60)
            queryset = queryset.filter(birthdate__lte=senior_cutoff)

        is_icc_ip = self.request.query_params.get('is_icc_ip')
        if is_icc_ip is not None:
            queryset = queryset.filter(is_icc_ip_member=(is_icc_ip.lower() in ('true', '1')))

        is_pwd = self.request.query_params.get('is_pwd')
        if is_pwd is not None:
            queryset = queryset.filter(is_pwd=(is_pwd.lower() in ('true', '1')))

        # Batch (Phase B): farmers_organization is no longer a field on
        # Farmer — filters through the real join table instead. distinct()
        # since a farmer could theoretically match via more than one active
        # membership row for the same org id (shouldn't happen given the
        # model's unique_together, but the join can still produce dup rows
        # without it if this filter is ever combined with another join).
        organization_filter = self.request.query_params.get('farmers_organization')
        if organization_filter is not None:
            queryset = queryset.filter(
                farmer_organizations__organization_id=organization_filter,
                farmer_organizations__is_active=True,
            ).distinct()

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
        # applies). Everyone else gets an inactive shell immediately, ready
        # for a later in-person "Set Up Account" visit
        # (ActivateCitizenAccountButton / SetCitizenPasswordView) — staff no
        # longer type or see a password at enrollment time.
        with transaction.atomic():
            serializer.save(registered_by=self.request.user)
            farmer = serializer.instance
            if not farmer.is_farm_laborer:
                create_inactive_citizen_shell(User.LinkedRecordType.FARMER, farmer, email=farmer.email)


class FarmerCreateView(generics.CreateAPIView):
    """
    NOTE: not called by any current frontend code — AddFarmerModal.jsx
    posts to '/farmers/' (FarmerListView above), not '/farmers/create/'.
    Kept in the same shape as FarmerListView.perform_create so it doesn't
    silently regress if something starts using it.
    """
    queryset = Farmer.objects.all()
    serializer_class = FarmerCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def perform_create(self, serializer):
        with transaction.atomic():
            serializer.save(registered_by=self.request.user)
            farmer = serializer.instance
            if not farmer.is_farm_laborer:
                create_inactive_citizen_shell(User.LinkedRecordType.FARMER, farmer, email=farmer.email)


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


class MyFarmParcelListView(generics.ListAPIView):
    """A farmer citizen's OWN registered parcels, read-only. The staff parcel
    list is admin/evaluator-only, so the citizen app had no way to count a
    farmer's parcels; this serves only the parcels of the farmer the signed-in
    account is linked to, and nothing for anyone else."""
    serializer_class = FarmParcelSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_queryset(self):
        user = self.request.user
        farmer_id = user.get_linked_farmer_id() if user.role == 'CITIZEN' else None
        return FarmParcel.objects.filter(farmer_id=farmer_id if farmer_id else -1).order_by('id')


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
