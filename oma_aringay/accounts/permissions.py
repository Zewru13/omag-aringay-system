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
    replacement of its rules. A CITIZEN may only touch activity/harvest/
    disaster entries belonging to their OWN linked Farmer/Fisherfolk record
    (resolved via User.get_linked_record(), Batch 10).

    Evaluator-parity batch: the entry no longer needs to have been created
    by that citizen — has_object_permission's own-creator check was
    removed, so a citizen may now edit a STAFF-logged entry on their own
    record too, matching what an Evaluator could already do. Ownership of
    the PARENT record (get_object_owner_id vs linked_record_id) remains
    the sole gate and was not loosened at all — a citizen still cannot
    reach another person's record by ID, regardless of who logged what on
    it. Existing views' get_object_creator_id implementations are simply
    unused now (harmless to leave in place — this class no longer calls
    that hook at all, on any method, safe or unsafe).

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
            FK chain (obj.monitoring_record.farmer_id, etc). This is the
            ONLY hook has_object_permission calls (Evaluator-parity batch —
            see above).
      - get_object_creator_id(self, obj) -> int | None
            No longer called by this class as of the Evaluator-parity
            batch. Left as part of the documented interface only because
            existing views already implement it and removing it from them
            is unnecessary churn; a new view adopting this permission class
            does not need to implement it.
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
        # A view whose owner ids are Fisherfolk (or Farmer) pks declares it, so a citizen linked to the
        # OTHER domain can never pass by a coincidental equal number (a farmer id equal to a fisherfolk id).
        required_type = getattr(view, 'owner_record_type', None)
        if required_type and request.user.linked_record_type != required_type:
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
        required_type = getattr(view, 'owner_record_type', None)
        if required_type and request.user.linked_record_type != required_type:
            return False

        # Evaluator-parity batch: a CITIZEN may act on ANY entry belonging to
        # their own record now, not just ones they personally created —
        # get_object_creator_id is deliberately no longer consulted here.
        # The line above (get_object_owner_id vs linked_record_id) is the
        # ENTIRE remaining boundary: it is exactly as strict as it was
        # before this change, and is still checked unconditionally for both
        # safe and unsafe methods. A citizen touching another person's
        # record — by ID, staff-logged or not — still fails right here.
        return view.get_object_owner_id(obj) == request.user.linked_record_id


# ─── Fisheries ownership (Admin pages reused by Fisherfolk accounts) ─────────────
# ONE role-aware rule for every Fisheries Monitoring / Forecasting / Disaster / Capture endpoint the
# Admin pages call:
#   - ADMIN / EVALUATOR: no filtering at all - exactly the behaviour these endpoints always had.
#   - a CITIZEN linked to a Fisherfolk record (User.get_linked_fisherfolk_id): every queryset is narrowed
#     to rows of THAT fisherfolk, so lists, details, updates and deletes only ever see their own rows (a
#     guessed id of someone else's record is simply a 404), and creates are forced onto their own record.
#   - anyone else (an organization citizen, a citizen with no linked record): rejected.
STAFF_ROLES = ('ADMIN', 'EVALUATOR')


def is_fisherfolk_citizen(user):
    return bool(
        user and user.is_authenticated and user.role == 'CITIZEN'
        and user.get_linked_fisherfolk_id() is not None
    )


def fisherfolk_scope(user):
    """None for ADMIN/EVALUATOR (= no filter); the user's own Fisherfolk id for a fisherfolk citizen."""
    if user.role in STAFF_ROLES:
        return None
    return user.get_linked_fisherfolk_id()


def scope_to_fisherfolk(queryset, user, lookup='fisherfolk_id'):
    """Narrow `queryset` to the user's own fisherfolk via `lookup` (e.g. 'production_cycle__fisherfolk_id');
    unchanged for staff. Callers sit behind IsStaffOrFisherfolk, so every other user is already rejected."""
    owner = fisherfolk_scope(user)
    return queryset if owner is None else queryset.filter(**{lookup: owner})


