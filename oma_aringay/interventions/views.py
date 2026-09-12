from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import generics
from rest_framework import status as drf_status
from rest_framework.exceptions import ValidationError
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator, IsCitizen, IsOrgMemberRecordCitizen
from core.notifications import notify_staff, notify_user, resolve_owner_user

from .lifecycle import advance_due_distributions
from .models import BeneficiaryRecord, DistributionStatus, FisherfolkBeneficiaryRecord
from .serializers import (
    BeneficiaryRecordCreateSerializer,
    BeneficiaryRecordUpdateSerializer,
    FisherfolkBeneficiaryRecordCreateSerializer,
    FisherfolkBeneficiaryRecordUpdateSerializer,
)


class PendingOnlyEditMixin:
    """
    Scheduled-distribution lifecycle, Step 6: once a record has entered
    AWAITING_CONFIRMATION or later, it's a citizen-facing state and must
    not be silently changed under them — editing is blocked from that point
    on. PENDING (not yet due) and the pre-existing CONFIRMED-immediately
    path (today/past-dated, no lifecycle involved at all) both stay
    editable exactly as before; this mixin only adds a new rejection for
    the states that are new in this batch.
    """

    def perform_update(self, serializer):
        if serializer.instance.status not in (DistributionStatus.PENDING, DistributionStatus.CONFIRMED):
            raise ValidationError(
                f'This record cannot be edited — it is {serializer.instance.get_status_display()}, '
                'not Pending or Confirmed.'
            )
        serializer.save()


class BeneficiaryRecordDetailView(PendingOnlyEditMixin, generics.RetrieveUpdateAPIView):
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
        # Step 5: "Needs Follow-up" — ?status=NOT_RECEIVED on the same
        # existing list endpoint CropAssistancePage already calls, rather
        # than a separate view.
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


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
        if params.get('status'):
            qs = qs.filter(status=params['status'])
        return qs

    def perform_create(self, serializer):
        serializer.save(recorded_by=self.request.user)


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
        advance_due_distributions(self.request.user)
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
        advance_due_distributions(self.request.user)
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


# ─── Scheduled distribution + confirmation lifecycle: recipient & staff actions ──
# Structural reference: production.views.CropDisasterResolveView — plain
# APIView (no queryset for DRF's object-level permission machinery to hook
# into), explicit get_object_or_404, explicit status guard, manual
# ownership check for the CITIZEN branch rather than a permission class,
# same as that view's own documented reasoning.

def _beneficiary_label(record, person, assistance_type=None):
    return f'{assistance_type or record.assistance_type or "Assistance"} — {person.full_name}'


def _check_recipient_permission(request, owner_linked_type, owner_id):
    """Shared by both domains' Confirm/ReportNotReceived views. Own-record-
    only for the CITIZEN who IS the recipient — not the reporting
    organization (IsOrgMemberRecordCitizen is a different, unrelated
    permission for a different actor). Staff may act too, same as disaster
    resolution's own precedent."""
    if request.user.role in ('ADMIN', 'EVALUATOR'):
        return None
    if request.user.role != 'CITIZEN':
        return Response({'detail': 'You do not have permission to perform this action.'}, status=403)
    if request.user.linked_record_type != owner_linked_type or request.user.linked_record_id != owner_id:
        return Response({'detail': 'You do not have permission to perform this action.'}, status=403)
    return None


class BeneficiaryConfirmReceivedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        record = get_object_or_404(BeneficiaryRecord.objects.select_related('farmer'), pk=pk)
        denied = _check_recipient_permission(request, 'FARMER', record.farmer_id)
        if denied:
            return denied
        if record.status != DistributionStatus.AWAITING_CONFIRMATION:
            return Response(
                {'detail': f'This record is not awaiting confirmation (current status: {record.get_status_display()}).'},
                status=400,
            )
        record.status = DistributionStatus.CONFIRMED
        record.confirmed_at = timezone.now()
        record.save()
        return Response(BeneficiaryRecordCreateSerializer(record).data)


class BeneficiaryReportNotReceivedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        record = get_object_or_404(BeneficiaryRecord.objects.select_related('farmer', 'attributed_organization'), pk=pk)
        denied = _check_recipient_permission(request, 'FARMER', record.farmer_id)
        if denied:
            return denied
        if record.status != DistributionStatus.AWAITING_CONFIRMATION:
            return Response(
                {'detail': f'This record is not awaiting confirmation (current status: {record.get_status_display()}).'},
                status=400,
            )
        reason = (request.data.get('non_receipt_reason') or '').strip()
        if not reason:
            return Response({'detail': 'A reason is required.'}, status=400)

        record.status = DistributionStatus.NOT_RECEIVED
        record.non_receipt_reason = reason
        record.save()

        label = _beneficiary_label(record, record.farmer)
        notify_staff(
            actor=request.user, verb='reported not receiving', record_type='beneficiary',
            record_id=record.id, record_label=label, detail=reason,
        )
        notify_user(
            recipient=resolve_owner_user(farmers_organization_id=record.attributed_organization_id),
            actor=request.user, verb='reported not receiving', record_type='beneficiary',
            record_id=record.id, record_label=label, detail=reason,
        )
        return Response(BeneficiaryRecordCreateSerializer(record).data)


class BeneficiaryMarkResolvedView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk):
        record = get_object_or_404(BeneficiaryRecord, pk=pk)
        if record.status != DistributionStatus.NOT_RECEIVED:
            return Response(
                {'detail': f'This record is not a Not Received case (current status: {record.get_status_display()}).'},
                status=400,
            )
        notes = (request.data.get('follow_up_notes') or '').strip()
        if not notes:
            return Response({'detail': 'Follow-up notes are required.'}, status=400)
        record.status = DistributionStatus.RESOLVED
        record.follow_up_notes = notes
        record.save()
        return Response(BeneficiaryRecordCreateSerializer(record).data)


class FisherfolkBeneficiaryConfirmReceivedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        record = get_object_or_404(FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk'), pk=pk)
        denied = _check_recipient_permission(request, 'FISHERFOLK', record.fisherfolk_id)
        if denied:
            return denied
        if record.status != DistributionStatus.AWAITING_CONFIRMATION:
            return Response(
                {'detail': f'This record is not awaiting confirmation (current status: {record.get_status_display()}).'},
                status=400,
            )
        record.status = DistributionStatus.CONFIRMED
        record.confirmed_at = timezone.now()
        record.save()
        return Response(FisherfolkBeneficiaryRecordCreateSerializer(record).data)


class FisherfolkBeneficiaryReportNotReceivedView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request, pk):
        record = get_object_or_404(
            FisherfolkBeneficiaryRecord.objects.select_related('fisherfolk', 'attributed_fisherfolk_organization'), pk=pk,
        )
        denied = _check_recipient_permission(request, 'FISHERFOLK', record.fisherfolk_id)
        if denied:
            return denied
        if record.status != DistributionStatus.AWAITING_CONFIRMATION:
            return Response(
                {'detail': f'This record is not awaiting confirmation (current status: {record.get_status_display()}).'},
                status=400,
            )
        reason = (request.data.get('non_receipt_reason') or '').strip()
        if not reason:
            return Response({'detail': 'A reason is required.'}, status=400)

        record.status = DistributionStatus.NOT_RECEIVED
        record.non_receipt_reason = reason
        record.save()

        label = _beneficiary_label(record, record.fisherfolk)
        notify_staff(
            actor=request.user, verb='reported not receiving', record_type='ff_beneficiary',
            record_id=record.id, record_label=label, detail=reason,
        )
        notify_user(
            recipient=resolve_owner_user(fisherfolk_organization_id=record.attributed_fisherfolk_organization_id),
            actor=request.user, verb='reported not receiving', record_type='ff_beneficiary',
            record_id=record.id, record_label=label, detail=reason,
        )
        return Response(FisherfolkBeneficiaryRecordCreateSerializer(record).data)


class FisherfolkBeneficiaryMarkResolvedView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request, pk):
        record = get_object_or_404(FisherfolkBeneficiaryRecord, pk=pk)
        if record.status != DistributionStatus.NOT_RECEIVED:
            return Response(
                {'detail': f'This record is not a Not Received case (current status: {record.get_status_display()}).'},
                status=400,
            )
        notes = (request.data.get('follow_up_notes') or '').strip()
        if not notes:
            return Response({'detail': 'Follow-up notes are required.'}, status=400)
        record.status = DistributionStatus.RESOLVED
        record.follow_up_notes = notes
        record.save()
        return Response(FisherfolkBeneficiaryRecordCreateSerializer(record).data)


