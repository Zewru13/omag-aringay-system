"""
CropRecordImportPreviewView / CropRecordImportCommitView — preview-first
import of RSBSA/BFAR per-commodity crop files (corn, rice, tobacco-native,
tobacco-virginia, ...) into CropMonitoringRecord. See
production/crop_record_import.py's module docstring for why this is a new,
purpose-built path rather than a reshape of ForecastingImportView, and for
the two fixed design decisions (crop-name mapping, date_planted-as-estimate)
this import follows.

Same preview/commit split as RsbsaUpdateImportPreviewView/CommitView
(farmers/rsbsa_import_views.py): preview parses, classifies, and resolves
every row but writes nothing; commit takes back the EXACT row objects the
preview returned (only the ones staff selected) and writes only those —
never a re-upload or re-interpretation of the file. Duplicate detection
(in-file collision grouping + against-database check) mirrors
ForecastingImportView's identity-based two-pass approach, with the identity
key adapted to this import's per-farmer shape: (farmer_id, crop_type_id,
variety_used, date_planted) — variety_used is part of the key because two
real, distinct tobacco plantings (native vs Virginia) can otherwise collide
under the same crop_type once both map onto the single Tobacco CropType.
"""
import uuid
from datetime import date as date_cls

from django.db import transaction
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from farmers.models import Farmer
from fisheries.models import Fisherfolk

from .crop_record_import import (
    build_crop_type_cache,
    build_incoming,
    classify_crop_row,
    parse_crop_record_file,
    resolve_farmer,
)
from .models import CropMonitoringRecord

HOLD_BACK_REASON_TEXT = {
    'corrupted_rsbsa': 'RSBSA number has a non-numeric segment',
    'all_flags_blank': 'Farmer/Farmworker/Fisherfolk flags are all blank',
    'all_flags_no': 'Farmer/Farmworker/Fisherfolk flags are all No',
    'unmatched_barangay': 'Barangay does not match any known barangay',
    'unmapped_cropname': 'Crop name has no known mapping to a real CropType',
    'crop_type_not_found': 'Mapped CropType does not exist in this database',
    'unparseable_crop_data': 'date_created or crop_area could not be read',
}


