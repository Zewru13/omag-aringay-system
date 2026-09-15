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

from accounts.models import User
from accounts.permissions import IsAdminOrEvaluator
from accounts.utils import create_inactive_citizen_shell
from farmers.models import Farmer, RsbsaImportChangeLog
# Reused wholesale rather than re-derived: these crop files ARE RSBSA/BFAR
# registry rows (see this module's own docstring), byte-for-byte the same
# person-registration shape farmers/rsbsa_import_views.py already parses —
# _build_incoming is the exact function that turns one such row into the
# typed Farmer field values needed to register someone, and duplicating
# that logic here would be the same corrupted_rsbsa/normalize_barangay/
# parse_birthday parsing maintained in two places instead of one.
from farmers.rsbsa_import_views import _build_incoming as build_person_incoming
from farmers.rsbsa_import_views import _coerce_incoming as coerce_person_incoming
from fisheries.models import Fisherfolk

from .crop_record_import import (
    build_crop_type_cache,
    build_incoming,
    classify_crop_row,
    parse_crop_record_file,
    resolve_farmer,
)
from .models import CropMonitoringRecord

# Distinct bracketed tag so this reads unmistakably as machine-generated in
# the plain-text notes field, never mistakable for a real staff remark (which
# never look like this) — the closest this field can get to "visually
# distinct" without any frontend change, since notes has no rich formatting.
SYSTEM_HARVEST_NOTE = (
    "[SYSTEM-GENERATED — IMPORT] Automatically marked Harvested: estimated "
    "planting date exceeds this crop's expected growth duration. No real "
    "harvest record exists for this cycle — reflects imported registry data only."
)

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
            farmer, is_dual_citizen, fisherfolk = resolve_farmer(p['rsbsa'], farmers_by_rsbsa, fisherfolk_by_rsbsa)
            p['farmer'] = farmer
            p['dual_citizen_fisherfolk'] = fisherfolk
            if farmer is None:
                p['status'] = 'dual_citizen' if is_dual_citizen else 'farmer_not_found'
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
        summary = {'ready': 0, 'duplicate_in_file': 0, 'duplicate_in_database': 0, 'farmer_not_found': 0, 'dual_citizen': 0, 'invalid': 0}

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

            if status == 'dual_citizen':
                ff = p['dual_citizen_fisherfolk']
                inc = p['incoming']
                summary['dual_citizen'] += 1
                # Treated as a legitimate dual registration, not a data
                # error: this row's own person-registration fields (same
                # row shape farmers/rsbsa_import_views.py's _build_incoming
                # already parses) are enough to register the missing Farmer
                # record, using the SAME rsbsa_number, alongside — never
                # replacing — the existing Fisherfolk record. Wrapped in its
                # own try/except so one row's unparseable birthday can't
                # break the whole preview; that row just stays uncommittable
                # with a clear reason instead.
                try:
                    create_incoming_values = build_person_incoming(row)
                    create_blocked_reason = None
                except ValueError as exc:
                    create_incoming_values = None
                    create_blocked_reason = f'Cannot auto-register a Farmer record for this row: {exc}'
                result_rows.append({
                    'row_number': row_number, 'rsbsa_number': rsbsa, 'status': 'dual_citizen',
                    'hold_back_reason': None,
                    'detail': (
                        f'RSBSA number {rsbsa} matches an existing Fisherfolk record (#{ff.id} {ff.full_name}), '
                        f'not a Farmer. Treated as a legitimate dual registration: committing this row creates '
                        f'a new Farmer record with the same RSBSA number (no new citizen login — the person '
                        f'already has one via their existing Fisherfolk account) and attaches this crop '
                        f'planting to it.' if create_incoming_values else create_blocked_reason
                    ),
                    'farmer_id': None, 'farmer_name': None,
                    'fisherfolk_id': ff.id, 'fisherfolk_name': ff.full_name,
                    'crop_type_id': inc['crop_type'].id, 'crop_type_name': inc['crop_type'].name,
                    'variety_used': inc['variety_used'],
                    'date_planted': inc['date_planted'].isoformat(),
                    'date_planted_is_estimated': True,
                    'area_planted_ha': inc['area_planted_ha'],
                    'season': inc['season'], 'year': inc['year'],
                    'farm_location_barangay': inc['farm_location_barangay'],
                    # Only populated when the row's person fields parsed
                    # cleanly — everything CropRecordImportCommitView needs
                    # to register the missing Farmer record. None (with
                    # create_blocked_reason explaining why) otherwise.
                    'create_incoming_values': create_incoming_values,
                    'create_blocked_reason': create_blocked_reason,
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
    """POST {"rows": [<'ready'/'dual_citizen' row dicts from
    CropRecordImportPreviewView's response, exactly as returned — only the
    ones staff selected>]}. Writes ONLY 'ready' and 'dual_citizen'
    rows — any other status is refused, matching the preview view's own
    committability. Every row's uniqueness is re-checked live (farmer,
    crop_type, variety_used, date_planted) before creating, in case
    something changed since the preview was generated — refuses the whole
    batch rather than silently creating a duplicate. One transaction: every
    row succeeds or none do.

    'dual_citizen' rows are a dual registration: the RSBSA number
    only matches an existing Fisherfolk, but CropMonitoringRecord.farmer is
    Farmer-only, so the missing Farmer record is created first (same
    rsbsa_number, this row's own person fields, never touching the existing
    Fisherfolk record), then the crop planting is attached to it exactly
    like a 'ready' row. No second citizen shell is created —
    create_inactive_citizen_shell() (accounts.utils) detects the person's
    existing Fisherfolk shell and skips creating a second one on its own.
    Every such Farmer creation is logged to farmers.models.
    RsbsaImportChangeLog, the same audit trail RsbsaUpdateImportCommitView
    uses for every Farmer/Fisherfolk creation elsewhere — one consistent
    trail for "this record exists because of an RSBSA-based import",
    regardless of which importer triggered it.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    def post(self, request):
        rows = request.data.get('rows')
        if not isinstance(rows, list) or not rows:
            return Response({'detail': 'Expected a non-empty list of rows to commit.'}, status=400)

        batch_id = uuid.uuid4()
        log_entries = []
        created = []

        try:
            with transaction.atomic():
                for row in rows:
                    created.append(self._commit_one_row(row, batch_id, request.user, log_entries))
                # Written last, inside the same atomic block: if anything
                # above raised, none of these exist either — same pattern
                # RsbsaUpdateImportCommitView already uses.
                RsbsaImportChangeLog.objects.bulk_create(log_entries)
        except _CommitRowError as exc:
            where = f'Row {exc.row_number}: ' if exc.row_number is not None else ''
            return Response({
                'detail': f'{where}{exc.message} No changes were saved — the entire batch was rolled back.',
            }, status=400)

        return Response({'batch_id': str(batch_id), 'committed': len(created), 'results': created}, status=200)

    def _commit_one_row(self, row, batch_id, user, log_entries):
        row_number = row.get('row_number')
        status = row.get('status')

        if status == 'dual_citizen':
            return self._commit_dual_registration(row, row_number, batch_id, user, log_entries)

        if status != 'ready':
            raise _CommitRowError(
                row_number,
                f'status "{status}" is not committable — only ready and dual_citizen rows can be.',
            )

        farmer_id = row.get('farmer_id')
        if not farmer_id:
            raise _CommitRowError(row_number, 'is missing farmer_id.')
        try:
            farmer = Farmer.objects.get(pk=farmer_id)
        except Farmer.DoesNotExist:
            raise _CommitRowError(row_number, f'Farmer #{farmer_id} no longer exists.')

        return self._create_crop_record(row, row_number, farmer, user)

    def _commit_dual_registration(self, row, row_number, batch_id, user, log_entries):
        """A `dual_citizen` row: RSBSA matches an existing
        Fisherfolk, not a Farmer, but CropMonitoringRecord.farmer is
        Farmer-only. Treated as a legitimate dual registration (the same
        real person, genuinely active in both farming and fishing) —
        creates the missing Farmer record with this row's own
        person-registration fields (same rsbsa_number), then attaches this
        crop planting to it exactly as a 'ready' row would.
        """
        create_incoming_values = row.get('create_incoming_values')
        if not create_incoming_values:
            raise _CommitRowError(
                row_number,
                row.get('create_blocked_reason')
                or 'is missing create_incoming_values — cannot register the missing Farmer record.',
            )

        rsbsa_number = (row.get('rsbsa_number') or '').strip()
        if not rsbsa_number:
            raise _CommitRowError(row_number, 'is missing rsbsa_number.')

        if Farmer.objects.filter(rsbsa_number=rsbsa_number).exists():
            raise _CommitRowError(
                row_number,
                f'A Farmer with RSBSA number "{rsbsa_number}" already exists — this row is stale '
                f'(no longer genuinely a dual registration). Re-run the preview and try again.',
            )

        # Re-verify the Fisherfolk match this row was flagged against still
        # exists live — same drift-safety discipline as every other commit
        # path in this app.
        fisherfolk_id = row.get('fisherfolk_id')
        if not fisherfolk_id or not Fisherfolk.objects.filter(pk=fisherfolk_id, rsbsa_number=rsbsa_number).exists():
            raise _CommitRowError(
                row_number,
                'The existing Fisherfolk record this row was matched against no longer matches '
                'this RSBSA number — re-run the preview and try again.',
            )

        # The preview response leaves birthdate as a real date, but JSON has
        # no date type — it comes back from the frontend as an ISO string
        # (same round-trip issue RsbsaUpdateImportCommitView's own
        # _coerce_incoming exists to fix; reused here rather than
        # re-derived, since it's the exact same field on the exact same
        # Farmer model). Every other field round-trips through JSON as the
        # type it needs to be written back as already.
        try:
            create_kwargs = {
                field: coerce_person_incoming(field, value)
                for field, value in create_incoming_values.items()
            }
        except ValueError as exc:
            raise _CommitRowError(row_number, str(exc))
        create_kwargs['rsbsa_number'] = rsbsa_number
        create_kwargs['registered_by'] = user
        create_kwargs.setdefault('municipality', 'Aringay')
        create_kwargs.setdefault('province', 'La Union')
        create_kwargs.setdefault('civil_status', Farmer.CivilStatus.UNSPECIFIED)
        farmer = Farmer.objects.create(**create_kwargs)

        # Same farm-laborer exclusion RsbsaUpdateImportCommitView's own
        # _create_record uses; create_inactive_citizen_shell() also detects
        # on its own that this rsbsa_number already has a Fisherfolk shell
        # and returns None without creating a second one — nothing dual-
        # registration-specific has to be handled here for that part.
        shell = None
        if not farmer.is_farm_laborer:
            shell = create_inactive_citizen_shell(User.LinkedRecordType.FARMER, farmer)

        for field, value in create_incoming_values.items():
            log_entries.append(RsbsaImportChangeLog(
                batch_id=batch_id, performed_by=user, record_type='FARMER',
                record_id=farmer.pk, rsbsa_number=farmer.rsbsa_number,
                record_name=farmer.full_name, action=RsbsaImportChangeLog.Action.CREATE,
                field_name=field, field_label=field.replace('_', ' ').title(),
                old_value='', new_value=str(value),
            ))

        crop_result = self._create_crop_record(row, row_number, farmer, user)
        crop_result['dual_registration'] = {
            'farmer_id': farmer.id, 'farmer_name': farmer.full_name,
            'citizen_shell_created': shell is not None,
            'note': (
                f'Farmer record created, no new login — citizen already has access via their '
                f'existing Fisherfolk account (#{fisherfolk_id}).' if shell is None
                else 'New citizen shell created for the Farmer record.'
            ),
        }
        return crop_result

    def _create_crop_record(self, row, row_number, farmer, user):
        """Shared by the 'ready' path (farmer already existed at preview
        time) and _commit_dual_registration (farmer was just created above,
        in this same request) — both end the same way: one
        CropMonitoringRecord attached to `farmer`."""
        crop_type_id = row.get('crop_type_id')
        variety_used = row.get('variety_used') or ''
        date_planted_raw = row.get('date_planted')
        if not (crop_type_id and date_planted_raw):
            raise _CommitRowError(row_number, 'is missing required fields (crop_type_id, date_planted).')

        # The preview response leaves date_planted as a real date, but JSON
        # has no date type — it comes back from the frontend as an ISO
        # string (same round-trip issue RsbsaUpdateImportCommitView's
        # _coerce_incoming already handles for birthdate).
        date_planted = date_planted_raw if isinstance(date_planted_raw, date_cls) else date_cls.fromisoformat(date_planted_raw)

        # Live drift check — refuse rather than silently create a duplicate
        # that wasn't there when the preview was generated.
        if CropMonitoringRecord.objects.filter(
            farmer=farmer, crop_type_id=crop_type_id,
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

        # Retroactive Harvested marking: CropMonitoringRecord.save() always
        # computes expected_harvest_date from date_planted + crop_type.days_to_harvest,
        # regardless of date_planted_is_estimated — only the Near-Harvest
        # auto-transition and the real-harvest/suggestion-engine gates are
        # conditioned on that flag (see date_planted_is_estimated's own
        # model comment for every enforcement point). Those gates mean this
        # record would otherwise sit at "Planted" forever — the auto-
        # transition to Near Harvest is skipped for estimated dates, so
        # nothing will ever move it. If the estimate already lies in the
        # past by the time this import runs, waiting for that to eventually
        # happen is pointless; it never will. This does NOT create a real
        # HarvestRecord and does NOT touch the Record Harvest 50%-duration
        # gate (production/views.py's HarvestRecordCreateView.create) or the
        # Activity Suggestion Engine's exclusion — both still refuse/exclude
        # this record exactly as before, since date_planted_is_estimated
        # stays True. This only sets the display status and an explanatory
        # note so imported registry data doesn't misreport as still-growing
        # when the estimated timeline has already elapsed.
        if record.expected_harvest_date and record.expected_harvest_date < date_cls.today():
            record.status = CropMonitoringRecord.Status.HARVESTED
            record.notes = SYSTEM_HARVEST_NOTE
            record.save()

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
