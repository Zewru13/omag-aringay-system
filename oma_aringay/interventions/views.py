import uuid

from django.db import transaction
from rest_framework import generics
from rest_framework import status as drf_status
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import (
    IsAdminOrEvaluator, IsCitizen, IsOrgMemberRecordCitizen, IsStaffOrFisherfolk, scope_to_fisherfolk,
)
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from core.idnumbers import by_id_key

from .lifecycle import CurrentStatusMixin, notify_assistance_recorded, notify_schedule_changed
from .models import (
    AssistanceAgency,
    AssistanceCustomType,
    AssistanceOption,
    AssistanceTypeUnits,
    BeneficiaryConfirmationRequest,
    BeneficiaryRecord,
    DistributionStatus,
    FisherfolkBeneficiaryConfirmationRequest,
    FisherfolkBeneficiaryRecord,
)
from .recent import confirmed_repeat, recent_assistance_warning
from .distributions import build_distributions, filter_records, group_id, record_item, remove_records
from .type_units import STARTING_UNITS, UNITS, in_catalog_order
from .types import custom_names, domain_of, valid_type_names
from .serializers import (
    AssistanceAgencySerializer,
    AssistanceCustomTypeCreateSerializer,
    AssistanceCustomTypeSerializer,
    AssistanceOptionSerializer,
    BeneficiaryConfirmationRequestSerializer,
    BeneficiaryRecordCreateSerializer,
    BeneficiaryRecordUpdateSerializer,
    FisherfolkBeneficiaryConfirmationRequestSerializer,
    FisherfolkBeneficiaryRecordCreateSerializer,
    FisherfolkBeneficiaryRecordUpdateSerializer,
)
from core.exports import SafeWorkbook


class PendingOnlyEditMixin(CurrentStatusMixin):
    """
    Who may still edit an assistance record, by its state:
      - a cooperative (CITIZEN account) only while it is Scheduled;
      - staff while it is Scheduled or Received, so a typo can still be fixed (not older follow-up cases).
    Moving the day, time or place of something still to come tells the recipient.
    """
    ORGANIZATION_EDITABLE = (DistributionStatus.PENDING,)
    STAFF_EDITABLE = (
        DistributionStatus.PENDING, DistributionStatus.AWAITING_CONFIRMATION, DistributionStatus.CONFIRMED,
    )

    def perform_update(self, serializer):
        is_organization = self.request.user.role == 'CITIZEN'
        allowed = self.ORGANIZATION_EDITABLE if is_organization else self.STAFF_EDITABLE
        if serializer.instance.status not in allowed:
            raise ValidationError(
                f'This record cannot be edited — it is {serializer.instance.get_status_display()}, '
                + ('not Scheduled.' if is_organization else 'not Scheduled or Received.')
            )

        def schedule(record):
            return (record.date_given, record.distribution_time, record.distribution_place)

        before = schedule(serializer.instance)
        record = serializer.save()
        if record.status == DistributionStatus.PENDING and schedule(record) != before:
            notify_schedule_changed(record, self.request.user)


class BeneficiaryRecordDetailView(PendingOnlyEditMixin, generics.RetrieveUpdateAPIView):
    """
    Batch 12: GET/PATCH by id for any BeneficiaryRecord, shared by staff
    (unrestricted, via IsOrgMemberRecordCitizen's ADMIN/EVALUATOR bypass)
    and ORGANIZATION citizens (own-submitted, own-member entries only).
    """
    queryset = BeneficiaryRecord.objects.select_related('farmer')
    serializer_class = BeneficiaryRecordUpdateSerializer
    permission_classes = [IsAuthenticated, IsOrgMemberRecordCitizen]
    org_linked_record_type = 'FARMERS_ORG'   # a farmer id here must never be matched by a fisherfolk organization
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_person_id(self, obj):
        return obj.farmer_id

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id


class RecentAssistanceCheckMixin:
    """A single ad-hoc entry that repeats the same assistance type for the same person within 30 days is answered with a 409 (code
    `recent_assistance`) until the request says `confirm_duplicate: true`. The save itself is unchanged."""
    person_field = 'farmer'
    record_model = BeneficiaryRecord

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data
        person = data.get(self.person_field)
        if person is not None and not confirmed_repeat(request.data):
            warning = recent_assistance_warning(self.record_model, self.person_field, person.pk, data['assistance_type'], data['date_given'])
            if warning:
                return Response({'detail': warning, 'code': 'recent_assistance'}, status=drf_status.HTTP_409_CONFLICT)
        return super().create(request, *args, **kwargs)


