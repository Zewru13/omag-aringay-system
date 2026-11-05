// The small rules behind the stock / pond-cage loss entries of the Fisheries Log Disaster forms (the single form, FisherfolkStockDisasterModal.jsx,
// and the multi form, MultiFisherfolkDisasterModal.jsx). No screen, no network.

export const todayLocal = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export const stockOptionLabel = (s) => [
  s.species_name || 'Stock',
  s.production_cycle_name,
  s.production_cycle_no && `Cycle ${s.production_cycle_no}`,
].filter(Boolean).join(' · ')

export const rowKey = (stockId, unitId) => `${stockId}:${unitId ?? 'all'}`
export const HARVESTED = new Set(['harvested', 'force_harvested', 'cycle_harvested'])

// Total Loss on a row with a known stocked count: the count is that full stocked count (filled in, read-only).
export const autoFilled = (row, value) => Boolean(value?.total) && row.stocked != null

// The row's Fingerlings Lost as counted in totals and sent: the stocked count while auto-filled.
export const effectiveLost = (row, value) => (autoFilled(row, value) ? String(row.stocked) : String(value?.lost ?? '').trim())

// '' = not recorded. Otherwise a whole number of 0 or more, at most the stocked count when known.
export function rowError(row, value) {
  if (autoFilled(row, value)) return ''
  const s = String(value?.lost ?? '').trim()
  if (!s) return value?.total ? 'Enter the fingerlings lost (no stocked count is recorded for this one).' : ''
  if (!/^\d+$/.test(s)) return 'Whole number of 0 or more.'
  if (row.stocked != null && Number(s) > row.stocked) return `Cannot exceed ${row.stocked.toLocaleString()} stocked.`
  return ''
}

