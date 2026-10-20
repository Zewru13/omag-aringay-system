// Small pure helpers shared by FisheriesRecordsPage.jsx (the list view and EditStockingModal) and
// StartProductionCycleModal.jsx.

// Whole calendar days from YYYY-MM-DD `a` to `b` (UTC arithmetic, so no timezone/DST drift).
function daysBetween(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

export function todayLocalISO() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// Normal-harvest activation: at least 50% of (Stocking Date -> Expected Harvest Date) has elapsed.
// Same whole-day math as core.utils.harvest_gate_status on the backend, which is the real enforcement.
// No date, or a non-positive duration -> never gated (nothing to measure against).
export function harvestGateStatus(dateStocked, expectedHarvestDate, today = todayLocalISO()) {
  if (!dateStocked || !expectedHarvestDate) return { gated: false, message: null }
  const totalDays = daysBetween(dateStocked, expectedHarvestDate)
  if (totalDays <= 0) return { gated: false, message: null }
  const halfwayDays = totalDays / 2
  const elapsedDays = daysBetween(dateStocked, today)
  if (elapsedDays >= halfwayDays) return { gated: false, message: null }
  return {
    gated: true,
    message: `Harvest can only be recorded once at least half the expected culture duration has passed. Available in about ${Math.ceil(halfwayDays - elapsedDays)} more day(s).`,
  }
}

export function fmtShort(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

export function fmtLong(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

// Cumulative ACTUAL harvested kg of a stocking record's production cycle, shared by Fisheries Monitoring
// and Fisheries Forecasting so both always agree. Source: the backend's total_harvested_kg, which is
// SUM(quantity_kg) over every harvest record of the stocking record - normal and Force Harvest alike,
// each record counted once. "—" when no harvest has been recorded (harvest_count 0). Never the estimate.
export function fmtActualHarvestKg(rec) {
  if (!rec.harvest_count) return '—'
  return Number(rec.total_harvested_kg || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// Wet = Jun–Nov, Dry = Dec–May. Mirrors oma_aringay/core/seasons.py (the authoritative rule).
export function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  // Month is read from the YYYY-MM-DD string so the browser timezone can't shift boundary dates.
  const month = Number(String(dateStr).slice(5, 7))
  return month >= 6 && month <= 11 ? 'Wet' : 'Dry'
}

export function computeHarvestPreview(species, dateStocked, fingerlings, survivalRate, avgWeight) {
  if (!species || !dateStocked) return null
  const d = new Date(dateStocked + 'T00:00:00')
  d.setDate(d.getDate() + species.culture_duration_days)
  const harvestDate = d
  let estKg = null
  if (fingerlings && survivalRate && avgWeight) {
    estKg = parseFloat(fingerlings) * (parseFloat(survivalRate) / 100) * parseFloat(avgWeight)
  }
  return { harvestDate, estKg }
}