class BeneficiaryAdHocListCreateView(CurrentStatusMixin, RecentAssistanceCheckMixin, generics.ListCreateAPIView):
    serializer_class = BeneficiaryRecordCreateSerializer
    pagination_class = None
    org_linked_record_type = 'FARMERS_ORG'

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
        qs = BeneficiaryRecord.objects.select_related('farmer', 'recorded_by').prefetch_related('photos').order_by('-date_given', '-id')
        params = self.request.query_params
        if params.get('farmer'):
            qs = qs.filter(farmer_id=params['farmer'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(farmer__barangay=params['barangay'])
        # Step 5: "Needs Follow-up" — ?status=NOT_RECEIVED on the same
        # existing list endpoint CropAssistancePage already calls, rather
        # than a separate view.
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs

    def perform_create(self, serializer):
        record = serializer.save(recorded_by=self.request.user, distribution_batch=uuid.uuid4())
        notify_assistance_recorded(record, self.request.user)


class BeneficiaryAdHocDetailView(PendingOnlyEditMixin, generics.RetrieveUpdateDestroyAPIView):
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


class FisherfolkBeneficiaryRecordDetailView(PendingOnlyEditMixin, generics.RetrieveUpdateAPIView):
    """Fisherfolk equivalent of BeneficiaryRecordDetailView."""
    queryset = FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk')
    serializer_class = FisherfolkBeneficiaryRecordUpdateSerializer
    permission_classes = [IsAuthenticated, IsOrgMemberRecordCitizen]
    org_linked_record_type = 'FISHERFOLK_ORG'   # a fisherfolk id here must never be matched by a farmers' organization
    http_method_names = ['get', 'patch']
    lookup_field = 'id'

    def get_object_person_id(self, obj):
        return obj.fisherfolk_id

    def get_object_creator_id(self, obj):
        return obj.recorded_by_id


class FisherfolkBeneficiaryAdHocListCreateView(CurrentStatusMixin, RecentAssistanceCheckMixin, generics.ListCreateAPIView):
    person_field = 'fisherfolk'
    record_model = FisherfolkBeneficiaryRecord
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    pagination_class = None
    org_linked_record_type = 'FISHERFOLK_ORG'

    def get_permissions(self):
        if self.request.method == 'GET':
            # The Admin Fisheries Assistance page is reused by fisherfolk accounts read-only: a fisherfolk
            # citizen lists only their OWN assistance (scoped below). Creating stays staff/organization.
            return [IsAuthenticated(), IsStaffOrFisherfolk()]
        return [IsAuthenticated(), IsOrgMemberRecordCitizen()]

    def get_target_person_id(self, request):
        return request.data.get('fisherfolk')

    def get_queryset(self):
        qs = scope_to_fisherfolk(FisherfolkBeneficiaryRecord.objects.all(), self.request.user) \
            .select_related('fisherfolk', 'recorded_by').order_by('-date_given', '-id')
        params = self.request.query_params
        if params.get('fisherfolk'):
            qs = qs.filter(fisherfolk_id=params['fisherfolk'])
        if params.get('year'):
            qs = qs.filter(year=params['year'])
        if params.get('barangay'):
            qs = qs.filter(fisherfolk__barangay=params['barangay'])
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs

    def perform_create(self, serializer):
        record = serializer.save(recorded_by=self.request.user, distribution_batch=uuid.uuid4())
        notify_assistance_recorded(record, self.request.user)


class FisherfolkBeneficiaryAdHocDetailView(PendingOnlyEditMixin, generics.RetrieveUpdateDestroyAPIView):
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


class MyBeneficiaryHistoryView(CurrentStatusMixin, generics.ListAPIView):
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
        ).select_related('farmer', 'recorded_by').prefetch_related('photos').order_by('-date_given', '-id')


class MyFisherfolkBeneficiaryHistoryView(CurrentStatusMixin, generics.ListAPIView):
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


class MyOrgBeneficiaryHistoryView(CurrentStatusMixin, generics.ListAPIView):
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
        ).select_related('farmer').prefetch_related('photos').order_by('-date_given', '-id')


class MyOrgFisherfolkBeneficiaryHistoryView(CurrentStatusMixin, generics.ListAPIView):
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


class MyOrgDistributionsView(CurrentStatusMixin, APIView):
    """An organization's own assistance history as distributions (one entry per distribution, expandable to its
    members), with the filters `status` (a status or `needs-follow-up`), `assistance_type`, `date_from`, `date_to`,
    `member` and `source_agency`. Only records this organization account recorded, never another organization's."""
    permission_classes = [IsAuthenticated, IsCitizen]
    org_linked_record_type = 'FARMERS_ORG'
    record_model = BeneficiaryRecord
    person_field = 'farmer'

    def get(self, request):
        if request.user.linked_record_type != self.org_linked_record_type:
            return Response([])
        queryset = self.record_model.objects.filter(recorded_by=request.user).select_related(self.person_field)
        records = filter_records(queryset, self.person_field, request.query_params)
        return Response(build_distributions(records, self.person_field))


class MyOrgFisherfolkDistributionsView(MyOrgDistributionsView):
    org_linked_record_type = 'FISHERFOLK_ORG'
    record_model = FisherfolkBeneficiaryRecord
    person_field = 'fisherfolk'