class IsStaffOrFisherfolk(BasePermission):
    """ADMIN/EVALUATOR exactly as IsAdminOrEvaluator; additionally a fisherfolk CITIZEN, whose data the view
    then narrows with scope_to_fisherfolk. Views list staff-only HTTP methods for citizens in
    `fisherfolk_blocked_methods` (e.g. ('DELETE',) - record deletion stays a staff/governance action)."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role in STAFF_ROLES:
            return True
        if not is_fisherfolk_citizen(user):
            return False
        return request.method not in getattr(view, 'fisherfolk_blocked_methods', ())


class IsStaffOrFisherfolkReadOnly(IsStaffOrFisherfolk):
    """Shared reference data (species, feed types, disease types...): staff unchanged, a fisherfolk may read."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role in STAFF_ROLES or request.method in SAFE_METHODS


# ─── Farmer ownership (Admin crop pages reused by Farmer accounts) ───────────────
# The Farmer counterpart of the Fisherfolk block above, for the crop endpoints the Farmer pages call:
#   - ADMIN / EVALUATOR: no filtering - exactly the behaviour these endpoints always had.
#   - a CITIZEN linked to a Farmer record (User.get_linked_farmer_id, which is None for any other link type, so
#     an organization or fisherfolk id can never be mistaken for a farmer id): querysets are narrowed to rows of
#     THAT farmer; another farmer's id is simply a 404.
#   - anyone else: rejected by IsStaffOrFarmer, and (defence in depth) scope_to_farmer returns NOTHING for them
#     rather than everything, should a view ever forget the permission class.


def is_farmer_citizen(user):
    return bool(
        user and user.is_authenticated and user.role == 'CITIZEN'
        and user.get_linked_farmer_id() is not None
    )


def farmer_scope(user):
    """None for ADMIN/EVALUATOR (= no filter) and for anyone who is not a farmer; the user's own Farmer id for a
    farmer citizen."""
    if user.role in STAFF_ROLES:
        return None
    return user.get_linked_farmer_id()


def scope_to_farmer(queryset, user, lookup='farmer_id'):
    """Narrow `queryset` to the user's own farmer via `lookup` (e.g. 'monitoring_record__farmer_id'); unchanged for
    staff; EMPTY for any other user who is not a farmer citizen."""
    if user.role in STAFF_ROLES:
        return queryset
    owner = user.get_linked_farmer_id()
    return queryset.none() if owner is None else queryset.filter(**{lookup: owner})


class IsStaffOrFarmer(BasePermission):
    """ADMIN/EVALUATOR exactly as IsAdminOrEvaluator; additionally a farmer CITIZEN, whose data the view then
    narrows with scope_to_farmer. Views list HTTP methods refused for farmers in `farmer_blocked_methods`."""

    def has_permission(self, request, view):
        user = request.user
        if not (user and user.is_authenticated):
            return False
        if user.role in STAFF_ROLES:
            return True
        if not is_farmer_citizen(user):
            return False
        return request.method not in getattr(view, 'farmer_blocked_methods', ())


class IsStaffOrFarmerReadOnly(IsStaffOrFarmer):
    """Shared reference data (crop types, stages): staff unchanged, a farmer may read."""

    def has_permission(self, request, view):
        if not super().has_permission(request, view):
            return False
        return request.user.role in STAFF_ROLES or request.method in SAFE_METHODS


def _person_is_org_member(linked_record_type, org_id, person_id):
    """
    Batch 12: is `person_id` (a Farmer or Fisherfolk pk, depending on
    linked_record_type) ACTUALLY a current member of the organization
    `org_id` — checked via each domain's own confirmed-live membership
    mechanism (Step 0), never assumed equal to attributed_organization/
    attributed_fisherfolk_organization (interventions.models), which can
    legitimately point at a DIFFERENT organization than the one doing the
    reporting — that's exactly the scenario this batch exists to get right.

    Batch (Phase B): both domains now go through the identical real,
    genuinely-multi-membership mechanism — FarmersOrganizationMember /
    FisherfolkOrganizationMember join rows (Farmer.farmers_organization no
    longer exists).
    """
    if org_id is None or person_id is None:
        return False
    if linked_record_type == 'FARMERS_ORG':
        from associations.models import FarmersOrganizationMember
        return FarmersOrganizationMember.objects.filter(
            farmer_id=person_id, organization_id=org_id,
        ).exists()
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
