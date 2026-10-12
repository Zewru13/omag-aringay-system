// How far along a crop or pond is, and which activities its "Add activity" picker should offer because of it.

const DAY = 24 * 60 * 60 * 1000
const toUtc = (iso) => {
  if (!iso) return null
  const t = Date.parse(`${String(iso).slice(0, 10)}T00:00:00Z`)
  return Number.isNaN(t) ? null : t
}

// { day, total, halfway, percent } for a record planted / stocked on `start`, expected to be harvested on `end`,
// seen on `today` (all YYYY-MM-DD). day is the whole days since the start (day 0 = the day it started). total is
// the season's length, or null when the expected date is missing or not after the start; with no total nothing is
// held back (halfway is true). null when there is no start date or it is still in the future.
export const cycleProgress = (start, end, today) => {
  const s = toUtc(start)
  const t = toUtc(today)
  if (s === null || t === null || t < s) return null
  const day = Math.round((t - s) / DAY)
  const e = toUtc(end)
  const total = e !== null && e > s ? Math.round((e - s) / DAY) : null
  if (total === null) return { day, total: null, halfway: true, percent: null }
  return { day, total, halfway: day >= total / 2, percent: Math.min(100, Math.round((day / total) * 100)) }
}

const REMEDY = 'Disaster Remedy'
const HARVEST_STEPS = ['Pre-Harvest Inspection', 'Harvesting']

// The picker's activities: Disaster Remedy only when the record has a disaster report, and the pre-harvest steps only
// from half way through the season. `keep` (the activity of a log being edited) is always left in.
export const filterCycleActivities = (options, { hasDisaster, halfway, keep = '' }) => (Array.isArray(options) ? options : []).filter((name) => {
  if (name === keep) return true
  if (name === REMEDY) return Boolean(hasDisaster)
  if (HARVEST_STEPS.includes(name)) return Boolean(halfway)
  return true
})
