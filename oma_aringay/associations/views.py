from datetime import date, timedelta
from io import BytesIO

from django.db import transaction
from django.db.models import Case, IntegerField, Q, When
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics, serializers, status
from rest_framework.exceptions import APIException
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminOrEvaluator, IsOwnOrgOrStaff, IsStaffOrFisherfolk, fisherfolk_scope
from accounts.utils import create_inactive_citizen_shell
from farmers.models import Farmer
from farmers.rsbsa_import import normalize_barangay
from core.utils import build_name_search_q
from fisheries.models import Fisherfolk
from interventions.lifecycle import notify_assistance_recorded
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


# ─── Phase B: shared is_main resolution/enforcement ─────────────────────────
# Used by both domains' add-member and set-active views. A person's "main"
# organization is a real, stored field (FarmersOrganizationMember.is_main /
# FisherfolkOrganizationMember.is_main) — not the live barangay-match guess
# _resolve_attributed_organization computes (interventions/models.py), which
# predates this and is kept only as a general-purpose attribution fallback.

class MainChoiceRequired(APIException):
    """400 raised when adding a membership needs an explicit main-organization
    choice (see _resolve_and_assign_main). The body keeps the original
    `is_main` message and adds `main_choice_required` plus the person's other
    active memberships, so a client can offer a real choice instead of a
    generic error. APIException/ValidationError stringify every leaf of their
    detail (True -> "True", ids -> "12"), so the plain dict is set directly
    to keep real booleans and integers in the response."""
    status_code = status.HTTP_400_BAD_REQUEST
    default_code = 'main_choice_required'

    def __init__(self, message, other_organizations):
        super().__init__(message)
        self.detail = {
            'is_main': message,
            'main_choice_required': True,
            'other_organizations': other_organizations,
        }


def _resolve_and_assign_main(member, other_active_qs, person_barangay, explicit_is_main):
    """
    `member`: a freshly created, already-saved membership row with
    is_main still at its default (False) — decide its real value here.
    `other_active_qs`: queryset of every OTHER currently-active membership
    this same person holds (never including `member` itself).
    `explicit_is_main`: True/False if the caller passed a real choice,
    None if they didn't specify one at all.

    Rule:
      - No other active memberships exist (this is the person's first ever)
        -> always main; there is nothing to choose between.
      - Explicit choice given -> honored. True clears is_main on every
        other membership (enforcing "at most one main at a time" by
        construction); False leaves this one non-main.
      - No explicit choice, and exactly one candidate among this new
        membership + the others barangay-matches the person's own
        barangay, and that candidate IS this new membership -> becomes
        main (the auto-suggestion). An existing match among the OTHERS is
        left alone — joining a new organization never silently steals main
        status from an already-established one.
      - No explicit choice, ambiguous/no unique match, and the person
        already has a main among the others -> leave this one non-main;
        nothing to decide.
      - No explicit choice, ambiguous/no unique match, and the person has
        NO main among the others (their very first resolvable membership,
        or one left mainless by a deactivation with no promotion
        candidate) -> require an explicit choice.
    """
    others = list(other_active_qs.select_related('organization'))
    if not others:
        member.is_main = True
        member.save(update_fields=['is_main'])
        return

    if explicit_is_main is not None:
        if explicit_is_main:
            other_active_qs.update(is_main=False)
            member.is_main = True
        else:
            member.is_main = False
        member.save(update_fields=['is_main'])
        return

    matches = [m for m in (others + [member]) if m.organization.barangay == person_barangay]
    if len(matches) == 1 and matches[0].pk == member.pk:
        other_active_qs.update(is_main=False)
        member.is_main = True
        member.save(update_fields=['is_main'])
        return

    if any(m.is_main for m in others):
        member.is_main = False
        member.save(update_fields=['is_main'])
        return

    raise MainChoiceRequired(
        "This person has no main organization yet, and this organization's barangay does not "
        "uniquely match theirs — please explicitly choose whether this should be their main organization.",
        [
            {
                'membership_id': m.id,
                'organization_id': m.organization_id,
                'organization_name': m.organization.name,
            }
            for m in others
        ],
    )


def _promote_main_after_deactivation(other_active_qs, person_barangay):
    """Called right after a person's is_main=True membership was
    deactivated. `other_active_qs`: every OTHER still-active membership for
    this person (already excludes the one just deactivated). Promotes one
    to main only if exactly one barangay-matches; otherwise leaves the
    person without a main — surfaced/required the next time this matters
    (the same explicit-choice requirement _resolve_and_assign_main enforces
    for a person with no main), rather than guessing."""
    others = list(other_active_qs.select_related('organization'))
    if not others:
        return
    matches = [m for m in others if m.organization.barangay == person_barangay]
    if len(matches) == 1:
        matches[0].is_main = True
        matches[0].save(update_fields=['is_main'])


