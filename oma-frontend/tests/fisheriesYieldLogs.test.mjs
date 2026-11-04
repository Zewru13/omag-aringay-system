import assert from 'node:assert/strict'

const { factorsSummary, factorLines, hasRecordedActivity, EMPTY_ACTIVITY } = await import(new URL('../src/utils/fisheriesYieldLogs.js', import.meta.url).href)
const { possibleFactorsText } = await import(new URL('../src/utils/yieldAnalysis.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const base = { variance_pct: -10, activities_total_count: 4, activities_completed_count: 2, missed_high_priority: [{ activity: 'Water test', scheduled_day: 10 }] }
const activity = (feeding, health, factors = []) => ({
  feeding: { count: feeding, total_kg: feeding * 10, logs: [] }, health: { count: health, mortality_total: 0, logs: [] }, units: [], factors,
})

// ── a record with no cycle activity (older answer, no cycle) is simply empty
eq(hasRecordedActivity(undefined), false, 'no activity at all')
eq(hasRecordedActivity(EMPTY_ACTIVITY), false, 'an empty activity')
eq(hasRecordedActivity(activity(0, 0)), false, 'a cycle without logs')
eq(hasRecordedActivity(activity(2, 0)), true, 'feeding logs')
eq(hasRecordedActivity(activity(0, 1)), true, 'a health log')

// ── the table cell: the existing schedule wording stays, the recorded logs are added only when there are some
eq(factorsSummary({ ...base, cycle_activity: activity(0, 0) }), possibleFactorsText(base, 'fisheries'), 'nothing recorded: the schedule wording alone')
eq(factorsSummary({ ...base }), possibleFactorsText(base, 'fisheries'), 'an answer without cycle_activity')
eq(factorsSummary({ ...base, cycle_activity: activity(3, 2) }), `Recorded: 2 Health Logs, 3 Feeding Logs. ${possibleFactorsText(base, 'fisheries')}`, 'both kinds, plural')
eq(factorsSummary({ ...base, cycle_activity: activity(1, 0) }), `Recorded: 1 Feeding Log. ${possibleFactorsText(base, 'fisheries')}`, 'one feeding log')
eq(factorsSummary({ ...base, cycle_activity: activity(0, 1) }), `Recorded: 1 Health Log. ${possibleFactorsText(base, 'fisheries')}`, 'one health log')

// ── the expanded list: the recorded facts, worded by the server, never anything made up
eq(factorLines({ cycle_activity: activity(1, 1, ['Fish Mortality recorded on 2026-02-01 (Pond 2): 7 dead', '1 Feeding Log recorded (10 kg, 2026-01-10 to 2026-01-10)']) }),
  ['Fish Mortality recorded on 2026-02-01 (Pond 2): 7 dead', '1 Feeding Log recorded (10 kg, 2026-01-10 to 2026-01-10)'], 'the server\'s lines')
eq(factorLines({}), [], 'no activity, no lines')
eq(factorLines({ cycle_activity: activity(0, 0) }), [], 'a cycle without logs has none')

console.log(`ok - ${n} assertions`)
