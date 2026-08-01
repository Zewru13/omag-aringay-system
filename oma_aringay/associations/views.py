from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator, IsOwnOrgOrStaff
from farmers.models import Farmer
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.serializers import OrganizationDistributionRequestSerializer

from .models import (
    FarmersOrganization,
    FarmersOrganizationEquipment,
    FarmersOrganizationMember,
    FisherfolkOrganization,
    FisherfolkOrganizationEquipment,
    FisherfolkOrganizationMember,
    FisherfolkOrganizationOfficer,
    OrganizationOfficer,
)
from .serializers import (
    FarmerOrganizationMemberSearchSerializer,
    FarmersOrganizationDetailSerializer,
    FarmersOrganizationEquipmentSerializer,
    FarmersOrganizationListSerializer,
    FarmersOrganizationMemberSerializer,
    FisherfolkOrganizationDetailSerializer,
    FisherfolkOrganizationEquipmentSerializer,
    FisherfolkOrganizationListSerializer,
    FisherfolkOrganizationMemberSerializer,
    FisherfolkOrganizationOfficerSerializer,
    OrganizationOfficerSerializer,
)


# ─── Farmers Organization ──────────────────────────────────────────────────────

class FarmersOrganizationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FarmersOrganizationDetailSerializer if self.request.method == 'POST' else FarmersOrganizationListSerializer

    def get_queryset(self):
        qs = FarmersOrganization.objects.all().order_by('-date_created')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        return qs


class FarmersOrganizationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersOrganizationDetailSerializer
    queryset = FarmersOrganization.objects.all()


class FarmersOrganizationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS organization's own members — used by the officer
    assignment search-select. Sourced from Farmer.farmers_organization (the
    real membership link for Farmers Organizations; see
    FarmersOrganizationMember's docstring), not the join table.
    Batch 12: GET also opens to the FARMERS_ORG citizen who IS this
    organization — the member picker for their own "Report Assistance"
    flow reuses this exact endpoint rather than a parallel one.
    POST: unchanged join-table "add member" capability, staff-only — kept
    for parity with the fisherfolk side, though nothing in the current UI
    calls it for farmers (see model docstring).
    """
    org_linked_record_type = 'FARMERS_ORG'
    pagination_class = None

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsOwnOrgOrStaff()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return FarmerOrganizationMemberSearchSerializer
        return FarmersOrganizationMemberSerializer

    def get_queryset(self):
        organization_id = self.kwargs['pk']
        if self.request.method == 'GET':
            qs = Farmer.objects.filter(farmers_organization_id=organization_id)
            search = self.request.query_params.get('search', '').strip()
            if search:
                qs = qs.filter(
                    Q(first_name__icontains=search)
                    | Q(last_name__icontains=search)
                    | Q(middle_name__icontains=search)
                )
            return qs.order_by('last_name', 'first_name')
        return FarmersOrganizationMember.objects.filter(organization_id=organization_id)

    def perform_create(self, serializer):
        organization_id = self.kwargs['pk']
        farmer = serializer.validated_data['farmer']
        if FarmersOrganizationMember.objects.filter(organization_id=organization_id, farmer=farmer).exists():
            raise serializers.ValidationError(
                {'detail': 'This farmer is already a member of this organization.'}
            )
        serializer.save(organization_id=organization_id)


class FarmersOrganizationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersOrganizationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FarmersOrganizationMemberDirectRemoveView(APIView):
    """
    The actual "remove member" action for Farmers Organizations: clears
    Farmer.farmers_organization (the real membership link) rather than
    deleting a join-table row. Does NOT touch the Farmer profile otherwise.
    Auto-clears any officer position this farmer holds in this organization
    first (Batch 4's chosen behavior — see OrganizationOfficer.farmer's
    SET_NULL, which can't auto-cascade here since we're nulling a field,
    not deleting a row, so this has to be done explicitly).
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def delete(self, request, pk, farmer_id):
        farmer = get_object_or_404(Farmer, pk=farmer_id, farmers_organization_id=pk)
        OrganizationOfficer.objects.filter(organization_id=pk, farmer_id=farmer_id).delete()
        farmer.farmers_organization = None
        farmer.save(update_fields=['farmers_organization'])
        return Response(status=status.HTTP_204_NO_CONTENT)


class FarmersOrganizationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersOrganizationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class FarmersOrganizationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersOrganizationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


class OrganizationOfficerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = OrganizationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        return OrganizationOfficer.objects.filter(organization_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class OrganizationOfficerDestroyView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = OrganizationOfficer.objects.all()
    lookup_url_kwarg = 'officer_id'


# ─── Fisherfolk Organization ───────────────────────────────────────────────────

class FisherfolkOrganizationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FisherfolkOrganizationDetailSerializer if self.request.method == 'POST' else FisherfolkOrganizationListSerializer

    def get_queryset(self):
        qs = FisherfolkOrganization.objects.all().order_by('-date_created')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        return qs


class FisherfolkOrganizationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationDetailSerializer
    queryset = FisherfolkOrganization.objects.all()


class FisherfolkOrganizationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS organization's own members — used by the officer
    assignment search-select. Batch 12: GET also opens to the
    FISHERFOLK_ORG citizen who IS this organization (member picker for
    their own "Report Assistance" flow).
    POST: unchanged "add member" (join-table row), staff-only.
    """
    org_linked_record_type = 'FISHERFOLK_ORG'
    serializer_class = FisherfolkOrganizationMemberSerializer
    pagination_class = None

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsOwnOrgOrStaff()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_queryset(self):
        qs = FisherfolkOrganizationMember.objects.filter(
            organization_id=self.kwargs['pk'],
        ).select_related('fisherfolk')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(fisherfolk__first_name__icontains=search)
                | Q(fisherfolk__last_name__icontains=search)
                | Q(fisherfolk__middle_name__icontains=search)
            )
        return qs

    def perform_create(self, serializer):
        organization_id = self.kwargs['pk']
        fisherfolk = serializer.validated_data['fisherfolk']
        if FisherfolkOrganizationMember.objects.filter(organization_id=organization_id, fisherfolk=fisherfolk).exists():
            raise serializers.ValidationError(
                {'detail': 'This fisherfolk is already a member of this organization.'}
            )
        serializer.save(organization_id=organization_id)


class FisherfolkOrganizationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkOrganizationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FisherfolkOrganizationEquipmentAddView(generics.CreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationEquipmentSerializer

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class FisherfolkOrganizationEquipmentRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkOrganizationEquipment.objects.all()
    lookup_url_kwarg = 'equip_id'


class FisherfolkOrganizationOfficerListCreateView(generics.ListCreateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        return FisherfolkOrganizationOfficer.objects.filter(organization_id=self.kwargs['pk'])

    def perform_create(self, serializer):
        serializer.save(organization_id=self.kwargs['pk'])


class FisherfolkOrganizationOfficerDestroyView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FisherfolkOrganizationOfficer.objects.all()
    lookup_url_kwarg = 'officer_id'


# ─── Per-organization bulk assistance distribution ──────────────────────────
# Creates ONE BeneficiaryRecord/FisherfolkBeneficiaryRecord per CURRENT
# member of an organization, in one request. Sits alongside the existing
# one-by-one flow (CitizenReportAssistanceModal / AddAssistanceModal /
# LogGovernmentAssistanceModal) — does not replace it.

def _run_organization_distribution(record_model, person_field, organization, members, data, user, commit=True):
    """
    Shared by both domain views below — identical per-member logic, differing
    only in which model/FK field/attribution field is used.

    Deliberately NOT one all-or-nothing transaction.atomic() around the whole
    loop (unlike PondBulkCreateView's precedent): a member already enrolled in
    the attached program is expected, routine behavior here, not a batch
    failure — the rest of the members must still get their record. Each row is
    instead created inside its OWN transaction.atomic(), so a single row's
    write is still all-or-nothing internally, but one member's failure can
    never roll back or block rows already committed for other members. The
    return value is a per-member result list, not a single success/failure.

    commit=False (Step 3's confirmation-screen preview) runs the exact same
    program-skip and 30-day cross-org checks — both are read-only — but never
    calls .create(). Statuses are reported as 'would_create'/'skipped' instead
    of 'created'/'skipped' so the frontend can't mistake a preview for a
    completed distribution.
    """
    program = data.get('program')
    assistance_type = data['assistance_type']
    date_given = data['date_given']
    cutoff = date_given - timedelta(days=30)
    attributed_field = (
        'attributed_organization' if record_model is BeneficiaryRecord
        else 'attributed_fisherfolk_organization'
    )
    text_field = 'remarks' if record_model is BeneficiaryRecord else 'description'

    results = []
    for person in members:
        person_filter = {person_field: person}

        if program and record_model.objects.filter(program=program, **person_filter).exists():
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'status': 'skipped',
                'reason': 'Already has a record under this program.',
            })
            continue

        # Safeguard (non-blocking): same assistance_type from a DIFFERENT
        # organization within the last 30 days. Flagged in the result, never
        # silently allowed or silently blocked.
        prior = (
            record_model.objects
            .filter(assistance_type=assistance_type, date_given__gte=cutoff, date_given__lte=date_given, **person_filter)
            .exclude(**{f'{attributed_field}_id': organization.id})
            .exclude(**{f'{attributed_field}__isnull': True})
            .select_related(attributed_field)
            .order_by('-date_given')
            .first()
        )
        note = None
        if prior:
            other_org = getattr(prior, attributed_field)
            note = f'Also received {prior.assistance_type} from {other_org.name} on {prior.date_given}.'

        if not commit:
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'status': 'would_create',
                'note': note,
            })
            continue

        try:
            with transaction.atomic():
                record = record_model.objects.create(
                    program=program,
                    assistance_type=assistance_type,
                    source_agency=data.get('source_agency', ''),
                    quantity=data.get('quantity', ''),
                    date_given=date_given,
                    season=data.get('season', ''),
                    year=date_given.year,
                    recorded_by=user,
                    **{person_field: person, text_field: data.get('description', '')},
                )
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'status': 'created',
                'record_id': record.id,
                'note': note,
            })
        except Exception as exc:
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'status': 'error',
                'reason': str(exc),
            })

    return results


class FarmersOrganizationDistributeAssistanceView(APIView):
    """
    Step 2: ADMIN/EVALUATOR may distribute to any organization; a CITIZEN
    linked to a FARMERS_ORG may only distribute to their OWN organization —
    IsOwnOrgOrStaff reused as-is (URL 'pk' kwarg + org_linked_record_type),
    same pattern as FarmersOrganizationMemberAddView's GET.
    """
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FARMERS_ORG'

    def post(self, request, pk):
        organization = get_object_or_404(FarmersOrganization, pk=pk)

        request_serializer = OrganizationDistributionRequestSerializer(
            data=request.data, context={'model': BeneficiaryRecord},
        )
        request_serializer.is_valid(raise_exception=True)
        data = request_serializer.validated_data

        # Snapshot at distribution time — resolved once, here, before any
        # writes. Members added after this point never retroactively receive
        # this distribution.
        members = list(Farmer.objects.filter(farmers_organization_id=pk))

        results = _run_organization_distribution(
            BeneficiaryRecord, 'farmer', organization, members, data, request.user,
            commit=not bool(request.data.get('dry_run')),
        )
        return Response({
            'organization_id': organization.id,
            'organization_name': organization.name,
            'member_count': len(members),
            'results': results,
        }, status=status.HTTP_200_OK)


class FisherfolkOrganizationDistributeAssistanceView(APIView):
    """Fisherfolk equivalent of FarmersOrganizationDistributeAssistanceView above."""
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FISHERFOLK_ORG'

    def post(self, request, pk):
        organization = get_object_or_404(FisherfolkOrganization, pk=pk)

        request_serializer = OrganizationDistributionRequestSerializer(
            data=request.data, context={'model': FisherfolkBeneficiaryRecord},
        )
        request_serializer.is_valid(raise_exception=True)
        data = request_serializer.validated_data

        members = [
            m.fisherfolk for m in
            FisherfolkOrganizationMember.objects.filter(organization_id=pk).select_related('fisherfolk')
        ]

        results = _run_organization_distribution(
            FisherfolkBeneficiaryRecord, 'fisherfolk', organization, members, data, request.user,
            commit=not bool(request.data.get('dry_run')),
        )
        return Response({
            'organization_id': organization.id,
            'organization_name': organization.name,
            'member_count': len(members),
            'results': results,
        }, status=status.HTTP_200_OK)
