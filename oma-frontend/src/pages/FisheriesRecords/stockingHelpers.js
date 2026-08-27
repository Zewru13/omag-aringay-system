// Small pure helpers shared between FisheriesRecordsPage.jsx (the list view
// and EditStockingModal) and AddStockingPage.jsx (the full-screen bulk-entry
// page) — split out so the bulk-entry page didn't need to reach back into
// the list-page file for four unrelated-looking functions.

export function fmtShort(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

export function fmtLong(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

export function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  const month = new Date(dateStr).getMonth() + 1
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
