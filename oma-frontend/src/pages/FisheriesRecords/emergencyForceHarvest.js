// Pure helpers of the emergency Force Harvest (Aquaculture Monitoring ⋮ menu > Force Harvest). Separate from the Health
// Log Force Harvest (forceHarvestTable.js and the red HP / HC badges), which these never touch. No network, no DOM.

// The six reasons, exactly as the backend (fisheries.models.EMERGENCY_FORCE_HARVEST_REASONS) defines them. The form lists the
// reasons the server sends; this is the same list for the pages that only show a saved reason. There is no "Other".
export const FORCE_REASONS = [
  { value: 'upcoming_typhoon', label: 'Upcoming Typhoon' },
  { value: 'super_typhoon', label: 'Super Typhoon' },
  { value: 'el_nino', label: 'El Niño' },
  { value: 'drought', label: 'Drought' },
  { value: 'possible_flooding', label: 'Possible Flooding' },
  { value: 'pest_or_virus', label: 'Fish Pest or Virus Spreading' },
]

export const reasonLabel = (value) => FORCE_REASONS.find((r) => r.value === value)?.label || ''

// Today's date in the application's own timezone (Asia/Manila), as YYYY-MM-DD - never the browser's or UTC's date.
export function manilaToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

export const isFutureDate = (value, today) => Boolean(value) && String(value) > String(today)

// The ⋮ menu offers Force Harvest for a record that is still in stock or ongoing and linked to a production cycle (which is
// where the ponds / cages are). Whether any pond / cage is left is decided by the server when the form opens.
export const canForceHarvest = (rec) => Boolean(rec && rec.production_cycle && !['Harvested', 'Total Loss'].includes(rec.status))

// The status a pond / cage shows once an emergency Force Harvest has harvested it (never "Stocked").
export const FORCED_UNIT_STATUS = 'Forced Harvested'

// The overall status of a production cycle in the Aquaculture Monitoring row. It stays the record's own status (Stocked / Near
// Harvest / Late from the dates, Harvested once every pond / cage is harvested), with ONE correction: while some ponds / cages of
// the cycle have been emergency force harvested and others are still growing, a plain "Stocked" would read as if nothing had
// happened, so the cycle shows "In Progress". Near Harvest and Late are kept (they say more), and a cycle with no emergency Force
// Harvest (including one with only Health Log Force Harvests and its HP / HC badges) is shown exactly as before.
export function cycleStatusText(rec) {
  const shown = rec.display_status || rec.status
  if (shown !== 'Stocked' || !(rec.forced_harvests || []).length) return shown
  const units = rec.harvest_units || []
  const partial = units.some((u) => u.harvested) && units.some((u) => !u.harvested)
  return partial ? 'In Progress' : shown
}

// Kilograms as shown in the tables: 2 decimals with thousands separators.
export const fmtKg = (value) => (value == null || value === '' || Number.isNaN(Number(value))
  ? '—'
  : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

export const NO_ESTIMATE = 'Estimate unavailable'
export const estimateText = (value) => (value == null || value === '' ? NO_ESTIMATE : fmtKg(value))

// One table row per pond / cage, each carrying its cycle's details: what the selection table shows.
export function flattenCycles(cycles) {
  return (cycles || []).flatMap((cycle) => (cycle.units || []).map((unit) => ({
    key: `${cycle.stocking_record}:${unit.id}`,
    stockingRecord: cycle.stocking_record,
    species: cycle.species || '—',
    cycleNumber: cycle.cycle_number,
    cycleName: cycle.cycle_name || '',
    cycleLabel: cycle.cycle_number ? `Cycle ${cycle.cycle_number}` : 'Cycle',
    unitId: unit.id,
    unitLabel: unit.label,
    estimate: unit.estimated_harvest_kg ?? null,
  })))
}

// The rows grouped by production cycle, in order: [{ stockingRecord, species, cycleLabel, cycleName, rows }].
export function groupByCycle(rows) {
  const groups = []
  for (const row of rows) {
    let group = groups[groups.length - 1]
    if (!group || group.stockingRecord !== row.stockingRecord) {
      group = { stockingRecord: row.stockingRecord, species: row.species, cycleLabel: row.cycleLabel, cycleName: row.cycleName, rows: [] }
      groups.push(group)
    }
    group.rows.push(row)
  }
  return groups
}

// A typed quantity: a positive number with at most 2 decimals. NaN otherwise (blank, zero, negative, text, too many decimals).
export function parseKg(text) {
  const value = String(text ?? '').trim()
  if (!/^\d+(\.\d{1,2})?$/.test(value)) return NaN
  const number = Number(value)
  return number > 0 ? number : NaN
}

export const selectedRows = (rows, selected) => rows.filter((row) => selected.has(row.key))

// The total actual harvest of the selected units (rounded to cents so 0.1 + 0.2 never shows 0.30000000000000004).
export function totalKg(rows, selected, actual) {
  const cents = selectedRows(rows, selected).reduce((sum, row) => {
    const kg = parseKg(actual[row.key])
    return Number.isNaN(kg) ? sum : sum + Math.round(kg * 100)
  }, 0)
  return cents / 100
}

// Everything that must be right before the review step: a reason, a date that is not in the future, at least one selected
// unit, and a positive quantity for every selected unit. The server checks all of it again.
export function validateForm({ reason, date, today, rows, selected, actual }) {
  const errors = { kg: {} }
  if (!reason) errors.reason = 'Select a reason for the Force Harvest.'
  if (!date) errors.date = 'Enter the harvest date.'
  else if (isFutureDate(date, today)) errors.date = 'Harvest date cannot be in the future.'
  const chosen = selectedRows(rows, selected)
  if (chosen.length === 0) errors.selection = 'Select at least one pond or cage.'
  for (const row of chosen) {
    if (Number.isNaN(parseKg(actual[row.key]))) errors.kg[row.key] = 'Enter the actual harvest (kg), more than 0.'
  }
  const ok = !errors.reason && !errors.date && !errors.selection && Object.keys(errors.kg).length === 0
  return { ok, errors }
}

// The request body: the selected units grouped by their cycle, in table order.
export function buildPayload({ reason, date, rows, selected, actual }) {
  const byCycle = new Map()
  for (const row of selectedRows(rows, selected)) {
    if (!byCycle.has(row.stockingRecord)) byCycle.set(row.stockingRecord, [])
    byCycle.get(row.stockingRecord).push({ production_unit: row.unitId, quantity_kg: String(actual[row.key]).trim() })
  }
  return {
    reason,
    harvest_date: date,
    cycles: [...byCycle.entries()].map(([stocking_record, units]) => ({ stocking_record, units })),
  }
}

// The review table: one row per selected unit with its estimate and the typed actual quantity.
export function reviewRows({ rows, selected, actual }) {
  return selectedRows(rows, selected).map((row) => ({
    key: row.key,
    species: row.species,
    cycleLabel: row.cycleLabel,
    unitLabel: row.unitLabel,
    estimate: estimateText(row.estimate),
    actual: fmtKg(parseKg(actual[row.key])),
  }))
}

// A readable message from an API error (the first message of the first field, or the detail).
export function errorMessage(error, fallback = 'The Force Harvest could not be recorded. Nothing was saved.') {
  const data = error?.response?.data
  if (!data) return fallback
  if (typeof data === 'string') return data
  if (data.detail) return String(data.detail)
  const first = Object.values(data).flat()[0]
  return typeof first === 'string' ? first : fallback
}