class CropRecordImportPreviewView(APIView):
    """POST a .csv or .xlsx RSBSA/BFAR crop-commodity export (multipart,
    field name 'file'). Parses, classifies, maps each row's cropname to a
    real CropType (Decision 1), resolves the row's farmer by rsbsa_no (same
    cross-table fallback as the RSBSA preview), and flags in-file/database
    duplicates — all read-only. Nothing in this view writes to the database.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'No file was uploaded.'}, status=400)

        try:
            rows = parse_crop_record_file(upload)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)

        crop_type_cache = build_crop_type_cache()

        # ── Phase 1: classify + parse every row, so one bad row never breaks
        # the whole preview. ──
        parsed = []
        for i, row in enumerate(rows, start=2):  # row 1 is the header
            rsbsa = row['rsbsa_no'].strip()
            disposition, reason, crop_type, variety_used = classify_crop_row(row, crop_type_cache)
            if disposition == 'HOLD-BACK':
                parsed.append({'row_number': i, 'rsbsa': rsbsa, 'status': 'invalid', 'reason': reason, 'incoming': None})
                continue
            try:
                incoming = build_incoming(row, crop_type, variety_used)
            except ValueError as exc:
                parsed.append({
                    'row_number': i, 'rsbsa': rsbsa, 'status': 'invalid',
                    'reason': 'unparseable_crop_data', 'detail': str(exc), 'incoming': None,
                })
                continue
            parsed.append({'row_number': i, 'rsbsa': rsbsa, 'status': None, 'reason': None, 'incoming': incoming})

        # ── Phase 2: bulk-fetch every matchable rsbsa_number against BOTH
        # Farmer and Fisherfolk — same cross-table approach proven for the
        # RSBSA preview's classification_mismatch handling (see this
        # module's docstring for why: a Farmer-only lookup would silently
        # misreport a real Fisherfolk-registered person as "not found"). ──
        matchable_rsbsa = [p['rsbsa'] for p in parsed if p['status'] is None]
        farmers_by_rsbsa = {f.rsbsa_number: f for f in Farmer.objects.filter(rsbsa_number__in=matchable_rsbsa)}
        fisherfolk_by_rsbsa = {f.rsbsa_number: f for f in Fisherfolk.objects.filter(rsbsa_number__in=matchable_rsbsa)}

        # ── Phase 3: resolve farmer, build the identity key, group for
        # in-file collisions (mirrors ForecastingImportView's two-pass
        # approach: every colliding row is flagged, none created). ──
        groups = {}
        for p in parsed:
            if p['status'] is not None:
                continue
            farmer, wrong_domain, fisherfolk = resolve_farmer(p['rsbsa'], farmers_by_rsbsa, fisherfolk_by_rsbsa)
            p['farmer'] = farmer
            p['wrong_domain_fisherfolk'] = fisherfolk
            if farmer is None:
                p['status'] = 'matched_wrong_domain' if wrong_domain else 'farmer_not_found'
                continue
            inc = p['incoming']
            key = (farmer.id, inc['crop_type'].id, inc['variety_used'], inc['date_planted'])
            p['key'] = key
            groups.setdefault(key, []).append(p['row_number'])

        # ── Phase 4: against-database duplicate check for everything that
        # survived phases 1-3, then build the response. ──
        candidate_keys = [p['key'] for p in parsed if p.get('key')]
        existing_by_key = {}
        if candidate_keys:
            farmer_ids = {k[0] for k in candidate_keys}
            crop_type_ids = {k[1] for k in candidate_keys}
            for rec in CropMonitoringRecord.objects.filter(
                farmer_id__in=farmer_ids, crop_type_id__in=crop_type_ids,
            ).only('id', 'farmer_id', 'crop_type_id', 'variety_used', 'date_planted'):
                existing_by_key[(rec.farmer_id, rec.crop_type_id, rec.variety_used, rec.date_planted)] = rec.id

        result_rows = []
        summary = {'ready': 0, 'duplicate_in_file': 0, 'duplicate_in_database': 0, 'farmer_not_found': 0, 'matched_wrong_domain': 0, 'invalid': 0}

        for p in parsed:
            row_number, rsbsa, status = p['row_number'], p['rsbsa'], p['status']

            if status == 'invalid':
                summary['invalid'] += 1
                result_rows.append({
                    'row_number': row_number, 'rsbsa_number': rsbsa, 'status': 'invalid',
                    'hold_back_reason': p['reason'],
                    'detail': p.get('detail') or HOLD_BACK_REASON_TEXT.get(p['reason'], p['reason']),
                    'farmer_id': None, 'farmer_name': None,
                    'fisherfolk_id': None, 'fisherfolk_name': None,
                    'crop_type_id': None, 'crop_type_name': None, 'variety_used': None,
                    'date_planted': None, 'date_planted_is_estimated': None,
                    'area_planted_ha': None, 'season': None, 'year': None,
                    'farm_location_barangay': None,
                })
                continue

            if status == 'farmer_not_found':
                summary['farmer_not_found'] += 1
                result_rows.append({
                    'row_number': row_number, 'rsbsa_number': rsbsa, 'status': 'farmer_not_found',
                    'hold_back_reason': None,
                    'detail': (
                        f'No Farmer or Fisherfolk record exists for RSBSA number {rsbsa} yet. This crop row '
                        f'cannot be attached to anyone until that person is registered (see the RSBSA '
                        f'registration import) — likely because the RSBSA registration commit has not run yet.'
                    ),
                    'farmer_id': None, 'farmer_name': None,
                    'fisherfolk_id': None, 'fisherfolk_name': None,
                    'crop_type_id': None, 'crop_type_name': None, 'variety_used': None,
                    'date_planted': None, 'date_planted_is_estimated': None,
                    'area_planted_ha': None, 'season': None, 'year': None,
                    'farm_location_barangay': None,
                })
                continue

            if status == 'matched_wrong_domain':
                ff = p['wrong_domain_fisherfolk']
                summary['matched_wrong_domain'] += 1
                result_rows.append({
                    'row_number': row_number, 'rsbsa_number': rsbsa, 'status': 'matched_wrong_domain',
                    'hold_back_reason': None,
                    'detail': (
                        f'RSBSA number {rsbsa} matches an existing Fisherfolk record (#{ff.id} {ff.full_name}), '
                        f'not a Farmer. CropMonitoringRecord can only be attached to a Farmer — this row cannot '
                        f'be imported here.'
                    ),
                    'farmer_id': None, 'farmer_name': None,
                    'fisherfolk_id': ff.id, 'fisherfolk_name': ff.full_name,
                    'crop_type_id': None, 'crop_type_name': None, 'variety_used': None,
                    'date_planted': None, 'date_planted_is_estimated': None,
                    'area_planted_ha': None, 'season': None, 'year': None,
                    'farm_location_barangay': None,
                })
                continue

            # Remaining statuses (ready / duplicate_in_file / duplicate_in_database)
            # all have a resolved farmer + incoming values.
            farmer, inc, key = p['farmer'], p['incoming'], p['key']
            base = {
                'row_number': row_number, 'rsbsa_number': rsbsa,
                'hold_back_reason': None,
                'farmer_id': farmer.id, 'farmer_name': farmer.full_name,
                'fisherfolk_id': None, 'fisherfolk_name': None,
                'crop_type_id': inc['crop_type'].id, 'crop_type_name': inc['crop_type'].name,
                'variety_used': inc['variety_used'],
                'date_planted': inc['date_planted'].isoformat(),
                'date_planted_is_estimated': True,
                'area_planted_ha': inc['area_planted_ha'],
                'season': inc['season'], 'year': inc['year'],
                'farm_location_barangay': inc['farm_location_barangay'],
            }

            colliding_rows = [r for r in groups[key] if r != row_number]
            if colliding_rows:
                summary['duplicate_in_file'] += 1
                result_rows.append({
                    **base, 'status': 'duplicate_in_file',
                    'detail': (
                        f'Duplicate of row(s) {", ".join(str(r) for r in colliding_rows)} in this file '
                        f'(same farmer, crop, variety, and date_planted). None of the colliding rows were '
                        f'created — resolve the conflict and re-upload.'
                    ),
                    'colliding_rows': colliding_rows,
                })
                continue

            existing_id = existing_by_key.get(key)
            if existing_id:
                summary['duplicate_in_database'] += 1
                result_rows.append({
                    **base, 'status': 'duplicate_in_database',
                    'detail': f'A CropMonitoringRecord already exists for this farmer/crop/variety/date (record #{existing_id}). Not created again.',
                    'existing_record_id': existing_id,
                })
                continue

            summary['ready'] += 1
            result_rows.append({**base, 'status': 'ready', 'detail': 'Will be created.'})

        return Response({'total_rows': len(rows), 'summary': summary, 'rows': result_rows}, status=200)


class CropRecordImportCommitView(APIView):
    """POST {"rows": [<'ready' row dicts from CropRecordImportPreviewView's
    response, exactly as returned — only the ones staff selected>]}. Writes
    ONLY 'ready' rows — any other status is refused, matching the preview
    view's own committability. Every row's uniqueness is re-checked live
    (farmer, crop_type, variety_used, date_planted) before creating, in case
    something changed since the preview was generated — refuses the whole
    batch rather than silently creating a duplicate. One transaction: every
    row succeeds or none do.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request):
        rows = request.data.get('rows')
        if not isinstance(rows, list) or not rows:
            return Response({'detail': 'Expected a non-empty list of rows to commit.'}, status=400)

        batch_id = uuid.uuid4()
        created = []

        try:
            with transaction.atomic():
                for row in rows:
                    created.append(self._commit_one_row(row, request.user))
        except _CommitRowError as exc:
            where = f'Row {exc.row_number}: ' if exc.row_number is not None else ''
            return Response({
                'detail': f'{where}{exc.message} No changes were saved — the entire batch was rolled back.',
            }, status=400)

        return Response({'batch_id': str(batch_id), 'committed': len(created), 'results': created}, status=200)

    def _commit_one_row(self, row, user):
        row_number = row.get('row_number')
        if row.get('status') != 'ready':
            raise _CommitRowError(row_number, f'status "{row.get("status")}" is not committable — only ready rows can be.')

        farmer_id = row.get('farmer_id')
        crop_type_id = row.get('crop_type_id')
        variety_used = row.get('variety_used') or ''
        date_planted_raw = row.get('date_planted')
        if not (farmer_id and crop_type_id and date_planted_raw):
            raise _CommitRowError(row_number, 'is missing required fields (farmer_id, crop_type_id, date_planted).')

        # The preview response leaves date_planted as a real date, but JSON
        # has no date type — it comes back from the frontend as an ISO
        # string (same round-trip issue RsbsaUpdateImportCommitView's
        # _coerce_incoming already handles for birthdate).
        date_planted = date_planted_raw if isinstance(date_planted_raw, date_cls) else date_cls.fromisoformat(date_planted_raw)

        try:
            farmer = Farmer.objects.get(pk=farmer_id)
        except Farmer.DoesNotExist:
            raise _CommitRowError(row_number, f'Farmer #{farmer_id} no longer exists.')

        # Live drift check — refuse rather than silently create a duplicate
        # that wasn't there when the preview was generated.
        if CropMonitoringRecord.objects.filter(
            farmer_id=farmer_id, crop_type_id=crop_type_id,
            variety_used=variety_used, date_planted=date_planted,
        ).exists():
            raise _CommitRowError(row_number, 'A matching CropMonitoringRecord was created since this preview was generated.')

        record = CropMonitoringRecord.objects.create(
            farmer=farmer,
            crop_type_id=crop_type_id,
            variety_used=variety_used,
            date_planted=date_planted,
            date_planted_is_estimated=True,
            area_planted_ha=row.get('area_planted_ha'),
            season=row.get('season'),
            year=row.get('year'),
            farm_location_barangay=row.get('farm_location_barangay') or '',
            recorded_by=user,
        )
        return {
            'row_number': row_number, 'record_id': record.id,
            'farmer_name': farmer.full_name, 'crop_type_name': record.crop_type.name,
            'variety_used': record.variety_used, 'date_planted': record.date_planted.isoformat(),
        }


class _CommitRowError(Exception):
    def __init__(self, row_number, message):
        self.row_number = row_number
        self.message = message
        super().__init__(message)
