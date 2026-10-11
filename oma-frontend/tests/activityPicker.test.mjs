import assert from 'node:assert/strict'

const { groupActivityOptions, overdueStepDay } = await import(new URL('../src/utils/activityPicker.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const step = (name, day, status) => ({ activity_name: name, day_after_planting: day, status })
const types = ['Land Preparation', 'Planting', 'Fertilizer Application', 'Weeding', 'Irrigation', 'Other']

eq(groupActivityOptions({ allTypes: types, suggestions: [], editingType: '' }), { suggested: [], other: types }, 'no suggestions: everything is other')
eq(groupActivityOptions({ allTypes: types, suggestions: [step('Weeding', 14, 'due_now')], editingType: '' }),
  { suggested: ['Weeding'], other: ['Land Preparation', 'Planting', 'Fertilizer Application', 'Irrigation', 'Other'] }, 'due_now is suggested')
eq(groupActivityOptions({ allTypes: types, suggestions: [step('Weeding', 14, 'overdue')], editingType: '' }).suggested, ['Weeding'], 'overdue is suggested')
eq(groupActivityOptions({ allTypes: types, suggestions: [step('Weeding', 14, 'due_now'), step('Planting', 1, 'overdue'), step('Fertilizer Application', 7, 'overdue')], editingType: '' }).suggested,
  ['Planting', 'Fertilizer Application', 'Weeding'], 'ordered by smallest due day')
// several steps: step 20 done, 40 upcoming, 60 upcoming -> not suggested, not hidden
const multi = [step('Fertilizer Application', 20, 'done'), step('Fertilizer Application', 40, 'upcoming'), step('Fertilizer Application', 60, 'upcoming')]
eq(groupActivityOptions({ allTypes: types, suggestions: multi, editingType: '' }).suggested, [], 'next step not yet due: not suggested')
eq(groupActivityOptions({ allTypes: types, suggestions: multi, editingType: '' }).other.includes('Fertilizer Application'), true, 'next step not yet due: still selectable')
eq(groupActivityOptions({ allTypes: types, suggestions: [step('Fertilizer Application', 20, 'done'), step('Fertilizer Application', 40, 'due_now'), step('Fertilizer Application', 60, 'upcoming')], editingType: '' }).suggested, ['Fertilizer Application'], 'second step due: suggested again')
// all done -> hidden
const allDone = [step('Weeding', 14, 'done')]
const hidden = groupActivityOptions({ allTypes: types, suggestions: allDone, editingType: '' })
eq(hidden.suggested.concat(hidden.other).includes('Weeding'), false, 'every step done: hidden')
// editing keeps it selectable
const editing = groupActivityOptions({ allTypes: types, suggestions: allDone, editingType: 'Weeding' })
eq(editing.other.includes('Weeding'), true, 'editing a done activity keeps it selectable')
eq(editing.suggested.includes('Weeding'), false, 'the edited done activity is not "suggested"')
// duplicates and unknown names
eq(groupActivityOptions({ allTypes: ['Weeding', 'Weeding', 'Irrigation'], suggestions: [step('Weeding', 14, 'due_now')], editingType: '' }), { suggested: ['Weeding'], other: ['Irrigation'] }, 'duplicate type listed once')
eq(groupActivityOptions({ allTypes: ['Irrigation'], suggestions: [step('Ghost Step', 3, 'due_now')], editingType: '' }), { suggested: [], other: ['Irrigation'] }, 'unknown suggestion ignored')
// ties by name; no overlap
const tie = groupActivityOptions({ allTypes: ['B Task', 'A Task'], suggestions: [step('B Task', 5, 'due_now'), step('A Task', 5, 'overdue')], editingType: '' })
eq(tie.suggested, ['A Task', 'B Task'], 'ties by name')
eq(tie.suggested.filter((x) => tie.other.includes(x)), [], 'no overlap')
// a step done with a different target day is still reported done by the server: the picker follows the server status
eq(groupActivityOptions({ allTypes: types, suggestions: [step('Planting', 1, 'done')], editingType: '' }).other.includes('Planting'), false, 'server-done is hidden')
// a late log picked from the dropdown is tied to the earliest overdue step of that activity
eq(overdueStepDay('Weeding', [step('Weeding', 20, 'overdue')]), 20, 'single overdue step')
eq(overdueStepDay('Weeding', [step('Weeding', 40, 'overdue'), step('Weeding', 20, 'overdue')]), 20, 'earliest overdue step')
eq(overdueStepDay('Weeding', [step('Weeding', 20, 'overdue'), step('Weeding', 40, 'due_now')]), 20, 'overdue step wins over the due one')
eq(overdueStepDay('Weeding', [step('Weeding', 20, 'done'), step('Weeding', 40, 'due_now')]), null, 'nothing overdue')
eq(overdueStepDay('Weeding', [step('Planting', 1, 'overdue')]), null, 'other activity ignored')
eq(overdueStepDay('Weeding', []), null, 'no schedule')
eq(overdueStepDay('', [step('Weeding', 20, 'overdue')]), null, 'no activity chosen')
// set-up work is done once: after it is recorded it is no longer offered at all, with or without a schedule
const setupTypes = ['Land Preparation', 'Planting', 'Weeding', 'Irrigation / Watering']
const noSchedule = groupActivityOptions({ allTypes: setupTypes, suggestions: [], editingType: '', recorded: ['Land Preparation', 'Planting'] })
eq(noSchedule, { suggested: [], other: ['Weeding', 'Irrigation / Watering'] }, 'recorded Land Preparation and Planting are gone')
eq(groupActivityOptions({ allTypes: setupTypes, suggestions: [], editingType: '', recorded: ['Planting'] }).other, ['Land Preparation', 'Weeding', 'Irrigation / Watering'], 'only the recorded one is gone')
eq(groupActivityOptions({ allTypes: setupTypes, suggestions: [], editingType: '' }).other, setupTypes, 'nothing recorded: all offered')
eq(groupActivityOptions({ allTypes: setupTypes, suggestions: [], editingType: '', recorded: ['Weeding'] }).other.includes('Weeding'), true, 'a repeatable activity stays offered after it was logged')
eq(groupActivityOptions({ allTypes: setupTypes, suggestions: [], editingType: 'Planting', recorded: ['Planting'] }).other.includes('Planting'), true, 'the log being edited keeps its activity')
// recorded and still suggested by an old server answer: recorded wins
eq(groupActivityOptions({ allTypes: setupTypes, suggestions: [step('Land Preparation', 0, 'overdue')], editingType: '', recorded: ['Land Preparation'] }).suggested, [], 'recorded is never suggested')
// a set-up step whose time has passed (never recorded) is not suggested but can still be picked to log it late
const passed = groupActivityOptions({ allTypes: setupTypes, suggestions: [step('Land Preparation', 0, 'passed'), step('Planting', 1, 'passed')], editingType: '' })
eq(passed.suggested, [], 'passed steps are not suggested')
eq(passed.other.includes('Land Preparation') && passed.other.includes('Planting'), true, 'passed steps can still be logged late')
eq(overdueStepDay('Land Preparation', [step('Land Preparation', 0, 'passed')]), null, 'a passed step is not an overdue target')

console.log(`ALL ${n} CHECKS PASSED`)
