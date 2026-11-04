"""What a production cycle's saved Feeding Logs and Health Logs say, for the Fisheries Yield Analysis.

Everything here is read from the cycle's own saved logs (monitoring.AquacultureFeedingLog / AquacultureHealthLog, by pond/cage): nothing is
invented, and the wording of the "factors" only states what was recorded - it never says an activity caused a loss. A record without a
production cycle, or a cycle without logs, simply has no activity. The records must come with the logs prefetched
(see fisheries.views._fisheries_yield_analysis_queryset), so there is no query per record."""

_EMPTY = {
    'feeding': {'count': 0, 'total_kg': 0.0, 'logs': []},
    'health': {'count': 0, 'mortality_total': 0, 'logs': []},
    'units': [],
    'factors': [],
}


def _unit_label(unit):
    return f'{unit.get_unit_type_display()} {unit.unit_number}' if unit else None


def _day(d):
    return d.isoformat() if d else None


def _where(label):
    return f' ({label})' if label else ''


def cycle_activity(rec):
    """The Feeding Log / Health Log activity of `rec`'s production cycle: the logs themselves (newest first), a summary per pond/cage,
    and the recorded facts worded as possible contributing factors."""
    cycle = rec.production_cycle
    if cycle is None:
        return {**_EMPTY, 'feeding': dict(_EMPTY['feeding'], logs=[]), 'health': dict(_EMPTY['health'], logs=[]), 'units': [], 'factors': []}

    feeding_logs = sorted(cycle.feeding_logs.all(), key=lambda l: (l.feeding_date, l.id), reverse=True)
    health_logs = sorted(cycle.health_logs.all(), key=lambda l: (l.log_date, l.id), reverse=True)
    units = list(cycle.units.all())

    feeding = []
    feed_by_unit = {}
    for log in feeding_logs:
        per_unit = sorted(log.unit_quantities.all(), key=lambda q: q.production_unit.unit_number)
        for q in per_unit:
            feed_by_unit[q.production_unit_id] = feed_by_unit.get(q.production_unit_id, 0) + float(q.quantity_kg)
        feeding.append({
            'id': log.id, 'date': _day(log.feeding_date), 'feed_type': log.feed_type, 'quantity_kg': float(log.quantity_kg), 'notes': log.notes,
            'units': [{'unit_label': _unit_label(q.production_unit), 'quantity_kg': float(q.quantity_kg)} for q in per_unit],
        })
    total_kg = round(sum(float(l.quantity_kg) for l in feeding_logs), 2)

    health = []
    for log in health_logs:
        health.append({
            'id': log.id, 'date': _day(log.log_date), 'unit_label': _unit_label(log.production_unit), 'observation': log.observation,
            'mortality_count': log.mortality_count, 'treatment_applied': log.treatment_applied, 'notes': log.notes,
            'force_harvest': log.force_harvest,
        })

    unit_rows = []
    for unit in units:
        own = [l for l in health_logs if l.production_unit_id == unit.id]
        unit_rows.append({
            'unit_label': _unit_label(unit),
            'feeding_kg': round(feed_by_unit.get(unit.id, 0.0), 2),
            'health_logs': len(own),
            'mortality': sum(l.mortality_count for l in own),
            'force_harvest': any(l.force_harvest for l in own),
        })

    factors = []
    for log in reversed(health):   # oldest first: the order things were recorded in
        if log['observation'] == 'Fish Mortality' or log['mortality_count']:
            factors.append(f"{log['observation']} recorded on {log['date']}{_where(log['unit_label'])}: {log['mortality_count']} dead")
        else:
            treatment = f" — treatment recorded: {log['treatment_applied']}" if log['treatment_applied'] else ''
            factors.append(f"{log['observation']} recorded on {log['date']}{_where(log['unit_label'])}{treatment}")
    if feeding:
        n = len(feeding)
        factors.append(f"{n} Feeding Log{'' if n == 1 else 's'} recorded ({total_kg:g} kg, {feeding[-1]['date']} to {feeding[0]['date']})")

    return {
        'feeding': {'count': len(feeding), 'total_kg': total_kg, 'logs': feeding},
        'health': {'count': len(health), 'mortality_total': sum(l['mortality_count'] for l in health), 'logs': health},
        'units': unit_rows,
        'factors': factors,
    }
