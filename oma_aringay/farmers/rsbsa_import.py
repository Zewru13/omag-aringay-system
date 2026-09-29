"""
Shared RSBSA/BFAR registry-file parsing and classification logic.

Originally written inline inside management/commands/import_rsbsa_bfar_data.py
(Batch 8's one-time CSV import of 4,618 rows into Farmer/Fisherfolk). Moved
here, unchanged in behavior, so the update-import feature (farmers/
rsbsa_import_views.py) can reuse the exact same header spec, corruption
check, barangay normalization, and farmer/farmworker/fisherfolk
classification rules rather than re-deriving them — the one-time command now
imports from here instead of defining them itself.

Two known export shapes, both real:
  EXPECTED_HEADERS_V1 — the original 21-column shape Batch 8 was built
    against (an .xlsx, `date_updated` as one column).
  EXPECTED_HEADERS_V2 — the real 2026 RSBSA refresh's 23-column .csv shape:
    adds `verified_area(for_testing)` after `crop_area`, and splits the old
    `date_updated` into `kyc_updated`/`parcel_updated`. Confirmed against
    all 6 real 2026 export files (Aringay-{HVC,corn,fisherfolk,rice,
    tobacco-natice,tobacco-virginia}.csv) — identical header row, byte for
    byte, across every one of them.
  EXPECTED_HEADERS still exists as the "current default" alias (V2 — that's
  the shape a fresh export actually arrives in now), kept for any code that
  imports that exact name; detect_header_version() is what actually decides
  whether a given header row is acceptable, checking both shapes.

  `verified_area(for_testing)`, like `cropname`/`crop_area` before it, is
  read into every row dict (so callers CAN see it) but deliberately never
  parsed into a typed value or written anywhere — this pipeline creates
  Farmer/Fisherfolk registry rows only (see import_rsbsa_bfar_data.py's own
  docstring: "does NOT create any CropMonitoringRecord, FarmParcel, or
  StockingRecord from cropname/crop_area"), and neither Farmer nor
  Fisherfolk has anywhere to put a per-crop area figure — that's
  CropMonitoringRecord/FarmParcel territory, out of scope for this import by
  the same standing decision that already excludes crop_area. It is real
  data (a re-verified area measurement, present on 60-70% of crop rows in
  most of the 2026 files, 'null' otherwise) — not garbage — but there is
  nowhere on the target models to record it, so it stays unread past this
  module exactly like crop_area does.
"""
import re
from datetime import date, datetime

from core.constants import BARANGAY_CHOICES
from core.validators import RSBSA_RE_E

IMPORT_SYSTEM_USER_EMAIL = 'rsbsa-bfar-import@system.local'

EXPECTED_HEADERS_V1 = [
    'rsbsa_no', 'control_no', 'first_name', 'middle_name', 'last_name', 'ext_name',
    'farmer_address_bgy', 'farmer_address_mun', 'farmer_address_prv', 'birthday',
    'gender', 'contact_num', 'cropname', 'crop_area', 'farmer', 'farmworker',
    'fisherfolk', 'agency', 'farm_type', 'date_created', 'date_updated',
]

EXPECTED_HEADERS_V2 = [
    'rsbsa_no', 'control_no', 'first_name', 'middle_name', 'last_name', 'ext_name',
    'farmer_address_bgy', 'farmer_address_mun', 'farmer_address_prv', 'birthday',
    'gender', 'contact_num', 'cropname', 'crop_area', 'verified_area(for_testing)',
    'farmer', 'farmworker', 'fisherfolk', 'agency', 'farm_type', 'date_created',
    'kyc_updated', 'parcel_updated',
]

EXPECTED_HEADERS = EXPECTED_HEADERS_V2

KNOWN_HEADER_VERSIONS = {
    'v1': EXPECTED_HEADERS_V1,
    'v2': EXPECTED_HEADERS_V2,
}


def detect_header_version(actual_headers):
    """Returns 'v1', 'v2', or None — whichever known RSBSA/BFAR export
    header shape actual_headers matches exactly, if any."""
    actual = [str(h).strip().lower() for h in actual_headers]
    for version, expected in KNOWN_HEADER_VERSIONS.items():
        if actual == expected:
            return version
    return None

BGY_NORMALIZE = {
    'PANGAO AOAN EAST': 'Pangao-aoan East',
    'PANGAO AOAN WEST': 'Pangao-aoan West',
}
SYSTEM_BGY = {name.upper(): name for name, _ in BARANGAY_CHOICES}


