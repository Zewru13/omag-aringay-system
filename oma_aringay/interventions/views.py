import csv
from collections import Counter

from django.db.models import Q
from django.http import HttpResponse
from django.shortcuts import get_object_or_404
from rest_framework import generics
from rest_framework import status as drf_status
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator, IsCitizen

from .models import BeneficiaryRecord, FisherfolkBeneficiaryRecord, InterventionProgram
from .serializers import (
    BeneficiaryRecordCreateSerializer,
    FisherfolkBeneficiaryRecordCreateSerializer,
    InterventionProgramSerializer,
)


class BeneficiaryPagination(PageNumberPagination):
    page_size = 15


class ProgramListView(generics.ListCreateAPIView):
    queryset = InterventionProgram.objects.all().order_by('-date_created')
    serializer_class = InterventionProgramSerializer
    permission_classes = [IsAuthenticated]
    pagination_class = None

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProgramCreateView(generics.CreateAPIView):
    queryset = InterventionProgram.objects.all()
    serializer_class = InterventionProgramSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def perform_create(self, serializer):
        serializer.save(created_by=self.request.user)


class ProgramDetailView(generics.RetrieveUpdateAPIView):
    queryset = InterventionProgram.objects.all()
    serializer_class = InterventionProgramSerializer
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]


class BeneficiaryListView(generics.ListCreateAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    pagination_class = None

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['program'] = InterventionProgram.objects.get(
            id=self.kwargs['program_id'],
        )
        return context

    def get_queryset(self):
        queryset = BeneficiaryRecord.objects.filter(
            program_id=self.kwargs['program_id'],
        ).select_related('farmer', 'program').order_by('-date_given', '-id')

        search = self.request.query_params.get('search')
        barangay = self.request.query_params.get('barangay')

        if search:
            queryset = queryset.filter(
                Q(farmer__first_name__icontains=search)
                | Q(farmer__last_name__icontains=search)
                | Q(farmer__middle_name__icontains=search)
                | Q(farmer__rsbsa_number__icontains=search)
            )

        if barangay:
            queryset = queryset.filter(farmer__barangay__iexact=barangay)

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            program_id=self.kwargs['program_id'],
            recorded_by=self.request.user,
        )


