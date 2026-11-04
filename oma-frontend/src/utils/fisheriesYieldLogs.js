import { possibleFactorsText } from './yieldAnalysis.js'

// The Feeding Log / Health Log side of the Fisheries Yield Analysis. The server (fisheries/yield_cycle_logs.py) reads the cycle's own saved logs
// and words them as recorded facts; this only shows them. Nothing is made up here: a record without a cycle, or a cycle without logs, shows nothing
// extra, and no wording says that an activity caused a loss (the Yield Analysis disclaimer says these are possible factors, not proven causes).

export const EMPTY_ACTIVITY = {
  feeding: { count: 0, total_kg: 0, logs: [] },
  health: { count: 0, mortality_total: 0, logs: [] },
  units: [],
  factors: [],
}

export const hasRecordedActivity = (activity) => Boolean(activity && (activity.feeding?.count > 0 || activity.health?.count > 0))

const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`

// The Possible Factors cell of a Yield Analysis row: what was actually logged first (it must not be cut off), then the schedule wording the page always had.
export function factorsSummary(rec) {
  const base = possibleFactorsText(rec, 'fisheries')
  const activity = rec.cycle_activity
  if (!hasRecordedActivity(activity)) return base
  const parts = []
  if (activity.health.count > 0) parts.push(plural(activity.health.count, 'Health Log'))
  if (activity.feeding.count > 0) parts.push(plural(activity.feeding.count, 'Feeding Log'))
  return `Recorded: ${parts.join(', ')}. ${base}`
}

// The recorded facts of the cycle, one line each (oldest health entry first, the feeding summary last).
export const factorLines = (rec) => (hasRecordedActivity(rec.cycle_activity) ? rec.cycle_activity.factors || [] : [])
