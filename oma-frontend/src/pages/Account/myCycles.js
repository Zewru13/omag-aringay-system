// The rules of the fisherfolk's Cycles and Forecast pages (MyCyclesPage.jsx, MyFisheriesForecastPage.jsx draw them): the sections, the
// wording of a status, the main button of a row and the order of the list. A cycle's status is read the way the office's Aquaculture
// Monitoring reads it (cycleStatusText: the date-based status, with In Progress / Forced Harvested after an emergency Force Harvest).
// No screen and no network, so the rules can be tested on their own.
import { FORCED_UNIT_STATUS, cycleStatusText } from '../FisheriesRecords/emergencyForceHarvest.js'

const ENDED = ['Harvested', FORCED_UNIT_STATUS]

// The section a cycle belongs to. Ready to harvest: near or past its harvest date, or a Health log asked for a force harvest. Every
// status has a place, so a cycle never disappears from the page.
function sectionOf(rec) {
  const status = cycleStatusText(rec)
  if (status === 'Total Loss') return 'lost'
  if (ENDED.includes(status)) return 'harvested'
  if (status === 'Near Harvest' || status === 'Late' || rec.force_harvest || rec.is_near_harvest) return 'ready'
  return 'growing'
}

export const CYCLE_SECTIONS = [
  { key: 'growing', label: 'Growing', match: (rec) => sectionOf(rec) === 'growing' },
  { key: 'ready', label: 'Ready to harvest', match: (rec) => sectionOf(rec) === 'ready' },
  { key: 'harvested', label: 'Harvested', match: (rec) => sectionOf(rec) === 'harvested' },
  { key: 'lost', label: 'Lost', match: (rec) => sectionOf(rec) === 'lost' },
]

const STATUS_LABEL = {
  Stocked: 'Growing',
  'In Progress': 'Partly harvested',
  'Near Harvest': 'Ready to harvest',
  Late: 'Late',
  Harvested: 'Harvested',
  [FORCED_UNIT_STATUS]: 'Force harvested',
  'Total Loss': 'Lost',
}

// The status in plain words; one the page does not know is shown as it is.
export const cycleStatusLabel = (rec) => STATUS_LABEL[cycleStatusText(rec)] || cycleStatusText(rec)

// The main button of a row: 'harvest' (Record harvest) for a cycle that is ready and whose harvest is allowed (`gate` is
// stockingHarvestGate's answer), none for an ended one, otherwise 'activity' (Log activity).
export function cycleMainAction(rec, gate) {
  const section = sectionOf(rec)
  if (section === 'harvested' || section === 'lost') return null
  return section === 'ready' && !gate?.gated ? 'harvest' : 'activity'
}

const byDate = (key, direction) => (a, b) => {
  if (!a[key] && !b[key]) return 0
  if (!a[key]) return 1          // no date: last
  if (!b[key]) return -1
  return direction * String(a[key]).localeCompare(String(b[key]))
}

// Cycles in the water first, the soonest harvest at the top; then the harvested ones, the newest first; then the lost ones. A new list.
export function sortCycles(rows) {
  const active = rows.filter((r) => ['growing', 'ready'].includes(sectionOf(r))).sort(byDate('expected_harvest_date', 1))
  const harvested = rows.filter((r) => sectionOf(r) === 'harvested').sort(byDate('actual_harvest_date', -1))
  const lost = rows.filter((r) => sectionOf(r) === 'lost').sort(byDate('date_stocked', -1))
  return [...active, ...harvested, ...lost]
}

// "Tilapia, Cycle #1".
export const cycleTitle = (rec) => [rec.species_name, rec.production_cycle_no ? `Cycle #${rec.production_cycle_no}` : null].filter(Boolean).join(', ') || 'Cycle'

// Everything the search box may look at.
export const cycleText = (rec) => [rec.species_name, rec.production_cycle_no, rec.culture_type, rec.pond_location_barangay].filter((v) => v != null && v !== '').join(' ')

// The date the Year filter reads.
export const cycleDate = (rec) => rec.date_stocked

// The Harvest date column: the day it was harvested once it is, the expected day until then.
export const cycleHarvestDate = (rec) => (sectionOf(rec) === 'harvested' && rec.actual_harvest_date) || rec.expected_harvest_date

// The Forecast page: cycles still in the water first (their expected harvest and estimate), then the harvested ones (the estimate
// beside what was actually harvested). A lost cycle has nothing to forecast.
export const CYCLE_FORECAST_SECTIONS = [
  { key: 'growing', label: 'Growing', match: (rec) => ['growing', 'ready'].includes(sectionOf(rec)) },
  { key: 'harvested', label: 'Harvested', match: (rec) => sectionOf(rec) === 'harvested' },
]
