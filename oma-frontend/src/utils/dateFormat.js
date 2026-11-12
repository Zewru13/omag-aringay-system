// The one way dates are shown on screen: "Nov 1, 2026" (and "Nov 1, 2026, 2:30 PM" with a time).
//
// Two kinds of value come from the API and they are not the same thing:
//   a CALENDAR DATE  '2026-11-01'             the day someone meant; it is that day wherever it is read, so it is never moved by a time zone
//   a MOMENT         '2026-11-01T18:30:00Z'   shown on the day and at the hour it was for the person reading (the browser's own time zone)
// `empty` is what a missing or unreadable date shows (a dash unless the caller says otherwise). `timeZone` is for tests; pages leave it out.

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/
const SHORT = { month: 'short', day: 'numeric', year: 'numeric' }
const LONG = { month: 'long', day: 'numeric', year: 'numeric' }
const TIME = { hour: 'numeric', minute: '2-digit' }

// { date, calendar } or null: `calendar` says the value was a calendar date (formatted in UTC so the day never shifts).
function read(value) {
  if (value === null || value === undefined || value === '') return null
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : { date: value, calendar: false }
  const text = String(value).trim()
  const day = DATE_ONLY.exec(text)
  if (day) {
    const [year, month, date] = [Number(day[1]), Number(day[2]), Number(day[3])]
    const utc = new Date(Date.UTC(year, month - 1, date))
    // 2026-13-45 would roll over to another real date: refuse it instead of showing a day nobody typed.
    return utc.getUTCMonth() === month - 1 && utc.getUTCDate() === date ? { date: utc, calendar: true } : null
  }
  const moment = new Date(text)
  return Number.isNaN(moment.getTime()) ? null : { date: moment, calendar: false }
}

const show = (parsed, options, timeZone) => new Intl.DateTimeFormat('en-US', { ...options, timeZone: parsed.calendar ? 'UTC' : timeZone }).format(parsed.date)

export function formatDate(value, { empty = '—', timeZone } = {}) {
  const parsed = read(value)
  return parsed ? show(parsed, SHORT, timeZone) : empty
}

// The month in full ("November 1, 2026"), for the printed papers and report headings.
export function formatDateLong(value, { empty = '—', timeZone } = {}) {
  const parsed = read(value)
  return parsed ? show(parsed, LONG, timeZone) : empty
}

// "Thursday, Nov 12, 2026": a welcome line or page heading that says the day too.
export function formatDateWithWeekday(value, { empty = '—', timeZone } = {}) {
  const parsed = read(value)
  return parsed ? show(parsed, { weekday: 'long', ...SHORT }, timeZone) : empty
}

export function formatDateTime(value, { empty = '—', timeZone } = {}) {
  const parsed = read(value)
  if (!parsed) return empty
  return parsed.calendar ? show(parsed, SHORT, timeZone) : show(parsed, { ...SHORT, ...TIME }, timeZone)
}

export function formatTime(value, { empty = '—', timeZone } = {}) {
  const parsed = read(value)
  return parsed && !parsed.calendar ? show(parsed, TIME, timeZone) : empty
}