def normalize_barangay(raw):
    raw = (raw or '').strip()
    if raw in BGY_NORMALIZE:
        return BGY_NORMALIZE[raw]
    return SYSTEM_BGY.get(raw.upper())


def is_corrupted_rsbsa(value):
    v = value.strip()
    if RSBSA_RE_E.match(v):
        return False
    body = v[3:] if v.startswith('BF-') else v
    return any(not seg.isdigit() for seg in body.split('-'))


def is_blank(v):
    return not v or v.strip() == '' or v.strip().lower() == 'null'


def normalize_rsbsa(raw):
    """Trim and upper-case an RSBSA number as read from a file. Every stored
    number is upper-case, so a lower-case "01-033-02-011-xiirza" (retyped by
    hand) must match — and be judged — as the same number instead of being
    held back as corrupted."""
    return (raw or '').strip().upper()


class InvalidPersonData(ValueError):
    """A row whose person fields can't safely create/update a Farmer or
    Fisherfolk (unknown gender, no name, impossible birthdate). Bucketed as
    an invalid row with this message — never guessed at."""


CONTACT_RE = re.compile(r'^09\d{9}$')


def clean_contact(raw):
    """(value, warning). A number that isn't 11 digits starting 09 (after the
    usual 10-digit -> 09 fix) is dropped with a warning rather than stored:
    the registration form refuses such a number, and importing it would also
    put a value in that the form could never re-save."""
    n = normalize_contact(raw)
    if not n:
        return '', None
    if CONTACT_RE.match(n):
        return n, None
    return '', f'Contact number "{(raw or "").strip()}" is not a valid 09XXXXXXXXX number — ignored.'


def normalize_contact(raw):
    """CSV contact_num is always 10 digits, no leading 0 (e.g. '9307572121').
    System convention is 11 digits starting with 09. Blank stays blank."""
    v = (raw or '').strip()
    if is_blank(v):
        return ''
    if len(v) == 10 and v.isdigit() and v.startswith('9'):
        return '0' + v
    return v


def parse_birthday(raw):
    """The original (V1, .xlsx-era) export wrote birthday as DD/MM/YYYY
    text. The real 2026 refresh (V2, .csv) writes it ISO (YYYY-MM-DD).
    Both are real, live formats — V1 for whatever historical files still
    carry it, V2 for every current export — so both are tried rather than
    picking one; ISO first since that's what a fresh export actually is."""
    v = raw.strip()
    try:
        return datetime.strptime(v, '%Y-%m-%d').date()
    except ValueError:
        pass
    return datetime.strptime(v, '%d/%m/%Y').date()


def normalize_name_part(raw):
    return (raw or '').strip().title()


def build_last_name(last_name, ext_name):
    last = normalize_name_part(last_name)
    ext = (ext_name or '').strip()
    if ext and ext.lower() != 'null':
        last = f'{last} {ext.title()}'
    return last


def classify_row(row):
    """Returns (disposition, reason_or_None) where disposition is one of
    'IMPORT-FARMER', 'IMPORT-FISHERFOLK', 'HOLD-BACK'."""
    rsbsa = row['rsbsa_no'].strip()
    if is_corrupted_rsbsa(rsbsa):
        return 'HOLD-BACK', 'corrupted_rsbsa'

    farmer_flag = (row['farmer'] or '').strip().upper()
    farmworker_flag = (row['farmworker'] or '').strip().upper()
    fisherfolk_flag = (row['fisherfolk'] or '').strip().upper()

    if is_blank(farmer_flag) and is_blank(farmworker_flag) and is_blank(fisherfolk_flag):
        return 'HOLD-BACK', 'all_flags_blank'

    if normalize_barangay(row['farmer_address_bgy']) is None:
        return 'HOLD-BACK', 'unmatched_barangay'

    if fisherfolk_flag == 'YES':
        return 'IMPORT-FISHERFOLK', None
    if farmer_flag == 'YES' or farmworker_flag == 'YES':
        return 'IMPORT-FARMER', None
    return 'HOLD-BACK', 'all_flags_no'


