// What the crop Log Activity form fills in for itself from the crop's schedule, with no screen and no network so it can be tested on its
// own. The schedule is what GET /production/monitoring/<id>/suggestions/ gives:
//   suggestions[{ activity_name, day_after_planting, status: 'overdue' | 'due_now' | 'upcoming' | 'done', recommendation, days_diff }]
// The form only fills in a first answer (the activity, its advice, the fertilizer); every box stays editable and the server checks everything.

import { BEFORE_ADDING } from '../../utils/activityPicker.js'

const byDay = (a, b) => a.day_after_planting - b.day_after_planting
const loggable = (steps) => (steps || []).filter((s) => !BEFORE_ADDING.includes(s.activity_name))

// The step the form opens on: the earliest overdue step, else the earliest one due now; null when nothing is due (an upcoming or finished
// step is not suggested, and neither is work done before the crop was added to the system).
export function suggestedStep(steps) {
  const open = loggable(steps)
  const pick = (status) => open.filter((s) => s.status === status).sort(byDay)[0]
  return pick('overdue') || pick('due_now') || null
}

// The step to take the advice from when a person picks the activity themselves: its earliest overdue step, else due now, else the next
// upcoming one; null for an activity that is not scheduled or whose steps are all done.
export function stepForActivity(activityType, steps) {
  if (!activityType) return null
  const own = (steps || []).filter((s) => s.activity_name === activityType)
  const pick = (status) => own.filter((s) => s.status === status).sort(byDay)[0]
  return pick('overdue') || pick('due_now') || pick('upcoming') || null
}

// What filling in a step sets: the activity, its recommendation as the note, and (only for an overdue step) the late-log link that ties the
// new log to that step's day.
export function stepDefaults(step) {
  if (!step) return { activityType: '', notes: '', pending: null }
  return {
    activityType: step.activity_name || '',
    notes: step.recommendation || '',
    pending: step.status === 'overdue' ? { occurrence_day: step.day_after_planting, status: 'overdue' } : null,
  }
}

// The Type of Fertilizer to start on: the input recommended for the crop's growth stage, when the activity is Fertilizer Application and that
// input is one of the fertilizers of Crop Settings (the recommended input can also be a pesticide); otherwise empty.
export function fertilizerDefault(activityType, record, fertilizerNames) {
  const recommended = record?.recommended_input_type_name
  if (activityType !== 'Fertilizer Application' || !recommended) return ''
  return (fertilizerNames || []).includes(recommended) ? recommended : ''
}

// A fertilizer saved on a log is text. The dropdown shows it as a listed fertilizer, or as "Other" with the text (an older log's free text).
export function splitFertilizer(saved, fertilizerNames) {
  const text = (saved || '').trim()
  if (!text) return { value: '', other: '' }
  return (fertilizerNames || []).includes(text) ? { value: text, other: '' } : { value: 'Other', other: text }
}

// ...and back: what is saved for the dropdown's value.
export function joinFertilizer({ value, other }) {
  return value === 'Other' ? (other || '').trim() : (value || '')
}

// "Fertilizer Application (Day 30, 4 days late)" for the line under the form.
export function suggestionNote(step) {
  if (!step) return ''
  const late = step.status === 'overdue' ? Math.abs(step.days_diff ?? 0) : 0
  const when = step.status === 'overdue' ? `${late} day${late === 1 ? '' : 's'} late` : 'due now'
  return `${step.activity_name} (Day ${step.day_after_planting}, ${when})`
}
