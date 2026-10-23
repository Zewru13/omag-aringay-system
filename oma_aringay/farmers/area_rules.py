"""
How much land a parcel's crops may use.

A crop cannot use more land than its parcel has. Two rules, applied everywhere crops are put on a parcel (the Add Farm Parcels page,
adding a crop to a parcel, the parcels file import) and, for plantings, in Crop Monitoring:

1. One crop's area can never be more than the parcel's area.
2. All the crops declared on a parcel together can not come to more than the parcel's area, except that a parcel marked Double
   Cropping or Triple Cropping may declare up to 2 or 3 times its area (several plantings a year on the same land).

Crop Monitoring (a planting on a parcel) has its own rule: the plantings that are growing now (Planted, Near Harvest) on one parcel
together cannot be more than the parcel's area; harvested and total-loss plantings no longer count. See growing_area_problem().
"""
from decimal import Decimal

SCHEDULE_TIMES = {'Double Cropping': 2, 'Triple Cropping': 3}
GROWING_STATUSES = ('Planted', 'Near Harvest')


def _ha(value):
    return Decimal(str(value))


def times_allowed(cropping_schedule):
    return SCHEDULE_TIMES.get(cropping_schedule or '', 1)


def capacity(parcel_area, cropping_schedule):
    """The most the declared crops of a parcel may add up to."""
    return _ha(parcel_area) * times_allowed(cropping_schedule)


def fmt(value):
    """12.5 / 5 / 0.25 - no trailing zeros."""
    text = f'{_ha(value):f}'
    return text.rstrip('0').rstrip('.') if '.' in text else text


def crop_area_problems(parcel_area, cropping_schedule, crop_areas, already_declared=0):
    """One message or None per crop in `crop_areas`, for crops being added to a parcel of `parcel_area` ha that already has
    `already_declared` ha of declared crops. The first crop that pushes the total over the limit carries the total message."""
    area = _ha(parcel_area)
    limit = capacity(area, cropping_schedule)
    running = _ha(already_declared)
    problems = []
    for crop_area in crop_areas:
        crop_area = _ha(crop_area)
        running += crop_area
        if crop_area > area:
            problems.append(f'A crop cannot be bigger than its parcel: this crop is {fmt(crop_area)} ha and the parcel is {fmt(area)} ha.')
        elif running > limit:
            allowed = (
                f'{fmt(limit)} ha ({times_allowed(cropping_schedule)} times the parcel, because it is {cropping_schedule})'
                if times_allowed(cropping_schedule) > 1 else f'{fmt(limit)} ha, the parcel\'s area'
            )
            problems.append(f'The crops on this parcel would come to {fmt(running)} ha, more than the {allowed}.')
        else:
            problems.append(None)
    return problems


def growing_area_problem(parcel_area, other_growing_area, new_area):
    """A message when a planting of `new_area` ha on a parcel of `parcel_area` ha does not fit next to the `other_growing_area`
    ha already growing on it; None when it fits."""
    area, other, new = _ha(parcel_area), _ha(other_growing_area), _ha(new_area)
    if new > area:
        return f'This planting ({fmt(new)} ha) is bigger than its parcel ({fmt(area)} ha).'
    if other + new > area:
        free = max(area - other, Decimal(0))
        return (f'Only {fmt(free)} ha of this {fmt(area)} ha parcel is free: {fmt(other)} ha is already growing other crops. '
                f'Harvest or close those records first, or plant a smaller area.')
    return None


def parcel_change_problem(parcel_area, cropping_schedule, crop_areas, growing_area):
    """A message when a parcel of `parcel_area` ha and `cropping_schedule` cannot hold what is already on it: the crops declared on
    it (`crop_areas`) or the plantings growing on it now (`growing_area` ha). None when it can. Used when a parcel is edited."""
    area = _ha(parcel_area)
    limit = capacity(area, cropping_schedule)
    crops = [_ha(a) for a in crop_areas]
    biggest = max(crops, default=Decimal(0))
    if biggest > area:
        return f'The parcel cannot be smaller than its biggest crop ({fmt(biggest)} ha). Shrink or remove that crop first.'
    declared = sum(crops, Decimal(0))
    if declared > limit:
        return (f'The crops declared on this parcel come to {fmt(declared)} ha, more than the {fmt(limit)} ha allowed. '
                f'Shrink or remove a crop first, or keep the larger area or cropping schedule.')
    if _ha(growing_area) > area:
        return (f'{fmt(growing_area)} ha is growing on this parcel now, more than {fmt(area)} ha. '
                f'Harvest or close those Crop Monitoring records first.')
    return None
