// Log Disaster of Fisheries Disaster (Admin): ONE disaster event over the ponds and cages of SEVERAL fisherfolk, saved as one log per fisherfolk
// (POST /fisheries/disaster-reports/event/). Pure functions, no screen and no network, so the rules can be tested on their own. The server checks
// every stock and pond against its fisherfolk again.
//
// `picked` is the screen's state: { [stockId]: { stock, info: { state: 'loading' | 'ok' | 'error', units }, values: { [rowKey]: { lost, total } } } }.

const HARVESTED = new Set(['harvested', 'force_harvested', 'cycle_harvested'])

export const rowKey = (stockId, unitId) => `${stockId}:${unitId ?? 'all'}`

// The rows of one picked stock: its open ponds / cages (a harvested one cannot lose fingerlings), or the whole stock when it has none.
// Nothing while its ponds are still loading.
export function rowsFor(stock, info) {
  if (!info || info.state === 'loading') return []
  const units = info.units || []
  if (!units.length) return [{ key: rowKey(stock.id, null), unitId: null, unitLabel: 'Whole stock', stocked: stock.number_of_fingerlings ?? null }]
  return units.filter((u) => !HARVESTED.has(u.status)).map((u) => ({ key: rowKey(stock.id, u.id), unitId: u.id, unitLabel: u.label, stocked: u.fingerling_count ?? null }))
}

// Total Loss on a row with a known stocked count: that full count (filled in, read-only).
const autoFilled = (row, value) => Boolean(value?.total) && row.stocked != null

// The fingerlings lost of a row as counted and sent ('' = not recorded).
export const effectiveLost = (row, value) => (autoFilled(row, value) ? String(row.stocked) : String(value?.lost ?? '').trim())

// What is wrong with one row ('' when nothing): a whole number of 0 or more, at most the stocked count when known.
export function rowProblem(row, value) {
  if (autoFilled(row, value)) return ''
  const s = String(value?.lost ?? '').trim()
  if (!s) return value?.total ? 'Enter the fingerlings lost (no stocked count is recorded for this one).' : ''
  if (!/^\d+$/.test(s)) return 'Whole number of 0 or more.'
  if (row.stocked != null && Number(s) > row.stocked) return `Cannot exceed ${row.stocked.toLocaleString()} stocked.`
  return ''
}

// The request's groups: one per fisherfolk (in the order they were first picked), each with its own stocks' rows.
export function buildGroups(picked) {
  const groups = new Map()
  Object.values(picked).forEach(({ stock, info, values }) => {
    if (!groups.has(stock.fisherfolk)) groups.set(stock.fisherfolk, { fisherfolk: stock.fisherfolk, stock_losses: [] })
    rowsFor(stock, info).forEach((row) => {
      const value = values?.[row.key] || {}
      const lost = effectiveLost(row, value)
      groups.get(stock.fisherfolk).stock_losses.push({
        stocking_record: stock.id, production_unit: row.unitId, fingerlings_lost: lost === '' ? null : Number(lost), is_total_loss: Boolean(value.total),
      })
    })
  })
  return [...groups.values()]
}

export function pickedSummary(picked) {
  const entries = Object.values(picked)
  return {
    fisherfolk: new Set(entries.map((e) => e.stock.fisherfolk)).size,
    stocks: entries.length,
    rows: entries.reduce((sum, e) => sum + rowsFor(e.stock, e.info).length, 0),
  }
}

// What is wrong with the event before it is sent ('' when nothing). `today` is YYYY-MM-DD.
export function eventProblem(form, picked, today) {
  const entries = Object.values(picked)
  if (!entries.length) return 'Choose at least one pond or cage.'
  if (!form.date_of_occurrence) return 'Enter the date of occurrence.'
  if (form.date_of_occurrence > today) return 'The date of occurrence cannot be in the future.'
  if (form.disaster_type === 'Other' && !String(form.disaster_type_other_specify || '').trim()) return 'Specify the disaster type.'
  if (entries.some((e) => e.info?.state === 'loading')) return 'The ponds and cages are still loading. Please wait a moment.'
  if (entries.some((e) => e.info?.state === 'error')) return 'The ponds and cages of a chosen stock could not be loaded. Remove it and choose it again.'
  for (const { stock, info, values } of entries) {
    for (const row of rowsFor(stock, info)) {
      const problem = rowProblem(row, values?.[row.key])
      if (problem) return `${stock.fisherfolk_name || 'Fisherfolk'} · ${stock.species_name || 'Stock'} · ${row.unitLabel}: ${problem}`
    }
  }
  return ''
}