# ─── Farmers Organization ──────────────────────────────────────────────────────

class FarmersOrganizationListCreateView(generics.ListCreateAPIView):
    def get_permissions(self):
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FarmersOrganizationDetailSerializer if self.request.method == 'POST' else FarmersOrganizationListSerializer

    def get_queryset(self):
        qs = FarmersOrganization.objects.all().order_by('-date_created', '-id')
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
    assignment search-select. Batch 12: GET also opens to the FARMERS_ORG
    citizen who IS this organization (member picker for their own "Report
    Assistance" flow).
    POST: "add member" (join-table row).

    Batch (Phase B — multi-org membership): FarmersOrganizationMember is now
    the real, live, multi-capable membership mechanism — mirrors
    FisherfolkOrganizationMemberAddView exactly. Deliberately NO
    reassignment concept any more: adding a farmer already in another
    organization just creates a second row and takes nothing away from
    anyone, same as the fisherfolk side always worked.
    """
    org_linked_record_type = 'FARMERS_ORG'
    serializer_class = FarmersOrganizationMemberSerializer
    pagination_class = None
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]

    def get_queryset(self):
        qs = FarmersOrganizationMember.objects.filter(
            organization_id=self.kwargs['pk'],
        ).select_related('farmer')
        # Toggle-not-delete batch: officer assignment's search-select opts
        # into this filter (an inactive membership can't hold an officer
        # position, enforced in the serializer already) — Report
        # Assistance's reuse of this same endpoint deliberately does NOT
        # pass it, since reporting to an inactive member can still be
        # legitimate.
        if self.request.method == 'GET' and self.request.query_params.get('active_only') in ('1', 'true', 'True'):
            qs = qs.filter(is_active=True)
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(
                Q(farmer__first_name__icontains=search)
                | Q(farmer__last_name__icontains=search)
                | Q(farmer__middle_name__icontains=search)
            )
        return qs

    @transaction.atomic
    def perform_create(self, serializer):
        organization_id = self.kwargs['pk']
        farmer = serializer.validated_data['farmer']
        if FarmersOrganizationMember.objects.filter(organization_id=organization_id, farmer=farmer).exists():
            raise serializers.ValidationError(
                {'detail': 'This farmer is already a member of this organization.'}
            )
        member = serializer.save(organization_id=organization_id)
        explicit_is_main = self.request.data.get('is_main')
        if explicit_is_main is not None:
            explicit_is_main = str(explicit_is_main).lower() in ('true', '1')
        _resolve_and_assign_main(
            member,
            FarmersOrganizationMember.objects.filter(farmer_id=farmer.id, is_active=True).exclude(pk=member.pk),
            farmer.barangay,
            explicit_is_main,
        )


def _set_farmer_member_active(member, is_active, reason=''):
    """Shared by both the staff-only and org-scoped set-active views below.
    Mirrors _set_fisherfolk_member_active exactly (Toggle-not-delete batch:
    deactivating still auto-clears any officer position held via this
    membership row) plus is_main handling: deactivating a MAIN membership
    tries to promote another active one via the same barangay-match rule
    used at join time (_promote_main_after_deactivation) — a person's main
    can lapse to "none" if nothing uniquely matches, same as a first-ever
    join with no match would require an explicit choice."""
    reason = (reason or '').strip()
    was_main = False
    if not is_active:
        member.deactivation_reason = reason
        OrganizationOfficer.objects.filter(
            organization_id=member.organization_id, farmer_id=member.farmer_id, is_active=True,
        ).update(
            is_active=False,
            term_end_date=timezone.localdate(),
            early_exit_reason=reason or 'Organization membership deactivated.',
        )
        was_main = member.is_main
        member.is_main = False
    else:
        member.deactivation_reason = ''
    member.is_active = is_active
    member.save(update_fields=['is_active', 'deactivation_reason', 'is_main'])
    if was_main:
        _promote_main_after_deactivation(
            FarmersOrganizationMember.objects.filter(farmer_id=member.farmer_id, is_active=True),
            member.farmer.barangay,
        )


class FarmersOrganizationMemberSetActiveView(APIView):
    """Staff-only. Its URL carries no organization id, so IsOwnOrgOrStaff
    (which resolves ownership from the `pk` kwarg) cannot gate it — the
    org-scoped citizen route is the sibling view below. Mirrors
    FisherfolkOrganizationMemberSetActiveView."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def patch(self, request, member_id):
        member = get_object_or_404(FarmersOrganizationMember, pk=member_id)
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({'detail': 'is_active is required.'}, status=status.HTTP_400_BAD_REQUEST)
        _set_farmer_member_active(member, str(is_active).lower() in ('true', '1'), request.data.get('reason'))
        return Response({
            'id': member.id, 'is_active': member.is_active,
            'deactivation_reason': member.deactivation_reason, 'is_main': member.is_main,
        })


class FarmersOrganizationMemberOrgScopedSetActiveView(APIView):
    """
    Org-scoped active/inactive flip for Farmers Organization membership,
    mirroring the fisherfolk side's `<pk>/members/<id>/` shape so
    IsOwnOrgOrStaff has a `pk` to check. Sibling of the staff-only route
    above. get_queryset-equivalent filters by the organization from the
    URL, so a member id belonging to some other organization 404s instead
    of being toggled.
    """
    permission_classes = [IsAuthenticated, IsOwnOrgOrStaff]
    org_linked_record_type = 'FARMERS_ORG'

    def patch(self, request, pk, member_id):
        member = get_object_or_404(
            FarmersOrganizationMember, pk=member_id, organization_id=pk,
        )
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({'detail': 'is_active is required.'}, status=status.HTTP_400_BAD_REQUEST)
        _set_farmer_member_active(member, str(is_active).lower() in ('true', '1'), request.data.get('reason'))
        return Response({
            'id': member.id, 'is_active': member.is_active,
            'deactivation_reason': member.deactivation_reason, 'is_main': member.is_main,
        })


class FarmersOrganizationMemberSetMainView(APIView):
    """
    Batch (Phase B): explicit override — make this ACTIVE membership the
    farmer's main organization, clearing is_main on every other membership
    they hold (see _resolve_and_assign_main's docstring for the invariant
    this enforces). Mirrors FisherfolkOrganizationMemberSetMainView.

    Staff only (ADMIN/EVALUATOR). This used to be IsOwnOrgOrStaff, which let
    an organization's own login flip main for its members — no citizen
    screen ever used that, and it is not the organization's decision: a
    person's main organization is which one they primarily belong to when
    they belong to several, and a person's other organizations shouldn't be
    overridden unilaterally by one of them. The citizen Members screen shows
    the Main marker read-only; changing it goes through staff.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk, member_id):
        member = get_object_or_404(FarmersOrganizationMember, pk=member_id, organization_id=pk)
        if not member.is_active:
            return Response(
                {'detail': 'An inactive membership cannot be set as main.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        FarmersOrganizationMember.objects.filter(
            farmer_id=member.farmer_id, is_active=True,
        ).exclude(pk=member.pk).update(is_main=False)
        member.is_main = True
        member.save(update_fields=['is_main'])
        return Response({'id': member.id, 'is_main': member.is_main})


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
        # A fisherfolk citizen may READ the list (Start Production Cycle's Organization dropdown), limited
        # below to the organizations they are an active member of; everything else stays staff-only.
        if self.request.method == 'GET':
            return [IsAuthenticated(), IsStaffOrFisherfolk()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get_serializer_class(self):
        return FisherfolkOrganizationDetailSerializer if self.request.method == 'POST' else FisherfolkOrganizationListSerializer

    def get_queryset(self):
        qs = FisherfolkOrganization.objects.all().order_by('-date_created', '-id')
        search = self.request.query_params.get('search', '').strip()
        if search:
            qs = qs.filter(Q(name__icontains=search) | Q(barangay__icontains=search))
        # Only organizations this fisherfolk is an active member of (the real join table). For a fisherfolk
        # citizen this is always their OWN membership, whatever `fisherfolk` the request names.
        owner = fisherfolk_scope(self.request.user)
        fisherfolk_id = str(owner) if owner is not None else self.request.query_params.get('fisherfolk', '').strip()
        if fisherfolk_id:
            if not fisherfolk_id.isdigit():
                return qs.none()
            qs = qs.filter(members__fisherfolk_id=fisherfolk_id, members__is_active=True).distinct()
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

    @transaction.atomic
    def perform_create(self, serializer):
        organization_id = self.kwargs['pk']
        fisherfolk = serializer.validated_data['fisherfolk']
        if FisherfolkOrganizationMember.objects.filter(organization_id=organization_id, fisherfolk=fisherfolk).exists():
            raise serializers.ValidationError(
                {'detail': 'This fisherfolk is already a member of this organization.'}
            )
        member = serializer.save(organization_id=organization_id)
        explicit_is_main = self.request.data.get('is_main')
        if explicit_is_main is not None:
            explicit_is_main = str(explicit_is_main).lower() in ('true', '1')
        _resolve_and_assign_main(
            member,
            FisherfolkOrganizationMember.objects.filter(fisherfolk_id=fisherfolk.id, is_active=True).exclude(pk=member.pk),
            fisherfolk.barangay,
            explicit_is_main,
        )


def _set_fisherfolk_member_active(member, is_active, reason=''):
    """Shared by both the staff-only and org-scoped set-active views below.
    Toggle-not-delete batch: deactivating still auto-clears any officer
    position held via this membership row — the CASCADE that used to do
    this automatically only fires on a real row delete, and this path no
    longer deletes the row, so it's explicit here instead.

    Optional-but-encouraged reason (Batch: reason field) — stored on this
    row directly (deactivation_reason) since it's a real per-membership
    row, unlike Farmer's inline flag. Falls back to the same generic text
    as before on the auto-cleared officer row when none is given.

    Batch (Phase B): is_main handling mirrors _set_farmer_member_active
    exactly — deactivating a MAIN membership tries to promote another
    active one via the same barangay-match rule used at join time."""
    reason = (reason or '').strip()
    was_main = False
    if not is_active:
        member.deactivation_reason = reason
        # Batch: mark ended instead of deleting — see
        # FarmersOrganizationMemberAddView.create() above.
        FisherfolkOrganizationOfficer.objects.filter(member=member, is_active=True).update(
            is_active=False,
            term_end_date=timezone.localdate(),
            early_exit_reason=reason or 'Organization membership deactivated.',
        )
        was_main = member.is_main
        member.is_main = False
    else:
        member.deactivation_reason = ''
    member.is_active = is_active
    member.save(update_fields=['is_active', 'deactivation_reason', 'is_main'])
    if was_main:
        _promote_main_after_deactivation(
            FisherfolkOrganizationMember.objects.filter(fisherfolk_id=member.fisherfolk_id, is_active=True),
            member.fisherfolk.barangay,
        )


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
        _set_fisherfolk_member_active(member, str(is_active).lower() in ('true', '1'), request.data.get('reason'))
        return Response({
            'id': member.id, 'is_active': member.is_active,
            'deactivation_reason': member.deactivation_reason, 'is_main': member.is_main,
        })


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
        _set_fisherfolk_member_active(member, str(is_active).lower() in ('true', '1'), request.data.get('reason'))
        return Response({
            'id': member.id, 'is_active': member.is_active,
            'deactivation_reason': member.deactivation_reason, 'is_main': member.is_main,
        })


class FisherfolkOrganizationMemberSetMainView(APIView):
    """Batch (Phase B): explicit override — mirrors
    FarmersOrganizationMemberSetMainView exactly, including being staff-only
    (see that view's docstring for why)."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk, member_id):
        member = get_object_or_404(FisherfolkOrganizationMember, pk=member_id, organization_id=pk)
        if not member.is_active:
            return Response(
                {'detail': 'An inactive membership cannot be set as main.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        FisherfolkOrganizationMember.objects.filter(
            fisherfolk_id=member.fisherfolk_id, is_active=True,
        ).exclude(pk=member.pk).update(is_main=False)
        member.is_main = True
        member.save(update_fields=['is_main'])
        return Response({'id': member.id, 'is_main': member.is_main})


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
# An identifier (RSBSA / FishR / LGU number) is matched only once enough of it
# has been typed to be a real number rather than a guess, and only when the
# term actually contains a digit — so typing "ana" can never sweep the number
# columns, and typing "01" cannot list the registry. The result cap and the
# minimum length above still apply on top.
MIN_NUMBER_SEARCH_LENGTH = 5


def _name_or_number_q(search, name_fields, number_fields):
    """Suggestion match for the add-member search: a full-name query ("Juan
    Cruz", any order, partial words) via the shared build_name_search_q, or —
    when the term looks like a number and is long enough — an identifier."""
    q = build_name_search_q(search, name_fields)
    if len(search) >= MIN_NUMBER_SEARCH_LENGTH and any(ch.isdigit() for ch in search):
        for field in number_fields:
            q |= Q(**{f'{field}__icontains': search})
    return q


def _prefix_first(qs, search, name_fields):
    """Order suggestions so people whose name STARTS with what was typed come
    before people whose name merely contains it ("ana" -> Ana Garcia before
    Miana Abat), then alphabetically. Applied before the result cap, so the
    best matches are the ones that survive it."""
    tokens = search.split()
    if not tokens:
        return qs.order_by('last_name', 'first_name')
    starts = Q()
    for field in name_fields:
        starts |= Q(**{f'{field}__istartswith': tokens[0]})
    return qs.annotate(
        _prefix_rank=Case(When(starts, then=0), default=1, output_field=IntegerField()),
    ).order_by('_prefix_rank', 'last_name', 'first_name')


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
        qs = (
            Farmer.objects
            .filter(_name_or_number_q(
                search, ['first_name', 'middle_name', 'last_name'], ['rsbsa_number'],
            ))
            .prefetch_related('farmer_organizations__organization')
        )
        return _prefix_first(qs, search, ['first_name', 'middle_name', 'last_name'])[:MAX_RESULTS]


class FisherfolkOrganizationAddCandidateSearchView(_AddCandidateSearchBase):
    """Fisherfolk only — a Fisherfolk Organization can never surface farmers."""
    org_linked_record_type = 'FISHERFOLK_ORG'
    serializer_class = FisherfolkAddCandidateSerializer

    def get_queryset(self):
        search = self._search_term()
        if len(search) < MIN_SEARCH_LENGTH:
            return Fisherfolk.objects.none()
        qs = (
            Fisherfolk.objects
            .filter(_name_or_number_q(
                search, ['first_name', 'middle_name', 'last_name'],
                ['lgu_registration_number', 'fishr_number', 'rsbsa_number'],
            ))
            .prefetch_related('fisherfolk_organizations__organization')
        )
        return _prefix_first(qs, search, ['first_name', 'middle_name', 'last_name'])[:MAX_RESULTS]


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
    are reported as 'would_create'/'would_block' instead of 'created'/
    'blocked' so the frontend can't mistake a preview for a completed
    distribution.

    Batch: the 30-day cross-org check was previously informational only
    (every member still got a record, just flagged with a note). Now a
    hard block — whichever organization distributes a given assistance_type
    to a given person first within the rolling 30-day window is the one
    that counts; this naturally falls out of the query below unchanged
    (it already looked back from the NEW date_given, so an earlier
    distribution from another org always blocks a later one, regardless of
    which org is "first" in any other sense). A later attempt from the
    SAME organization is still deliberately excluded here, same as before
    — re-distributing is a different concern this check was never meant to
    catch, and remains unblocked.

    Batch (Phase B — Phase A gap fix): "is this a prior record from the SAME
    organization now distributing" used to be decided by comparing the
    prior record's attributed_organization (a live, independently-recomputed
    barangay-match guess — see _resolve_attributed_organization) against
    `organization.id`. That guess is NOT the organization that actually ran
    a given bulk distribution — a non-main organization distributing FIRST
    still produces a record whose attribution resolves to the person's
    barangay-matching (main) organization, because attribution is computed
    from the person's current memberships, not from who clicked the button.
    That let a later, genuinely-different, main-organization attempt slip
    through unblocked, since the prior record's attribution already equaled
    the main organization's own id — indistinguishable from "I'm just
    re-distributing my own prior record." Live-tested and confirmed capable
    of double-distributing (see Phase A/Phase B reports).

    Fixed by keying "is this mine" off `distributed_by_organization`, set
    below to the real, durable, never-recomputed organization running THIS
    request — for any prior record that has one (i.e. came from this same
    bulk-distribution flow, before or after this fix shipped isn't relevant
    — old rows simply have it null and fall back to the line below). Only
    when a prior record has NO distributed_by_organization (an individual
    "Report/Log Assistance" entry, never a bulk-distribution action) does
    the check fall back to the old attributed_organization comparison —
    unchanged behavior for that path, which this fix does not touch.
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

        # Safeguard (blocking): same assistance_type already delivered to
        # this person within the last 30 days, by a DIFFERENT organization.
        # "Different" is decided off distributed_by_organization when a
        # prior record has one (the real, durable acting org — see this
        # function's own docstring for the bug this fixes), falling back to
        # the live-guessed attributed_organization only for prior records
        # that have no distributed_by_organization at all (individual log
        # entries, never a bulk-distribution action).
        prior = (
            record_model.objects
            .filter(assistance_type=assistance_type, date_given__gte=cutoff, date_given__lte=date_given, **person_filter)
            .exclude(
                Q(distributed_by_organization_id=organization.id)
                | Q(distributed_by_organization__isnull=True, **{f'{attributed_field}_id': organization.id})
                | Q(distributed_by_organization__isnull=True, **{f'{attributed_field}__isnull': True})
            )
            .select_related(attributed_field, 'distributed_by_organization')
            .order_by('-date_given')
            .first()
        )
        block_reason = None
        if prior:
            other_org = prior.distributed_by_organization or getattr(prior, attributed_field)
            block_reason = (
                f'Already received {prior.assistance_type} from {other_org.name} on '
                f'{prior.date_given} — within the last 30 days. Only one organization\'s '
                f'distribution of the same assistance type counts per person in that window.'
            )

        if block_reason:
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'id_number': id_number,
                'status': 'would_block' if not commit else 'blocked',
                'reason': block_reason,
            })
            continue

        if not commit:
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'id_number': id_number,
                'status': 'would_create',
            })
            continue

        # source_agencies is the JSON list both models carry since the
        # source_agency -> source_agencies rename (interventions migrations
        # 0014-0016); the four type-conditional fields below are validated by
        # OrganizationDistributionRequestSerializer and were previously
        # accepted and then dropped here. seed_type / fertilizer_type exist
        # on BeneficiaryRecord only.
        type_fields = {
            'training_duration_days': data.get('training_duration_days'),
            'equipment_type': data.get('equipment_type', ''),
        }
        if record_model is BeneficiaryRecord:
            type_fields['seed_type'] = data.get('seed_type', '')
            type_fields['fertilizer_type'] = data.get('fertilizer_type', '')

        try:
            with transaction.atomic():
                record = record_model.objects.create(
                    assistance_type=assistance_type,
                    source_agencies=data.get('source_agencies', []),
                    quantity=data.get('quantity', ''),
                    date_given=date_given,
                    season=data.get('season', ''),
                    year=date_given.year,
                    recorded_by=user,
                    **type_fields,
                    # Batch (Phase B — Phase A gap fix): the real, durable
                    # acting organization — see this function's own
                    # docstring and distributed_by_organization's model
                    # comment for why this can't be reconstructed later
                    # from attributed_organization.
                    distributed_by_organization=organization,
                    **{person_field: person, text_field: data.get('description', '')},
                )
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'id_number': id_number,
                'status': 'created',
                'record_id': record.id,
            })
        except Exception as exc:
            results.append({
                'person_id': person.id,
                'name': person.full_name,
                'id_number': id_number,
                'status': 'error',
                'reason': str(exc),
            })
        else:
            # Only after the row is really saved — the recipient is told
            # (if it is already-received and they have an account). Kept in
            # the else: clause so a notification problem can never be
            # reported as a failed distribution for this member.
            notify_assistance_recorded(record, user)

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
        # this distribution. Batch (Phase B): sourced from the join table
        # now (mirrors the fisherfolk side below) — a farmer can belong to
        # several organizations, so this must be THIS org's roster
        # specifically, not "the" org on the farmer's own record (there is
        # no longer such a thing).
        # Active memberships only: "every current member" means exactly
        # that — a deactivated member (Toggle-not-delete batch) keeps their
        # row and history but must not receive a new record.
        members = [
            m.farmer for m in
            FarmersOrganizationMember.objects.filter(organization_id=pk, is_active=True).select_related('farmer')
        ]

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

        # Active memberships only — see the farmers view above.
        members = [
            m.fisherfolk for m in
            FisherfolkOrganizationMember.objects.filter(organization_id=pk, is_active=True).select_related('fisherfolk')
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


# ─── Organization Excel import (create-new-organizations) ──────────────────
# "Import File" on the Farmers/Fisherfolk Organizations pages — a distinct
# feature from the RSBSA update-import (farmers/rsbsa_import_views.py),
# which only ever UPDATES existing Farmer/Fisherfolk records and never
# creates one. This one creates new FarmersOrganization/FisherfolkOrganization
# rows — the registration entities themselves, never membership-linkage rows
# (Farmer.farmers_organization is a direct FK set from the farmer's own
# profile, not an import concern; FisherfolkOrganizationMember is a separate
# join table with its own add-member flow) — see the investigation that
# preceded this feature for why the two domains' membership can't share one
# import shape.
#
# Follows the same dry_run convention as _run_organization_distribution
# above (one endpoint, `dry_run` truthy => preview only, falsy => commit) and
# the same two-pass in-file-then-database duplicate detection already
# shipped for Crop/Fisheries Forecasting's imports (production/views.py
# ForecastingImportView, fisheries/views.py StockingForecastingImportView).
# Identity is the organization's own `registration_number` — already
# unique=True on both models. blank=True on FisherfolkOrganization means the
# model itself would allow a blank value, but this import requires a
# non-blank one anyway: it's the only reliable identity for duplicate
# detection, and it's also what the citizen-account shell created below
# needs to be worth anything (an org with no registration number can never
# log in — see FarmersOrganization.registration_number's own comment).

ORG_TEMPLATE_HEADERS = [
    'Name', 'Barangay', 'Street Address', 'Date Organized (YYYY-MM-DD)',
    'Date Registered (YYYY-MM-DD)', 'Registration Number', 'Registration Agency',
    'Email Address', 'Contact Person', 'Contact Number',
]
ORG_TEMPLATE_COL_WIDTHS = [30, 20, 28, 24, 24, 22, 20, 28, 22, 18]


def _org_import_template_response(filename, sample_row, agency_note):
    from django.http import HttpResponse
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
    ws = wb.active
    ws.title = 'Organization Import'

    green_fill = PatternFill(start_color='1E4620', end_color='1E4620', fill_type='solid')
    white_font = Font(color='FFFFFF', bold=True)
    for col, (header, width) in enumerate(zip(ORG_TEMPLATE_HEADERS, ORG_TEMPLATE_COL_WIDTHS), 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = green_fill
        cell.font = white_font
        ws.column_dimensions[cell.column_letter].width = width

    for col, value in enumerate(sample_row, 1):
        ws.cell(row=2, column=col, value=value)
    ws.cell(row=4, column=1, value=agency_note)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    response = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


FARMERS_ORG_TEMPLATE_SAMPLE = [
    'Aringay Farmers Alliance', 'Poblacion', 'Purok 1', '2020-03-15', '2020-06-01',
    'FA-2020-001', 'CDA', 'org@example.com', 'Juan Dela Cruz', '09171234567',
]
FISHERFOLK_ORG_TEMPLATE_SAMPLE = [
    'Aringay Fisherfolk Alliance', 'Santa Cecilia', 'Purok 2', '2021-01-10', '2021-04-20',
    'FF-2021-001', 'BFAR', 'org@example.com', 'Maria Santos', '09181234567',
]
ORG_TEMPLATE_NOTE_PREFIX = 'Registration Agency must be'


def _parse_org_import_row(row, agency_choices):
    """Parses one raw Excel row (10 columns, matching ORG_TEMPLATE_HEADERS)
    into a dict of cleaned values ready to hand to the model's own
    DetailSerializer. Raises ValueError (caller buckets that row as invalid)
    on a malformed date, an unrecognized barangay, or an unrecognized
    registration agency code — everything else (which fields are actually
    *required*, contact number format, future-date checks) is left to that
    serializer, exactly as the manual "Add Organization" modal already gets,
    rather than re-deriving those rules by hand here."""
    from datetime import datetime as _datetime

    from core.utils import cell_text

    def s(i):
        return cell_text(row[i]) if i < len(row) else ''

    def parse_date(raw):
        if raw is None or str(raw).strip() == '':
            return None
        # A real Excel date cell arrives as a datetime (a date SUBCLASS): it
        # must be reduced to a date, or the serializer refuses it with
        # "Expected a date but got a datetime" — i.e. every date typed the
        # normal Excel way used to fail.
        if isinstance(raw, _datetime):
            return raw.date()
        if isinstance(raw, date):
            return raw
        try:
            return date.fromisoformat(str(raw).strip()[:10])
        except ValueError:
            raise ValueError(f'Invalid date "{raw}". Use YYYY-MM-DD.')

    barangay_raw = s(1)
    barangay = normalize_barangay(barangay_raw) if barangay_raw else ''
    if barangay_raw and not barangay:
        raise ValueError(f'Barangay "{barangay_raw}" does not match any known Aringay barangay.')

    agency_raw = s(6)
    agency = ''
    if agency_raw:
        agency_map = {code.upper(): code for code, _ in agency_choices}
        agency = agency_map.get(agency_raw.upper())
        if not agency:
            valid = '/'.join(code for code, _ in agency_choices)
            raise ValueError(f'Invalid registration agency "{agency_raw}". Use one of: {valid}.')

    payload = {
        'name': s(0),
        'barangay': barangay,
        'street_address': s(2),
        'registration_number': s(5),
        'registration_agency': agency,
        'email_address': s(7),
        'contact_person': s(8),
        'contact_number': s(9),
    }
    # Excel stores 09171234567 as a number and drops the leading zero.
    _digits = ''.join(ch for ch in payload['contact_number'] if ch.isdigit())
    if len(_digits) == 10 and _digits.startswith('9') and payload['contact_number'] == _digits:
        payload['contact_number'] = '0' + _digits
    date_organized = parse_date(row[3] if len(row) > 3 else None)
    date_registered = parse_date(row[4] if len(row) > 4 else None)
    if date_organized is not None:
        payload['date_organized'] = date_organized
    if date_registered is not None:
        payload['date_registered'] = date_registered
    return payload


def _run_organization_import(model, serializer_class, linked_record_type, agency_choices, file, dry_run, user, sample_row=None):
    from collections import defaultdict

    from core.utils import ImportFileError, read_template_rows

    # Rows are found by the header row's content (not "everything after row
    # 2"), so overwriting the template's sample row no longer loses a row,
    # and the sample/note lines are never imported as organizations.
    try:
        rows_iter = read_template_rows(
            file, file.name, ORG_TEMPLATE_HEADERS,
            sample_row=sample_row, note_prefixes=(ORG_TEMPLATE_NOTE_PREFIX,),
        )
    except ImportFileError as exc:
        return Response({'error': str(exc)}, status=400)
    except Exception as exc:
        return Response({'error': f'Invalid file: {exc}'}, status=400)

    errors = []
    rows_out = []
    ready = []
    groups = defaultdict(list)

    def invalid(row_num, msg):
        errors.append({'row': row_num, 'error': msg})
        rows_out.append({'row': row_num, 'status': 'invalid', 'label': f'Row {row_num}', 'detail': msg})

    for row_num, row in rows_iter:
        try:
            parsed = _parse_org_import_row(row, agency_choices)
        except ValueError as exc:
            invalid(row_num, str(exc))
            continue

        reg_number = parsed['registration_number']
        if not reg_number:
            invalid(row_num, 'Registration Number is required for import — it is how duplicate rows/records are '
                             'detected and how the organization\'s citizen account gets linked.')
            continue

        key = reg_number.lower()
        ready.append({'row_num': row_num, 'parsed': parsed, 'key': key})
        groups[key].append(row_num)

    created = 0
    for item in ready:
        row_num, parsed, key = item['row_num'], item['parsed'], item['key']
        reg_number = parsed['registration_number']
        label = f'{parsed["name"] or "(no name)"} — {reg_number}'

        colliding_rows = [r for r in groups[key] if r != row_num]
        if colliding_rows:
            detail = (
                f'Duplicate Registration Number "{reg_number}" also appears in row(s) '
                f'{", ".join(str(r) for r in colliding_rows)} of this file. None of the colliding rows were created — '
                f'resolve the conflict and re-upload.'
            )
            rows_out.append({'row': row_num, 'status': 'duplicate_in_file', 'label': label, 'detail': detail, 'colliding_rows': colliding_rows})
            continue

        existing = model.objects.filter(registration_number__iexact=reg_number).first()
        if existing:
            detail = f'An organization with Registration Number "{reg_number}" already exists (record #{existing.id}, "{existing.name}"). Not created again.'
            rows_out.append({'row': row_num, 'status': 'duplicate_in_database', 'label': label, 'detail': detail, 'existing_record_id': existing.id})
            continue

        serializer = serializer_class(data=parsed)
        if not serializer.is_valid():
            detail = '; '.join(f'{field}: {"; ".join(str(m) for m in msgs)}' for field, msgs in serializer.errors.items())
            invalid(row_num, detail or 'Invalid row.')
            continue

        if dry_run:
            rows_out.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': 'Will be created.'})
            continue

        with transaction.atomic():
            instance = serializer.save()
            create_inactive_citizen_shell(linked_record_type, instance)
        created += 1
        rows_out.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': f'Created (record #{instance.id}).'})

    summary = {
        'ready': sum(1 for r in rows_out if r['status'] == 'ready'),
        'duplicate_in_file': sum(1 for r in rows_out if r['status'] == 'duplicate_in_file'),
        'duplicate_in_database': sum(1 for r in rows_out if r['status'] == 'duplicate_in_database'),
        'invalid': sum(1 for r in rows_out if r['status'] == 'invalid'),
    }
    return Response({
        'created': created, 'errors': errors, 'dry_run': dry_run, 'summary': summary, 'rows': rows_out,
    })


class FarmersOrganizationImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _org_import_template_response(
            'farmers_organizations_import_template.xlsx',
            FARMERS_ORG_TEMPLATE_SAMPLE,
            'Registration Agency must be one of: SEC / CDA / DOLE',
        )


class FarmersOrganizationImportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        dry_run = str(request.data.get('dry_run', '')).strip().lower() in ('1', 'true', 'yes')
        from core.utils import run_import_atomically
        return run_import_atomically(lambda: _run_organization_import(
            FarmersOrganization, FarmersOrganizationDetailSerializer, User.LinkedRecordType.FARMERS_ORG,
            FarmersOrganization.REGISTRATION_AGENCY_CHOICES, file, dry_run, request.user,
            sample_row=FARMERS_ORG_TEMPLATE_SAMPLE,
        ))


class FisherfolkOrganizationImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _org_import_template_response(
            'fisherfolk_organizations_import_template.xlsx',
            FISHERFOLK_ORG_TEMPLATE_SAMPLE,
            'Registration Agency must be one of: SEC / CDA / DOLE / BFAR',
        )


class FisherfolkOrganizationImportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        dry_run = str(request.data.get('dry_run', '')).strip().lower() in ('1', 'true', 'yes')
        from core.utils import run_import_atomically
        return run_import_atomically(lambda: _run_organization_import(
            FisherfolkOrganization, FisherfolkOrganizationDetailSerializer, User.LinkedRecordType.FISHERFOLK_ORG,
            FisherfolkOrganization.REGISTRATION_AGENCY_CHOICES, file, dry_run, request.user,
            sample_row=FISHERFOLK_ORG_TEMPLATE_SAMPLE,
        ))
