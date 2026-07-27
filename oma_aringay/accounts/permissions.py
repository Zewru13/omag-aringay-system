from rest_framework.permissions import SAFE_METHODS, BasePermission


class IsAdmin(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'ADMIN'
        )


class IsEvaluator(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'EVALUATOR'
        )


class IsAdminOrEvaluator(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role in ['ADMIN', 'EVALUATOR']
        )


class IsCitizen(BasePermission):
    def has_permission(self, request, view):
        return (
            request.user
            and request.user.is_authenticated
            and request.user.role == 'CITIZEN'
        )


class IsStaffOrOwnRecordCitizen(BasePermission):
    """
    Batch 11: ADMIN/EVALUATOR keep their full existing access, unchanged —
    this class is a strict superset of IsAdminOrEvaluator's behavior, not a
    replacement of its rules. A CITIZEN may only touch activity/harvest
    entries belonging to their OWN linked Farmer/Fisherfolk record
    (resolved via User.get_linked_record(), Batch 10), and — for unsafe
    methods on a specific entry — only one they themselves created.

    Deliberately a proper object-level permission (has_object_permission),
    not just a queryset filter: a queryset filter alone only protects
    LIST views. A detail endpoint (GET/PATCH/DELETE .../<id>/) receiving a
    guessed/incremented ID would bypass a filter-only check entirely and
    still return someone else's record. has_object_permission is what DRF
    actually calls before serving retrieve/update/destroy on a specific
    object, so a citizen requesting another person's entry by ID is
    rejected here regardless of how the object was looked up.

    Views using this must implement two small hooks (deliberately NOT a
    dotted-string/reflection convention — the two activity-log models call
    their creator field 'recorded_by' and 'logged_by' respectively, and
    forcing a shared naming scheme onto that would be more fragile than
    just asking each view to state its own field directly):
      - get_target_owner_id(self, request) -> int | None
            OPTIONAL — only needed on List/Create views, where has_permission
            is the only check that ever runs (there's no object to fetch for
            a list, and a create's object doesn't exist yet). Must resolve
            the parent CropMonitoringRecord/StockingRecord identified by the
            request (e.g. a 'monitoring_id'/'stocking_id' URL kwarg) and
            return its farmer_id/fisherfolk_id, or None if that parent
            record doesn't exist / isn't identifiable. Detail-only views
            (Retrieve/Update, no list/create) should simply omit this hook —
            has_permission passes CITIZEN through unconditionally and lets
            has_object_permission (below) do the real check once DRF has
            fetched the specific object.
      - get_object_owner_id(self, obj) -> int | None
            Called by has_object_permission for retrieve/update/destroy.
            Same idea, but reading the already-fetched entry object's own
            FK chain (obj.monitoring_record.farmer_id, etc).
      - get_object_creator_id(self, obj) -> int | None
            Called by has_object_permission only for unsafe methods
            (PATCH/PUT/DELETE). Returns the entry's own recorded_by_id /
            logged_by_id.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role in ('ADMIN', 'EVALUATOR'):
            return True
        if request.user.role != 'CITIZEN':
            return False
        # Batch 12: this class only ever means "own Farmer/Fisherfolk
        # record" — an ORGANIZATION-linked citizen must never pass here,
        # even coincidentally (their linked_record_id lives in a completely
        # different table and comparing it against a farmer_id/
        # fisherfolk_id would be a raw-int collision waiting to happen).
        if request.user.linked_record_type not in ('FARMER', 'FISHERFOLK'):
            return False

        get_target_owner_id = getattr(view, 'get_target_owner_id', None)
        if get_target_owner_id is None:
            # Detail-only view (no list/create action) — nothing to check
            # yet before the object is fetched; has_object_permission below
            # is what actually gates this request.
            return True

        owner_id = get_target_owner_id(request)
        if owner_id is None:
            return False
        return request.user.linked_record_id == owner_id

    def has_object_permission(self, request, view, obj):
        if request.user.role in ('ADMIN', 'EVALUATOR'):
            return True
        if request.user.role != 'CITIZEN':
            return False
        if request.user.linked_record_type not in ('FARMER', 'FISHERFOLK'):
            return False

        if view.get_object_owner_id(obj) != request.user.linked_record_id:
            return False

        if request.method not in SAFE_METHODS:
            if view.get_object_creator_id(obj) != request.user.id:
                return False
        return True


def _person_is_org_member(linked_record_type, org_id, person_id):
    """
    Batch 12: is `person_id` (a Farmer or Fisherfolk pk, depending on
    linked_record_type) ACTUALLY a current member of the organization
    `org_id` — checked via each domain's own confirmed-live membership
    mechanism (Step 0), never assumed equal to attributed_organization/
    attributed_fisherfolk_organization (interventions.models), which can
    legitimately point at a DIFFERENT organization than the one doing the
    reporting — that's exactly the scenario this batch exists to get right.
      - FARMERS_ORG: Farmer.farmers_organization is the only live
        mechanism (FarmersOrganizationMember confirmed dormant, 0 rows).
      - FISHERFOLK_ORG: FisherfolkOrganizationMember join rows — the live,
        genuinely-multi-membership mechanism for this domain.
    """
    if org_id is None or person_id is None:
        return False
    if linked_record_type == 'FARMERS_ORG':
        from farmers.models import Farmer
        return Farmer.objects.filter(id=person_id, farmers_organization_id=org_id).exists()
    if linked_record_type == 'FISHERFOLK_ORG':
        from associations.models import FisherfolkOrganizationMember
        return FisherfolkOrganizationMember.objects.filter(
            fisherfolk_id=person_id, organization_id=org_id,
        ).exists()
    return False


class IsOrgMemberRecordCitizen(BasePermission):
    """
    Batch 12: same has_object_permission discipline as
    IsStaffOrOwnRecordCitizen (Batch 11) above — ADMIN/EVALUATOR keep full
    existing access unchanged. A CITIZEN linked to a FARMERS_ORG/
    FISHERFOLK_ORG may only create/view a BeneficiaryRecord/
    FisherfolkBeneficiaryRecord for a farmer/fisherfolk who is ACTUALLY a
    current member of their own organization, per _person_is_org_member's
    live-mechanism check.

    This is deliberately a SIBLING of IsStaffOrOwnRecordCitizen, not a
    subclass or a shared base — that class checks identity ("is this MY own
    id"), this one checks set membership ("is this person a member of MY
    org"), and collapsing two different ownership semantics into one class
    to save a few lines would make both harder to reason about. The
    has_permission/has_object_permission shape and the hook-based (non-
    reflection) convention are what's being reused, per this batch's
    instruction not to invent a parallel mechanism.

    Views using this must implement:
      - get_target_person_id(self, request) -> int | None
            OPTIONAL, list/create only (same rule as
            IsStaffOrOwnRecordCitizen's get_target_owner_id) — resolve the
            farmer/fisherfolk id named in the request (e.g.
            request.data.get('farmer')).
      - get_object_person_id(self, obj) -> int | None
            retrieve/update/destroy — the record's own farmer_id/
            fisherfolk_id.
      - get_object_creator_id(self, obj) -> int | None
            unsafe methods only — the record's own recorded_by_id.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role in ('ADMIN', 'EVALUATOR'):
            return True
        if request.user.role != 'CITIZEN':
            return False
        if request.user.linked_record_type not in ('FARMERS_ORG', 'FISHERFOLK_ORG'):
            return False

        get_target_person_id = getattr(view, 'get_target_person_id', None)
        if get_target_person_id is None:
            return True

        person_id = get_target_person_id(request)
        return _person_is_org_member(
            request.user.linked_record_type, request.user.linked_record_id, person_id,
        )

    def has_object_permission(self, request, view, obj):
        if request.user.role in ('ADMIN', 'EVALUATOR'):
            return True
        if request.user.role != 'CITIZEN':
            return False
        if request.user.linked_record_type not in ('FARMERS_ORG', 'FISHERFOLK_ORG'):
            return False

        person_id = view.get_object_person_id(obj)
        if not _person_is_org_member(request.user.linked_record_type, request.user.linked_record_id, person_id):
            return False

        if request.method not in SAFE_METHODS:
            if view.get_object_creator_id(obj) != request.user.id:
                return False
        return True


class IsOwnOrgOrStaff(BasePermission):
    """
    Batch 12: gates a view whose URL identifies one SPECIFIC organization by
    a 'pk' kwarg (associations app's org-scoped member/officer/equipment
    endpoints) — ADMIN/EVALUATOR always pass; a CITIZEN passes only when
    linked to THAT EXACT organization.

    Not IsOrgMemberRecordCitizen: that class gates a farmer/fisherfolk-
    shaped resource by membership ("is this person in my org"); this one
    gates an organization-shaped resource by identity ("is this org me") —
    same has_permission-only shape as the list/create half of
    IsStaffOrOwnRecordCitizen's target-owner check, applied to a URL kwarg
    instead of a request body field.

    Views using this must set a class attribute:
      - org_linked_record_type = 'FARMERS_ORG' | 'FISHERFOLK_ORG'
            Required — without it, a FISHERFOLK_ORG citizen whose
            linked_record_id happens to numerically match some unrelated
            FarmersOrganization's pk could pass a farmers-org-scoped view
            (and vice versa). Comparing linked_record_type first, not just
            linked_record_id, is what closes that.
    """

    def has_permission(self, request, view):
        if not (request.user and request.user.is_authenticated):
            return False
        if request.user.role in ('ADMIN', 'EVALUATOR'):
            return True
        if request.user.role != 'CITIZEN':
            return False

        required_type = getattr(view, 'org_linked_record_type', None)
        if required_type is None or request.user.linked_record_type != required_type:
            return False

        try:
            org_id = int(view.kwargs.get('pk'))
        except (TypeError, ValueError):
            return False
        return request.user.linked_record_id == org_id
