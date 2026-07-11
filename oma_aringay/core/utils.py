import datetime

from django.utils import timezone


def day_range_bounds(date_str, end_of_day=False):
    """
    Parse a 'YYYY-MM-DD' query param into a timezone-aware datetime at the
    start (or end) of that local day.

    Avoids Django's `__date` lookup, which on MySQL compiles to
    DATE(CONVERT_TZ(...)) — CONVERT_TZ silently returns NULL (excluding the
    row) unless MySQL's named-timezone tables are loaded, which they aren't
    on a stock XAMPP install. Comparing plain datetimes with __gte/__lte
    sidesteps that dependency entirely.
    """
    try:
        day = datetime.datetime.strptime(date_str, '%Y-%m-%d').date()
    except (ValueError, TypeError):
        return None
    time_part = datetime.time.max if end_of_day else datetime.time.min
    return timezone.make_aware(datetime.datetime.combine(day, time_part))
