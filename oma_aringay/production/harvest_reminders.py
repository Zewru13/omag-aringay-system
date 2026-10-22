"""Crop records that may need a harvest reminder (see core.harvest_reminders for the rules)."""
from datetime import timedelta

from core.harvest_reminders import EARLIEST_DAYS_LEFT, LATEST_DAYS_LEFT, Candidate

from .models import CropMonitoringRecord

TYPE_PREFIX = 'crop_harvest_reminder'


def harvest_reminder_candidates(today):
    """Every crop record still growing whose expected harvest date is close enough for a reminder. Left out: a record owned
    only by an organization (no farmer; the reminders are for the farmer's own account) and one whose planting date is only
    an estimate (its expected date is unconfirmed - the system does not treat such a record as near harvest either)."""
    records = CropMonitoringRecord.objects.filter(
        status__in=[CropMonitoringRecord.Status.PLANTED, CropMonitoringRecord.Status.NEAR_HARVEST],
        date_planted_is_estimated=False,
        expected_harvest_date__gte=today + timedelta(days=LATEST_DAYS_LEFT),
        expected_harvest_date__lte=today + timedelta(days=EARLIEST_DAYS_LEFT),
    ).select_related('crop_type', 'farm_parcel').order_by('id')
    found = []
    for record in records:
        farmer_id = record.farmer_id or (record.farm_parcel.farmer_id if record.farm_parcel_id else None)
        if not farmer_id:
            continue
        label = ' · '.join(p for p in (record.crop_type.name, f'{record.season} {record.year}') if p)
        place = record.farm_location_barangay or (record.farm_parcel.barangay if record.farm_parcel_id else '')
        found.append(Candidate(TYPE_PREFIX, record.id, 'farmer', farmer_id, record.expected_harvest_date, label, place))
    return found
