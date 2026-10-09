"""Duplicate detection for a farmer's crop records.

A new or edited record is a duplicate of another when it is the same farmer, the same crop type and the same
variety (compared with production.naming.normalize_name), the other record is still active (Planted or Near
Harvest), and it is in the same place: the same parcel when the record has one, otherwise the same barangay.
The serializer, the bulk add view and the add-form warning all use this one rule, so they never disagree.
"""
from .models import CropMonitoringRecord
from .naming import normalize_name

ACTIVE_STATUSES = (CropMonitoringRecord.Status.PLANTED, CropMonitoringRecord.Status.NEAR_HARVEST)


def _barangay_key(value):
    return (value or '').strip().lower()


def same_place(parcel_id, barangay, other_parcel_id, other_barangay):
    """The same place for the duplicate rule: the same parcel when this record has one, otherwise the same
    barangay (two records with no barangay at all count as the same place).

    Known edge, left on purpose: a record WITH a parcel and one WITHOUT a parcel in the same barangay are treated as
    different places, so that pair is not flagged. On the data checked on 2026-10-09 (109 active records, none with
    a parcel) it cannot occur; make the rule symmetric (and warn instead of refusing) if parcels start being used."""
    if parcel_id:
        return other_parcel_id == parcel_id
    return _barangay_key(barangay) == _barangay_key(other_barangay)


def find_active_duplicates(*, farmer_id, crop_type_id, variety, farm_parcel_id=None, barangay='', exclude_id=None):
    """Active records that the described record would duplicate, newest first."""
    if not farmer_id or not crop_type_id:
        return []
    candidates = CropMonitoringRecord.objects.filter(
        farmer_id=farmer_id, crop_type_id=crop_type_id, status__in=ACTIVE_STATUSES,
    ).order_by('-date_planted', '-id')
    if exclude_id:
        candidates = candidates.exclude(pk=exclude_id)
    wanted = normalize_name(variety)
    return [
        record for record in candidates
        if normalize_name(record.variety_used) == wanted
        and same_place(farm_parcel_id, barangay, record.farm_parcel_id, record.farm_location_barangay)
    ]


def duplicate_message(existing, crop_type, barangay, has_parcel):
    variety = f' ({existing.variety_used.strip()})' if (existing.variety_used or '').strip() else ''
    if has_parcel:
        where = 'on this parcel'
    elif _barangay_key(barangay):
        where = f'in {barangay.strip()}'
    else:
        where = 'with no parcel or barangay set'
    return (
        f'This farmer already has an active {crop_type.name}{variety} record {where} '
        f'(record #{existing.id}, planted {existing.date_planted}). '
        f'Harvest or close it first, or choose a different parcel.'
    )