class StaffDistributionsView(CurrentStatusMixin, APIView):
    """What staff see on the Assistance pages: every distribution (one row per distribution, named after the organization that gave it,
    or none for assistance given to individuals) with its members, newest first, paged (?page=, 10 a page). Filters: `year`,
    `barangay` (the member's), `status` (a status or `needs-follow-up`), `assistance_type`, `date_from`, `date_to`, `member`,
    `source_agency`."""
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    record_model = BeneficiaryRecord
    person_field = 'farmer'
    PAGE_SIZE = 10

    def get(self, request):
        params = request.query_params
        queryset = self.record_model.objects.select_related(self.person_field, 'distributed_by_organization')
        if params.get('year'):
            queryset = queryset.filter(year=params['year'])
        if params.get('barangay'):
            queryset = queryset.filter(**{f'{self.person_field}__barangay': params['barangay']})
        records = filter_records(queryset, self.person_field, params)
        groups = build_distributions(records, self.person_field)
        try:
            page = max(1, int(params.get('page') or 1))
        except ValueError:
            page = 1
        start = (page - 1) * self.PAGE_SIZE
        return Response({'count': len(groups), 'results': groups[start:start + self.PAGE_SIZE]})


class FisherfolkStaffDistributionsView(StaffDistributionsView):
    record_model = FisherfolkBeneficiaryRecord
    person_field = 'fisherfolk'


class BulkIndividualAssistanceView(APIView):
    """Give one assistance to several selected farmers in one request: one record each, all sharing one distribution id (so they are one
    row in the staff table). Body: `farmer_ids` plus the fields of one assistance record; `dry_run` only checks. The answer lists, per
    person, `created` / `would_create` or `error` with the reason, and the record id. Staff may choose anyone; an organization account
    only its own members. Each person is saved on its own, so one refusal never blocks the rest."""
    permission_classes = [IsAuthenticated]
    org_linked_record_type = 'FARMERS_ORG'
    record_model = BeneficiaryRecord
    person_model = Farmer
    serializer_class = BeneficiaryRecordCreateSerializer
    person_field = 'farmer'
    ids_key = 'farmer_ids'
    MAX_PEOPLE = 500

    def _allowed(self, user):
        if user.role in ('ADMIN', 'EVALUATOR'):
            return True
        return user.role == 'CITIZEN' and user.linked_record_type == self.org_linked_record_type

    def post(self, request):
        user = request.user
        if not self._allowed(user):
            raise PermissionDenied('You do not have permission to perform this action.')
        raw = request.data.get(self.ids_key)
        if not isinstance(raw, list) or not raw:
            raise ValidationError({self.ids_key: ['Choose at least one person.']})
        if len(raw) > self.MAX_PEOPLE:
            raise ValidationError({self.ids_key: [f'Choose at most {self.MAX_PEOPLE} people at a time.']})
        try:
            ids = list(dict.fromkeys(int(i) for i in raw))
        except (TypeError, ValueError):
            raise ValidationError({self.ids_key: ['Send a list of ids.']})
        dry_run = str(request.data.get('dry_run', '')).lower() in ('true', '1')
        shared = {k: v for k, v in request.data.items() if k not in (self.ids_key, 'dry_run', self.person_field)}
        if not shared.get('year'):   # the year of the date given, as the organization distribution sets it
            try:
                shared['year'] = int(str(shared.get('date_given', ''))[:4])
            except ValueError:
                pass

        # The assistance itself is checked once, up front, against the first person, so a wrong type or date is one clear refusal
        # (400) instead of the same error repeated on every row.
        probe = self.serializer_class(data={**shared, self.person_field: ids[0]})
        if not probe.is_valid():
            errors = {k: v for k, v in probe.errors.items() if k != self.person_field}
            if errors:
                raise ValidationError(errors)

        people = self.person_model.objects.in_bulk(ids)
        batch = uuid.uuid4()
        results = []
        for person_id in ids:
            person = people.get(person_id)
            if person is None:
                results.append({'person_id': person_id, 'name': '', 'id_number': '', 'barangay': '', 'status': 'error', 'reason': 'This person was not found.'})
                continue
            row = {'person_id': person.id, 'name': person.full_name, 'id_number': person.rsbsa_number or '', 'barangay': person.barangay}
            if user.role == 'CITIZEN' and not self._is_member(user, person):
                results.append({**row, 'status': 'error', 'reason': 'Not a member of your cooperative.'})
                continue
            serializer = self.serializer_class(data={**shared, self.person_field: person.id})
            if not serializer.is_valid():
                message = '; '.join(f'{field}: {" ".join(str(m) for m in msgs)}' for field, msgs in serializer.errors.items())
                results.append({**row, 'status': 'error', 'reason': message})
                continue
            warning = recent_assistance_warning(
                self.record_model, self.person_field, person.id, serializer.validated_data['assistance_type'], serializer.validated_data['date_given'])
            extra = {'warning': warning} if warning else {}
            if dry_run:
                results.append({**row, 'status': 'would_create', **extra})
                continue
            if warning and not confirmed_repeat(request.data):
                results.append({**row, 'status': 'needs_confirmation', **extra})
                continue
            try:
                with transaction.atomic():
                    record = serializer.save(recorded_by=user, distribution_batch=batch)
            except Exception as exc:  # one person's failure never blocks the others
                results.append({**row, 'status': 'error', 'reason': str(exc)})
                continue
            notify_assistance_recorded(record, user)
            results.append({**row, 'status': 'created', 'record_id': record.id})
        return Response({'distribution': str(batch), 'results': results})

    def _is_member(self, user, person):
        from accounts.permissions import _person_is_org_member
        return _person_is_org_member(user.linked_record_type, user.linked_record_id, person.id)


