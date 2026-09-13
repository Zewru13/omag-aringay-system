"""
RSBSA Excel update-import — preview (RsbsaUpdateImportPreviewView) and
commit (RsbsaUpdateImportCommitView); see rsbsa_import.py's module
docstring for the shared parsing/classification logic both reuse.

The preview view parses, classifies, and matches against existing records,
but performs no database writes — it's the review step. The commit view
writes, but ONLY what the preview already showed: it takes the exact rows
the preview returned (staff pick which of those to actually commit
client-side), never a fresh upload or a re-interpretation of the sheet.
This mirrors the dry_run pattern in associations/views.py
(_run_organization_distribution) — one shared shape, a boolean-ish gate
between "show what would happen" and "actually do it" — except here the
gate is "which endpoint you called", and the frontend still has to hand
back exactly the row data the preview computed rather than re-deriving it,
since the preview is the only place `changes`/`incoming_values` ever get
computed.

Conflict rule (explicit, per design discussion): neither Farmer nor
Fisherfolk carries any per-field "last modified" timestamp or change
history — the only trace of a locally-made edit is the current field value
itself (ProfileChangeRequest only covers first/middle/last name + barangay,
and only for edits that went through that specific citizen-request flow;
direct staff edits leave no record at all). So "changed locally since the
last import" cannot be detected as a true history comparison — what IS
reliably detectable, and what the preview reports, is simply: does the
incoming sheet value differ from the record's CURRENT value, for any
updatable field. Every such difference is surfaced as a flagged change for
staff to decide on, never silently applied.

Known structural limitation — same-person conflicting historical rows
(confirmed real case, not hypothetical): the source RSBSA/BFAR exports
carry no timestamp or recency field of their own to say which row for a
given person is "current" — `date_created`/`kyc_updated`/`parcel_updated`
describe the row's own record-keeping history, not which of two rows'
field values should win. A person who appears more than once — across
different crop files, or more than once within the same file (one row per
crop/parcel) — can carry two genuinely different values for the same
field (e.g. an old and a new contact number), both equally "real" as far
as this importer can tell. Whichever value is committed, the OTHER row's
value will keep showing up as a fresh `matched_with_changes` diff on the
next preview, because the diff is always just "does this row's value
differ from the record's current live value" with no concept of most-
recent-wins. This means such a person can permanently oscillate between
two `matched_with_changes` states no matter which value staff pick to
commit — that is NOT a bug in this view or in the drift check, and is not
fixable by re-running the commit again (doing so just flips which of the
two rows now looks "pending"). Confirmed real example: Rogie Mercado
Santiago (Farmer #3415, RSBSA 01-033-02-022-000004) — `Aringay-corn.csv`
and `Aringay-rice.csv` each contain both his old contact number
('09186398950') and his new one ('09397215139') in separate rows; after
committing the newer value, the older row still legitimately flags as a
pending change, indefinitely. A future session re-running this import and
seeing an old case like this "regress" or "never clear" should not
diagnose it as newly broken and should not try to silently resolve it by
picking whichever value happens to commit last — the two source rows are
genuinely in disagreement and that disagreement should stay visible to
staff, not be paved over.

`updated_at`'s own caveat (still true, re-confirmed against the live model
comment on Farmer.updated_at / Fisherfolk.updated_at): it's auto_now, so it
updates on every real save from here on — but a record that has never been
touched since whenever a backfill/migration last saved it will show THAT
timestamp, not "never edited". It is not proof of "no local edits", just
the best signal available; the frontend surfaces it with that same caveat,
not as a stronger guarantee than it actually is.

Audit trail: farmers.models.RsbsaImportChangeLog — NOT
auditlog.AuditLogEntry. That signal-based log already fires automatically
for every Farmer/Fisherfolk .save() this commit view makes (confirmed via
auditlog/signals.py), but it only ever records {action, model_name,
object_repr} for any model, never a field-level diff — so it complements
this log, it doesn't replace the need for it.
"""
import uuid
from datetime import date

