// The checks and totals of the Record Harvest form's pond/cage table (StockingMonitoringModals.jsx). Moved here unchanged so they can be tested; the backend
// checks everything again.

// The message for one pond's/cage's Actual Harvest (kg), or '' when it is a valid amount.
export function validateUnitKg(val) {
  const s = String(val ?? '').trim()
  if (!s) return 'Required.'
  if (!/^\d*\.?\d+$/.test(s) || isNaN(Number(s))) return 'Enter a valid number.'
  if (Number(s) <= 0) return 'Must be greater than 0.'
  if (!/^\d*(\.\d{1,2})?$/.test(s)) return 'At most 2 decimal places.'
  return ''
}

// Sum of the valid per-unit values only (an empty/invalid row adds nothing).
export const unitKgTotal = (units, values) => units.reduce((sum, u) => (validateUnitKg(values[u.id]) ? sum : sum + Number(values[u.id])), 0)

export const fmtKg = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Which ponds/cages the form harvests. Normal harvest: the ticked ones. Health-related forced harvest: every affected one (the workflow
// harvests all of them and nothing else, so there is nothing to choose).
export const pickedUnits = (units, selectedIds, forced) => (forced ? units : units.filter((u) => selectedIds.includes(u.id)))

// A row's tick box: a forced row is always ticked and cannot be changed.
export const harvestRowState = ({ forced, ticked }) => (forced ? { checked: true, locked: true } : { checked: Boolean(ticked), locked: false })