class FisherfolkBulkIndividualAssistanceView(BulkIndividualAssistanceView):
    org_linked_record_type = 'FISHERFOLK_ORG'
    record_model = FisherfolkBeneficiaryRecord
    person_model = Fisherfolk
    serializer_class = FisherfolkBeneficiaryRecordCreateSerializer
    person_field = 'fisherfolk'
    ids_key = 'fisherfolk_ids'


class AssistanceRemovalView(APIView):
    """Take entries out of the list before the recipient confirms them: body {domain: 'crop'|'fisheries', record_ids: [...]}
    or {domain, distribution: <group id>}. Staff may remove any entry; an organization account only what it recorded."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        user = request.user
        domain = request.data.get('domain')
        denied = Response({'detail': 'You do not have permission to perform this action.'}, status=403)
        if user.role == 'CITIZEN':
            expected = {'crop': 'FARMERS_ORG', 'fisheries': 'FISHERFOLK_ORG'}.get(domain)
            if expected is None or user.linked_record_type != expected:
                return denied
        elif user.role not in ('ADMIN', 'EVALUATOR'):
            return denied
        record_ids = request.data.get('record_ids')
        if record_ids is not None and not isinstance(record_ids, list):
            raise ValidationError({'record_ids': ['Send a list of record ids.']})
        try:
            result = remove_records(domain, user, record_ids=record_ids, distribution=request.data.get('distribution'))
        except (TypeError, ValueError):
            raise ValidationError({'record_ids': ['Send a list of record ids.']})
        return Response(result)


# ─── Earlier confirmations (history only: nobody confirms receipt any more) ────────

class OrgConfirmedForMembersView(generics.ListAPIView):
    """The history of what one organization has confirmed for its members, newest first (each row is one member's
    assistance, with the proof photos the organization sent). Staff can read any organization's; an organization account
    only its own. Nothing here is a queue: those confirmations were final when the organization sent them."""
    permission_classes = [IsAuthenticated]

    DOMAINS = {
        'farmers': (BeneficiaryConfirmationRequest, BeneficiaryConfirmationRequestSerializer, 'FARMERS_ORG', 'beneficiary_record__farmer'),
        'fisherfolk': (FisherfolkBeneficiaryConfirmationRequest, FisherfolkBeneficiaryConfirmationRequestSerializer,
                       'FISHERFOLK_ORG', 'beneficiary_record__fisherfolk'),
    }

    def _domain(self):
        org_type = self.kwargs['org_type']
        if org_type not in self.DOMAINS:
            raise NotFound()
        return self.DOMAINS[org_type]

    def get_serializer_class(self):
        return self._domain()[1]

    def get_queryset(self):
        model, _, linked_type, person = self._domain()
        user = self.request.user
        org_id = self.kwargs['pk']
        if user.role not in ('ADMIN', 'EVALUATOR'):
            if not (user.role == 'CITIZEN' and user.linked_record_type == linked_type and user.linked_record_id == org_id):
                raise PermissionDenied('You do not have permission to perform this action.')
        return model.objects.filter(submitted_by_organization_id=org_id, status=model.Status.APPROVED).select_related(
            'beneficiary_record', person, 'submitted_by', 'reviewed_by',
        ).prefetch_related('photos').order_by('-reviewed_at', '-id')


class OrgConfirmedAssistancesView(OrgConfirmedForMembersView):
    """The same history as OrgConfirmedForMembersView, but one row per ASSISTANCE instead of one per member: the records of one distribution
    (or of one old group of identical records) are a row with the members of it that this organization confirmed, newest confirmation
    first, ten rows a page. Same permissions as the per-member history."""

    def list(self, request, *args, **kwargs):
        person_attr = self._domain()[3].split('__')[1]
        groups = {}
        for req in self.get_queryset():                     # newest confirmation first
            rec = req.beneficiary_record
            person = getattr(rec, person_attr)
            gid = group_id(rec)
            group = groups.get(gid)
            confirmed_at = req.reviewed_at or req.submitted_at
            if group is None:
                group = groups[gid] = {
                    'id': gid, 'assistance_type': rec.assistance_type, 'item': record_item(rec), 'quantity': rec.quantity,
                    'source_agencies': list(rec.source_agencies or []), 'date_given': rec.date_given, 'confirmed_at': confirmed_at, 'members': [],
                }
            group['members'].append({
                'request_id': req.id, 'record_id': rec.id, 'name': person.full_name, 'rsbsa': person.rsbsa_number, 'barangay': person.barangay,
                'confirmed_at': confirmed_at, 'confirmed_by': getattr(req.submitted_by, 'full_name', '') or '',
                'photo_urls': [request.build_absolute_uri(p.image.url) for p in req.photos.all()],
            })
        rows = sorted(groups.values(), key=lambda g: g['confirmed_at'], reverse=True)
        page = self.paginate_queryset(rows)
        for group in page:
            group['members'].sort(key=lambda m: m['name'].lower())
            group['member_count'] = len(group['members'])
        return self.get_paginated_response(page)


# ─── Assistance Excel import ─────────────────────────────────────────────────
# "Import File" on the Crop/Fisheries Assistance pages — logs many
# assistance-given events from a spreadsheet instead of one at a time
# through AddAssistanceModal/LogGovernmentAssistanceModal. Shares the same
# dry_run convention as associations._run_organization_distribution and the
# same two-pass in-file-then-database duplicate detection as Crop/Fisheries
# Forecasting's imports (production/views.py ForecastingImportView,
# associations/views.py _run_organization_import) — see any of those for the full rationale.
#
# Identity is (person, assistance_type, date_given): the three facts that
# together answer "is this the same assistance-giving event" from what this
# import captures. quantity/source_agency/remarks are details of the event,
# not part of what makes two rows "the same event" — same reasoning as
# excluding number_of_fingerlings from StockingRecord's identity.

ASSISTANCE_TEMPLATE_HEADERS = [
    'RSBSA Number', 'Assistance Type', 'Source Agency', 'Quantity',
    'Date Given (YYYY-MM-DD)', 'Season', 'Description / Remarks',
]
ASSISTANCE_TEMPLATE_COL_WIDTHS = [28, 20, 24, 18, 22, 12, 40]


CROP_ASSISTANCE_TEMPLATE_SAMPLE = [
    '01-33-02-014-058212', 'Seeds', 'Office of the Municipal Agriculturist', '5 sacks',
    '2026-01-15', 'Dry', 'Certified rice seeds distribution',
]
FISHERIES_ASSISTANCE_TEMPLATE_SAMPLE = [
    '01-33-02-999-000001', 'Fingerlings/Seeds', 'BFAR', '500 pcs',
    '2026-01-15', 'Dry', 'Bangus fingerlings distribution',
]
ASSISTANCE_ID_LABELS = {'farmer': 'Farmer RSBSA Number', 'fisherfolk': 'Fisherfolk RSBSA Number'}
ASSISTANCE_SAMPLES = {'farmer': CROP_ASSISTANCE_TEMPLATE_SAMPLE, 'fisherfolk': FISHERIES_ASSISTANCE_TEMPLATE_SAMPLE}
ASSISTANCE_NOTE_PREFIX = 'Assistance Type must be one of'


def _assistance_import_template_response(filename, id_label, sample_row, type_note):
    from io import BytesIO

    from django.http import HttpResponse
    from openpyxl.styles import Font, PatternFill

    wb = SafeWorkbook()
    ws = wb.active
    ws.title = 'Assistance Import'

    headers = list(ASSISTANCE_TEMPLATE_HEADERS)
    headers[0] = id_label
    green_fill = PatternFill(start_color='1E4620', end_color='1E4620', fill_type='solid')
    white_font = Font(color='FFFFFF', bold=True)
    for col, (header, width) in enumerate(zip(headers, ASSISTANCE_TEMPLATE_COL_WIDTHS), 1):
        cell = ws.cell(row=1, column=col, value=header)
        cell.fill = green_fill
        cell.font = white_font
        ws.column_dimensions[cell.column_letter].width = width

    for col, value in enumerate(sample_row, 1):
        ws.cell(row=2, column=col, value=value)
    ws.cell(row=4, column=1, value=type_note)

    buf = BytesIO()
    wb.save(buf)
    buf.seek(0)

    response = HttpResponse(
        buf.read(),
        content_type='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    )
    response['Content-Disposition'] = f'attachment; filename="{filename}"'
    return response


def _run_assistance_import(person_model, record_model, serializer_class, person_field, text_field, file, dry_run, user):
    """
    person_model/record_model: e.g. Farmer/BeneficiaryRecord.
    person_field: 'farmer' or 'fisherfolk' — both the serializer's FK field
    name and the record_model's own field name for it.
    text_field: 'remarks' (BeneficiaryRecord) or 'description'
    (FisherfolkBeneficiaryRecord) — mirrors OrganizationDistributionRequestSerializer's
    same per-model mapping in associations/views.py.
    """
    import datetime as dt
    from collections import defaultdict

    from core.import_batches import record_created, start_batch
    from core.utils import ImportFileError, cell_text, read_template_rows

    import_batch = None   # opened with the first record actually created; never on a preview

    # The header row is located by content and must carry THIS page's id
    # label ("Farmer RSBSA Number" vs "Fisherfolk RSBSA Number"): a file from
    # the other page's template is refused up front instead of being half-read
    # (a person in both registries would otherwise get assistance recorded
    # under the wrong side).
    headers = list(ASSISTANCE_TEMPLATE_HEADERS)
    headers[0] = ASSISTANCE_ID_LABELS[person_field]
    try:
        rows_iter = read_template_rows(
            file, file.name, headers,
            sample_row=ASSISTANCE_SAMPLES[person_field], note_prefixes=(ASSISTANCE_NOTE_PREFIX,),
        )
    except ImportFileError as exc:
        return Response({'error': str(exc)}, status=400)
    except Exception as exc:
        return Response({'error': f'Invalid file: {exc}'}, status=400)

    valid_types = {label.upper(): value for value, label in record_model.AssistanceType.choices}
    valid_types.update({name.upper(): name for name in custom_names(domain_of(record_model))})

    errors = []
    rows_out = []
    ready = []
    groups = defaultdict(list)

    def invalid(row_num, msg):
        errors.append({'row': row_num, 'error': msg})
        rows_out.append({'row': row_num, 'status': 'invalid', 'label': f'Row {row_num}', 'detail': msg})

    def s(row, i):
        return cell_text(row[i]) if i < len(row) else ''

    for row_num, row in rows_iter:
        id_number = s(row, 0)
        type_raw = s(row, 1)
        source_agency = s(row, 2)
        quantity = s(row, 3)
        date_str = s(row, 4)
        season = s(row, 5)
        text_value = s(row, 6)
        if season.lower() in ('dry', 'wet'):
            season = season.title()  # "dry"/"WET" would otherwise fail the Dry/Wet choice check

        if not id_number or not type_raw or not date_str:
            invalid(row_num, 'RSBSA Number, Assistance Type, and Date Given are required.')
            continue

        person = by_id_key(person_model.objects.all(), 'rsbsa_number', id_number).first()
        if not person:
            invalid(row_num, f'No record found with RSBSA number "{id_number}".')
            continue

        assistance_type = valid_types.get(type_raw.upper())
        if not assistance_type:
            valid_list = ', '.join(valid_type_names(domain_of(record_model)))
            invalid(row_num, f'Invalid Assistance Type "{type_raw}". Use one of: {valid_list}.')
            continue

        try:
            date_given = dt.date.fromisoformat(date_str[:10])
        except ValueError:
            invalid(row_num, f'Invalid date "{date_str}". Use YYYY-MM-DD.')
            continue

        key = (person.id, assistance_type, date_given)
        ready.append({
            'row_num': row_num, 'person': person, 'assistance_type': assistance_type,
            'source_agency': source_agency, 'quantity': quantity, 'date_given': date_given,
            'season': season, 'text_value': text_value, 'key': key,
        })
        groups[key].append(row_num)

    created = 0
    for item in ready:
        row_num, key = item['row_num'], item['key']
        person, assistance_type, date_given = item['person'], item['assistance_type'], item['date_given']
        label = f'{person.full_name} — {assistance_type} ({date_given.isoformat()})'

        colliding_rows = [r for r in groups[key] if r != row_num]
        if colliding_rows:
            detail = (
                f'Duplicate of row(s) {", ".join(str(r) for r in colliding_rows)} in this file '
                f'(same person, Assistance Type "{assistance_type}", Date Given {date_given.isoformat()}). '
                f'None of the colliding rows were created — resolve the conflict and re-upload.'
            )
            rows_out.append({'row': row_num, 'status': 'duplicate_in_file', 'label': label, 'detail': detail, 'colliding_rows': colliding_rows})
            continue

        existing = record_model.objects.filter(
            **{person_field: person, 'assistance_type': assistance_type, 'date_given': date_given},
        ).first()
        if existing:
            detail = (
                f'A record already exists for {person.full_name}, Assistance Type "{assistance_type}", '
                f'Date Given {date_given.isoformat()} (record #{existing.id}). Not created again.'
            )
            rows_out.append({'row': row_num, 'status': 'duplicate_in_database', 'label': label, 'detail': detail, 'existing_record_id': existing.id})
            continue

        payload = {
            person_field: person.id,
            'assistance_type': assistance_type,
            # Import file still has one Source Agency column — wrapped into
            # a one-item list to match source_agencies' new shape, same
            # single-value-to-list conversion the data migration applies to
            # existing rows.
            'source_agencies': [item['source_agency']] if item['source_agency'] else [],
            'quantity': item['quantity'],
            'date_given': date_given,
            'season': item['season'],
            text_field: item['text_value'],
        }
        # An imported file carries assistance that already happened, so the "today or later" rule of the forms does not apply.
        serializer = serializer_class(data=payload, context={'allow_past_dates': True, 'training_type_optional': True})
        if not serializer.is_valid():
            detail = '; '.join(f'{field}: {"; ".join(str(m) for m in msgs)}' for field, msgs in serializer.errors.items())
            invalid(row_num, detail or 'Invalid row.')
            continue

        if dry_run:
            rows_out.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': 'Will be created.'})
            continue

        # An import loads assistance that already happened: the saved status follows the date (past ones are Received, a
        # future one is Scheduled), and nobody is told about old records.
        record = serializer.save(recorded_by=user)
        if import_batch is None:
            import_batch = start_batch(
                'crop_assistance' if person_field == 'farmer' else 'fisheries_assistance', user, label=file.name)
        record_created(import_batch, record)   # after the status is settled, so the fingerprint is the finished record
        created += 1
        rows_out.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': f'Created (record #{record.id}).'})

    summary = {
        'ready': sum(1 for r in rows_out if r['status'] == 'ready'),
        'duplicate_in_file': sum(1 for r in rows_out if r['status'] == 'duplicate_in_file'),
        'duplicate_in_database': sum(1 for r in rows_out if r['status'] == 'duplicate_in_database'),
        'invalid': sum(1 for r in rows_out if r['status'] == 'invalid'),
    }
    return Response({
        'created': created, 'errors': errors, 'dry_run': dry_run, 'summary': summary, 'rows': rows_out,
    })


class CropAssistanceImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _assistance_import_template_response(
            'crop_assistance_import_template.xlsx',
            'Farmer RSBSA Number',
            CROP_ASSISTANCE_TEMPLATE_SAMPLE,
            'Assistance Type must be one of: Fertilizer / Seeds / Equipment / Cash Assistance / Training / Other',
        )


class CropAssistanceImportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        dry_run = str(request.data.get('dry_run', '')).strip().lower() in ('1', 'true', 'yes')
        from farmers.models import Farmer
        from core.utils import run_import_atomically
        return run_import_atomically(lambda: _run_assistance_import(
            Farmer, BeneficiaryRecord, BeneficiaryRecordCreateSerializer,
            'farmer', 'remarks', file, dry_run, request.user,
        ))


class FisheriesAssistanceImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _assistance_import_template_response(
            'fisheries_assistance_import_template.xlsx',
            'Fisherfolk RSBSA Number',
            FISHERIES_ASSISTANCE_TEMPLATE_SAMPLE,
            'Assistance Type must be one of: Fishing Gear / Boat/Vessel / Fingerlings/Seeds / Feed / '
            'Equipment / Cash Assistance / Training / Other',
        )


class FisheriesAssistanceImportView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file uploaded.'}, status=400)
        dry_run = str(request.data.get('dry_run', '')).strip().lower() in ('1', 'true', 'yes')
        from fisheries.models import Fisherfolk
        from core.utils import run_import_atomically
        return run_import_atomically(lambda: _run_assistance_import(
            Fisherfolk, FisherfolkBeneficiaryRecord, FisherfolkBeneficiaryRecordCreateSerializer,
            'fisherfolk', 'description', file, dry_run, request.user,
        ))


# ─── Source agencies ────────────────────────────────────────────────────────────

class AssistanceAgencyListCreateView(generics.ListCreateAPIView):
    """The managed list of source agencies. Everyone signed in reads it (every assistance form uses it); only staff change it."""
    serializer_class = AssistanceAgencySerializer
    pagination_class = None

    def get_queryset(self):
        return sorted(AssistanceAgency.objects.all(), key=lambda a: a.name.lower())

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]


class AssistanceOptionListCreateView(generics.ListCreateAPIView):
    """The managed lists behind the assistance forms' dropdowns (?domain=crop|fisheries&kind=equipment|unit|gear|training|seed|fertilizer|feed|fingerling). Everyone signed in reads
    them; only staff change them."""
    serializer_class = AssistanceOptionSerializer
    pagination_class = None

    def get_queryset(self):
        qs = AssistanceOption.objects.all()
        for field in ('domain', 'kind'):
            if self.request.query_params.get(field):
                qs = qs.filter(**{field: self.request.query_params[field]})
        return sorted(qs, key=lambda o: o.name.lower())

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]


class AssistanceOptionDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AssistanceOptionSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AssistanceOption.objects.all()
    http_method_names = ['get', 'patch', 'delete']


class AssistanceChoicesView(APIView):
    """Every dropdown an assistance form needs, in one answer (?domain=crop|fisheries): the lists managed in Assistance Settings. Crop: seed,
    fertilizer, equipment, unit, training. Fisheries: feed, fingerling, gear, equipment, unit, training. Plus `types`, the assistance types added
    with Add Assistance. Everyone signed in may ask, because an organization account fills in the same forms."""
    permission_classes = [IsAuthenticated]

    @staticmethod
    def _sorted(names):
        return sorted({n for n in names if n}, key=str.lower)

    @staticmethod
    def _options(domain, kind):
        return AssistanceChoicesView._sorted(AssistanceOption.objects.filter(domain=domain, kind=kind).values_list('name', flat=True))

    def get(self, request):
        domain = request.query_params.get('domain')
        if domain == 'crop':
            return Response({
                'seed': self._options('crop', 'seed'),
                'fertilizer': self._options('crop', 'fertilizer'),
                'equipment': self._options('crop', 'equipment'),
                'unit': self._options('crop', 'unit'),
                'training': self._options('crop', 'training'),
                'types': custom_names('crop'),
            })
        if domain == 'fisheries':
            return Response({
                'feed': self._options('fisheries', 'feed'),
                'fingerling': self._options('fisheries', 'fingerling'),
                'gear': self._options('fisheries', 'gear'),
                'equipment': self._options('fisheries', 'equipment'),
                'unit': self._options('fisheries', 'unit'),
                'training': self._options('fisheries', 'training'),
                'types': custom_names('fisheries'),
            })
        raise ValidationError({'domain': ['Use crop or fisheries.']})


class AssistanceCustomTypeListCreateView(APIView):
    """The assistance types added in Assistance Settings (?domain=crop|fisheries narrows the list). Everyone signed in reads; staff add.
    POST {name, domains: ['crop', 'fisheries'], units?: [...]} adds the name for every chosen domain, or for none (all or nothing)."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    def get(self, request):
        rows = AssistanceCustomType.objects.all()
        if request.query_params.get('domain'):
            rows = rows.filter(domain=request.query_params['domain'])
        return Response(AssistanceCustomTypeSerializer(rows.order_by('domain', 'name'), many=True).data)

    def post(self, request):
        form = AssistanceCustomTypeCreateSerializer(data=request.data)
        form.is_valid(raise_exception=True)
        data = form.validated_data
        with transaction.atomic():
            rows = [AssistanceCustomType.objects.create(domain=domain, name=data['name']) for domain in data['domains']]
            if data.get('units'):
                for row in rows:
                    AssistanceTypeUnits.objects.update_or_create(
                        domain=row.domain, assistance_type=row.name, defaults={'units': in_catalog_order(data['units'])})
        return Response(AssistanceCustomTypeSerializer(rows, many=True).data, status=drf_status.HTTP_201_CREATED)


