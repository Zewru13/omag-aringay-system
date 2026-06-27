from django.db.models import Q
from rest_framework import generics, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrEvaluator

from .models import Fisherfolk
from .serializers import (
    FisherfolkCreateSerializer,
    FisherfolkDetailSerializer,
    FisherfolkListSerializer,
)


class FisherfolkListView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated]

    def get_serializer_class(self):
        if self.request.method == 'POST':
            return FisherfolkCreateSerializer
        return FisherfolkListSerializer

    def get_permissions(self):
        if self.request.method == 'POST':
            return [IsAuthenticated(), IsAdminOrEvaluator()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_queryset(self):
        from django.utils.timezone import now
        queryset = Fisherfolk.objects.all().order_by('-date_registered')
        search = self.request.query_params.get('search')
        fisherfolk_type = self.request.query_params.get('type')
        status_filter = self.request.query_params.get('status')
        gender_filter = self.request.query_params.get('gender')
        is_senior = self.request.query_params.get('is_senior')

        if search:
            queryset = queryset.filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(middle_name__icontains=search)
                | Q(lgu_registration_number__icontains=search)
                | Q(barangay__icontains=search)
                | Q(fish_registration_number__icontains=search)
                | Q(boat_registration_number__icontains=search)
            )

        if fisherfolk_type:
            types = [t.strip() for t in fisherfolk_type.split(',') if t.strip()]
            if len(types) > 1:
                queryset = queryset.filter(fisherfolk_type__in=types)
            else:
                queryset = queryset.filter(fisherfolk_type__iexact=types[0])

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

        return queryset

    def perform_create(self, serializer):
        serializer.save(registered_by=self.request.user)


class FisherfolkCreateView(generics.CreateAPIView):
    queryset = Fisherfolk.objects.all()
    serializer_class = FisherfolkCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def perform_create(self, serializer):
        serializer.save(registered_by=self.request.user)


class FisherfolkDetailView(generics.RetrieveUpdateAPIView):
    queryset = Fisherfolk.objects.all()
    serializer_class = FisherfolkDetailSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def partial_update(self, request, *args, **kwargs):
        if 'is_active' in request.data and request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only admins can change active status.'},
                status=status.HTTP_403_FORBIDDEN,
            )
        return super().partial_update(request, *args, **kwargs)