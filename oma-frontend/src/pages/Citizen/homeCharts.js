// Pure helpers for the charts on the farmer, fisherfolk and organization account Homes. They turn the lists a Home
// already loads into the rows recharts draws; nothing here touches the network or the DOM, so it is unit-tested.

// Colours for a status chart: the same status always gets the same colour, whatever the other slices are.
export const STATUS_COLORS = {
  Growing: '#4C9F70',
  'Near harvest': '#E0A526',
  Harvested: '#1B4D2E',
  'Total loss': '#B3412F',
  Active: '#4C9F70',
  Inactive: '#9AA89A',
}

// Colours for a chart whose slices are open-ended (disaster types, assistance types), in order of size.
const CATEGORY_COLORS = ['#1B4D2E', '#E0A526', '#2F7FA8', '#B3412F', '#7A5AA6']
const OTHER_COLOR = '#9AA89A'
const MAX_SLICES = 5

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

const num = (value) => {
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

// Counts rows by a key and returns [{ name, value }] biggest first (ties keep first-seen order). A blank key is
// counted under `blankLabel` rather than dropped, so the slices always add up to the rows given.
export function countBy(rows, keyOf, blankLabel = 'Not stated') {
  const counts = new Map()
  for (const row of rows || []) {
    const key = String(keyOf(row) ?? '').trim() || blankLabel
    counts.set(key, (counts.get(key) || 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, value]) => ({ name, value }))
    .sort((a, b) => b.value - a.value)
}

// Keeps the biggest slices and folds the rest into one "Other" slice, so a legend never runs off a phone.
export function limitSlices(slices, max = MAX_SLICES) {
  if (slices.length <= max) return slices
  const kept = slices.slice(0, max - 1)
  const rest = slices.slice(max - 1).reduce((sum, s) => sum + s.value, 0)
  return [...kept, { name: 'Other', value: rest }]
}

// Gives every slice its colour: a status keeps its own colour, anything else takes the next category colour.
export function withColors(slices) {
  let next = 0
  return slices.map((slice) => {
    if (STATUS_COLORS[slice.name]) return { ...slice, color: STATUS_COLORS[slice.name] }
    if (slice.name === 'Other') return { ...slice, color: OTHER_COLOR }
    const color = CATEGORY_COLORS[next % CATEGORY_COLORS.length]
    next += 1
    return { ...slice, color }
  })
}

export const hasData = (slices) => (slices || []).some((s) => s.value > 0)

const STATUS_LABELS = {
  Planted: 'Growing',
  Stocked: 'Growing',
  'Near Harvest': 'Near harvest',
  Harvested: 'Harvested',
  'Total Loss': 'Total loss',
}
const STATUS_ORDER = ['Growing', 'Near harvest', 'Harvested', 'Total loss']

// Crops (or stockings) by where they are in the cycle, always in cycle order so the chart reads the same each time.
export function statusSlices(rows) {
  const counts = countBy(rows, (r) => STATUS_LABELS[r.status] || r.status, 'Other')
  return withColors(counts.sort((a, b) => STATUS_ORDER.indexOf(a.name) - STATUS_ORDER.indexOf(b.name)))
}

// Disasters the account has logged, by type.
export function disasterSlices(logs) {
  return withColors(limitSlices(countBy(logs, (d) => d.disaster_type_label || d.disaster_type, 'Not stated')))
}

// Assistance by type (an organization's reported assistance).
export function assistanceTypeSlices(records) {
  return withColors(limitSlices(countBy(records, (r) => r.assistance_type, 'Not stated')))
}

// Members split into active and inactive; `isActive` is the domain's own rule for a members row.
export function memberSlices(members, isActive) {
  const active = (members || []).filter(isActive).length
  const inactive = (members || []).length - active
  return withColors([
    { name: 'Active', value: active },
    { name: 'Inactive', value: inactive },
  ].filter((s) => s.value > 0))
}

// Harvest against estimate: one bar pair per harvested crop or cycle that has both figures, newest first, at most
// `limit`. `nameOf` labels the pair (a trailing " (Local name)" is dropped to keep the axis short); `estimateKey` / `actualKey` name the kg fields on the row.
export function harvestBars(rows, { nameOf, estimateKey, actualKey, dateOf, limit = 6 }) {
  return (rows || [])
    .map((r) => ({ name: String(nameOf(r)).split(' (')[0], estimate: num(r[estimateKey]), actual: num(r[actualKey]), date: String(dateOf?.(r) || '') }))
    .filter((r) => r.estimate > 0 && r.actual > 0)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map(({ name, estimate, actual }) => ({ name, estimate, actual }))
}

// Twelve months of a year, each with how many rows fall in it by `dateOf` (YYYY-MM-DD), so a quiet month shows as 0.
export function monthlyCounts(rows, dateOf, year) {
  const counts = Array(12).fill(0)
  for (const row of rows || []) {
    const [y, m] = String(dateOf(row) || '').split('-')
    if (Number(y) === Number(year) && Number(m) >= 1 && Number(m) <= 12) counts[Number(m) - 1] += 1
  }
  return MONTHS.map((month, i) => ({ month, value: counts[i] }))
}

export const hasBars = (bars) => (bars || []).length > 0
export const hasMonthly = (months) => (months || []).some((m) => m.value > 0)
