"""
RSBSA Excel update-import — Step 1 (preview only; see rsbsa_import.py's
module docstring for the shared parsing/classification logic this reuses).

This view is deliberately preview-only: it parses, classifies, and matches
against existing records, but performs no database writes. A future commit
endpoint will reuse the same classify/match/diff logic with commit=True,
mirroring the dry_run pattern in associations/views.py
(_run_organization_distribution).

Conflict rule (explicit, per design discussion): neither Farmer nor
Fisherfolk carries any per-field "last modified" timestamp or change
history — the only trace of a locally-made edit is the current field value
itself (ProfileChangeRequest only covers first/middle/last name + barangay,
and only for edits that went through that specific citizen-request flow;
direct staff edits leave no record at all). So "changed locally since the
last import" cannot be detected as a true history comparison — what IS
reliably detectable, and what this view reports, is simply: does the
incoming sheet value differ from the record's CURRENT value, for any
updatable field. Every such difference is surfaced as a flagged change for
staff to decide on, never silently applied — there is no write path here at
all yet, let alone an automatic one.
"""
import openpyxl
from rest_framework.parsers import MultiPartParser
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView

from accounts.permissions import IsAdminOrEvaluator
from farmers.models import Farmer
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
        if name_lower.endswith('.xlsx'):
            parser = parse_rsbsa_xlsx
        elif name_lower.endswith('.csv'):
            parser = parse_rsbsa_csv
        else:
            return Response({'detail': 'Only .csv or .xlsx files are supported.'}, status=400)

        try:
            rows = parser(upload)
        except ValueError as exc:
            return Response({'detail': str(exc)}, status=400)
        except openpyxl.utils.exceptions.InvalidFileException:
            return Response({'detail': 'The file could not be read as an Excel workbook.'}, status=400)

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

        # ── Bulk-fetch every matchable rsbsa_number in one query per domain,
        # rather than one query per row. ──
        farmer_rsbsa = [
            p['row']['rsbsa_no'].strip() for p in parsed if p['disposition'] == 'IMPORT-FARMER'
        ]
        fisherfolk_rsbsa = [
            p['row']['rsbsa_no'].strip() for p in parsed if p['disposition'] == 'IMPORT-FISHERFOLK'
        ]
        farmers_by_rsbsa = {
            f.rsbsa_number: f for f in Farmer.objects.filter(rsbsa_number__in=farmer_rsbsa)
        }
        fisherfolk_by_rsbsa = {
            f.rsbsa_number: f for f in Fisherfolk.objects.filter(rsbsa_number__in=fisherfolk_rsbsa)
        }

        result_rows = []
        summary = {'matched_with_changes': 0, 'matched_no_changes': 0, 'unmatched': 0, 'invalid': 0}

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
                    'changes': [],
                })
                continue

            is_farmer = disposition == 'IMPORT-FARMER'
            record = (farmers_by_rsbsa if is_farmer else fisherfolk_by_rsbsa).get(rsbsa)
            field_specs = FARMER_FIELDS if is_farmer else FISHERFOLK_FIELDS

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
                    'changes': [],
                })
                continue

            changes = _diff_fields(record, p['incoming'], field_specs)
            status_key = 'matched_with_changes' if changes else 'matched_no_changes'
            summary[status_key] += 1
            result_rows.append({
                'row_number': row_number,
                'rsbsa_number': rsbsa,
                'classification': disposition,
                'status': status_key,
                'hold_back_reason': None,
                'matched_record_id': record.id,
                'matched_record_type': 'FARMER' if is_farmer else 'FISHERFOLK',
                'matched_record_name': record.full_name,
                # The one real "has this been touched locally" signal staff
                # have to weigh a flagged change against — see updated_at's
                # own model-field comment for why it's not a full history.
                'matched_record_updated_at': record.updated_at,
                'changes': changes,
            })

        return Response({
            'total_rows': len(rows),
            'summary': summary,
            'rows': result_rows,
        }, status=200)
