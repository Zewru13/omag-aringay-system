"""
Crop-record import — the RSBSA/BFAR registry's per-commodity crop files
(corn, rice, tobacco-native, tobacco-virginia, ...) imported as
CropMonitoringRecord data.

A genuinely different data source from ForecastingImportView's Organization/
.xlsx template (confirmed structurally incompatible by investigation: no
Organization concept in this data at all — identity is an individual farmer
via rsbsa_no — and no real planting-date column, only registry timestamps),
so this is its own purpose-built path rather than a reshape of that one.

Reuses farmers.rsbsa_import's parsing/classification wholesale rather than
re-deriving it: these crop files ARE RSBSA/BFAR registry exports, byte-for-
byte the same shape already proven there (detect_header_version,
classify_row's corrupted_rsbsa/blank-flags/unmatched-barangay checks,
parse_rsbsa_csv/xlsx).

Crop-name mapping (Decision 1, fixed by design — not inferred): the file's
cropname values don't match any real CropType.name (confirmed 100% mismatch
across 5,605 real rows in the investigation this import is built from).
Corn -> Corn (Mais); Rice/Palay -> Palay (Rice); both Tobacco (native) and
Tobacco (Virginia) -> the single Tobacco CropType (there is no separate
native/Virginia CropType), with the specific variety preserved in
variety_used rather than discarded — the only place that distinction
survives once both collapse onto one crop_type FK.

Planting date (Decision 2, fixed by design): these files carry no real
planting-date column — date_created/kyc_updated/parcel_updated are registry
bookkeeping timestamps spanning years, unrelated to any single growing
season. date_created is used as the closest available approximation, and
every record this import creates is marked date_planted_is_estimated=True
(see that field's own comment on CropMonitoringRecord for what this
functionally blocks — Activity Suggestion Engine, dashboard aggregation,
Record Harvest gate).

Farmer identity: CropMonitoringRecord.farmer is a Farmer FK only — it has no
Fisherfolk equivalent (crop monitoring is a Farmer-domain concept; fisheries
has its own StockingRecord). Resolving a row's rsbsa_no reuses the exact
same bulk two-table fetch + fallback approach RsbsaUpdateImportPreviewView's
classification_mismatch handling proved (see farmers/rsbsa_import_views.py)
— not to attach a Fisherfolk record here (the model can't hold one), but so
a person who IS really registered, just under Fisherfolk, is reported as
that specific, legitimate case (`dual_citizen`) instead of the misleading
"not found at all" a Farmer-only lookup would otherwise show —
exactly the silent-mismatch failure mode already confirmed for Picar/
Villanueva/Obra, who appear in these exact crop files.
"""
from datetime import date

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
from farmers.models import Farmer
from fisheries.models import Fisherfolk
from production.models import CropType

# Decision 1 (fixed — do not infer or extend without a new explicit decision):
# source cropname -> (CropType.name, variety_used). variety_used is blank for
# Corn/Rice — the source cropname carries no distinguishing variety beyond
# what crop_type already captures. This table exists ONLY because these 4
# source values do NOT match any real CropType.name (confirmed 100%
# mismatch across 5,605 real rows — see this module's own docstring); it is
# not a general crop-name registry.
#
# Investigated 2026-09-20: a re-uploaded file with cropname changed to
# "Ginger" (a real, active CropType.name already in Crop Settings) still
# hit unmapped_cropname. Root cause was NOT a stale cache (build_crop_type_
# cache() is called fresh per request, never memoized) and NOT a case/
# whitespace mismatch (CropType.name is "Ginger", 6 bytes, plain ASCII —
# confirmed byte-for-byte identical to the file's raw value). The real
# cause: classify_crop_row() only ever consulted this fixed dict, with no
# fallback for a cropname that already IS a real CropType.name verbatim —
# so any crop outside this original 4 was rejected regardless of whether a
# matching CropType existed. Fixed below by adding a direct-match fallback
# for that specific, narrow case (raw cropname == a real CropType.name,
# case/whitespace aside) — not a guess, since it only ever fires on an
# exact, already-real match. A cropname that DOESN'T exactly match any
# CropType.name still requires a new explicit CROPNAME_MAPPING entry here,
# same as Corn/Rice/Tobacco did.
CROPNAME_MAPPING = {
    'Corn': ('Corn (Mais)', ''),
    'Rice/Palay': ('Palay (Rice)', ''),
    'Tobacco (native)': ('Tobacco', 'Native'),
    'Tobacco (Virginia)': ('Tobacco', 'Virginia'),
}


def parse_crop_record_file(upload):
    """Dispatch to the shared RSBSA/BFAR parser by extension — same file
    shape, same parsers farmers.rsbsa_import already proved against the real
    2026 files. Raises ValueError (caller turns this into a 400) on an
    unrecognized extension or an unrecognized header shape."""
    name_lower = (upload.name or '').lower()
    if name_lower.endswith('.xlsx') or name_lower.endswith('.xls'):
        return parse_rsbsa_xlsx(upload)
    if name_lower.endswith('.csv'):
        return parse_rsbsa_csv(upload)
    raise ValueError('Only .csv, .xlsx, or .xls files are supported.')


