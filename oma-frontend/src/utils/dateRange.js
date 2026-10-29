// A "From / To" pair of date filters (Date Planted, Date Stocked, Trip Date, Date Registered) with no screen and no network, so the rules
// can be tested on their own. A value is a YYYY-MM-DD string or ''.

// Why a range cannot be used ('' when it can): a "To" before the "From".
export const dateRangeProblem = (from, to) => (from && to && to < from ? '"To" cannot be before "From".' : '')

// What to add to a list's request: only the dates that were chosen, and nothing at all while the range is reversed (the server refuses
// it), so the table keeps showing the last good result instead of an error.
export function dateRangeParams(from, to, fromName, toName) {
  if (dateRangeProblem(from, to)) return {}
  const params = {}
  if (from) params[fromName] = from
  if (to) params[toName] = to
  return params
}

const fmt = (value) => new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${value}T00:00:00`))

// The range in words, for a printed report ('' when neither end was chosen, or the range is reversed).
export function dateRangeText(from, to) {
  if (dateRangeProblem(from, to)) return ''
  if (from && to) return from === to ? fmt(from) : `${fmt(from)} to ${fmt(to)}`
  if (from) return `${fmt(from)} onward`
  if (to) return `up to ${fmt(to)}`
  return ''
}
