// The Act. Yield (kg) and Actual Harvest Date columns of Crop Forecasting. They are built the way Fisheries Forecasting builds its own
// (pages/Monitoring/FisheriesForecastingTab.jsx), so the two pages compare and classify a harvest the same way and their badges look the same.
// No screen and no network, so it can be tested on its own.
//
// Yield: ((actual - estimated) / estimated) * 100, from the crop's own estimated_yield_kg and its actual_yield_kg (the total of its harvest
// records). No harvest -> a dash and no badge; no (or a zero) estimate -> the kg only. Wording stays neutral ("above", "less").
// Timing: Early / On-Time / Late is decided by the server (fisheries.models.harvest_timing, the one rule Fisheries Forecasting uses) from the
// crop's latest harvest date and its expected harvest date; nothing is worked out again here.

export const VARIANCE_TONE_CLS = {
  green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  rose:  'text-rose-700 bg-rose-50 border-rose-200',
  slate: 'text-slate-500 bg-slate-100 border-slate-200',
}

export const TIMING_SHORT = { early: 'Early', on_time: 'On-Time', late: 'Late' }
export const TIMING_BADGE_CLS = {
  early:   'text-sky-700 bg-sky-50 border-sky-200',
  on_time: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  late:    'text-amber-700 bg-amber-50 border-amber-200',
}

const present = (value) => value !== null && value !== undefined && value !== ''
const fmtPctAbs = (pct) => String(Number(Math.abs(pct).toFixed(1)))
const onEstimate = ({ pct, diff }) => Math.abs(diff) < 0.005 || Number(pct.toFixed(1)) === 0

// { pct, diff } of a harvested crop with a usable estimate, else null.
export function rowVariance(rec) {
  if (!rec || !present(rec.actual_yield_kg) || !present(rec.estimated_yield_kg)) return null
  const est = Number(rec.estimated_yield_kg)
  if (!(est > 0)) return null
  const diff = Number(rec.actual_yield_kg || 0) - est
  return { pct: (diff / est) * 100, diff }
}

// Short badge text: "+20% above" (always with the plus sign), "30% less", "On estimate".
export function varianceShortLabel(v) {
  if (onEstimate(v)) return 'On estimate'
  return v.pct > 0 ? `+${fmtPctAbs(v.pct)}% above` : `${fmtPctAbs(v.pct)}% less`
}

export function varianceLongLabel(v) {
  if (onEstimate(v)) return 'On estimate'
  return v.pct > 0 ? `+${fmtPctAbs(v.pct)}% above estimate` : `${fmtPctAbs(v.pct)}% less than estimate`
}

export function varianceBadgeCls(v) {
  if (onEstimate(v)) return VARIANCE_TONE_CLS.slate
  return v.pct > 0 ? VARIANCE_TONE_CLS.green : VARIANCE_TONE_CLS.amber
}

const fmtKg2 = (v) => Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// The Act. Yield cell: { kgText, v, badge, cls }. '—' (and no badge) while nothing is harvested.
export function actualYieldFacts(rec) {
  if (!rec || !present(rec.actual_yield_kg) || !Number.isFinite(Number(rec.actual_yield_kg))) return { kgText: '—', v: null, badge: '', cls: '' }
  const v = rowVariance(rec)
  return { kgText: fmtKg2(rec.actual_yield_kg), v, badge: v ? varianceShortLabel(v) : '', cls: v ? varianceBadgeCls(v) : '' }
}

// The Actual Harvest Date cell: the date the server sent and the Early / On-Time / Late badge it classified. null while nothing is harvested.
export function timingFacts(rec) {
  if (!rec || !rec.latest_harvest_date) return null
  const timing = rec.actual_harvest_timing || null
  return {
    date: rec.latest_harvest_date,
    timing,
    text: timing ? TIMING_SHORT[timing] : '',
    cls: timing ? TIMING_BADGE_CLS[timing] : '',
    days: rec.actual_harvest_timing_days ?? null,
  }
}
