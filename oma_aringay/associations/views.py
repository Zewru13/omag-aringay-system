from datetime import timedelta

from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminOrEvaluator, IsOwnOrgOrStaff
from accounts.utils import create_inactive_citizen_shell
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from interventions.models import BeneficiaryRecord, FisherfolkBeneficiaryRecord
from interventions.serializers import OrganizationDistributionRequestSerializer

from .lifecycle import expire_due_officer_terms
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
    FarmerAddCandidateSerializer,
    FarmerOrganizationMemberSearchSerializer,
    FisherfolkAddCandidateSerializer,
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

    def perform_create(self, serializer):
        # Same shell-creation the Farmer/Fisherfolk enrollment flows already
        # do (farmers.views.FarmerListView.perform_create,
        # fisheries.views.FisherfolkListView.perform_create) — an inactive
        # shell ready for staff's later in-person "Set Up Account" visit.
        # Organizations had no equivalent call at all until now.
        with transaction.atomic():
            serializer.save()
            org = serializer.instance
            create_inactive_citizen_shell(User.LinkedRecordType.FARMERS_ORG, org)


class FarmersOrganizationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FarmersOrganizationDetailSerializer
    queryset = FarmersOrganization.objects.all()

    def get_object(self):
        expire_due_officer_terms()
        return super().get_object()


class FarmersOrganizationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS organization's own members — used by the officer
    assignment search-select. Sourced from Farmer.farmers_organization (the
    real membership link for Farmers Organizations; see
    FarmersOrganizationMember's docstring), not the join table.
    Batch 12: GET also opens to the FARMERS_ORG citizen who IS this
    organization — the member picker for their own "Report Assistance"
    flow reuses this exact endpoint rather than a parallel one.

    Batch 1 (org member management): POST opens to that same citizen, and
    now writes the membership link that is actually read everywhere else —
    Farmer.farmers_organization — instead of a FarmersOrganizationMember
    join row. The join table has 0 rows and nothing reads it (see its model
    docstring); the direct FK is what the Members tab, the officer
    "is a member" validation, bulk distribution, and the remove endpoint
    all use. Writing the join row left "added" members invisible to every
    one of those, so this is the write half finally matching the read half.

    Because the FK is single-valued, adding a farmer who already belongs to
    a DIFFERENT organization is a REASSIGNMENT, not an addition. That is
    destructive to the other organization's roster, so it requires an
    explicit `confirm_reassignment: true` in the body; without it the
    request is refused with 409 and the current organization's name so the
    caller can warn first. Reassignment also drops any officer position the
    farmer held in the OLD organization, for the same reason member removal
    does (associations.serializers enforces "officers must be members", and
    leaving a stale officer row would violate that invariant silently).
    """
    org_linked_record_type = 'FARMERS_ORG'
    pagination_class = None
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]

    def get_serializer_class(self):
        if self.request.method == 'GET':
            return FarmerOrganizationMemberSearchSerializer
        return FarmersOrganizationMemberSerializer

    def get_queryset(self):
        organization_id = self.kwargs['pk']
        if self.request.method == 'GET':
            qs = Farmer.objects.filter(farmers_organization_id=organization_id)
            # Toggle-not-delete batch: officer assignment's search-select opts
            # into this filter (an inactive membership can't hold an officer
            # position, enforced in the serializer already) — Report
            # Assistance's reuse of this same endpoint deliberately does NOT
            # pass it, since reporting to an inactive member can still be
            # legitimate.
            if self.request.query_params.get('active_only') in ('1', 'true', 'True'):
                qs = qs.filter(is_org_membership_active=True)
            search = self.request.query_params.get('search', '').strip()
            if search:
                qs = qs.filter(
                    Q(first_name__icontains=search)
                    | Q(last_name__icontains=search)
                    | Q(middle_name__icontains=search)
                )
            return qs.order_by('last_name', 'first_name')
        return FarmersOrganizationMember.objects.filter(organization_id=organization_id)

    def create(self, request, *args, **kwargs):
        organization_id = int(self.kwargs['pk'])
        organization = get_object_or_404(FarmersOrganization, pk=organization_id)
        farmer_id = request.data.get('farmer')
        if not farmer_id:
            raise serializers.ValidationError({'farmer': 'This field is required.'})
        farmer = get_object_or_404(Farmer, pk=farmer_id)

        current_id = farmer.farmers_organization_id
        if current_id == organization_id:
            raise serializers.ValidationError(
                {'detail': 'This farmer is already a member of this organization.'}
            )

        if current_id is not None:
            if str(request.data.get('confirm_reassignment')).lower() not in ('true', '1'):
                current = FarmersOrganization.objects.filter(pk=current_id).first()
                # 409, not 400: the request is well-formed and the caller is
                # allowed to do this — it conflicts with existing state, and
                # becomes valid once resubmitted with the confirmation flag.
                return Response(
                    {
                        'detail': 'requires_reassignment_confirmation',
                        'message': (
                            f'{farmer.full_name} is currently a member of '
                            f'{current.name if current else "another organization"}. '
                            f'Adding them here will remove them from that organization.'
                        ),
                        'farmer_id': farmer.id,
                        'farmer_name': farmer.full_name,
                        'current_organization_id': current_id,
                        'current_organization_name': current.name if current else None,
                    },
                    status=status.HTTP_409_CONFLICT,
                )

        with transaction.atomic():
            if current_id is not None:
                # Same auto-clear as FarmersOrganizationMemberSetActiveView:
                # they are leaving that organization, so they cannot stay an
                # officer of it. Batch: officer terms are never deleted on
                # any exit — mark ended instead of the old .delete().
                OrganizationOfficer.objects.filter(
                    organization_id=current_id, farmer_id=farmer.id, is_active=True,
                ).update(
                    is_active=False,
                    term_end_date=timezone.localdate(),
                    early_exit_reason='Reassigned to a different organization.',
                )
            farmer.farmers_organization = organization
            # Toggle-not-delete batch: a reassignment is a fresh membership
            # in the NEW organization, regardless of whatever active/inactive
            # state this farmer was left in at their old one.
            farmer.is_org_membership_active = True
            farmer.save(update_fields=['farmers_organization', 'is_org_membership_active'])

        return Response(
            {
                'farmer_id': farmer.id,
                'full_name': farmer.full_name,
                'barangay': farmer.barangay,
                'organization_id': organization_id,
                'organization_name': organization.name,
                'reassigned_from_organization_id': current_id,
            },
            status=status.HTTP_201_CREATED,
        )


class FarmersOrganizationMemberRemoveView(generics.DestroyAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = FarmersOrganizationMember.objects.all()
    lookup_url_kwarg = 'member_id'


class FarmersOrganizationMemberSetActiveView(APIView):
    """
    Toggle-not-delete batch: replaces the old hard "remove member" action
    (which nulled Farmer.farmers_organization) with an active/inactive flip
    on Farmer.is_org_membership_active. The FK itself is never touched here
    — the farmer stays linked to this organization, just marked inactive,
    so their full history (assistance records, past officer terms) stays
    attributed correctly and reactivation is a plain flip back.

    Deactivating still auto-clears any officer position this farmer holds
    in this organization first — same behavior the old delete() had, still
    unconditional (fires for every caller, staff or citizen), just moved
    into the deactivate branch since there's no FK-null/row-delete left to
    hang it off of.

    Opened to the FARMERS_ORG citizen who IS this organization, same as
    the flow it replaces.
    """
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FARMERS_ORG'

    def patch(self, request, pk, farmer_id):
        farmer = get_object_or_404(Farmer, pk=farmer_id, farmers_organization_id=pk)
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({'detail': 'is_active is required.'}, status=status.HTTP_400_BAD_REQUEST)
        is_active = str(is_active).lower() in ('true', '1')
        if not is_active:
            # Batch: mark ended instead of deleting — see
            # FarmersOrganizationMemberAddView.create() above.
            OrganizationOfficer.objects.filter(
                organization_id=pk, farmer_id=farmer_id, is_active=True,
            ).update(
                is_active=False,
                term_end_date=timezone.localdate(),
                early_exit_reason='Organization membership deactivated.',
            )
        farmer.is_org_membership_active = is_active
        farmer.save(update_fields=['is_org_membership_active'])
        return Response({
            'id': farmer.id,
            'full_name': farmer.full_name,
            'is_org_membership_active': farmer.is_org_membership_active,
        })


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
    """
    Batch 1 (org member management): GET (read the roster) and POST (assign
    an officer) both open to the FARMERS_ORG citizen who IS this
    organization. OrganizationOfficerSerializer.validate_farmer's "this
    farmer is not a member of this organization" check is untouched and
    still runs for every caller — widening who may assign does not widen
    who may BE assigned.

    Batch (2-year terms): GET defaults to current officers only
    (is_active=True, one per filled position) — every existing caller
    (AssignOfficerModal's "existingOfficers", the citizen roster) expects
    that shape unchanged. Pass ?history=1 to get every past+present row for
    the new Officer History view instead. POST refuses to create a second
    active row for a position that already has one — the position must be
    vacated (End Term Early, or natural term completion) first.
    """
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FARMERS_ORG'
    serializer_class = OrganizationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        expire_due_officer_terms()
        qs = OrganizationOfficer.objects.filter(organization_id=self.kwargs['pk'])
        if self.request.query_params.get('history') not in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
        return qs.order_by('position', '-term_start_date')

    def perform_create(self, serializer):
        expire_due_officer_terms()
        organization_id = self.kwargs['pk']
        position = serializer.validated_data.get('position')
        if OrganizationOfficer.objects.filter(
            organization_id=organization_id, position=position, is_active=True,
        ).exists():
            raise serializers.ValidationError(
                {'detail': 'This position is currently held by someone else. End their term first before assigning a new officer.'}
            )
        serializer.save(organization_id=organization_id)


class OrganizationOfficerEndTermView(APIView):
    """
    Replaces the old plain-removal (hard delete) flow. Requires a real
    reason, same required-field discipline as CropDisasterResolveView's
    recovery_note — sets term_end_date to today and early_exit_reason to
    the given text, and flips is_active False so the position becomes
    vacant/re-assignable. The row itself is never touched otherwise: it
    remains a permanent, queryable historical record.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, officer_id):
        officer = get_object_or_404(OrganizationOfficer, pk=officer_id)
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'detail': 'A reason is required to end a term early.'}, status=status.HTTP_400_BAD_REQUEST)
        if not officer.is_active:
            return Response({'detail': 'This officer term has already ended.'}, status=status.HTTP_400_BAD_REQUEST)
        officer.is_active = False
        officer.term_end_date = timezone.localdate()
        officer.early_exit_reason = reason
        officer.save(update_fields=['is_active', 'term_end_date', 'early_exit_reason'])
        return Response(OrganizationOfficerSerializer(officer).data)


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

    def perform_create(self, serializer):
        # Same shell-creation the Farmer/Fisherfolk enrollment flows already
        # do — see FarmersOrganizationListCreateView.perform_create above.
        with transaction.atomic():
            serializer.save()
            org = serializer.instance
            create_inactive_citizen_shell(User.LinkedRecordType.FISHERFOLK_ORG, org)