import openpyxl
import xlrd
from django.db import transaction
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.models import User
from accounts.permissions import IsAdminOrEvaluator
from accounts.utils import create_inactive_citizen_shell
from farmers.models import Farmer, RsbsaImportChangeLog
from farmers.rsbsa_import import (
    build_last_name,
    classify_row,
    normalize_barangay,
    normalize_contact,
    normalize_name_part,
    parse_birthday,
    parse_rsbsa_csv,
    parse_rsbsa_xlsx,
)
from fisheries.models import Fisherfolk

# (field name, display label) — the fields this import can ever touch on an
# existing record. Deliberately the same set the one-time import populates
# on create (see import_rsbsa_bfar_data.py) — nothing the sheet has no
# opinion on (civil_status, fisherfolk_type, the fishery-activity flags,
# municipality/province) is ever compared or touched.
FARMER_FIELDS = [
    ('first_name', 'First Name'),
    ('middle_name', 'Middle Name'),
    ('last_name', 'Last Name'),
    ('gender', 'Gender'),
    ('birthdate', 'Birthdate'),
    ('contact_number', 'Contact No.'),
    ('barangay', 'Barangay'),
    ('is_farm_laborer', 'Farm Laborer'),
]
FISHERFOLK_FIELDS = [
    ('first_name', 'First Name'),
    ('middle_name', 'Middle Name'),
    ('last_name', 'Last Name'),
    ('gender', 'Gender'),
    ('birthdate', 'Birthdate'),
    ('contact_number', 'Contact No.'),
    ('barangay', 'Barangay'),
]


def _display(value):
    if value is None or value == '':
        return '(blank)'
    return str(value)


def _diff_fields(record, incoming, field_specs):
    """incoming is {field_name: value}. Returns a list of
    {field, label, current, incoming} for every field whose current value
    differs from the incoming one. Comparison is on the raw values (not the
    display strings), so e.g. True != False is still caught even though
    both display fine."""
    changes = []
    for field, label in field_specs:
        current = getattr(record, field)
        new = incoming[field]
        # Normalize blank-ish values so '' and None compare equal — the sheet
        # only ever supplies strings, records may hold None.
        current_cmp = current if current not in (None, '') else None
        new_cmp = new if new not in (None, '') else None
        if current_cmp != new_cmp:
            changes.append({
                'field': field,
                'label': label,
                'current': _display(current),
                'incoming': _display(new),
            })
    return changes


def _build_incoming(row):
    """Parse one classified row's raw strings into the same typed values
    Farmer/Fisherfolk fields hold, using the exact same normalizers the
    one-time import writes with. Raises ValueError on unparseable data
    (e.g. a malformed birthday) — caller buckets that row as invalid rather
    than letting one bad row break the whole preview."""
    gender = 'Male' if row['gender'].strip().upper() == 'MALE' else 'Female'
    incoming = {
        'first_name': normalize_name_part(row['first_name']),
        'middle_name': normalize_name_part(row['middle_name']),
        'last_name': build_last_name(row['last_name'], row['ext_name']),
        'gender': gender,
        'birthdate': parse_birthday(row['birthday']),
        'contact_number': normalize_contact(row['contact_num']),
        'barangay': normalize_barangay(row['farmer_address_bgy']),
    }
    farmer_flag = (row['farmer'] or '').strip().upper()
    incoming['is_farm_laborer'] = farmer_flag != 'YES'
    return incoming