# ─── Assistance Excel import ─────────────────────────────────────────────────
# "Import File" on the Crop/Fisheries Assistance pages — logs many
# assistance-given events from a spreadsheet instead of one at a time
# through AddAssistanceModal/LogGovernmentAssistanceModal. Shares the same
# dry_run convention as associations._run_organization_distribution and the
# same two-pass in-file-then-database duplicate detection as Crop/Fisheries
# Forecasting's imports (production/views.py ForecastingImportView,
# fisheries/views.py StockingForecastingImportView, associations/views.py
# _run_organization_import) — see any of those for the full rationale.
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


def _assistance_import_template_response(filename, id_label, sample_row, type_note):
    from io import BytesIO

    from django.http import HttpResponse
    from openpyxl import Workbook
    from openpyxl.styles import Font, PatternFill

    wb = Workbook()
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

    from core.utils import UnsupportedFileType, iter_spreadsheet_rows

    try:
        rows_iter = list(iter_spreadsheet_rows(file, file.name, min_row=3))
    except UnsupportedFileType as exc:
        return Response({'error': str(exc)}, status=400)
    except Exception as exc:
        return Response({'error': f'Invalid file: {exc}'}, status=400)

    valid_types = {label.upper(): value for value, label in record_model.AssistanceType.choices}

    errors = []
    rows_out = []
    ready = []
    groups = defaultdict(list)

    def invalid(row_num, msg):
        errors.append({'row': row_num, 'error': msg})
        rows_out.append({'row': row_num, 'status': 'invalid', 'label': f'Row {row_num}', 'detail': msg})

    def s(row, i):
        v = row[i] if i < len(row) else None
        return str(v).strip() if v is not None else ''

    for row_num, row in enumerate(rows_iter, start=3):
        if not any(cell for cell in row if cell is not None):
            continue

        id_number = s(row, 0)
        type_raw = s(row, 1)
        source_agency = s(row, 2)
        quantity = s(row, 3)
        date_str = s(row, 4)
        season = s(row, 5)
        text_value = s(row, 6)

        if not id_number or not type_raw or not date_str:
            invalid(row_num, 'RSBSA Number, Assistance Type, and Date Given are required.')
            continue

        person = person_model.objects.filter(rsbsa_number__iexact=id_number).first()
        if not person:
            invalid(row_num, f'No record found with RSBSA number "{id_number}".')
            continue

        assistance_type = valid_types.get(type_raw.upper())
        if not assistance_type:
            valid_list = ', '.join(v for v, _ in record_model.AssistanceType.choices)
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
            'source_agency': item['source_agency'],
            'quantity': item['quantity'],
            'date_given': date_given,
            'season': item['season'],
            text_field: item['text_value'],
        }
        serializer = serializer_class(data=payload)
        if not serializer.is_valid():
            detail = '; '.join(f'{field}: {"; ".join(str(m) for m in msgs)}' for field, msgs in serializer.errors.items())
            invalid(row_num, detail or 'Invalid row.')
            continue

        if dry_run:
            rows_out.append({'row': row_num, 'status': 'ready', 'label': label, 'detail': 'Will be created.'})
            continue

        record = serializer.save(recorded_by=user)
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
            ['01-33-02-014-058212', 'Seeds', 'Office of the Municipal Agriculturist', '5 sacks',
             '2026-01-15', 'Dry', 'Certified rice seeds distribution'],
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
        return _run_assistance_import(
            Farmer, BeneficiaryRecord, BeneficiaryRecordCreateSerializer,
            'farmer', 'remarks', file, dry_run, request.user,
        )


class FisheriesAssistanceImportTemplateView(APIView):
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def get(self, request):
        return _assistance_import_template_response(
            'fisheries_assistance_import_template.xlsx',
            'Fisherfolk RSBSA Number',
            ['01-33-02-999-000001', 'Fingerlings/Seeds', 'BFAR', '500 pcs',
             '2026-01-15', 'Dry', 'Bangus fingerlings distribution'],
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
        return _run_assistance_import(
            Fisherfolk, FisherfolkBeneficiaryRecord, FisherfolkBeneficiaryRecordCreateSerializer,
            'fisherfolk', 'description', file, dry_run, request.user,
        )