def parse_rsbsa_xlsx(fileobj, filename=None):
    """
    Read an uploaded .xlsx or legacy .xls RSBSA/BFAR export into a list of
    dict rows shaped exactly like csv.DictReader's output, so classify_row()
    and the other helpers above work unchanged against either source.
    `filename` picks .xlsx (openpyxl) vs .xls (xlrd) via
    core.utils.iter_spreadsheet_rows — defaults to the upload's own `.name`
    when not passed explicitly.

    Raises ValueError (caller turns this into a 400) if the header row
    doesn't match a known RSBSA/BFAR export shape (see
    detect_header_version), or the file has no rows at all.
    """
    from core.utils import iter_spreadsheet_rows

    filename = filename or getattr(fileobj, 'name', '') or '.xlsx'
    rows_iter = iter_spreadsheet_rows(fileobj, filename)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        raise ValueError('The file is empty.')

    actual_headers = [str(h).strip().lower() if h is not None else '' for h in header_row]
    version = detect_header_version(actual_headers)
    if version is None:
        raise ValueError(
            f'File headers do not match a known RSBSA/BFAR export format.\n'
            f'Expected (current): {EXPECTED_HEADERS_V2}\n'
            f'Expected (older): {EXPECTED_HEADERS_V1}\n'
            f'Actual: {actual_headers}'
        )
    headers = KNOWN_HEADER_VERSIONS[version]

    rows = []
    for raw_row in rows_iter:
        if raw_row is None or all(cell is None for cell in raw_row):
            continue  # skip fully blank trailing rows
        row = {}
        for i, key in enumerate(headers):
            value = raw_row[i] if i < len(raw_row) else None
            if value is None:
                row[key] = ''
            elif key == 'birthday' and isinstance(value, (datetime, date)):
                # Excel date-typed cells arrive as real date objects, not the
                # 'DD/MM/YYYY' text parse_birthday() expects — reformat back
                # to that same string shape rather than touching that shared
                # parser's contract.
                row[key] = value.strftime('%d/%m/%Y')
            elif isinstance(value, float) and value.is_integer():
                # A numeric-looking column (e.g. contact_num) that Excel
                # stored as a number, not text, would otherwise pick up a
                # spurious '.0' suffix from str() and fail the 10-digit checks
                # normalize_contact()/is_corrupted_rsbsa() do downstream.
                row[key] = str(int(value))
            else:
                row[key] = str(value).strip()
        row['rsbsa_no'] = normalize_rsbsa(row['rsbsa_no'])
        rows.append(row)

    return rows


def parse_rsbsa_csv(fileobj):
    """
    Read an uploaded RSBSA/BFAR .csv export into a list of dict rows. The
    real 2026 refresh arrives this way (not .xlsx) — see this module's
    docstring.

    Read through core.utils' shared, hardened CSV handling (size cap,
    UTF-8/UTF-16/Windows-1252 detection, comma/semicolon/tab). Header names
    are matched case- and space-insensitively and every value is trimmed, so
    a file re-saved through Excel still reads. The RSBSA number is trimmed
    and upper-cased (see normalize_rsbsa).

    Raises ValueError (caller turns this into a 400) if the header row
    doesn't match a known RSBSA/BFAR export shape, or the file has no data
    rows.
    """
    from core.utils import (
        MAX_IMPORT_ROWS, ImportFileError, check_upload_size, csv_reader_for, decode_csv_bytes,
    )

    check_upload_size(fileobj)
    try:
        fileobj.seek(0)
    except Exception:
        pass
    reader = csv_reader_for(decode_csv_bytes(fileobj.read()))
    try:
        header = next(reader)
    except StopIteration:
        raise ValueError('The file is empty.')

    actual_headers = [h.strip().lower() for h in header]
    if detect_header_version(actual_headers) is None:
        raise ValueError(
            f'File headers do not match a known RSBSA/BFAR export format.\n'
            f'Expected (current): {EXPECTED_HEADERS_V2}\n'
            f'Expected (older): {EXPECTED_HEADERS_V1}\n'
            f'Actual: {actual_headers}'
        )

    rows = []
    for raw in reader:
        if not any((v or '').strip() for v in raw):
            continue
        row = {actual_headers[i]: (raw[i].strip() if i < len(raw) else '') for i in range(len(actual_headers))}
        row['rsbsa_no'] = normalize_rsbsa(row['rsbsa_no'])
        rows.append(row)
        if len(rows) > MAX_IMPORT_ROWS:
            raise ImportFileError(
                f'The file has more than {MAX_IMPORT_ROWS:,} rows. Split it into smaller files and import them one at a time.'
            )

    if not rows:
        raise ValueError('The file has a valid header row but no data rows.')

    return rows