class FisherfolkOrganizationDetailView(generics.RetrieveUpdateAPIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    serializer_class = FisherfolkOrganizationDetailSerializer
    queryset = FisherfolkOrganization.objects.all()

    def get_object(self):
        expire_due_officer_terms()
        return super().get_object()


class FisherfolkOrganizationMemberAddView(generics.ListCreateAPIView):
    """
    GET: search THIS organization's own members — used by the officer
    assignment search-select. Batch 12: GET also opens to the
    FISHERFOLK_ORG citizen who IS this organization (member picker for
    their own "Report Assistance" flow).
    POST: "add member" (join-table row). Batch 1 (org member management)
    opens this to that same citizen.

    Deliberately NO reassignment concept here, unlike the farmers side.
    FisherfolkOrganizationMember is a real join table, so belonging to
    several organizations at once is legitimate rather than a conflict —
    adding someone who is already in another organization just creates a
    second row and takes nothing away from anyone.
    """
    org_linked_record_type = 'FISHERFOLK_ORG'
    serializer_class = FisherfolkOrganizationMemberSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]

    def get_queryset(self):
        qs = FisherfolkOrganizationMember.objects.filter(
            organization_id=self.kwargs['pk'],
        ).select_related('fisherfolk')
        # Toggle-not-delete batch: same opt-in as the Farmers side above —
        # officer assignment's search-select passes this, Report Assistance
        # does not.
        if self.request.method == 'GET' and self.request.query_params.get('active_only') in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
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


