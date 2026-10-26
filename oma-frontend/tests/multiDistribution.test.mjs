import assert from 'node:assert/strict'

const {
  makeDistributionRow, withAssistanceType, typeName, quantityText, rowProblem, repeatedProblems, validateRows, distributionPayload,
  eligibleIds, reviewTotals, outcomeTotals, MAX_DISTRIBUTION_ROWS,
} = await import(new URL('../src/pages/AssistanceManagement/multiDistribution.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const today = '2026-10-27'
const org = (id, name = `Org ${id}`) => ({ id, name, barangay: 'Alaska' })
const ready = (id, over = {}) => ({ ...makeDistributionRow(id, today), org: org(id), assistance_type: 'Seeds', quantity: '2 sacks', ...over })

// ── blank rows
const blank = makeDistributionRow(1, today)
eq([blank._id, blank.org, blank.assistance_type, blank.date_given, blank.source_agencies], [1, null, '', today, []], 'a blank row starts today with nothing chosen')
eq(MAX_DISTRIBUTION_ROWS, 30, 'the most rows at once')
const copy = makeDistributionRow(2, today, { ...ready(1, { source_agencies: ['DA'], date_given: '2026-11-02', description: 'Wet season', equipment_type: 'Tiller' }) })
eq([copy.org, copy.assistance_type, copy.quantity, copy.source_agencies, copy.date_given, copy.description, copy.equipment_type], [null, 'Seeds', '2 sacks', ['DA'], '2026-11-02', 'Wet season', 'Tiller'], 'a copied row keeps the assistance but needs its own organization')
const sources = ['DA']
const copied = makeDistributionRow(3, today, { ...ready(1), source_agencies: sources })
copied.source_agencies.push('LGU')
eq(sources, ['DA'], 'a copy does not share the agency list')

// ── changing the type
const typed = withAssistanceType(ready(1, { cash_amount: '50', training_duration_days: '2', equipment_type: 'x', seed_type: 'y', fertilizer_type: 'z' }), 'Cash Assistance')
eq([typed.assistance_type, typed.quantity, typed.cash_amount, typed.training_duration_days, typed.equipment_type, typed.seed_type, typed.fertilizer_type], ['Cash Assistance', '', '', '', '', '', ''], 'the old type leaves nothing behind')
eq(typeName(ready(1, { assistance_type: 'Other', assistance_type_other: '  Tools  ' })), 'Tools', 'Other uses its text')
eq(typeName(ready(1)), 'Seeds', 'a listed type')
eq(quantityText(ready(1, { assistance_type: 'Cash Assistance', cash_amount: '500' })), '₱500 per head', 'cash')
eq(quantityText(ready(1, { assistance_type: 'Cash Assistance', cash_amount: '' })), '', 'no amount yet')
eq(quantityText(ready(1, { assistance_type: 'Training', quantity: 'stale' })), '', 'training has a duration, not a quantity')
eq(quantityText(ready(1)), '2 sacks', 'a quantity')

// ── what is wrong with a row
eq(rowProblem(ready(1), { today }), '', 'a complete row')
eq(rowProblem(ready(1, { org: null }), { today }), 'choose the organization', 'organization needed')
eq(rowProblem(ready(1, { assistance_type: '' }), { today }), 'choose the assistance type', 'type needed')
eq(rowProblem(ready(1, { assistance_type: 'Other', assistance_type_other: ' ' }), { today }), 'say what the assistance type is', 'Other needs text')
eq(rowProblem(ready(1, { date_given: '' }), { today }), 'choose the date the assistance is given', 'date needed')
eq(rowProblem(ready(1, { date_given: '2026-10-26' }), { today }), 'assistance can only be recorded for today or a future date', 'not in the past')
eq(rowProblem(ready(1, { date_given: '2026-12-01' }), { today }), '', 'a future date schedules it')
eq(rowProblem(ready(1, { assistance_type: 'Cash Assistance', cash_amount: '0' }), { today }), 'enter the cash amount per member', 'cash needs an amount')
eq(rowProblem(ready(1, { assistance_type: 'Cash Assistance', cash_amount: '250.50' }), { today }), '', 'cash with an amount')
eq(rowProblem(ready(1, { assistance_type: 'Training', training_duration_days: '' }), { today }), 'enter a valid training duration (1-3 days)', 'training needs days')
eq(rowProblem(ready(1, { assistance_type: 'Training', training_duration_days: '4' }), { today }), 'enter a valid training duration (1-3 days)', 'training 1 to 3 days')
eq(rowProblem(ready(1, { assistance_type: 'Training', training_duration_days: '2' }), { today }), '', 'training with days')

// ── the whole table
eq(validateRows([ready(1), ready(2)], { today }), {}, 'all fine')
eq(validateRows([ready(1), ready(2, { org: null })], { today }), { 2: 'Row 2: choose the organization.' }, 'the row is named')
eq(repeatedProblems([ready(1), ready(2, { org: org(1) })]), { 2: 'Org 1 already receives this assistance on this date in row 1' }, 'the same organization and assistance twice')
eq(repeatedProblems([ready(1), ready(2, { org: org(1), date_given: '2026-11-03' })]), {}, 'another date is another distribution')
eq(repeatedProblems([ready(1), ready(2, { org: org(1), assistance_type: 'Fertilizer' })]), {}, 'another assistance is another distribution')
eq(repeatedProblems([ready(1, { assistance_type: 'Other', assistance_type_other: 'Tools' }), ready(2, { org: org(1), assistance_type: 'Other', assistance_type_other: 'tools' })]), { 2: 'Org 1 already receives this assistance on this date in row 1' }, 'Other types compare by name')
eq(validateRows([ready(1), ready(2, { org: org(1) })], { today }), { 2: 'Row 2: Org 1 already receives this assistance on this date in row 1.' }, 'a repeat blocks the table')

// ── what is sent
eq(distributionPayload(ready(1, { source_agencies: ['DA'], description: 'x' }), { dryRun: true }), {
  assistance_type: 'Seeds', source_agencies: ['DA'], date_given: today, quantity: '2 sacks', description: 'x',
  training_duration_days: null, equipment_type: '', seed_type: '', fertilizer_type: '', dry_run: true,
}, 'a preview request')
eq(distributionPayload(ready(1), { memberIds: [3, 4] }).member_ids, [3, 4], 'the chosen members are sent with the real request')
assert.ok(!('dry_run' in distributionPayload(ready(1), { memberIds: [3] }))); n++
assert.ok(!('member_ids' in distributionPayload(ready(1), { dryRun: true }))); n++
eq(distributionPayload(ready(1, { assistance_type: 'Equipment', equipment_type: ' Hand Tractor ', quantity: '1' })).equipment_type, 'Hand Tractor', 'the kind of equipment, trimmed')
eq(distributionPayload(ready(1, { assistance_type: 'Training', training_duration_days: '2' })).training_duration_days, 2, 'training days as a number')

// ── the review
const preview = (...statuses) => ({ member_count: statuses.length, results: statuses.map((status, i) => ({ person_id: i + 1, status })) })
const previews = [preview('would_create', 'would_create', 'would_block'), preview('would_block'), preview('would_create')]
eq(eligibleIds(previews[0]), [1, 2], 'who can receive')
eq(eligibleIds(undefined), [], 'no preview')
eq(reviewTotals(previews, [new Set([1, 2]), new Set(), new Set([1])]), { organizations: 2, records: 3, blocked: 2 }, 'totals count only what is ticked')
eq(reviewTotals(previews, [new Set([1, 2, 3]), new Set([1]), new Set()]), { organizations: 1, records: 2, blocked: 2 }, 'a blocked member ticked does not count')
eq(reviewTotals([], []), { organizations: 0, records: 0, blocked: 0 }, 'nothing')

// ── the outcome
eq(outcomeTotals([{ results: [{ status: 'created' }, { status: 'created' }, { status: 'blocked' }] }, { results: [{ status: 'error' }, { status: 'created' }] }, { failed: 'Server said no.' }]),
  { organizations: 2, created: 3, blocked: 1, errors: 1, failed: 1 }, 'what happened across the organizations')
eq(outcomeTotals([]), { organizations: 0, created: 0, blocked: 0, errors: 0, failed: 0 }, 'no outcome')

console.log(`ok - ${n} assertions`)
