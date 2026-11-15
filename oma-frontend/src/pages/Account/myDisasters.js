// The rules of the farmer's Disasters page (MyDisastersPage.jsx draws them): the sections, the tone of a report's badge, when a
// report cannot be started, and the order of the list. No screen and no network, so they can be tested on their own.
import { formatDate } from '../../utils/dateFormat.js'
import { canRecoverDisaster } from '../Monitoring/disasterRecovery.js'

// Ongoing reports first; everything else (recovered, or a status the page does not know) stays listed under Recovered.
export const DISASTER_SECTIONS = [
  { key: 'ongoing', label: 'Ongoing', match: (row) => row.status === 'Active' },
  { key: 'recovered', label: 'Recovered', match: (row) => row.status !== 'Active' },
]

// The badge tone: a total loss is a problem, an ongoing report that can still be marked recovered waits on the farmer, one that
// cannot (its crop is already harvested) is only a record, and a recovered one is done.
export function disasterTone(row) {
  if (row.is_total_loss) return 'red'
  if (row.status !== 'Active') return 'green'
  return canRecoverDisaster(row) ? 'amber' : 'grey'
}

// Why Report a disaster cannot open: a farmer with no crop in the field has nothing to report on. `crops` is the farmer's active
// crops (null while they are still loading, when there is no reason yet).
export const reportBlock = (crops) => (crops && crops.length === 0 ? 'You can only report a disaster on a crop you have on record.' : null)

// Everything the search box may look at.
export const disasterText = (row) => [row.disaster_type_label, row.crop, row.report_number].filter(Boolean).join(' ')

// Newest first; a report with no date goes last. A new list; the one given is left as it is.
export function sortDisasters(rows) {
  return [...rows].sort((a, b) => {
    if (!a.date_of_occurrence && !b.date_of_occurrence) return 0
    if (!a.date_of_occurrence) return 1
    if (!b.date_of_occurrence) return -1
    return String(b.date_of_occurrence).localeCompare(String(a.date_of_occurrence))
  })
}

// How a crop reads in the list of crops to choose from: "Ginger · Wet 2026, planted Aug 13, 2026 · Santa Cecilia".
export function cropChoiceLabel(crop) {
  const season = crop.season ? ` · ${crop.season} ${crop.year}` : ''
  const place = crop.farm_location_barangay ? ` · ${crop.farm_location_barangay}` : ''
  return `${crop.crop_type_name || 'Crop'}${season}, planted ${formatDate(crop.date_planted)}${place}`
}
