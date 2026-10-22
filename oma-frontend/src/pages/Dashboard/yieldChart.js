// Season Snapshot on the staff dashboard: estimated vs actual yield per crop (metric tons per hectare) and per fisheries
// species (totals in kg). Pure helpers for the chart, no screen and no network, so they can be tested on their own.

// The server's rows -> one row per crop or species: { name, target, actual, variancePct, unit, season }.
export function chartRows(domain, rows) {
  if (!Array.isArray(rows)) return []
  const season = (r) => (r.season && r.year ? `${r.season} ${r.year}` : (r.season || (r.year ? String(r.year) : '')))
  if (domain === 'fisheries') {
    return rows.map((r) => ({ name: r.species, target: r.target_kg, actual: r.actual_kg, variancePct: r.variance_pct, unit: 'kg', season: season(r) }))
  }
  return rows.map((r) => ({ name: r.crop, target: r.target_mt_ha, actual: r.actual_mt_ha, variancePct: r.variance_pct, unit: 'mt/ha', season: season(r) }))
}

// The small chip under each pair of columns: above target is good news, below is not.
export function varianceChip(pct) {
  if (pct === null || pct === undefined || Number.isNaN(Number(pct))) return { text: '—', tone: 'neutral' }
  const value = Number(pct)
  if (value === 0) return { text: '0%', tone: 'neutral' }
  return value > 0 ? { text: `▲ ${value}%`, tone: 'safe' } : { text: `▼ ${Math.abs(value)}%`, tone: 'critical' }
}

export const formatValue = (value, unit) => `${Number(value).toLocaleString('en-US', { maximumFractionDigits: 2 })} ${unit}`

// What a screen reader reads for a pair of columns (the chart itself is a picture).
export function rowDescription(row) {
  const base = `${row.name}: target ${formatValue(row.target, row.unit)}, actual ${formatValue(row.actual, row.unit)}`
  const pct = row.variancePct
  if (pct === null || pct === undefined) return base
  if (Number(pct) === 0) return `${base}, on target`
  return `${base}, ${Math.abs(pct)}% ${pct > 0 ? 'above' : 'below'} target`
}

// The top of the value axis: a little above the tallest column, on a round step.
export function axisMax(rows) {
  const tallest = Math.max(0, ...rows.flatMap((r) => [Number(r.target) || 0, Number(r.actual) || 0]))
  if (tallest <= 0) return 1
  const step = 10 ** Math.floor(Math.log10(tallest)) / 5
  return Math.round(Math.ceil((tallest * 1.1) / step) * step * 100) / 100
}
