import assert from 'node:assert/strict'

const {
  CONDITIONS, REPAIRABLE, unitsSummary, validateBreakdown, defaultBreakdown, isOverdue, loanStatusLabel, openRequestCount, apiMessage, groupEquipment, allocateUnits,
} = await import(new URL('../src/utils/equipmentLoans.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── constants ────────────────────────────────────────────────────────────────
eq(CONDITIONS, ['Good', 'Needs Repair', 'Not Operational', 'Broken', 'Lost'], 'the five conditions')
eq(REPAIRABLE, ['Needs Repair', 'Not Operational', 'Broken'], 'what can be repaired')

// ── unitsSummary ─────────────────────────────────────────────────────────────
eq(unitsSummary({ quantity: 3, on_loan: 2, available: 1 }), { total: 3, available: 1, onLoan: 2 }, 'three units, two out')
eq(unitsSummary({ quantity: 4, on_loan: 0, available: 0, condition: 'Lost' }), { total: 4, available: 0, onLoan: 0 }, 'a lost line has none available')
eq(unitsSummary({}), { total: 0, available: 0, onLoan: 0 }, 'missing fields tolerated')
eq(unitsSummary(undefined), { total: 0, available: 0, onLoan: 0 }, 'a missing line tolerated')

// ── breakdown ────────────────────────────────────────────────────────────────
eq(defaultBreakdown(3), [{ condition: 'Good', quantity: 3 }], 'everything back Good')
eq(validateBreakdown([{ condition: 'Good', quantity: 2 }, { condition: 'Broken', quantity: 1 }], 3), { ok: true, message: '' }, 'an exact sum')
eq(validateBreakdown([{ condition: 'Good', quantity: 2 }], 3), { ok: false, message: 'The units must add up to 3 (now 2).' }, 'too few')
eq(validateBreakdown([{ condition: 'Good', quantity: 4 }], 3), { ok: false, message: 'The units must add up to 3 (now 4).' }, 'too many')
eq(validateBreakdown([{ condition: 'Good', quantity: 1.5 }, { condition: 'Broken', quantity: 1.5 }], 3).ok, false, 'decimals refused')
eq(validateBreakdown([{ condition: 'Good', quantity: -1 }, { condition: 'Broken', quantity: 4 }], 3).ok, false, 'negatives refused')
eq(validateBreakdown([{ condition: 'Shiny', quantity: 3 }], 3).ok, false, 'an unknown condition refused')
eq(validateBreakdown([], 3).ok, false, 'an empty list refused')
eq(validateBreakdown([{ condition: 'Good', quantity: '2' }, { condition: 'Lost', quantity: '1' }], 3).ok, true, 'typed text numbers accepted')
eq(validateBreakdown([{ condition: 'Good', quantity: '' }, { condition: 'Lost', quantity: 3 }], 3).ok, true, 'a blank part counts as zero')

// ── overdue ──────────────────────────────────────────────────────────────────
const today = '2026-10-10'
eq(isOverdue({ status: 'BORROWED', due_date: '2026-10-09' }, today), true, 'past the return-by date')
eq(isOverdue({ status: 'BORROWED', due_date: '2026-10-10' }, today), false, 'due today is not overdue')
eq(isOverdue({ status: 'BORROWED', due_date: '2026-10-11' }, today), false, 'not due yet')
eq(isOverdue({ status: 'BORROWED', due_date: null }, today), false, 'no return-by date')
eq(isOverdue({ status: 'RETURN_PENDING', due_date: '2026-10-01' }, today), true, 'a pending return can still be overdue')
eq(isOverdue({ status: 'RETURNED', due_date: '2026-10-01' }, today), false, 'a returned loan is never overdue')
eq(isOverdue({ status: 'REQUESTED', due_date: '2026-10-01' }, today), false, 'a request is never overdue')
eq(isOverdue(undefined, today), false, 'missing loan tolerated')

// ── labels and counts ────────────────────────────────────────────────────────
eq(['REQUESTED', 'BORROWED', 'RETURN_PENDING', 'RETURNED', 'REJECTED', 'CANCELLED'].map(loanStatusLabel),
  ['Requested', 'Borrowed', 'Return pending', 'Returned', 'Rejected', 'Cancelled'], 'every status')
eq(loanStatusLabel('WEIRD'), 'WEIRD', 'an unknown status shown as is')
eq(openRequestCount([{ status: 'REQUESTED' }, { status: 'BORROWED' }, { status: 'REQUESTED' }]), 2, 'open requests counted')
eq(openRequestCount(undefined), 0, 'missing list tolerated')

// ── server messages ──────────────────────────────────────────────────────────
eq(apiMessage({ response: { data: { detail: 'Only 2 units are available.' } } }, 'x'), 'Only 2 units are available.', 'detail shown')
eq(apiMessage({ response: { data: { breakdown: ['Bad part.'] } } }, 'x'), 'Bad part.', 'first field error shown')
eq(apiMessage({ response: { data: { quantity: 'Too many.' } } }, 'x'), 'Too many.', 'a string field error shown')
eq(apiMessage(new Error('offline'), 'Could not save.'), 'Could not save.', 'no response falls back')

// ── grouping lines of the same equipment ─────────────────────────────────────
const lines = [
  { id: 1, equipment_name: 'Water Pump', equipment_name_other: '', quantity: 2, condition: 'Good', on_loan: 1, available: 1 },
  { id: 2, equipment_name: 'Hand Tractor', equipment_name_other: '', quantity: 1, condition: 'Good', on_loan: 0, available: 1 },
  { id: 3, equipment_name: 'Water Pump', equipment_name_other: '', quantity: 1, condition: 'Broken', on_loan: 0, available: 0 },
  { id: 4, equipment_name: 'Other', equipment_name_other: 'Seed Drill', quantity: 1, condition: 'Good', on_loan: 0, available: 1 },
  { id: 5, equipment_name: 'Other', equipment_name_other: 'Plow', quantity: 2, condition: 'Lost', on_loan: 0, available: 0 },
]
const groups = groupEquipment(lines)
eq(groups.map((g) => g.label), ['Water Pump', 'Hand Tractor', 'Other — Seed Drill', 'Other — Plow'], 'one group per kind, first-seen order')
eq(groups[0].lines.map((l) => l.id), [1, 3], 'the lines of a kind, in condition order')
eq([groups[0].total, groups[0].onLoan, groups[0].available], [3, 1, 1], 'totals of the group')
eq(groups[0].summary, '3 units · 2 Good, 1 Broken', 'the summary names each condition')
eq(groups[1].summary, '1 unit · 1 Good', 'singular unit')
eq(groups[0].conditions, ['Good', 'Broken'], 'the conditions present, for filtering')
eq(groups[0].id, 'Water Pump|', 'a stable id from the kind')
eq(groupEquipment(undefined), [], 'missing list tolerated')
eq(groupEquipment([{ id: 9, equipment_name: 'Dryer', quantity: 1, condition: 'Lost', on_loan: 0, available: 0 }, { id: 8, equipment_name: 'Dryer', quantity: 2, condition: 'Good', on_loan: 0, available: 2 }])[0].lines.map((l) => l.condition), ['Good', 'Lost'], 'Good first whatever the order received')

// ── splitting a member's request over the lines that can supply it ──────────
const supply = [{ id: 1, available: 2 }, { id: 2, available: 1 }, { id: 3, available: 4 }]
eq(allocateUnits(supply, 1), [{ id: 1, quantity: 1 }], 'one unit comes from the first line')
eq(allocateUnits(supply, 3), [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }], 'spills over to the next line')
eq(allocateUnits(supply, 7), [{ id: 1, quantity: 2 }, { id: 2, quantity: 1 }, { id: 3, quantity: 4 }], 'uses every line when needed')
eq(allocateUnits(supply, 8), null, 'more than all lines can give')
eq(allocateUnits(supply, 0), null, 'zero units is not a request')
eq(allocateUnits([{ id: 1, available: 0 }, { id: 2, available: 2 }], 2), [{ id: 2, quantity: 2 }], 'lines with nothing are skipped')
eq(allocateUnits(undefined, 1), null, 'missing lines tolerated')

console.log(`ok - ${n} assertions`)
