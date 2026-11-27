// The one place that says how a distribution's statuses and schedule read on every assistance screen. Nobody confirms receipt:
// an entry is Scheduled until its day and time, then Received (the server moves it; see interventions/lifecycle.py). Not Received and
// Resolved are older cases only. No screen and no network, so it can be tested on its own.
export const STATUS_LABELS = {
  PENDING: 'Scheduled',
  AWAITING_CONFIRMATION: 'Awaiting Confirmation',
  CONFIRMED: 'Received',
  NOT_RECEIVED: 'Not Received',
  RESOLVED: 'Resolved',
}

// A whole distribution's status, as the server words it (summary_status).
export const SUMMARY_TONE = { Received: 'green', Scheduled: 'amber', 'Needs follow-up': 'rose' }

// What staff may still correct (interventions.views.PendingOnlyEditMixin; a cooperative only while Scheduled).
export const EDITABLE_STATUSES = new Set(['PENDING', 'AWAITING_CONFIRMATION', 'CONFIRMED'])

// Who can be taken off the list: someone still scheduled, or someone who never claimed it. A receipt somebody confirmed earlier stays
// (interventions.distributions._removable).
export const canRemove = (entry) => entry.status === 'PENDING' || entry.status === 'AWAITING_CONFIRMATION'
  || (entry.status === 'CONFIRMED' && !entry.confirmed_at)

export function timeText(value) {
  const match = /^(\d{1,2}):(\d{2})/.exec(String(value || ''))
  if (!match) return ''
  const hour = Number(match[1])
  return `${hour % 12 || 12}:${match[2]} ${hour < 12 ? 'AM' : 'PM'}`
}

const dayText = (value) => (value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
  : '')

// "Nov 28, 2026 · 9:00 AM · Barangay Hall", as much of it as the record has (older and imported records have only the date).
export const scheduleText = (record) => [dayText(record.date_given), timeText(record.distribution_time), record.distribution_place].filter(Boolean).join(' · ')

// PendingOnlyEditMixin raises a plain ValidationError(str), which the server sends as a bare list, not {detail: ...}: that shape is read
// too, or the "cannot be edited" reason would be lost behind the general message.
export function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (Array.isArray(data) && data.length) return String(data[0])
  if (data?.detail) return data.detail
  const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : ''
  return typeof first === 'string' && first ? first : fallback
}
