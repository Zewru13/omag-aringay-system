import assert from 'node:assert/strict'

const { lendManyProblem, lendManyBody, lendManySummary, unitsPicked } = await import(new URL('../src/utils/lendMany.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const today = '2026-10-27'
const good = { equipment: 7, picked: [{ member: 1, quantity: 2 }, { member: 2, quantity: '1' }], available: 5, borrowedOn: today, dueDate: '', today }

eq(unitsPicked(good.picked), 3, 'units chosen (typed text counts)')
eq(unitsPicked([]), 0, 'none chosen')
eq(lendManyProblem(good), '', 'a complete choice')
eq(lendManyProblem({ ...good, equipment: '' }), 'Choose the equipment.', 'equipment needed')
eq(lendManyProblem({ ...good, picked: [] }), 'Choose at least one member who borrowed it.', 'a member is needed')
eq(lendManyProblem({ ...good, picked: [{ member: 1, quantity: '' }] }), 'Every chosen member needs a whole number of units, 1 or more.', 'units needed')
eq(lendManyProblem({ ...good, picked: [{ member: 1, quantity: 0 }] }), 'Every chosen member needs a whole number of units, 1 or more.', 'zero units')
eq(lendManyProblem({ ...good, picked: [{ member: 1, quantity: 1.5 }] }), 'Every chosen member needs a whole number of units, 1 or more.', 'whole units only')
eq(lendManyProblem({ ...good, available: 2 }), 'Only 2 units available, but 3 chosen.', 'not more than available')
eq(lendManyProblem({ ...good, available: 1, picked: [{ member: 1, quantity: 2 }] }), 'Only 1 unit available, but 2 chosen.', 'singular')
eq(lendManyProblem({ ...good, available: 3 }), '', 'exactly what is available')
eq(lendManyProblem({ ...good, borrowedOn: '' }), 'Enter the date borrowed.', 'date borrowed needed')
eq(lendManyProblem({ ...good, borrowedOn: '2026-10-28' }), 'The date borrowed cannot be in the future.', 'not in the future')
eq(lendManyProblem({ ...good, borrowedOn: '2026-10-01' }), '', 'a past date is fine (reporting something that already happened)')
eq(lendManyProblem({ ...good, dueDate: '2026-10-26' }), 'The return-by date cannot be before the date borrowed.', 'return-by after borrowed')
eq(lendManyProblem({ ...good, dueDate: today }), '', 'return-by the same day')

eq(lendManyBody(good.picked, { dueDate: '2026-11-05', borrowedOn: '2026-10-20' }),
  { borrowers: [{ member: 1, quantity: 2 }, { member: 2, quantity: 1 }], due_date: '2026-11-05', borrowed_on: '2026-10-20' }, 'the request body')
eq(lendManyBody([{ member: '3', quantity: '4' }], { dueDate: '', borrowedOn: today }), { borrowers: [{ member: 3, quantity: 4 }], due_date: null, borrowed_on: today }, 'numbers as numbers, no return-by sent as null')
eq(lendManySummary('Hand Tractor', good.picked), '2 members, 3 units of Hand Tractor recorded as borrowed.', 'the message')
eq(lendManySummary('Sprayer', [{ member: 1, quantity: 1 }]), '1 member, 1 unit of Sprayer recorded as borrowed.', 'singular message')

console.log(`ok - ${n} assertions`)
