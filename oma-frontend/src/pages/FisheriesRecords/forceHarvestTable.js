// The Force Harvest table: one row per force-harvested pond or cage, from the stocking record's units, its harvest records and
// the cycle's Health Log. Pure helpers (no screen, no network) for the details window and its printed report.

const fmtDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T00:00:00`)) : '')
const fmtKg = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const unique = (values) => [...new Set(values.filter(Boolean))]

// units: the force-harvested units; harvests: the record's harvests (null while loading); logs: the cycle's Health Log (null while
// loading); estimates: { unitId: kg|null } | 'error' | null. A row has the unit's own kg when the harvest recorded one per unit, or
// the harvest's combined kg for older records.
export function forceHarvestRows({ units, harvests, logs, estimates }) {
  return units.map((u) => {
    const harvest = (harvests || []).find((h) => h.is_force_harvest && ((h.production_units || []).includes(u.id)
      || (h.production_unit_details || []).some((d) => d.id === u.id)))
    const unitLogs = (logs || []).filter((l) => l.production_unit === u.id && l.force_harvest)
    const own = harvest ? (harvest.unit_harvests || []).find((r) => r.production_unit === u.id) : null
    const estimate = estimates && estimates !== 'error' ? estimates[u.id] : null
    return {
      id: u.id,
      label: u.label,
      issue: unique(unitLogs.map((l) => l.observation)).join('; ') || (u.reasons || []).join('; '),
      mortality: unitLogs.reduce((s, l) => s + (Number(l.mortality_count) || 0), 0),
      logDates: unique(unitLogs.map((l) => l.log_date)).sort(),
      harvestDate: harvest ? harvest.harvest_date : null,
      kg: own ? Number(own.quantity_kg) : null,
      combinedKg: harvest && !own ? Number(harvest.quantity_kg) : null,
      estimateKg: estimate === null || estimate === undefined ? null : Number(estimate),
      harvested: Boolean(harvest),
    }
  })
}

// The same rows as text for the screen and the printout, with a TOTAL row. A harvest recorded for several units as one combined
// quantity counts once in the total.
export function forceHarvestTable(rows) {
  const head = ['Production Unit', 'Health Issue', 'Mortality', 'Health Log Date', 'Harvest Date', 'Actual Harvest (kg)', 'Estimate (kg)']
  const body = rows.map((r) => [
    r.label,
    r.issue || '—',
    String(r.mortality),
    r.logDates.length === 0 ? '—' : (r.logDates.length === 1 ? fmtDate(r.logDates[0]) : `${fmtDate(r.logDates[0])} – ${fmtDate(r.logDates.at(-1))}`),
    r.harvested ? fmtDate(r.harvestDate) : 'Not yet harvested',
    r.kg !== null ? fmtKg(r.kg) : (r.combinedKg !== null ? `${fmtKg(r.combinedKg)} (combined)` : '—'),
    r.estimateKg !== null ? fmtKg(r.estimateKg) : '—',
  ])
  // Rows with the same harvest date and combined quantity belong to one harvest.
  const combined = new Map()
  rows.forEach((r) => { if (r.combinedKg !== null) combined.set(`${r.harvestDate}|${r.combinedKg}`, r.combinedKg) })
  const kgTotal = rows.reduce((s, r) => s + (r.kg || 0), 0) + [...combined.values()].reduce((s, v) => s + v, 0)
  const estimateTotal = rows.reduce((s, r) => s + (r.estimateKg || 0), 0)
  const anyKg = rows.some((r) => r.kg !== null || r.combinedKg !== null)
  const anyEstimate = rows.some((r) => r.estimateKg !== null)
  body.push(['TOTAL', '', String(rows.reduce((s, r) => s + r.mortality, 0)), '', '', anyKg ? fmtKg(kgTotal) : '—', anyEstimate ? fmtKg(estimateTotal) : '—'])
  return { head, rows: body, boldRows: new Set([body.length - 1]) }
}

export function buildForceHarvestSpec({ record, rows }) {
  const reference = `FH-${String(record.id).padStart(6, '0')}`
  return {
    title: 'FORCE HARVEST REPORT',
    reference,
    header: [['Reference No.', reference], ['Species', record.species_name || '—'], ['Fisherfolk', record.fisherfolk_name || '—']],
    sections: [{ title: 'Force Harvested Production Units', table: forceHarvestTable(rows) }],
    photos: [],
    footerLabel: 'stocking record',
    signatures: ['Prepared by', 'Noted by'],
  }
}
