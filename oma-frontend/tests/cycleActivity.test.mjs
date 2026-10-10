import assert from 'node:assert/strict'

const { cycleProgress, filterCycleActivities } = await import(new URL('../src/utils/cycleActivity.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── cycleProgress: how many days a crop or pond has grown, and whether half of its season has passed ──
eq(cycleProgress('2026-08-31', '2026-12-19', '2026-10-10'), { day: 40, total: 110, halfway: false, percent: 36 }, 'day 40 of 110')
eq(cycleProgress('2026-08-31', '2026-12-19', '2026-10-25'), { day: 55, total: 110, halfway: true, percent: 50 }, 'exactly half counts as half')
eq(cycleProgress('2026-08-31', '2026-12-19', '2026-10-24').halfway, false, 'a day before half')
eq(cycleProgress('2026-08-31', '2026-12-19', '2026-12-30'), { day: 121, total: 110, halfway: true, percent: 100 }, 'past the expected date')
eq(cycleProgress('2026-10-10', '2026-12-19', '2026-10-10'), { day: 0, total: 70, halfway: false, percent: 0 }, 'planted today is day 0')
eq(cycleProgress('2026-08-31', null, '2026-10-10'), { day: 40, total: null, halfway: true, percent: null }, 'no expected date: the days still show, nothing is held back')
eq(cycleProgress('2026-08-31', '2026-08-31', '2026-10-10').total, null, 'an end date that is not after the start is ignored')
eq(cycleProgress(null, '2026-12-19', '2026-10-10'), null, 'no start date')
eq(cycleProgress('2026-12-01', '2026-12-30', '2026-10-10'), null, 'not started yet')

// ── filterCycleActivities: which activities the picker offers ──
const all = ['Land Preparation', 'Fertilizer Application', 'Disaster Remedy', 'Pre-Harvest Inspection', 'Harvesting', 'Other']
eq(filterCycleActivities(all, { hasDisaster: false, halfway: false }), ['Land Preparation', 'Fertilizer Application', 'Other'], 'no disaster and before half: remedy and harvest steps hidden')
eq(filterCycleActivities(all, { hasDisaster: true, halfway: false }), ['Land Preparation', 'Fertilizer Application', 'Disaster Remedy', 'Other'], 'a disaster report shows the remedy')
eq(filterCycleActivities(all, { hasDisaster: false, halfway: true }), ['Land Preparation', 'Fertilizer Application', 'Pre-Harvest Inspection', 'Harvesting', 'Other'], 'half way shows the harvest steps')
eq(filterCycleActivities(all, { hasDisaster: true, halfway: true }), all, 'both: everything')
eq(filterCycleActivities(all, { hasDisaster: false, halfway: false, keep: 'Harvesting' }), ['Land Preparation', 'Fertilizer Application', 'Harvesting', 'Other'], 'the activity of a log being edited stays selectable')
eq(filterCycleActivities(undefined, { hasDisaster: false, halfway: false }), [], 'missing list tolerated')

console.log(`ok - ${n} assertions`)
