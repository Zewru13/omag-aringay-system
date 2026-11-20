"""The same person getting the same type of assistance again within 30 days (audit 2026-11-20).

Staff recording assistance are WARNED, never blocked: the repeat is saved only once they confirm it. (A different ORGANIZATION giving the
same type within 30 days is a hard block, in associations.views._run_organization_distribution, and is not part of this.) A gift the person
reported as not received, or one that was removed, does not count."""
from datetime import timedelta

from .models import DistributionStatus

RECENT_DAYS = 30


def _gap(days):
    if days == 0:
        return 'the same day'
    if days > 0:
        return f'{days} day{"s" if days != 1 else ""} earlier'
    return f'{-days} day{"s" if days != -1 else ""} later'


def recent_assistance_warning(record_model, person_field, person_id, assistance_type, date_given):
    """A sentence about the nearest earlier or later record of the same type within 30 days of `date_given`, or None."""
    window = timedelta(days=RECENT_DAYS)
    nearby = (
        record_model.objects
        .filter(**{f'{person_field}_id': person_id}, assistance_type=assistance_type, date_given__gte=date_given - window, date_given__lte=date_given + window)
        .exclude(status=DistributionStatus.NOT_RECEIVED)
    )
    nearest = min(nearby, key=lambda r: abs((date_given - r.date_given).days), default=None)
    if nearest is None:
        return None
    gap = (date_given - nearest.date_given).days
    return f'Already received {nearest.assistance_type} on {nearest.date_given:%b %d, %Y} ({_gap(gap)}), within {RECENT_DAYS} days of this date.'


def confirmed_repeat(data):
    """True when the person recording it has seen the warning and chosen to record it anyway."""
    return str(data.get('confirm_duplicate', '')).lower() in ('true', '1')