class BeneficiaryCreateView(generics.CreateAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['program'] = InterventionProgram.objects.get(
            id=self.kwargs['program_id'],
        )
        return context

    def perform_create(self, serializer):
        serializer.save(
            program_id=self.kwargs['program_id'],
            recorded_by=self.request.user,
        )


class BeneficiaryDeleteView(generics.DestroyAPIView):
    queryset = BeneficiaryRecord.objects.all()
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    lookup_field = 'id'


# ─── Ad-hoc (program=null) beneficiary records (Batch 6) ───────────────────
# Absorbs production.CropAssistanceRecord's list/create/detail contract.
# Scoped to program__isnull=True so this endpoint can never touch a
# program-based row — that stays exclusively reachable through the
# programs/<id>/beneficiaries/ endpoints above.

class BeneficiaryAdHocListCreateView(generics.ListCreateAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = BeneficiaryRecord.objects.filter(
            program__isnull=True,
        ).select_related('farmer', 'recorded_by').order_by('-date_given', '-id')
        params = self.request.query_params
        if params.get('farmer'):
            qs = qs.filter(farmer_id=params['farmer'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(farmer__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(program=None, recorded_by=self.request.user)


class BeneficiaryAdHocDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = BeneficiaryRecord.objects.filter(program__isnull=True).select_related('farmer')
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete assistance records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class FarmerInterventionHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, farmer_id):
        records = BeneficiaryRecord.objects.filter(
            farmer_id=farmer_id,
        ).select_related('program').order_by('-date_given', '-id')

        data = [
            {
                'program_name': record.program.program_name,
                'program_type': record.program.program_type,
                'season': record.program.season,
                'year': record.program.year,
                'quantity_given': record.quantity_given,
                'unit': record.unit,
                'date_given': record.date_given,
            }
            for record in records
        ]

        return Response(data)


class FisherfolkInterventionHistoryView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, fisherfolk_id):
        records = FisherfolkBeneficiaryRecord.objects.filter(
            fisherfolk_id=fisherfolk_id,
        ).select_related('program').order_by('-date_given', '-id')

        data = [
            {
                'program_name': record.program.program_name,
                'program_type': record.program.program_type,
                'season': record.program.season,
                'year': record.program.year,
                'quantity_given': record.quantity_given,
                'unit': record.unit,
                'date_given': record.date_given,
            }
            for record in records
        ]

        return Response(data)


class FisherfolkBeneficiaryListCreateView(generics.ListCreateAPIView):
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    pagination_class = None

    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_context(self):
        context = super().get_serializer_context()
        context['program'] = InterventionProgram.objects.get(
            id=self.kwargs['program_id'],
        )
        return context

    def get_queryset(self):
        queryset = FisherfolkBeneficiaryRecord.objects.filter(
            program_id=self.kwargs['program_id'],
        ).select_related('fisherfolk', 'program').order_by('-date_given', '-id')

        search = self.request.query_params.get('search')
        barangay = self.request.query_params.get('barangay')

        if search:
            queryset = queryset.filter(
                Q(fisherfolk__first_name__icontains=search)
                | Q(fisherfolk__last_name__icontains=search)
                | Q(fisherfolk__middle_name__icontains=search)
                | Q(fisherfolk__lgu_registration_number__icontains=search)
            )

        if barangay:
            queryset = queryset.filter(fisherfolk__barangay__iexact=barangay)

        return queryset

    def perform_create(self, serializer):
        serializer.save(
            program_id=self.kwargs['program_id'],
            recorded_by=self.request.user,
        )


class FisherfolkBeneficiaryDeleteView(generics.DestroyAPIView):
    queryset = FisherfolkBeneficiaryRecord.objects.all()
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    lookup_field = 'id'


# ─── Ad-hoc (program=null) fisherfolk beneficiary records (Batch 6) ────────
# Absorbs fisheries.FisheriesAssistanceRecord's list/create/detail contract.

class FisherfolkBeneficiaryAdHocListCreateView(generics.ListCreateAPIView):
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    pagination_class = None

    def get_queryset(self):
        qs = FisherfolkBeneficiaryRecord.objects.filter(
            program__isnull=True,
        ).select_related('fisherfolk', 'recorded_by').order_by('-date_given', '-id')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(program=None, recorded_by=self.request.user)


class FisherfolkBeneficiaryAdHocDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkBeneficiaryRecord.objects.filter(program__isnull=True).select_related('fisherfolk')
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete assistance records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class MyBeneficiaryHistoryView(generics.ListAPIView):
    """
    Batch 11: CITIZEN-only, read-only view of the caller's own assistance
    history — both program-based and ad hoc BeneficiaryRecord rows,
    resolved via get_linked_record() (never a farmer id from the request),
    so a citizen cannot pass someone else's id to see their history.
    """
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsCitizen]
    pagination_class = None

    def get_queryset(self):
        linked = self.request.user.get_linked_record()
        if linked is None:
            return BeneficiaryRecord.objects.none()
        return BeneficiaryRecord.objects.filter(
            farmer_id=linked.id,
        ).select_related('program', 'farmer', 'recorded_by').order_by('-date_given', '-id')


class MyFisherfolkBeneficiaryHistoryView(generics.ListAPIView):
    """Batch 11: fisherfolk equivalent of MyBeneficiaryHistoryView."""
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsCitizen]
    pagination_class = None

    def get_queryset(self):
        linked = self.request.user.get_linked_record()
        if linked is None:
            return FisherfolkBeneficiaryRecord.objects.none()
        return FisherfolkBeneficiaryRecord.objects.filter(
            fisherfolk_id=linked.id,
        ).select_related('program', 'fisherfolk', 'recorded_by').order_by('-date_given', '-id')


class BeneficiaryExportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request, id):
        program = get_object_or_404(InterventionProgram, id=id)
        records = BeneficiaryRecord.objects.filter(
            program=program,
        ).select_related('farmer').order_by('farmer__last_name', 'farmer__first_name', 'id')

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = (
            f'attachment; filename="program_{id}_beneficiaries.csv"'
        )

        writer = csv.writer(response)
        writer.writerow([
            'No.',
            'RSBSA Number',
            'Full Name',
            'Barangay',
            'Quantity Given',
            'Unit',
            'Date Given',
        ])

        total_quantity = 0
        units = []

        for index, record in enumerate(records, start=1):
            total_quantity += record.quantity_given
            units.append(record.unit)

            writer.writerow([
                index,
                record.farmer.rsbsa_number,
                record.farmer.full_name,
                record.farmer.barangay,
                record.quantity_given,
                record.unit,
                record.date_given,
            ])

        most_common_unit = Counter(units).most_common(1)
        unit = most_common_unit[0][0] if most_common_unit else ''

        writer.writerow([
            'TOTAL',
            '',
            '',
            '',
            total_quantity,
            unit,
            '',
        ])

        return response
