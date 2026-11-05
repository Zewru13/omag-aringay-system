import assert from 'node:assert/strict'

// What the crop Log Activity form fills in for itself from the crop's schedule (and what it leaves alone).
const { suggestedStep, stepForActivity, stepDefaults, fertilizerDefault, splitFertilizer, joinFertilizer, suggestionNote } =
  await import(new URL('../src/pages/Monitoring/cropLogDefaults.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const step = (activity_name, day, status, over = {}) => ({ activity_name, day_after_planting: day, status, recommendation: `${activity_name} advice`, days_diff: 0, ...over })
const steps = [
  step('Weeding', 20, 'upcoming', { days_diff: 5 }),
  step('Fertilizer Application', 30, 'overdue', { days_diff: -4 }),
  step('Irrigation / Watering', 15, 'overdue', { days_diff: -9 }),
  step('Pest Control', 25, 'due_now'),
  step('Land Preparation', 0, 'overdue', { days_diff: -30 }),
  step('Seed Soaking', 1, 'done'),
]

// ── which step the form opens on: the earliest overdue one, else the earliest due now, never an upcoming or finished one
eq(suggestedStep(steps).activity_name, 'Irrigation / Watering', 'earliest overdue step first')
eq(suggestedStep([step('A', 25, 'due_now'), step('B', 10, 'due_now'), step('C', 5, 'upcoming')]).activity_name, 'B', 'else the earliest due now')
eq(suggestedStep([step('C', 5, 'upcoming'), step('D', 1, 'done')]), null, 'nothing due: no suggestion')
eq(suggestedStep([]), null, 'no schedule')
eq(suggestedStep(undefined), null, 'schedule not loaded')
eq(suggestedStep([step('Land Preparation', 0, 'overdue'), step('Planting', 0, 'due_now')]), null, 'work done before the crop was added is never suggested')
eq(suggestedStep([step('Weeding', 12, 'overdue'), step('Weeding', 3, 'overdue')]).day_after_planting, 3, 'the earliest day of the same activity')

// ── the step to take the defaults from when a person picks an activity themselves
eq(stepForActivity('Fertilizer Application', steps).day_after_planting, 30, 'an overdue step')
eq(stepForActivity('Weeding', steps).status, 'upcoming', 'an upcoming step still gives its advice')
eq(stepForActivity('Seed Soaking', steps), null, 'a finished one gives nothing')
eq(stepForActivity('Other', steps), null, 'an unscheduled activity gives nothing')
eq(stepForActivity('', steps), null, 'no activity')

// ── what filling in a step sets
eq(stepDefaults(steps[1]), { activityType: 'Fertilizer Application', notes: 'Fertilizer Application advice', pending: { occurrence_day: 30, status: 'overdue' } }, 'an overdue step is a late log')
eq(stepDefaults(steps[3]), { activityType: 'Pest Control', notes: 'Pest Control advice', pending: null }, 'a step due now is not late')
eq(stepDefaults(step('X', 3, 'due_now', { recommendation: null })).notes, '', 'no advice: an empty note')
eq(stepDefaults(null), { activityType: '', notes: '', pending: null }, 'no step')

// ── the type of fertilizer: the crop's recommended input, only when it is one of the fertilizers of Crop Settings
const names = ['Urea (46-0-0)', 'Complete (14-14-14)']
eq(fertilizerDefault('Fertilizer Application', { recommended_input_type_name: 'Complete (14-14-14)' }, names), 'Complete (14-14-14)', 'the recommended fertilizer')
eq(fertilizerDefault('Fertilizer Application', { recommended_input_type_name: 'Some pesticide' }, names), '', 'a recommended input that is not a fertilizer is not used')
eq(fertilizerDefault('Fertilizer Application', { recommended_input_type_name: null }, names), '', 'nothing recommended: empty')
eq(fertilizerDefault('Weeding', { recommended_input_type_name: 'Urea (46-0-0)' }, names), '', 'only for Fertilizer Application')

// ── the dropdown value of a fertilizer typed on an older log
eq(splitFertilizer('Urea (46-0-0)', names), { value: 'Urea (46-0-0)', other: '' }, 'a listed fertilizer')
eq(splitFertilizer('14-14-14 NPK', names), { value: 'Other', other: '14-14-14 NPK' }, 'an old free-text one becomes Other + text')
eq(splitFertilizer('', names), { value: '', other: '' }, 'none')
eq(splitFertilizer(null, names), { value: '', other: '' }, 'null')
eq(joinFertilizer({ value: 'Other', other: '  Compost ' }), 'Compost', 'Other sends what was typed')
eq(joinFertilizer({ value: 'Urea (46-0-0)', other: 'ignored' }), 'Urea (46-0-0)', 'a listed one sends its name')
eq(joinFertilizer({ value: '', other: '' }), '', 'none')

// ── the line under the table
eq(suggestionNote(steps[1]), 'Fertilizer Application (Day 30, 4 days late)', 'late')
eq(suggestionNote(step('Pest Control', 25, 'due_now')), 'Pest Control (Day 25, due now)', 'due now')
eq(suggestionNote(step('Pest Control', 25, 'overdue', { days_diff: -1 })), 'Pest Control (Day 25, 1 day late)', 'one day late')
eq(suggestionNote(null), '', 'none')

console.log(`ok - ${n} assertions`)
