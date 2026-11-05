// The Actual Harvest column of Crop Monitoring: what was harvested (kg) and how it compares with the estimate, like the Actual Harvest column
// of the fisheries tables. No screen and no network, so it can be tested on its own.
//
// rec: a crop monitoring record (actual_yield_kg, estimated_yield_kg, yield_variance_pct, actual_harvest_date, status).
// Returns null when nothing was harvested yet; else { kgText, label, tone, date }:
//   kgText  '4,500 kg' ('' for a total loss)        label  the variance against the estimate, '+12.5%' ('' when there is no estimate)
//   tone    'green' at or above the estimate, 'amber' up to 20% under, 'rose' further under ('' with no variance)
//   date    the actual harvest date, or ''
// The variance is the server's own figure; when it sent none it is worked out the same way, (actual - estimated) / estimated.

const present = (value) => value !== null && value !== undefined && value !== ''

export function actualHarvestFacts(rec) {
  if (!rec) return null
  if (rec.status === 'Total Loss') return { kgText: '', label: 'Total loss', tone: 'rose', date: '' }
  if (!present(rec.actual_yield_kg)) return null
  const kg = Number(rec.actual_yield_kg)
  if (!Number.isFinite(kg)) return null

  const estimated = Number(rec.estimated_yield_kg)
  let pct = present(rec.yield_variance_pct) ? Number(rec.yield_variance_pct) : (estimated > 0 ? ((kg - estimated) / estimated) * 100 : null)
  if (!Number.isFinite(pct)) pct = null

  return {
    kgText: `${kg.toLocaleString('en-US', { maximumFractionDigits: 2 })} kg`,
    label: pct === null ? '' : `${pct >= 0 ? '+' : '-'}${Math.abs(pct).toFixed(1)}%`,
    tone: pct === null ? '' : pct >= 0 ? 'green' : pct >= -20 ? 'amber' : 'rose',
    date: rec.actual_harvest_date || '',
  }
}
