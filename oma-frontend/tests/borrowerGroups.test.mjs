import assert from 'node:assert/strict'

const { groupLoansByBorrower, loanMatches, availableAgainText } = await import(new URL('../src/utils/borrowerGroups.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

let nextId = 1
const loan = (member, equipment, status, extra = {}) => ({
  id: nextId++, member_id: member.id, member_name: member.name, equipment_name: equipment, quantity: 1, status, overdue: false, ...extra,
})
const ana = { id: 1, name: 'Ana Cruz' }
const ben = { id: 2, name: 'Ben Reyes' }
const names = (groups) => groups.map((g) => g.name)

// ── one row per person ──────────────────────────────────────────────────────
const loans = [
  loan(ana, 'Water pump', 'REQUESTED'),
  loan(ben, 'Sprayer', 'BORROWED'),
  loan(ana, 'Tiller', 'BORROWED'),
  loan(ana, 'Hand cart', 'RETURNED'),
]
const groups = groupLoansByBorrower(loans)
eq(names(groups), ['Ana Cruz', 'Ben Reyes'], 'three loans of one person are one row')
eq(groups[0].loans.map((l) => l.equipment_name), ['Water pump', 'Tiller', 'Hand cart'], 'her items keep their order, closed ones last')
eq(groups[1].loans.length, 1, 'the other person has one item')
eq(groupLoansByBorrower([]), [], 'nothing borrowed')
eq(groupLoansByBorrower(undefined), [], 'a missing list is tolerated')

// the same name with different ids are two people; no id falls back to the name
eq(names(groupLoansByBorrower([loan({ id: 7, name: 'Sam Lee' }, 'Pump', 'BORROWED'), loan({ id: 8, name: 'Sam Lee' }, 'Cart', 'BORROWED')])), ['Sam Lee', 'Sam Lee'], 'same name, different people')
eq(groupLoansByBorrower([{ id: 90, member_name: 'No Id', equipment_name: 'A', quantity: 1, status: 'BORROWED' }, { id: 91, member_name: 'No Id', equipment_name: 'B', quantity: 1, status: 'BORROWED' }]).length, 1, 'no id: grouped by name')

// ── what each row says ──────────────────────────────────────────────────────
eq(groups[0].counts, { requested: 1, returnPending: 0, overdue: 0, borrowed: 1, earlier: 1 }, 'her counts')
eq(groups[0].summary, '1 requested · 1 borrowed · 1 earlier', 'her summary')
eq(groups[1].summary, '1 borrowed', 'his summary')

const mixed = groupLoansByBorrower([
  loan(ana, 'A', 'REQUESTED'), loan(ana, 'B', 'REQUESTED'),
  loan(ana, 'C', 'BORROWED', { overdue: true }), loan(ana, 'D', 'RETURN_PENDING'), loan(ana, 'E', 'BORROWED'),
])[0]
eq(mixed.counts, { requested: 2, returnPending: 1, overdue: 1, borrowed: 1, earlier: 0 }, 'an overdue loan counts as overdue, not as borrowed')
eq(mixed.summary, '2 requested · 1 return pending · 1 overdue · 1 borrowed', 'summary order: what needs a decision first')

eq(groupLoansByBorrower([loan(ana, 'A', 'RETURNED'), loan(ana, 'B', 'REJECTED')])[0].summary, '2 earlier', 'only closed loans')

// ── who needs attention comes first ─────────────────────────────────────────
const order = groupLoansByBorrower([
  loan(ben, 'Sprayer', 'BORROWED'),
  loan(ana, 'Pump', 'REQUESTED'),
  loan({ id: 3, name: 'Cy Dela Cruz' }, 'Cart', 'RETURN_PENDING'),
  loan({ id: 4, name: 'Di Lopez' }, 'Tiller', 'BORROWED'),
])
eq(names(order), ['Ana Cruz', 'Cy Dela Cruz', 'Ben Reyes', 'Di Lopez'], 'a waiting request or return first; otherwise as the list came')
eq(order.map((g) => g.needsAction), [true, true, false, false], 'needsAction')

// ── filters apply to the loans (a person shows if one of their loans matches) ─
const fl = [loan(ana, 'Water pump', 'BORROWED', { overdue: true }), loan(ana, 'Tiller', 'REQUESTED'), loan(ben, 'Water pump', 'RETURNED')]
eq(fl.filter((l) => loanMatches(l, {})).length, 3, 'no filter keeps all')
eq(fl.filter((l) => loanMatches(l, { status: 'Requested' })).map((l) => l.equipment_name), ['Tiller'], 'status filter')
eq(fl.filter((l) => loanMatches(l, { status: 'Borrowed' })).length, 1, 'an overdue loan is still a Borrowed loan')
eq(fl.filter((l) => loanMatches(l, { overdue: 'Overdue only' })).length, 1, 'overdue filter')
eq(fl.filter((l) => loanMatches(l, { equipment: 'Water pump' })).length, 2, 'equipment filter')
eq(fl.filter((l) => loanMatches(l, { status: 'Returned', equipment: 'Water pump' })).map((l) => l.member_name), ['Ben Reyes'], 'filters combine')
eq(fl.filter((l) => loanMatches(l, { status: '', overdue: '', equipment: '' })).length, 3, 'empty values mean all')

// ── the message after a return ──────────────────────────────────────────────
eq(availableAgainText('Water pump', [{ condition: 'Good', quantity: 2 }, { condition: 'Broken', quantity: 1 }]), '2 × Water pump are available again.', 'good units are available again')
eq(availableAgainText('Sprayer', [{ condition: 'Good', quantity: 1 }]), '1 × Sprayer is available again.', 'one unit')
eq(availableAgainText('Cart', [{ condition: 'Broken', quantity: 2 }]), '', 'nothing came back Good: no claim')
eq(availableAgainText('Cart', []), '', 'no breakdown: no claim')

console.log(`ok - ${n} assertions`)
