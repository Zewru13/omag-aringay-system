// Disaster chart on the staff dashboard: reports per month between a From and a To month. Pure helpers (no screen, no network).

const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
export const MAX_MONTHS = 36

const parts = (month) => month.split('-').map(Number)

// Calendar year of `today`, January to December.
export function defaultRange(today = new Date()) {
  const year = today.getFullYear()
  return { from: `${year}-01`, to: `${year}-12` }
}

export function rangeProblem(from, to) {
  if (!from || !to) return 'Choose both months.'
  if (from > to) return 'The From month must not be after the To month.'
  const [fy, fm] = parts(from)
  const [ty, tm] = parts(to)
  return (ty - fy) * 12 + (tm - fm) + 1 > MAX_MONTHS ? `Choose a range of at most ${MAX_MONTHS} months.` : ''
}

export const monthLabel = (month) => { const [y, m] = parts(month); return `${SHORT[m - 1]} ${y}` }
const longLabel = (month) => { const [y, m] = parts(month); return `${LONG[m - 1]} ${y}` }
export const rangeTitle = (from, to) => (from === to ? longLabel(from) : `${longLabel(from)} to ${longLabel(to)}`)

// The server's months as chart rows; the year is part of the label only when the range crosses years.
export function chartData(months) {
  const crossesYears = new Set(months.map((m) => parts(m.month)[0])).size > 1
  return months.map((m) => ({
    month: m.month,
    label: crossesYears ? monthLabel(m.month) : SHORT[parts(m.month)[1] - 1],
    crop: m.crop,
    fisheries: m.fisheries,
    total: m.crop + m.fisheries,
  }))
}

// The biggest disaster types as bars (relative to the biggest), the rest grouped as "Others (n)".
export function typeBars(types, top = 6) {
  if (types.length === 0) return []
  const shown = types.length <= top ? types : types.slice(0, top - 1)
  const rest = types.slice(shown.length)
  const bars = shown.map((t) => ({ type: t.type, total: t.total }))
  if (rest.length) bars.push({ type: `Others (${rest.length})`, total: rest.reduce((s, t) => s + t.total, 0) })
  const biggest = Math.max(...bars.map((b) => b.total))
  return bars.map((b) => ({ ...b, percent: Math.round((b.total / biggest) * 100) }))
}
