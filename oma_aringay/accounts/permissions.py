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

        get_target_owner_id = getattr(view, 'get_target_owner_id', None)
        if get_target_owner_id is None:
            # Detail-only view (no list/create action) — nothing to check
            # yet before the object is fetched; has_object_permission below
            # is what actually gates this request.
            return True

        owner_id = get_target_owner_id(request)
        if owner_id is None:
            return False
        linked = request.user.get_linked_record()
        return linked is not None and linked.id == owner_id

    def has_object_permission(self, request, view, obj):
        if request.user.role in ('ADMIN', 'EVALUATOR'):
            return True
        if request.user.role != 'CITIZEN':
            return False

        linked = request.user.get_linked_record()
        if linked is None:
            return False
        if view.get_object_owner_id(obj) != linked.id:
            return False

        if request.method not in SAFE_METHODS:
            if view.get_object_creator_id(obj) != request.user.id:
                return False
        return True
