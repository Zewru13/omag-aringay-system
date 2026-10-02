// Dates on the forecasting pages. Harvest dates are calendar dates
// ('2026-10-28'), not instants, so they are read at local midnight.

const SHORT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

// "Oct 28, 2026" — the same style the rest of the staff app shows dates in.
export function fmtShortDate(iso) {
  if (!iso) return '—'
  return SHORT.format(new Date(`${iso}T00:00:00`))
}

// Whole days from today to `iso` (negative once it has passed), or null.
export function daysUntil(iso) {
  if (!iso) return null
  const target = new Date(`${iso}T00:00:00`)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.round((target - today) / 86400000)
}

// "in 26 days", "Today", "5 days overdue".
export function countdownText(iso) {
  const n = daysUntil(iso)
  if (n === null) return ''
  if (n === 0) return 'Today'
  if (n > 0) return `in ${n} day${n === 1 ? '' : 's'}`
  return `${-n} day${n === -1 ? '' : 's'} overdue`
}