def _set_fisherfolk_member_active(member, is_active):
    """Shared by both the staff-only and org-scoped set-active views below.
    Toggle-not-delete batch: deactivating still auto-clears any officer
    position held via this membership row — the CASCADE that used to do
    this automatically only fires on a real row delete, and this path no
    longer deletes the row, so it's explicit here instead."""
    if not is_active:
        # Batch: mark ended instead of deleting — see
        # FarmersOrganizationMemberAddView.create() above.
        FisherfolkOrganizationOfficer.objects.filter(member=member, is_active=True).update(
            is_active=False,
            term_end_date=timezone.localdate(),
            early_exit_reason='Organization membership deactivated.',
        )
    member.is_active = is_active
    member.save(update_fields=['is_active'])


class FisherfolkOrganizationMemberSetActiveView(APIView):
    """Staff-only. Its URL carries no organization id, so IsOwnOrgOrStaff
    (which resolves ownership from the `pk` kwarg) cannot gate it — the
    org-scoped citizen route is the sibling view below."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def patch(self, request, member_id):
        member = get_object_or_404(FisherfolkOrganizationMember, pk=member_id)
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({'detail': 'is_active is required.'}, status=status.HTTP_400_BAD_REQUEST)
        _set_fisherfolk_member_active(member, str(is_active).lower() in ('true', '1'))
        return Response({'id': member.id, 'is_active': member.is_active})


class FisherfolkOrganizationMemberOrgScopedSetActiveView(APIView):
    """
    Toggle-not-delete batch: org-scoped active/inactive flip for Fisherfolk
    Organization membership, mirroring the farmers side's `<pk>/members/
    <id>/` shape so IsOwnOrgOrStaff has a `pk` to check. Sibling of the
    staff-only route above, same as the delete-based views this replaced.

    get_queryset filters by the organization from the URL, so a member id
    belonging to some other organization 404s instead of being toggled.
    """
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FISHERFOLK_ORG'

    def patch(self, request, pk, member_id):
        member = get_object_or_404(
            FisherfolkOrganizationMember, pk=member_id, organization_id=pk,
        )
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({'detail': 'is_active is required.'}, status=status.HTTP_400_BAD_REQUEST)
        _set_fisherfolk_member_active(member, str(is_active).lower() in ('true', '1'))
        return Response({'id': member.id, 'is_active': member.is_active})


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
    """
    Batch 1 (org member management): GET and POST both open to the
    FISHERFOLK_ORG citizen who IS this organization.
    FisherfolkOrganizationOfficerSerializer.validate's "this fisherfolk is
    not a member of this organization" check is untouched and still runs.

    Batch (2-year terms): see OrganizationOfficerListCreateView's identical
    docstring — same ?history=1 / vacant-position-required behavior.
    """
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FISHERFOLK_ORG'
    serializer_class = FisherfolkOrganizationOfficerSerializer
    pagination_class = None

    def get_queryset(self):
        expire_due_officer_terms()
        qs = FisherfolkOrganizationOfficer.objects.filter(organization_id=self.kwargs['pk'])
        if self.request.query_params.get('history') not in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
        return qs.order_by('position', '-term_start_date')

    def perform_create(self, serializer):
        expire_due_officer_terms()
        organization_id = self.kwargs['pk']
        position = serializer.validated_data.get('position')
        if FisherfolkOrganizationOfficer.objects.filter(
            organization_id=organization_id, position=position, is_active=True,
        ).exists():
            raise serializers.ValidationError(
                {'detail': 'This position is currently held by someone else. End their term first before assigning a new officer.'}
            )
        serializer.save(organization_id=organization_id)


class FisherfolkOrganizationOfficerEndTermView(APIView):
    """Fisherfolk equivalent of OrganizationOfficerEndTermView above."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, officer_id):
        officer = get_object_or_404(FisherfolkOrganizationOfficer, pk=officer_id)
        reason = (request.data.get('reason') or '').strip()
        if not reason:
            return Response({'detail': 'A reason is required to end a term early.'}, status=status.HTTP_400_BAD_REQUEST)
        if not officer.is_active:
            return Response({'detail': 'This officer term has already ended.'}, status=status.HTTP_400_BAD_REQUEST)
        officer.is_active = False
        officer.term_end_date = timezone.localdate()
        officer.early_exit_reason = reason
        officer.save(update_fields=['is_active', 'term_end_date', 'early_exit_reason'])
        return Response(FisherfolkOrganizationOfficerSerializer(officer).data)


# ─── Batch 1: add-member candidate search ──────────────────────────────────
# Finds people to ADD, so unlike the member-list endpoints it necessarily
# looks outside the calling organization. Three limits keep that from
# becoming a registry dump, since the farmer table alone holds ~3.5k rows:
#
#   1. IsOwnOrgOrStaff — only the organization itself (or staff) may search
#      at all, and only under its own id in the URL.
#   2. MIN_SEARCH_LENGTH — a blank or 1-character query returns nothing
#      rather than everything, so there is no "list all" mode.
#   3. MAX_RESULTS — a broad query is truncated, so paging through the
#      whole registry a slice at a time is not possible either.
#
# Field list is minimal by construction — see the candidate serializers.

MIN_SEARCH_LENGTH = 2
MAX_RESULTS = 20


class _AddCandidateSearchBase(generics.ListAPIView):
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    pagination_class = None

    def _search_term(self):
        return self.request.query_params.get('search', '').strip()


class FarmersOrganizationAddCandidateSearchView(_AddCandidateSearchBase):
    """Farmers only — a Farmers Organization can never surface fisherfolk."""
    org_linked_record_type = 'FARMERS_ORG'
    serializer_class = FarmerAddCandidateSerializer

    def get_queryset(self):
        search = self._search_term()
        if len(search) < MIN_SEARCH_LENGTH:
            return Farmer.objects.none()
        return (
            Farmer.objects
            .filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(middle_name__icontains=search)
            )
            .select_related('farmers_organization')
            .order_by('last_name', 'first_name')[:MAX_RESULTS]
        )


class FisherfolkOrganizationAddCandidateSearchView(_AddCandidateSearchBase):
    """Fisherfolk only — a Fisherfolk Organization can never surface farmers."""
    org_linked_record_type = 'FISHERFOLK_ORG'
    serializer_class = FisherfolkAddCandidateSerializer

    def get_queryset(self):
        search = self._search_term()
        if len(search) < MIN_SEARCH_LENGTH:
            return Fisherfolk.objects.none()
        return (
            Fisherfolk.objects
            .filter(
                Q(first_name__icontains=search)
                | Q(last_name__icontains=search)
                | Q(middle_name__icontains=search)
            )
            .prefetch_related('fisherfolk_organizations__organization')
            .order_by('last_name', 'first_name')[:MAX_RESULTS]
        )


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
    loop (unlike PondBulkCreateView's precedent): one member's failure must
    never roll back or block rows already committed for other members. Each
    row is instead created inside its OWN transaction.atomic(), so a single
    row's write is still all-or-nothing internally. The return value is a
    per-member result list, not a single success/failure.

    commit=False (Step 3's confirmation-screen preview) runs the exact same
    30-day cross-org check — read-only — but never calls .create(). Statuses
    are reported as 'would_create' instead of 'created' so the frontend
    can't mistake a preview for a completed distribution.
    """
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
        # Real identifying number, not fabricated — Farmer's RSBSA number or
        # Fisherfolk's LGU registration number, whichever the model has.
        id_number = getattr(person, 'rsbsa_number', None) or getattr(person, 'lgu_registration_number', None)

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
                'id_number': id_number,
                'status': 'would_create',
                'note': note,
            })
            continue

        try:
            with transaction.atomic():
                record = record_model.objects.create(
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
                'id_number': id_number,
                'status': 'created',
                'record_id': record.id,
                'note': note,
            })
        except Exception as exc:
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'id_number': id_number,
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