def build_crop_type_cache():
    """CropType.name (case/whitespace-normalized) -> CropType instance, for
    every CropType in the database. Covers both CROPNAME_MAPPING's fixed
    translation targets and classify_crop_row's direct-match fallback for a
    raw cropname that already IS a real CropType.name verbatim. One query,
    reused across every row in the file — built fresh per request (never
    memoized across requests), so a CropType added or renamed in Crop
    Settings is picked up on the very next import."""
    return {ct.name.strip().lower(): ct for ct in CropType.objects.all()}


def classify_crop_row(row, crop_type_cache):
    """Returns (disposition, reason_or_None, crop_type_or_None, variety_used).

    disposition is 'READY' or 'HOLD-BACK'. Reuses classify_row() for every
    check that isn't specific to crop import (corrupted_rsbsa,
    all_flags_blank, unmatched_barangay, all_flags_no) — its own
    IMPORT-FARMER/IMPORT-FISHERFOLK distinction is ignored here, since a
    row's presence in a corn/rice/tobacco file is itself the fact that
    matters for crop import, independent of which RSBSA classification flag
    the row carries. Two crop-import-specific HOLD-BACK reasons:
    'unmapped_cropname' (not in CROPNAME_MAPPING and no real CropType shares
    its exact name) and 'crop_type_not_found' (mapped name has no matching
    CropType row in this database — a real gap a fixed mapping can surface
    but can't fix by itself).
    """
    disposition, reason = classify_row(row)
    if disposition == 'HOLD-BACK':
        return 'HOLD-BACK', reason, None, None

    cropname = (row.get('cropname') or '').strip()
    mapping = CROPNAME_MAPPING.get(cropname)
    if mapping is not None:
        crop_type_name, variety_used = mapping
        crop_type = crop_type_cache.get(crop_type_name.strip().lower())
        if crop_type is None:
            return 'HOLD-BACK', 'crop_type_not_found', None, None
        return 'READY', None, crop_type, variety_used

    # Direct-match fallback (see CROPNAME_MAPPING's own comment): a raw
    # cropname that already IS a real CropType.name verbatim needs no
    # manual translation entry — this only ever fires on an exact,
    # already-real match, never a guess.
    direct_match = crop_type_cache.get(cropname.lower())
    if direct_match is not None:
        return 'READY', None, direct_match, ''

    return 'HOLD-BACK', 'unmapped_cropname', None, None


def parse_date_created(raw):
    """The registry record-creation timestamp used as date_planted's
    approximation (Decision 2) — e.g. '2024-03-25T02:50:37.000Z'. Returns a
    plain date (DateField, not DateTime). Raises ValueError on anything
    unparseable, same contract as parse_birthday."""
    v = (raw or '').strip()
    if not v:
        raise ValueError('date_created is blank.')
    try:
        return date.fromisoformat(v[:10])
    except ValueError:
        raise ValueError(f'date_created "{raw}" is not a recognized date.')


def derive_season(planted):
    """Same Wet/Dry month boundary ForecastingImportView already uses (May
    through October = Wet) — not a second, differently-drawn boundary."""
    return 'Wet' if 5 <= planted.month <= 10 else 'Dry'


def build_incoming(row, crop_type, variety_used):
    """Parse one classified row's raw strings into the typed values a
    CropMonitoringRecord needs. Raises ValueError (caller buckets the row as
    invalid) on unparseable date_created or crop_area."""
    planted = parse_date_created(row['date_created'])
    area_raw = (row.get('crop_area') or '').strip()
    try:
        area_planted_ha = float(area_raw) if area_raw and area_raw.lower() != 'null' else None
    except ValueError:
        raise ValueError(f'crop_area "{area_raw}" is not a valid number.')
    if area_planted_ha is None:
        raise ValueError('crop_area is blank.')

    return {
        'crop_type': crop_type,
        'variety_used': variety_used,
        'date_planted': planted,
        'date_planted_is_estimated': True,
        'area_planted_ha': area_planted_ha,
        'season': derive_season(planted),
        'year': planted.year,
        'farm_location_barangay': normalize_barangay(row['farmer_address_bgy']) or '',
    }


def resolve_farmer(rsbsa, farmers_by_rsbsa, fisherfolk_by_rsbsa):
    """Farmer-only resolution with a Fisherfolk fallback used purely to tell
    "not registered at all" apart from "registered, but as Fisherfolk — this
    import can't attach a crop record to that". Returns (farmer_or_None,
    is_dual_citizen: bool, fisherfolk_or_None).
    CropMonitoringRecord.farmer has no Fisherfolk equivalent, so the second
    case is never committable — it's reported, not silently resolved."""
    farmer = farmers_by_rsbsa.get(rsbsa)
    if farmer is not None:
        return farmer, False, None
    fisherfolk = fisherfolk_by_rsbsa.get(rsbsa)
    if fisherfolk is not None:
        return None, True, fisherfolk
    return None, False, None
