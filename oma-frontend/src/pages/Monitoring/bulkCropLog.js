// One activity logged on many crops at once (the farmer's My Crops page: "Log activity on many crops"). The rules of that window, with no screen
// and no network, so they can be tested on their own: which crops it offers, the search, what is wrong with the form, what is sent and how the
// server's answer is read. The server (POST /production/monitoring/bulk-logs/) checks every crop exactly like a log made on that crop's own window.
import { matchesSearch } from '../../utils/searchMatch.js'
import { BEFORE_ADDING } from '../../utils/activityPicker.js'
import { cycleProgress, filterCycleActivities } from '../../utils/cycleActivity.js'

const GROWING = ['Planted', 'Near Harvest']
export const MAX_CROPS = 100   // the most the server takes in one request
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

// Only a crop that is still growing takes a log (a harvested crop or a total loss is read-only).
export const growingCrops = (records) => (Array.isArray(records) ? records.filter((r) => GROWING.includes(r.status)) : [])

// A cooperative's list holds several members' crops, so each one also says whose it is.
export const cropLabel = (r) => `${r.member_name ? `${r.member_name} · ` : ''}${r.crop_type_name || 'Crop'}${r.variety_used ? ` (${r.variety_used})` : ''}`

// The search box: every word typed has to be found in the crop, its variety, its place or its planting date, in any order.
export const filterCrops = (records, query) => records.filter((r) => matchesSearch(
  [r.member_name, r.crop_type_name, r.variety_used, r.farm_location_barangay, r.farm_parcel_number, r.date_planted].filter(Boolean).join(' '), query,
))

export const showsFertilizer = (activity) => activity === 'Fertilizer Application'
export const showsPest = (activity) => activity === 'Pest Control' || activity === 'Disease Control'

// The activities a farmer can log on many crops: not the work done before a crop is added, and not Disaster Remedy (it belongs to the
// disaster report of one crop) or the bare "Other" entry (the form has its own Other box).
// Pre-Harvest Inspection and Harvesting are offered only when every ticked crop is past half way through its season (`halfway`), as on a crop's own window.
export const offeredActivities = (names, halfway = true) => filterCycleActivities(
  (names || []).filter((name) => !BEFORE_ADDING.includes(name) && name !== 'Disaster Remedy' && name !== 'Other'),
  { hasDisaster: false, halfway },
)

// True when every one of these crops is past half way through its season on `today` (nothing ticked holds nothing back).
export const allHalfway = (records, today) => records.every((r) => {
  const progress = cycleProgress(r.date_planted, r.expected_harvest_date, today)
  return progress ? progress.halfway : true
})

// What is wrong with the form ('' when nothing). `crops` are the ticked ids, `today` is YYYY-MM-DD.
export function formProblem(form, crops, today, halfway = true) {
  if (!form.activity) return 'Choose the activity.'
  if (form.activity === 'Other' && !form.activityOther.trim()) return 'Describe the activity.'
  if (!halfway && ['Pre-Harvest Inspection', 'Harvesting'].includes(form.activity)) return `${form.activity} can be logged only on crops that are past half of their growing season. Untick the younger crops.`
  if (!form.date) return 'Enter the date of the activity.'
  if (form.date > today) return 'The date of the activity cannot be in the future.'
  if (!crops.length) return 'Tick at least one crop.'
  if (crops.length > MAX_CROPS) return `Tick at most ${MAX_CROPS} crops at a time.`
  if (showsFertilizer(form.activity) && form.fertilizer === 'Other' && !form.fertilizerOther.trim()) return 'Type the fertilizer.'
  // Each crop has its own area, so a pest or disease is described by how severe it is, the same for every crop.
  if (showsPest(form.activity) && !form.severity) return 'Choose the severity of the pest or disease.'
  return ''
}

// The request: only the boxes the chosen activity uses are sent, even if others were filled in before the activity changed.
export function buildPayload(form, crops) {
  const payload = { record_ids: crops, activity_type: form.activity, date_of_activity: form.date, notes: form.notes }
  if (form.activity === 'Other') payload.activity_type_other_specify = form.activityOther.trim()
  if (form.plantCondition) payload.plant_condition = form.plantCondition
  if (showsFertilizer(form.activity)) {
    payload.fertilizer_type = form.fertilizer === 'Other' ? form.fertilizerOther.trim() : form.fertilizer
    if (form.quantity !== '' && form.quantity != null) { payload.quantity_applied = form.quantity; payload.quantity_unit = form.unit }
    if (!payload.fertilizer_type) delete payload.fertilizer_type
  }
  if (showsPest(form.activity)) {
    if (form.pestName.trim()) payload.pest_disease_name = form.pestName.trim()
    payload.severity = form.severity
  }
  return payload
}

export const logButtonLabel = (count) => (count === 0 ? 'Log Activity' : `Log on ${plural(count, 'Crop')}`)
export const doneMessage = (count) => `Activity logged on ${plural(count, 'crop')}.`

// The server's refusal: the sentence to show and the crops it named (so they can be marked on the list).
export function serverProblem(data) {
  if (!data || typeof data !== 'object') return { message: 'The activity could not be saved. Please try again.', ids: [] }
  const ids = Array.isArray(data.errors) ? data.errors.map((e) => e.monitoring_record).filter((id) => id != null) : []
  if (data.detail) return { message: String(data.detail), ids }
  const first = Object.values(data).flat().find((m) => typeof m === 'string')
  return { message: first || 'The activity could not be saved. Please try again.', ids }
}
