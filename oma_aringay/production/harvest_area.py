"""
How much land a harvest may cover.

The area harvested cannot be more than the area the crop was planted on: for a harvest on a crop record, the record's planted area,
and all the harvests of that record together cannot cover more than it (a crop can be harvested in several passes). A harvest with no
crop record (the older Production page form) is limited to its parcel's area instead. One harvest that is harvesting a whole planting
is therefore always fine; one for more than was planted never is.
"""
from decimal import Decimal, InvalidOperation

from django.db.models import Sum


def _ha(value):
    return Decimal(str(value))


def _fmt(value):
    text = f'{_ha(value):f}'
    return text.rstrip('0').rstrip('.') if '.' in text else text


def harvest_area_problem(area, monitoring_record, parcel, exclude_id=None):
    """A message when `area` ha harvested does not fit; None when it does (or when there is nothing to compare it with).
    `exclude_id` is the harvest being edited, so it is not counted against itself."""
    if area is None or area == '':
        return None
    try:
        area = _ha(area)
    except InvalidOperation:
        return None
    if monitoring_record is not None and monitoring_record.area_planted_ha is not None:
        planted = _ha(monitoring_record.area_planted_ha)
        harvested = monitoring_record.harvest_records.exclude(pk=exclude_id) if exclude_id else monitoring_record.harvest_records.all()
        before = harvested.aggregate(total=Sum('area_harvested_hectares'))['total'] or Decimal(0)
        if area > planted:
            return f'The area harvested cannot be more than the area planted ({_fmt(planted)} ha).'
        if before + area > planted:
            left = max(planted - before, Decimal(0))
            return (f'Only {_fmt(left)} ha of the {_fmt(planted)} ha planted is left to harvest: {_fmt(before)} ha was already harvested '
                    f'from this crop.')
        return None
    if parcel is not None and parcel.area_hectares is not None and area > _ha(parcel.area_hectares):
        return f'The area harvested cannot be more than the parcel ({_fmt(parcel.area_hectares)} ha).'
    return None