class RsbsaUpdateImportPreviewView(APIView):
    """
    POST a .csv or .xlsx RSBSA/BFAR export (multipart, field name 'file').
    Parses, classifies every row with the same rules the one-time import
    used, and for rows that classify as IMPORT-FARMER/IMPORT-FISHERFOLK,
    looks up an existing record by rsbsa_number.

    .csv accepted alongside .xlsx (not instead of it) because the real 2026
    RSBSA refresh arrives as .csv — the same shape import_rsbsa_bfar_data.py
    already reads directly via csv.DictReader — while .xlsx stays supported
    for anyone who re-saves an export through Excel first; nothing forces
    either format exclusively, so there was no reason to drop one for the
    other. Either format is accepted under either known header shape (see
    farmers.rsbsa_import.detect_header_version).

    This is an UPDATE mechanism, not a re-run of the original import: a row
    with no matching existing record is reported as 'unmatched', never
    silently created as a new Farmer/Fisherfolk. Nothing in this view writes
    to the database.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]
    parser_classes = [MultiPartParser]

    def post(self, request):
        upload = request.FILES.get('file')
        if not upload:
            return Response({'detail': 'No file was uploaded.'}, status=400)

        name_lower = upload.name.lower()
        if name_lower.endswith('.xlsx') or name_lower.endswith('.xls'):
            parser = parse_rsbsa_xlsx
        elif name_lower.endswith('.csv'):
            parser = parse_rsbsa_csv
        else:
            return Response({'detail': 'Only .csv, .xlsx, or .xls files are supported.'}, status=400)

        try:
            rows = parser(upload)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        except openpyxl.utils.exceptions.InvalidFileException:
            return Response({'detail': 'The file could not be read as an Excel workbook.'}, status=400)
        except xlrd.biffh.XLRDError:
            return Response({'detail': 'The file could not be read as a legacy Excel (.xls) workbook.'}, status=400)

        if not rows:
            return Response({'detail': 'The file has a valid header row but no data rows.'}, status=400)

        # ── Classify + parse every row first, so one bad row never breaks
        # the whole preview (unlike the one-time command, this runs against
        # live, less-controlled uploads, not one known-good file). ──
        parsed = []
        for i, row in enumerate(rows, start=2):  # row 1 is the header
            disposition, reason = classify_row(row)
            if disposition == 'HOLD-BACK':
                parsed.append({'row': row, 'row_number': i, 'disposition': disposition, 'reason': reason, 'incoming': None})
                continue
            try:
                incoming = _build_incoming(row)
            except ValueError:
                parsed.append({
                    'row': row, 'row_number': i, 'disposition': 'HOLD-BACK',
                    'reason': 'unparseable_birthday', 'incoming': None,
                })
                continue
            parsed.append({'row': row, 'row_number': i, 'disposition': disposition, 'reason': None, 'incoming': incoming})

        # ── Bulk-fetch every matchable rsbsa_number against BOTH tables, not
        # just the one matching each row's file classification. A row's
        # farmer/farmworker/fisherfolk flags say what the FILE thinks this
        # person is, but that can be wrong for someone already registered
        # under the other table — checking only the "expected" table then
        # silently reports them "unmatched" even though their real record
        # exists, one query away, in the other one. See the
        # classification_mismatch handling below, which surfaces this to
        # staff instead of resolving it invisibly. ──
        matchable_rsbsa = [
            p['row']['rsbsa_no'].strip() for p in parsed if p['disposition'] != 'HOLD-BACK'
        ]
        farmers_by_rsbsa = {
            f.rsbsa_number: f for f in Farmer.objects.filter(rsbsa_number__in=matchable_rsbsa)
        }
        fisherfolk_by_rsbsa = {
            f.rsbsa_number: f for f in Fisherfolk.objects.filter(rsbsa_number__in=matchable_rsbsa)
        }

        result_rows = []
        summary = {
            'matched_with_changes': 0, 'matched_no_changes': 0,
            'classification_mismatch': 0, 'unmatched': 0, 'invalid': 0,
        }

        for p in parsed:
            row, row_number, disposition, reason = p['row'], p['row_number'], p['disposition'], p['reason']
            rsbsa = row['rsbsa_no'].strip()

            if disposition == 'HOLD-BACK':
                summary['invalid'] += 1
                result_rows.append({
                    'row_number': row_number,
                    'rsbsa_number': rsbsa,
                    'classification': disposition,
                    'status': 'invalid',
                    'hold_back_reason': reason,
                    'matched_record_id': None,
                    'matched_record_type': None,
                    'matched_record_name': None,
                    'classification_mismatch': False,
                    'mismatch_note': None,
                    'changes': [],
                    'incoming_values': None,
                    'current_values': None,
                })
                continue

            is_farmer = disposition == 'IMPORT-FARMER'
            primary_dict, primary_table = (farmers_by_rsbsa, 'FARMER') if is_farmer else (fisherfolk_by_rsbsa, 'FISHERFOLK')
            other_dict, other_table = (fisherfolk_by_rsbsa, 'FISHERFOLK') if is_farmer else (farmers_by_rsbsa, 'FARMER')

            record = primary_dict.get(rsbsa)
            matched_table = primary_table
            classification_mismatch = False
            if record is None:
                fallback = other_dict.get(rsbsa)
                if fallback is not None:
                    record = fallback
                    matched_table = other_table
                    classification_mismatch = True

            field_specs = FARMER_FIELDS if matched_table == 'FARMER' else FISHERFOLK_FIELDS

            if record is None:
                summary['unmatched'] += 1
                result_rows.append({
                    'row_number': row_number,
                    'rsbsa_number': rsbsa,
                    'classification': disposition,
                    'status': 'unmatched',
                    'hold_back_reason': None,
                    'matched_record_id': None,
                    'matched_record_type': None,
                    'matched_record_name': None,
                    'classification_mismatch': False,
                    'mismatch_note': None,
                    'changes': [],
                    # No existing record to diff against — this is
                    # everything RsbsaUpdateImportCommitView needs to
                    # register this person as new, same field set the
                    # matched branch above diffs against (field_specs).
                    'incoming_values': {field: p['incoming'][field] for field, _ in field_specs},
                    'current_values': None,
                })
                continue

            changes = _diff_fields(record, p['incoming'], field_specs)

            if classification_mismatch:
                status_key = 'classification_mismatch'
                summary[status_key] += 1
                file_role = 'Farmer/Farmworker' if is_farmer else 'Fisherfolk'
                mismatch_note = (
                    f"Classification mismatch: the file's flags classify this row as "
                    f"{file_role}, but RSBSA number {rsbsa} matches an existing "
                    f"{matched_table.title()} record instead (not {primary_table.title()}, "
                    f"as the file's classification would expect). Treated as a legitimate "
                    f"dual registration, not a data error: committing this row creates the "
                    f"missing {primary_table.title()} record with this same RSBSA number, "
                    f"alongside (never replacing) the existing {matched_table.title()} record "
                    f"above — no second citizen login is created; the person's existing "
                    f"{matched_table.title()} account remains their only one."
                )
                # Full field set for the domain the FILE wants (primary_table),
                # built from the FULL parsed row (p['incoming']) — deliberately
                # NOT derived from `changes` below, which is only a diff against
                # the WRONG-domain record for human review and would silently
                # omit any field that happens to already match it.
                create_domain = primary_table
                create_field_specs = FARMER_FIELDS if is_farmer else FISHERFOLK_FIELDS
                create_incoming_values = {field: p['incoming'][field] for field, _ in create_field_specs}
            else:
                status_key = 'matched_with_changes' if changes else 'matched_no_changes'
                summary[status_key] += 1
                mismatch_note = None
                create_domain = None
                create_incoming_values = None

            result_rows.append({
                'row_number': row_number,
                'rsbsa_number': rsbsa,
                'classification': disposition,
                'status': status_key,
                'hold_back_reason': None,
                'matched_record_id': record.id,
                'matched_record_type': matched_table,
                'matched_record_name': record.full_name,
                # The one real "has this been touched locally" signal staff
                # have to weigh a flagged change against — see updated_at's
                # own model-field comment for why it's not a full history.
                'matched_record_updated_at': record.updated_at,
                'classification_mismatch': classification_mismatch,
                'mismatch_note': mismatch_note,
                'changes': changes,
                # Raw (not display-formatted) values backing `changes` above,
                # for RsbsaUpdateImportCommitView — `changes[].current`/
                # `.incoming` are strings for human review ("(blank)", "True"),
                # never safe to write back verbatim. Only the fields that
                # actually changed are included, matching `changes` exactly,
                # so the commit view can never touch a field staff wasn't
                # shown a diff for. `current_values` doubles as the commit
                # view's drift check: if the record's live value no longer
                # matches what's captured here, the preview is stale and the
                # row is refused rather than silently overwritten.
                'incoming_values': {c['field']: p['incoming'][c['field']] for c in changes},
                'current_values': {c['field']: getattr(record, c['field']) for c in changes},
                # Only populated for classification_mismatch — everything the
                # commit view needs to create the missing-domain record. None
                # for every other status, including matched_with_changes/
                # matched_no_changes, which have nothing to "create".
                'create_domain': create_domain,
                'create_incoming_values': create_incoming_values,
            })

        return Response({
            'total_rows': len(rows),
            'summary': summary,
            'rows': result_rows,
        }, status=200)


class CommitRowError(Exception):
    """Raised by _commit_one_row to abort the whole batch — caught once in
    RsbsaUpdateImportCommitView.post, outside the atomic block, so every
    caller only has one place to build the error response."""
    def __init__(self, row_number, message):
        self.row_number = row_number
        self.message = message
        super().__init__(message)


def _coerce_incoming(field, value):
    """Undo the one lossy step of the preview-response round trip: a
    date leaves the preview as a real date, but JSON has no date type, so
    it comes back from the frontend as an ISO string. Every other field
    this import ever touches (name parts, gender, contact_number,
    barangay, is_farm_laborer) round-trips through JSON as the exact type
    it needs to be written back as — str stays str, bool stays bool.
    Raises plain ValueError on unparseable data — callers attach the
    row_number CommitRowError needs, since this helper doesn't have it."""
    if field != 'birthdate':
        return value
    if not value:
        raise ValueError('Birthdate cannot be blank.')
    if not isinstance(value, str):
        return value
    try:
        return parse_birthday(value)
    except ValueError:
        raise ValueError(f'Birthdate "{value}" is not a recognized date.')


