import assert from 'node:assert/strict'

const { lendProblem, lendBody, lendSummary, unitsPicked, unitsLeft, canPickMore, maxUnitsFor } = await import(new URL('../src/utils/lendMany.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const today = '2026-10-27'
const kind = (over = {}) => ({ equipment: 7, name: 'Hand Tractor', picked: [{ member: 1, quantity: 2 }, { member: 2, quantity: '1' }], available: 5, ...over })
const good = { kinds: [kind()], borrowedOn: today, today }

// ── units in one kind
eq(unitsPicked(kind().picked), 3, 'units chosen (typed text counts)')
eq(unitsPicked([]), 0, 'none chosen')
eq(unitsLeft(5, kind().picked), 2, 'units not given yet')
eq(unitsLeft(2, kind().picked), 0, 'never below zero')
eq(canPickMore(5, kind().picked), true, 'a unit is left')
eq(canPickMore(3, kind().picked), false, 'everything is given')
eq(canPickMore(1, []), true, 'one unit, nobody yet')
eq(canPickMore(1, [{ member: 1, quantity: 1 }]), false, 'one unit and one member: nobody else can be chosen')
eq(canPickMore(1, [{ member: 1, quantity: '' }]), true, 'a member with no number typed yet takes nothing')
eq(maxUnitsFor(5, kind().picked, 1), 4, 'a member can take what the others leave')
eq(maxUnitsFor(5, kind().picked, 2), 3, 'the other member')
eq(maxUnitsFor(1, [{ member: 1, quantity: 1 }], 1), 1, 'the only member can take the one unit')
eq(maxUnitsFor(2, [{ member: 1, quantity: 2 }, { member: 2, quantity: 1 }], 1), 1, 'never below 1')

// ── what is wrong
eq(lendProblem(good), '', 'a complete choice')
eq(lendProblem({ ...good, kinds: [] }), 'Choose the equipment.', 'equipment needed')
eq(lendProblem({ ...good, kinds: [kind({ equipment: '' })] }), 'Choose the equipment for every section.', 'every section needs its equipment')
eq(lendProblem({ ...good, kinds: [kind({ picked: [] })] }), 'Choose at least one member who borrowed it.', 'a member is needed')
eq(lendProblem({ ...good, kinds: [kind({ picked: [{ member: 1, quantity: '' }] })] }), 'Every chosen member needs a whole number of units, 1 or more.', 'units needed')
eq(lendProblem({ ...good, kinds: [kind({ picked: [{ member: 1, quantity: 0 }] })] }), 'Every chosen member needs a whole number of units, 1 or more.', 'zero units')
eq(lendProblem({ ...good, kinds: [kind({ picked: [{ member: 1, quantity: 1.5 }] })] }), 'Every chosen member needs a whole number of units, 1 or more.', 'whole units only')
eq(lendProblem({ ...good, kinds: [kind({ available: 2 })] }), 'Only 2 units available, but 3 chosen.', 'not more than available')
eq(lendProblem({ ...good, kinds: [kind({ available: 1, picked: [{ member: 1, quantity: 2 }] })] }), 'Only 1 unit available, but 2 chosen.', 'singular')
eq(lendProblem({ ...good, kinds: [kind({ available: 3 })] }), '', 'exactly what is available')
eq(lendProblem({ ...good, borrowedOn: '' }), 'Enter the date borrowed.', 'date borrowed needed')
eq(lendProblem({ ...good, borrowedOn: '2026-10-28' }), 'The date borrowed cannot be in the future.', 'not in the future')
eq(lendProblem({ ...good, borrowedOn: '2026-10-01' }), '', 'a past date is fine (reporting something that already happened)')

// ── several kinds of equipment, one member in more than one
const pump = (over = {}) => ({ equipment: 8, name: 'Water Pump', picked: [{ member: 1, quantity: 1 }], available: 2, ...over })
eq(lendProblem({ ...good, kinds: [kind(), pump()] }), '', 'one member can borrow two kinds')
eq(lendProblem({ ...good, kinds: [kind(), pump({ equipment: 7 })] }), 'Each equipment can be chosen only once.', 'the same equipment twice')
eq(lendProblem({ ...good, kinds: [kind(), pump({ picked: [] })] }), 'Water Pump: choose at least one member who borrowed it.', 'the problem names its equipment when there are several')
eq(lendProblem({ ...good, kinds: [kind(), pump({ available: 0 })] }), 'Water Pump: only 0 units available, but 1 chosen.', 'a kind with nothing left')
eq(lendProblem({ ...good, kinds: [kind({ available: 1 }), pump()] }), 'Hand Tractor: only 1 unit available, but 3 chosen.', 'the first problem is the one shown')

// ── what is sent
eq(lendBody([kind()], { borrowedOn: '2026-10-20' }), { items: [{ equipment: 7, borrowers: [{ member: 1, quantity: 2 }, { member: 2, quantity: 1 }] }], borrowed_on: '2026-10-20' }, 'the request body, with no return-by date')
eq(lendBody([kind({ equipment: '9', picked: [{ member: '3', quantity: '4' }] }), pump()], { borrowedOn: '' }),
  { items: [{ equipment: 9, borrowers: [{ member: 3, quantity: 4 }] }, { equipment: 8, borrowers: [{ member: 1, quantity: 1 }] }], borrowed_on: null }, 'numbers as numbers; every kind is one item')
assert.ok(!('due_date' in lendBody([kind()], { borrowedOn: today }))); n++
eq(lendSummary([kind()]), '2 items recorded as borrowed by 2 members.', 'the message')
eq(lendSummary([kind({ picked: [{ member: 1, quantity: 1 }] })]), '1 item recorded as borrowed by 1 member.', 'singular message')
eq(lendSummary([kind(), pump()]), '3 items recorded as borrowed by 2 members.', 'a member counted once even with two kinds')

console.log(`ok - ${n} assertions`)