class AssistanceCustomTypeDetailView(generics.RetrieveUpdateDestroyAPIView):
    """Rename or delete one added assistance type. Assistance already recorded keeps the name it was saved with."""
    serializer_class = AssistanceCustomTypeSerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AssistanceCustomType.objects.all()
    http_method_names = ['get', 'patch', 'delete']

    def perform_update(self, serializer):
        old = serializer.instance.name
        with transaction.atomic():
            row = serializer.save()
            AssistanceTypeUnits.objects.filter(domain=row.domain, assistance_type=old).update(assistance_type=row.name)

    def perform_destroy(self, instance):
        with transaction.atomic():
            AssistanceTypeUnits.objects.filter(domain=instance.domain, assistance_type=instance.name).delete()
            instance.delete()


class AssistanceTypeUnitsView(APIView):
    """The units each assistance type offers in the quantity box (?domain=crop|fisheries). GET: every type that has a quantity box, with
    its units (its starting ones until an Admin changes them). PUT {domain, assistance_type, units}: set the units of one type. Everyone
    signed in reads, because every assistance form fills its Unit box from it; only staff change it."""

    def get_permissions(self):
        if self.request.method == 'GET':
            return [IsAuthenticated()]
        return [IsAuthenticated(), IsAdminOrEvaluator()]

    @staticmethod
    def _domain(value):
        if value not in STARTING_UNITS:
            raise ValidationError({'domain': ['Use crop or fisheries.']})
        return value

    @staticmethod
    def _rows(domain):
        saved = {r.assistance_type: r.units for r in AssistanceTypeUnits.objects.filter(domain=domain)}
        starting = {**STARTING_UNITS[domain], **{name: list(UNITS) for name in custom_names(domain)}}   # an added type starts with every unit
        return [
            {'domain': domain, 'assistance_type': name, 'units': in_catalog_order(saved.get(name, start)), 'is_default': name not in saved}
            for name, start in starting.items()
        ]

    def get(self, request):
        return Response(self._rows(self._domain(request.query_params.get('domain'))))

    def put(self, request):
        domain = self._domain(request.data.get('domain'))
        name = request.data.get('assistance_type')
        if name not in STARTING_UNITS[domain] and name not in custom_names(domain):
            raise ValidationError({'assistance_type': ['This type has no unit box in this domain.']})
        units = request.data.get('units')
        if not isinstance(units, list) or not units:
            raise ValidationError({'units': ['Choose at least one unit.']})
        if any(u not in UNITS for u in units):
            raise ValidationError({'units': [f'Units are: {", ".join(UNITS)}.']})
        AssistanceTypeUnits.objects.update_or_create(domain=domain, assistance_type=name, defaults={'units': in_catalog_order(units)})
        return Response(next(r for r in self._rows(domain) if r['assistance_type'] == name))


class AssistanceAgencyDetailView(generics.RetrieveUpdateDestroyAPIView):
    serializer_class = AssistanceAgencySerializer
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    queryset = AssistanceAgency.objects.all()