def _values_match(current, snapshot_field, snapshot_value):
    """Same blank-normalization _diff_fields already uses ('' and None
    compare equal), applied here so the drift check doesn't false-positive
    on that same blank/None distinction."""
    incoming = _coerce_incoming(snapshot_field, snapshot_value)
    current_cmp = current if current not in (None, '') else None
    incoming_cmp = incoming if incoming not in (None, '') else None
    return current_cmp == incoming_cmp


class RsbsaUpdateImportCommitView(APIView):
    """
    POST {"rows": [<row dicts from RsbsaUpdateImportPreviewView's response,
    exactly as returned — only the ones staff selected>]}.

    Writes ONLY 'matched_with_changes', 'unmatched', and
    'classification_mismatch' rows — anything else ('matched_no_changes':
    nothing to write; 'invalid': nothing to write to) is refused. For a
    'matched_with_changes' row, every field in that row's
    own `current_values` is re-checked against the record's LIVE value
    first — if anything has drifted since the preview was generated (a
    direct staff edit, a citizen-side ProfileChangeRequest approval, or
    just a stale/reused preview), the whole batch is refused rather than
    silently overwriting whatever changed it. Only the fields listed in
    that row's own `changes`/`incoming_values` are ever touched — never a
    blanket overwrite of the rest of the record.

    'unmatched' rows register a genuinely new Farmer/Fisherfolk, through
    the exact same create + create_inactive_citizen_shell pattern
    FarmerListView/FisherfolkListView.perform_create already use for
    manual registration (including Farmer's is_farm_laborer exclusion —
    farm laborers never get a citizen shell) — not a new pattern.

    'classification_mismatch' rows register a dual registration: the same
    physical person already has a record under the OTHER domain (see that
    status's own mismatch_note), and this creates the missing domain's
    record too, using this row's own values and the same rsbsa_number,
    without ever touching the existing wrong-domain record. No second
    citizen shell is created — create_inactive_citizen_shell() (accounts.
    utils) detects the person's existing shell under the other domain and
    skips creating a second one on its own.

    The whole batch is one transaction.atomic(): every row succeeds or none
    do, matching PondBulkCreateView / CropMonitoringBulkCreateView /
    _run_organization_distribution's per-batch atomicity, and the same
    all-or-nothing discipline the Excel-import duplicate fix relies on.

    Every field this view actually writes is logged to
    RsbsaImportChangeLog (old value, new value, per field, per record,
    who, when, grouped by one batch_id per commit) — see this module's
    docstring for why that log exists alongside auditlog.AuditLogEntry
    rather than instead of it; that signal-based log still fires on its
    own for every .save() below, same as any other Farmer/Fisherfolk save.
    """
    permission_classes = [IsAuthenticated, IsAdminOrEvaluator]

    FIELD_SPECS = {
        'FARMER': FARMER_FIELDS,
        'FISHERFOLK': FISHERFOLK_FIELDS,
    }
    MODELS = {
        'FARMER': Farmer,
        'FISHERFOLK': Fisherfolk,
    }
    LINKED_RECORD_TYPE = {
        'FARMER': User.LinkedRecordType.FARMER,
        'FISHERFOLK': User.LinkedRecordType.FISHERFOLK,
    }

    def post(self, request):
        rows = request.data.get('rows')
        if not isinstance(rows, list) or not rows:
            return Response({'detail': 'Expected a non-empty list of rows to commit.'}, status=400)

        batch_id = uuid.uuid4()
        log_entries = []
        results = []

        try:
            with transaction.atomic():
                for row in rows:
                    result = self._commit_one_row(row, batch_id, request.user, log_entries)
                    results.append(result)
                # Written last, inside the same atomic block: if anything
                # above raised, none of these exist either.
                RsbsaImportChangeLog.objects.bulk_create(log_entries)
        except CommitRowError as exc:
            where = f'Row {exc.row_number}: ' if exc.row_number is not None else ''
            return Response({
                'detail': f'{where}{exc.message} No changes were saved — the entire batch was rolled back.',
            }, status=400)

        return Response({
            'batch_id': str(batch_id),
            'committed': len(results),
            'results': results,
        }, status=200)

    def _commit_one_row(self, row, batch_id, user, log_entries):
        row_number = row.get('row_number')
        status_ = row.get('status')

        try:
            if status_ == 'matched_with_changes':
                return self._commit_update(row, row_number, batch_id, user, log_entries)
            if status_ == 'unmatched':
                return self._commit_create(row, row_number, batch_id, user, log_entries)
            if status_ == 'classification_mismatch':
                return self._commit_dual_registration(row, row_number, batch_id, user, log_entries)
        except ValueError as exc:
            # _coerce_incoming/_values_match raise plain ValueError — they
            # don't have row_number in scope, so it's attached here instead.
            raise CommitRowError(row_number, str(exc))

        raise CommitRowError(
            row_number,
            f'status "{status_}" is not committable — only matched_with_changes, unmatched, '
            f'and classification_mismatch rows can be.',
        )

    def _commit_update(self, row, row_number, batch_id, user, log_entries):
        record_type = row.get('matched_record_type')
        model = self.MODELS.get(record_type)
        field_specs = self.FIELD_SPECS.get(record_type)
        if model is None:
            raise CommitRowError(row_number, f'unrecognized matched_record_type "{record_type}".')

        record_id = row.get('matched_record_id')
        incoming_values = row.get('incoming_values') or {}
        current_values = row.get('current_values') or {}
        field_labels = dict(field_specs)

        if not incoming_values:
            raise CommitRowError(row_number, 'has no incoming_values — nothing to commit.')

        try:
            record = model.objects.get(pk=record_id)
        except model.DoesNotExist:
            raise CommitRowError(row_number, f'{record_type.title()} #{record_id} no longer exists.')

        # Drift check — every field this row claims to change, re-verified
        # against the record's LIVE value before anything is written.
        for field in incoming_values:
            if field not in field_labels:
                raise CommitRowError(row_number, f'"{field}" is not an updatable {record_type.title()} field.')
            live_value = getattr(record, field)
            if not _values_match(live_value, field, current_values.get(field)):
                raise CommitRowError(
                    row_number,
                    f'{field_labels[field]} has changed since this preview was generated '
                    f'(now "{live_value}") — re-run the preview and try again.',
                )

        record_name_before = record.full_name
        for field, raw_value in incoming_values.items():
            new_value = _coerce_incoming(field, raw_value)
            old_value = getattr(record, field)
            setattr(record, field, new_value)
            log_entries.append(RsbsaImportChangeLog(
                batch_id=batch_id, performed_by=user, record_type=record_type,
                record_id=record.pk, rsbsa_number=record.rsbsa_number,
                record_name=record_name_before, action=RsbsaImportChangeLog.Action.UPDATE,
                field_name=field, field_label=field_labels[field],
                old_value=_display(old_value), new_value=_display(new_value),
            ))
        record.save()

        return {
            'row_number': row_number, 'action': 'UPDATE', 'record_type': record_type,
            'record_id': record.pk, 'record_name': record.full_name,
            'fields_changed': list(incoming_values.keys()),
        }

    def _create_record(self, record_type, rsbsa_number, incoming_values, row_number, batch_id, user, log_entries):
        """Shared by _commit_create ('unmatched' rows) and
        _commit_dual_registration ('classification_mismatch' rows) — both
        ultimately do the same thing: create a brand-new Farmer or
        Fisherfolk row for an RSBSA number that has no row in THAT table
        yet. Returns (record, shell_or_None) — shell is None exactly when
        create_inactive_citizen_shell() decided a second citizen login
        would be unsafe (see its own docstring); farm-laborer exclusion is
        the other, older reason a Farmer might get None here.
        """
        model = self.MODELS[record_type]
        field_specs = self.FIELD_SPECS[record_type]
        field_labels = dict(field_specs)

        if model.objects.filter(rsbsa_number=rsbsa_number).exists():
            raise CommitRowError(
                row_number,
                f'{record_type.title()} with RSBSA number "{rsbsa_number}" already exists — '
                f'this row is stale (no longer genuinely new). Re-run the preview and try again.',
            )

        create_kwargs = {'rsbsa_number': rsbsa_number, 'registered_by': user}
        for field, _label in field_specs:
            if field in incoming_values:
                create_kwargs[field] = _coerce_incoming(field, incoming_values[field])

        if record_type == 'FARMER':
            create_kwargs.setdefault('municipality', 'Aringay')
            create_kwargs.setdefault('province', 'La Union')
            create_kwargs.setdefault('civil_status', Farmer.CivilStatus.UNSPECIFIED)
        else:
            create_kwargs.setdefault('municipality', 'Aringay')
            create_kwargs.setdefault('fisherfolk_type', Fisherfolk.FisherfolkType.UNSPECIFIED)
            for flag in ('is_aquaculture', 'is_capture_fishery', 'is_mariculture', 'is_inland_fishery', 'has_vessel'):
                create_kwargs.setdefault(flag, False)

        record = model.objects.create(**create_kwargs)

        # Same pattern FarmerListView/FisherfolkListView.perform_create
        # already use for manual registration — farm laborers never get a
        # citizen shell (no farm of their own to report on), everyone else
        # (including every Fisherfolk, unconditionally) does. On top of
        # that, create_inactive_citizen_shell() now also returns None on
        # its own when this exact rsbsa_number already has a reachable
        # shell under the other domain — nothing dual-registration-specific
        # has to be handled here for that part.
        shell = None
        if record_type == 'FISHERFOLK' or not record.is_farm_laborer:
            shell = create_inactive_citizen_shell(self.LINKED_RECORD_TYPE[record_type], record)

        for field, _label in field_specs:
            if field not in incoming_values:
                continue
            log_entries.append(RsbsaImportChangeLog(
                batch_id=batch_id, performed_by=user, record_type=record_type,
                record_id=record.pk, rsbsa_number=record.rsbsa_number,
                record_name=record.full_name, action=RsbsaImportChangeLog.Action.CREATE,
                field_name=field, field_label=field_labels[field],
                old_value='', new_value=_display(getattr(record, field)),
            ))
        return record, shell

    def _commit_create(self, row, row_number, batch_id, user, log_entries):
        classification = row.get('classification')
        record_type = 'FARMER' if classification == 'IMPORT-FARMER' else 'FISHERFOLK'
        field_specs = self.FIELD_SPECS[record_type]

        rsbsa_number = (row.get('rsbsa_number') or '').strip()
        incoming_values = row.get('incoming_values') or {}
        if not rsbsa_number or not incoming_values:
            raise CommitRowError(row_number, 'is missing rsbsa_number or incoming_values — cannot register.')

        record, _shell = self._create_record(record_type, rsbsa_number, incoming_values, row_number, batch_id, user, log_entries)

        return {
            'row_number': row_number, 'action': 'CREATE', 'record_type': record_type,
            'record_id': record.pk, 'record_name': record.full_name,
            'fields_changed': [f for f, _ in field_specs if f in incoming_values],
        }

    def _commit_dual_registration(self, row, row_number, batch_id, user, log_entries):
        """A `classification_mismatch` row: the file's own flags say this
        person is one domain (e.g. Farmer/Farmworker), but their RSBSA
        number already matches an existing record in the OTHER domain
        (e.g. Fisherfolk) — treated as a real, legitimate dual registration
        (the same physical person, genuinely active in both), not a data
        error. Creates the missing-domain record with this row's own
        values and the SAME rsbsa_number, alongside — never replacing —
        the existing wrong-domain record. Citizen-shell creation goes
        through the exact same _create_record path 'unmatched' rows use;
        create_inactive_citizen_shell() detects on its own that this exact
        rsbsa_number already has a shell under the other domain and skips
        creating a second one — nothing dual-registration-specific has to
        be handled here for that part (see accounts.utils's own docstring
        for why a second one would be unsafe, not just redundant).
        """
        create_domain = row.get('create_domain')
        if create_domain not in self.MODELS:
            raise CommitRowError(row_number, f'unrecognized create_domain "{create_domain}".')

        rsbsa_number = (row.get('rsbsa_number') or '').strip()
        incoming_values = row.get('create_incoming_values') or {}
        if not rsbsa_number or not incoming_values:
            raise CommitRowError(row_number, 'is missing rsbsa_number or create_incoming_values — cannot register.')

        # Re-verify the wrong-domain match this row was flagged against
        # still exists live — same drift-safety discipline as every other
        # commit path here. If it's gone (deleted, or already resolved by
        # an earlier row/commit in the meantime), this row's whole premise
        # is stale.
        other_type = row.get('matched_record_type')
        other_model = self.MODELS.get(other_type)
        other_id = row.get('matched_record_id')
        if other_model is None or other_id is None or not other_model.objects.filter(
            pk=other_id, rsbsa_number=rsbsa_number,
        ).exists():
            raise CommitRowError(
                row_number,
                'The existing record this row was matched against no longer matches this '
                'RSBSA number — re-run the preview and try again.',
            )

        field_specs = self.FIELD_SPECS[create_domain]
        record, shell = self._create_record(create_domain, rsbsa_number, incoming_values, row_number, batch_id, user, log_entries)

        note = (
            f'Record created, no new login — citizen already has access via their existing '
            f'{other_type.title()} account (#{other_id}).' if shell is None
            else 'New citizen shell created.'
        )
        return {
            'row_number': row_number, 'action': 'CREATE_DUAL_REGISTRATION', 'record_type': create_domain,
            'record_id': record.pk, 'record_name': record.full_name,
            'fields_changed': [f for f, _ in field_specs if f in incoming_values],
            'citizen_shell_created': shell is not None,
            'note': note,
        }
