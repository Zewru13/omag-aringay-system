import assert from 'node:assert/strict'

const { agencyChoices, assistanceDateProblem, assistanceMinDate } = await import(new URL('../src/pages/AssistanceManagement/assistanceFieldHelpers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the agencies offered in the dropdown: the list, plus any already on the record, in alphabetical order
const list = [{ name: 'LGU - Aringay' }, { name: 'Department of Agriculture (DA)' }]
eq(agencyChoices(list, []), ['Department of Agriculture (DA)', 'LGU - Aringay'], 'the list, alphabetical')
eq(agencyChoices(list, ['Old Agency']), ['Department of Agriculture (DA)', 'LGU - Aringay', 'Old Agency'], 'a deleted agency stays when it is already chosen')
eq(agencyChoices(list, ['Typed Long Ago']), ['Department of Agriculture (DA)', 'LGU - Aringay', 'Typed Long Ago'], 'an old free-text agency stays when chosen')
eq(agencyChoices(list, ['LGU - Aringay']), ['Department of Agriculture (DA)', 'LGU - Aringay'], 'no duplicates')
eq(agencyChoices([], []), [], 'empty list')
eq(agencyChoices(null, ['X']), ['X'], 'not loaded yet')

// ── dates: today or later; an old record may keep the date it has
const today = '2026-10-22'
eq(assistanceDateProblem('2026-10-22', { today }), '', 'today')
eq(assistanceDateProblem('2026-12-01', { today }), '', 'future')
eq(assistanceDateProblem('2026-10-21', { today }), 'Assistance can only be recorded for today or a future date.', 'yesterday')
eq(assistanceDateProblem('', { today }), 'Choose the date the assistance is given.', 'blank')
eq(assistanceDateProblem('2026-09-01', { today, original: '2026-09-01' }), '', 'an old record keeps its date')
eq(assistanceDateProblem('2026-09-02', { today, original: '2026-09-01' }), 'Assistance can only be recorded for today or a future date.', 'but cannot move to another past date')

// ── the date box: earliest pickable day
eq(assistanceMinDate({ today }), '2026-10-22', 'new assistance')
eq(assistanceMinDate({ today, original: '2026-12-01' }), '2026-10-22', 'a future record')
eq(assistanceMinDate({ today, original: '2026-09-01' }), undefined, 'an old record: no minimum is shown, the check above decides')

console.log(`assistanceRules: ${n} checks passed`)
