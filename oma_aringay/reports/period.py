"""The reporting-period line printed under a Reports page report's title.

It is built from the date filters actually applied to the report, never from the day it is printed:

    both dates, same year        As of October 1 to November 1, 2026
    both dates, different years  As of December 15, 2026 to January 15, 2027
    the same day twice           As of October 1, 2026
    only a start date            From October 1, 2026 onward
    only an end date             Up to November 1, 2026
    no date filter              (nothing: the report does not invent a period)
"""
from datetime import date, datetime


def parse_day(value):
    """A date from a date, a datetime or 'YYYY-MM-DD' text; None for anything blank or unreadable."""
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    text = str(value or '').strip()
    if not text:
        return None
    try:
        return datetime.strptime(text[:10], '%Y-%m-%d').date()
    except ValueError:
        return None


def _long(day):
    return f'{day.strftime("%B")} {day.day}, {day.year}'


def period_text(start=None, end=None):
    start, end = parse_day(start), parse_day(end)
    if start and end:
        if start == end:
            return f'As of {_long(start)}'
        if start.year == end.year:
            return f'As of {start.strftime("%B")} {start.day} to {_long(end)}'
        return f'As of {_long(start)} to {_long(end)}'
    if start:
        return f'From {_long(start)} onward'
    if end:
        return f'Up to {_long(end)}'
    return ''
