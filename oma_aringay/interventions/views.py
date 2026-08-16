from rest_framework import generics
from rest_framework import status as drf_status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from accounts.permissions import IsAdminOrEvaluator, IsCitizen, IsOrgMemberRecordCitizen

from .models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from .serializers import (
    BeneficiaryRecordCreateSerializer,
    BeneficiaryRecordUpdateSerializer,
    FisherfolkBeneficiaryRecordCreateSerializer,
    FisherfolkBeneficiaryRecordUpdateSerializer,
)


class BeneficiaryRecordDetailView(generics.RetrieveUpdateAPIView):
    """
    Batch 12: GET/PATCH by id for any BeneficiaryRecord, shared by staff
    (unrestricted, via IsOrgMemberRecordCitizen's ADMIN/EVALUATOR bypass)
    and ORGANIZATION citizens (own-submitted, own-member entries only).
    """
    queryset = BeneficiaryRecord.objects.select_related('farmer')
    serializer_class = BeneficiaryRecordUpdateSerializer
    permission_classes = [IsAuthenticated, IsOrgMemberRecordCitizen]
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_person_id(self, obj):
        return obj.farmer_id

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id


class BeneficiaryAdHocListCreateView(generics.ListCreateAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    pagination_class = None

    def get_permissions(self):
        # Batch 12: LIST stays staff-only — an ORGANIZATION citizen browsing
        # every record here would see other organizations'/staff's
        # submissions for shared members. CREATE opens to them via
        # IsOrgMemberRecordCitizen, which staff pass through unconditionally
        # either way.
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsAdminOrEvaluator()]
        return [IsAuthenticated(), IsOrgMemberRecordCitizen()]

    def get_target_person_id(self, request):
        return request.data.get('farmer')

    def get_queryset(self):
        qs = BeneficiaryRecord.objects.select_related('farmer', 'recorded_by').order_by('-date_given', '-id')
        params = self.request.query_params
        if params.get('farmer'):
            qs = qs.filter(farmer_id=params['farmer'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(farmer__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class BeneficiaryAdHocDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = BeneficiaryRecord.objects.select_related('farmer')
    lookup_field = 'id'
    http_method_names = ['get', 'patch', 'delete']

    def destroy(self, request, *args, **kwargs):
        if request.user.role != 'ADMIN':
            return Response(
                {'detail': 'Only administrators can delete assistance records.'},
                status=drf_status.HTTP_403_FORBIDDEN,
            )
        return super().destroy(request, *args, **kwargs)


class FisherfolkBeneficiaryRecordDetailView(generics.RetrieveUpdateAPIView):
    """Fisherfolk equivalent of BeneficiaryRecordDetailView."""
    queryset = FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk')
    serializer_class = FisherfolkBeneficiaryRecordUpdateSerializer
    permission_classes = [IsAuthenticated, IsOrgMemberRecordCitizen]
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_person_id(self, obj):
        return obj.fisherfolk_id

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id


class FisherfolkBeneficiaryAdHocListCreateView(generics.ListCreateAPIView):
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsAdminOrEvaluator()]
        return [IsAuthenticated(), IsOrgMemberRecordCitizen()]

    def get_target_person_id(self, request):
        return request.data.get('fisherfolk')

    def get_queryset(self):
        qs = FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk', 'recorded_by').order_by('-date_given', '-id')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


class FisherfolkBeneficiaryAdHocDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk')
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
    history, resolved via get_linked_record() (never a farmer id from the
    request), so a citizen cannot pass someone else's id to see their
    history.
    """
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsCitizen]
    pagination_class = None

    def get_queryset(self):
        # Batch 12: explicit type guard — an ORGANIZATION-linked citizen's
        # linked_record_id points into a different table entirely, and
        # comparing it against farmer_id here would risk an accidental
        # int collision. This view is FARMER-only; see
        # MyOrgBeneficiaryHistoryView for the ORGANIZATION-role equivalent
        # (different semantics: recorded_by=self, not farmer=self — an
        # organization is never a beneficiary subject itself).
        farmer_id = self.request.user.get_linked_farmer_id()
        if farmer_id is None:
            return BeneficiaryRecord.objects.none()
        return BeneficiaryRecord.objects.filter(
            farmer_id=farmer_id,
        ).select_related('farmer', 'recorded_by').order_by('-date_given', '-id')


class MyFisherfolkBeneficiaryHistoryView(generics.ListAPIView):
    """Batch 11: fisherfolk equivalent of MyBeneficiaryHistoryView."""
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsCitizen]
    pagination_class = None

    def get_queryset(self):
        # Batch 12: see MyBeneficiaryHistoryView's comment — same type-guard
        # fix, FISHERFOLK-only here.
        fisherfolk_id = self.request.user.get_linked_fisherfolk_id()
        if fisherfolk_id is None:
            return FisherfolkBeneficiaryRecord.objects.none()
        return FisherfolkBeneficiaryRecord.objects.filter(
            fisherfolk_id=fisherfolk_id,
        ).select_related('fisherfolk', 'recorded_by').order_by('-date_given', '-id')


class MyOrgBeneficiaryHistoryView(generics.ListAPIView):
    """
    Batch 12: an ORGANIZATION citizen's own reporting history — records
    THEY submitted (recorded_by = themselves). Deliberately NOT "every
    record touching this org's members" — an organization is never a
    beneficiary subject itself, and surfacing other organizations'/staff's
    submissions for the same member is explicitly out of this batch's
    scope (Step 4). Different filter shape from MyBeneficiaryHistoryView
    on purpose: that one is farmer_id=self (person is the subject), this
    one is recorded_by=self (org is the reporter).
    """
    serializer_class = BeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsCitizen]
    pagination_class = None

    def get_queryset(self):
        if self.request.user.linked_record_type != 'FARMERS_ORG':
            return BeneficiaryRecord.objects.none()
        return BeneficiaryRecord.objects.filter(
            recorded_by=self.request.user,
        ).select_related('farmer').order_by('-date_given', '-id')


class MyOrgFisherfolkBeneficiaryHistoryView(generics.ListAPIView):
    """Batch 12: fisherfolk-organization equivalent of MyOrgBeneficiaryHistoryView."""
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    permission_classes = [IsAuthenticated, IsCitizen]
    pagination_class = None

    def get_queryset(self):
        if self.request.user.linked_record_type != 'FISHERFOLK_ORG':
            return FisherfolkBeneficiaryRecord.objects.none()
        return FisherfolkBeneficiaryRecord.objects.filter(
            recorded_by=self.request.user,
        ).select_related('fisherfolk').order_by('-date_given', '-id')
