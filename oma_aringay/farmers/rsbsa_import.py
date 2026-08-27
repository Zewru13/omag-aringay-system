"""
Shared RSBSA/BFAR registry-file parsing and classification logic.

Originally written inline inside management/commands/import_rsbsa_bfar_data.py
(Batch 8's one-time CSV import of 4,618 rows into Farmer/Fisherfolk). Moved
here, unchanged in behavior, so the update-import feature (farmers/
rsbsa_import_views.py) can reuse the exact same header spec, corruption
check, barangay normalization, and farmer/farmworker/fisherfolk
classification rules rather than re-deriving them — the one-time command now
imports from here instead of defining them itself.

EXPECTED_HEADERS is deliberately still the original 21-column RSBSA/BFAR
export shape — a fresh RSBSA export for the update-import feature is expected
to carry the same columns, since it's the same government data source.
"""
import re
from datetime import date, datetime

from core.constants import BARANGAY_CHOICES

IMPORT_SYSTEM_USER_EMAIL = 'rsbsa-bfar-import@system.local'

EXPECTED_HEADERS = [
    'rsbsa_no', 'control_no', 'first_name', 'middle_name', 'last_name', 'ext_name',
    'farmer_address_bgy', 'farmer_address_mun', 'farmer_address_prv', 'birthday',
    'gender', 'contact_num', 'cropname', 'crop_area', 'farmer', 'farmworker',
    'fisherfolk', 'agency', 'farm_type', 'date_created', 'date_updated',
]

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
    body = v[3:] if v.startswith('BF-') else v
    return any(not seg.isdigit() for seg in body.split('-'))


def is_blank(v):
    return not v or v.strip() == '' or v.strip().lower() == 'null'


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
    return datetime.strptime(raw.strip(), '%d/%m/%Y').date()


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


def parse_rsbsa_xlsx(fileobj):
    """
    Read an uploaded .xlsx RSBSA/BFAR export into a list of dict rows shaped
    exactly like csv.DictReader's output, so classify_row() and the other
    helpers above work unchanged against either source.

    Raises ValueError (caller turns this into a 400) if the header row
    doesn't match EXPECTED_HEADERS exactly, or the file has no rows at all.
    """
    import openpyxl

    wb = openpyxl.load_workbook(fileobj, read_only=True, data_only=True)
    ws = wb.active

    rows_iter = ws.iter_rows(values_only=True)
    try:
        header_row = next(rows_iter)
    except StopIteration:
        raise ValueError('The file is empty.')

    actual_headers = [str(h).strip() if h is not None else '' for h in header_row]
    if actual_headers != EXPECTED_HEADERS:
        raise ValueError(
            f'File headers do not match the expected RSBSA/BFAR export format.\n'
            f'Expected: {EXPECTED_HEADERS}\nActual: {actual_headers}'
        )

    rows = []
    for raw_row in rows_iter:
        if raw_row is None or all(cell is None for cell in raw_row):
            continue  # skip fully blank trailing rows
        row = {}
        for i, key in enumerate(EXPECTED_HEADERS):
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
        rows.append(row)

    return rows
