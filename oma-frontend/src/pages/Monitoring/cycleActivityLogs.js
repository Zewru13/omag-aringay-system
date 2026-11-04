// The Activity Logs of a production cycle (Fisheries Monitoring row menu): its saved Feeding Logs and Health Logs as one list. The logs themselves
// come from the cycle's existing endpoints (/monitoring/aquaculture-cycles/<id>/feeding/ and /health/); this only puts them in one date order,
// one row for each pond/cage a log belongs to. Nothing is created or changed here.

export const ACTIVITY_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'feeding', label: 'Feeding Log' },
  { key: 'health', label: 'Health Log' },
]

const WHOLE_CYCLE = 'Whole cycle'
const kg = (v) => Number(v).toFixed(2)

function feedingRows(logs) {
  return logs.flatMap((log) => {
    const base = { kind: 'feeding', type: 'Feeding Log', date: log.feeding_date, notes: log.notes || '', details: [] }
    const shares = log.unit_quantities || []
    if (shares.length === 0) {
      return [{ ...base, key: `feeding-${log.id}`, unit: WHOLE_CYCLE, summary: `${log.feed_type} — ${kg(log.quantity_kg)} kg` }]
    }
    return shares.map((q) => ({ ...base, key: `feeding-${log.id}-${q.production_unit}`, unit: q.unit_label, summary: `${log.feed_type} — ${kg(q.quantity_kg)} kg` }))
  })
}

function healthRows(logs) {
  return logs.map((log) => {
    const details = []
    if (log.mortality_count > 0) details.push(['Mortality count', String(log.mortality_count)])
    if (log.treatment_applied) details.push(['Treatment', log.treatment_applied])
    if (log.force_harvest) details.push(['Force Harvest', 'Yes'])
    return {
      key: `health-${log.id}`, kind: 'health', type: 'Health Log', date: log.log_date, unit: log.unit_label || WHOLE_CYCLE,
      summary: log.observation, details, notes: log.notes || '',
    }
  })
}

// The rows of the list, newest first (on one day: feeding before health, then by pond/cage name).
export function activityLogRows({ feeding = [], health = [] }) {
  return [...feedingRows(feeding), ...healthRows(health)].sort((a, b) => (
    b.date.localeCompare(a.date) || a.kind.localeCompare(b.kind) || a.unit.localeCompare(b.unit)
  ))
}

export const filterActivityRows = (rows, kind) => (kind === 'all' ? rows : rows.filter((r) => r.kind === kind))
