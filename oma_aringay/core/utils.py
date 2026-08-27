import datetime
import math
from decimal import Decimal

from django.utils import timezone


def harvest_gate_status(start_date, expected_date):
    """
    Record Harvest (crop and fisheries alike) is gated until at least 50%
    of the record's expected growth/culture duration has elapsed since
    planting/stocking. Reuses the same start_date/expected_date pair that
    already drives expected_harvest_date and the Activity Suggestion
    Engine's progress display (CropType.days_to_harvest /
    SpeciesOption.culture_duration_days), rather than a second duration
    field or lookup.

    Returns (is_gated, message) — message is None when not gated. A record
    missing either date, or with a non-positive computed duration, is never
    gated (nothing to measure against).
    """
    if not start_date or not expected_date:
        return False, None
    total_days = (expected_date - start_date).days
    if total_days <= 0:
        return False, None
    halfway_days = total_days / 2
    elapsed_days = (timezone.localdate() - start_date).days
    if elapsed_days >= halfway_days:
        return False, None
    days_remaining = math.ceil(halfway_days - elapsed_days)
    return True, (
        f'Harvest can only be recorded once at least half the expected growth duration has '
        f'passed ({max(elapsed_days, 0)} of {math.ceil(halfway_days)} days so far). '
        f'Available in about {days_remaining} more day(s).'
    )


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


# ── Yield Analysis: shared "Possible Factors" wording + aggregate math ─────
#
# Used by production/views.py, fisheries/views.py, and reports/views.py so
# the on-screen Yield Analysis tabs and the PDF/Excel exports never diverge —
# this project has been bitten before by the same logic quietly drifting
# apart across multiple copies (see the fisherfolk-search bug). Frontend has
# its own mirror of the wording rules in oma-frontend/src/utils/
# yieldAnalysis.js (JS can't import Python) — keep the two in sync by rule,
# not by literal string.

_YIELD_FACTOR_HINTS = {
    'crop': 'weather, pests, and soil',
    'fisheries': 'water quality, disease, and weather',
}
_YIELD_NO_SCHEDULE_NOUN = {
    'crop': 'crop',
    'fisheries': 'species',
}


def possible_factors_text(variance_pct, missed_high_priority, activities_completed_count,
                           activities_total_count, domain='crop'):
    """
    "Possible Factors" text for one Yield Analysis record. Causal-adjacent
    "Missed: ..." wording is reserved for the one case it's actually
    informative for — a real shortfall (variance_pct < 0) alongside logged
    activity gaps. Showing that same wording next to a positive or unknown
    variance would imply the gaps caused a problem that didn't happen (or
    can't even be measured), so those cases get neutral, non-causal text
    instead.
    """
    if activities_total_count == 0:
        noun = _YIELD_NO_SCHEDULE_NOUN.get(domain, 'record')
        return f'No activity schedule defined for this {noun}.'

    has_gaps = bool(missed_high_priority)

    if variance_pct is None:
        if not has_gaps:
            return 'All key activities completed'
        return (
            f'Recommended activities logged: {activities_completed_count}/{activities_total_count} '
            '— no yield estimate available for comparison.'
        )

    if variance_pct >= 0:
        if not has_gaps:
            return 'All key activities completed'
        return (
            f'Recommended activities logged: {activities_completed_count}/{activities_total_count} '
            '— yield met or exceeded the estimate despite limited logged activity.'
        )

    # variance_pct < 0
    if not has_gaps:
        hint = _YIELD_FACTOR_HINTS.get(domain, 'external, unlogged conditions')
        return (
            'Most recommended activities were completed; the shortfall may reflect '
            f"factors outside this system's scope ({hint})."
        )
    parts = [f"{m['activity']} (Day {m['scheduled_day']})" for m in missed_high_priority]
    return 'Missed: ' + ', '.join(parts)


def new_yield_group():
    """A fresh accumulator for one Yield Analysis aggregate group (barangay/
    crop type/species). Pair with accumulate_yield_group()."""
    return {
        'count': 0,
        'total_loss_count': 0,
        'estimated_sum': Decimal('0'), 'estimated_n': 0,
        'actual_sum': Decimal('0'),
        'variance_pct_sum': 0.0, 'variance_pct_n': 0,
        'completion_pct_sum': 0.0, 'completion_pct_n': 0,
    }


def accumulate_yield_group(g, a):
    """
    Fold one analyzed Yield Analysis record (the dict returned by
    _analyze_crop/_analyze_stocking) into a group accumulator from
    new_yield_group().

    Total Loss records are counted (g['count'], g['total_loss_count']) and
    included in avg_actual_kg (their actual output really is 0, which is
    real information), but excluded from avg_variance_pct — a -100% Total
    Loss variance blended unweighted into a barangay average silently
    dominates it and gives a misleading read on how the "normal" harvests in
    that group performed. total_loss_count on the result makes the
    exclusion visible instead of silent.
    """
    g['count'] += 1
    if a['is_total_loss']:
        g['total_loss_count'] += 1
    if a['estimated_kg'] is not None:
        g['estimated_sum'] += Decimal(str(a['estimated_kg']))
        g['estimated_n'] += 1
    g['actual_sum'] += Decimal(str(a['actual_total_kg']))
    if a['variance_pct'] is not None and not a['is_total_loss']:
        g['variance_pct_sum'] += a['variance_pct']
        g['variance_pct_n'] += 1
    if a['activities_total_count'] > 0:
        g['completion_pct_sum'] += (a['activities_completed_count'] / a['activities_total_count']) * 100
        g['completion_pct_n'] += 1
