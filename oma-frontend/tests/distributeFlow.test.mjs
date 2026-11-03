import assert from 'node:assert/strict'

const {
  makeAssistanceForm, withAssistanceType, typeName, quantityText, assistanceFormProblem, sourceAgencies, organizationRequest, peopleRequest,
  eligibleIds, reviewTotals, outcomeTotals, personOutcomeTotals, reportRecords, toggleInMap, MAX_RECIPIENTS,
} = await import(new URL('../src/pages/AssistanceManagement/distributeFlow.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const today = '2026-10-27'
const form = (over = {}) => ({ ...makeAssistanceForm(today), assistance_type: 'Seeds', source_agencies: ['DA'], quantity_amount: '2', quantity_unit: 'sacks', ...over })

// ── the blank form
const blank = makeAssistanceForm(today)
eq([blank.assistance_type, blank.date_given, blank.source_agencies, blank.quantity_amount, blank.description], ['', today, [], '', ''], 'a blank form starts today with nothing chosen')
eq(MAX_RECIPIENTS, 300, 'the most recipients at once')

// ── changing the type
const typed = withAssistanceType(form({ cash_amount: '50', training_duration_days: '2', equipment_type: 'x', seed_type: 'y', fertilizer_type: 'z' }), 'Cash Assistance')
eq([typed.assistance_type, typed.quantity_amount, typed.cash_amount, typed.training_duration_days, typed.equipment_type, typed.seed_type, typed.fertilizer_type], ['Cash Assistance', '', '', '', '', '', ''], 'the old type leaves nothing behind')
eq(typeName(form({ assistance_type: 'Other', assistance_type_other: '  Tools  ' })), 'Tools', 'Other uses its text')
eq(typeName(form()), 'Seeds', 'a listed type')
eq(quantityText(form({ assistance_type: 'Cash Assistance', cash_amount: '500' })), '₱500 per head', 'cash')
eq(quantityText(form({ assistance_type: 'Cash Assistance', cash_amount: '' })), '', 'no amount yet')
eq(quantityText(form({ assistance_type: 'Training', quantity_amount: '9' })), '', 'training has a duration, not a quantity')
eq(quantityText(form()), '2 sacks', 'a quantity')

// ── what is wrong with the form
eq(assistanceFormProblem(form(), { today }), '', 'a complete form')
eq(assistanceFormProblem(form({ assistance_type: '' }), { today }), 'Choose the assistance type.', 'type needed')
eq(assistanceFormProblem(form({ assistance_type: 'Other', assistance_type_other: ' ' }), { today }), 'Say what the assistance type is.', 'Other needs text')
// the source agency, the quantity per recipient and the date are all required (an "Others" agency is typed out)
eq(assistanceFormProblem(form({ source_agencies: [] }), { today }), 'Choose the source agency.', 'source agency needed')
eq(assistanceFormProblem(form({ source_agencies: [], source_other_on: true, source_other: '  ' }), { today }), 'Type the other source agency.', 'Others needs text')
eq(assistanceFormProblem(form({ source_agencies: [], source_other_on: true, source_other: 'Brgy. Council' }), { today }), '', 'Others typed out is a source agency')
eq(assistanceFormProblem(form({ source_agencies: ['DA'], source_other_on: true, source_other: '' }), { today }), 'Type the other source agency.', 'Others ticked but empty')
eq(assistanceFormProblem(form({ quantity_amount: '' }), { today }), 'Enter the quantity per recipient.', 'quantity needed')
eq(assistanceFormProblem(form({ quantity_amount: '0' }), { today }), 'Enter a quantity of more than 0.', 'quantity above 0')
eq(assistanceFormProblem(form({ quantity_unit: '' }), { today }), 'Choose the unit of the quantity.', 'unit needed')
eq(assistanceFormProblem(form({ assistance_type: 'Cash Assistance', cash_amount: '10', quantity_amount: '' }), { today }), '', 'cash has no quantity box')
eq(assistanceFormProblem(form({ assistance_type: 'Training', training_duration_days: '2', quantity_amount: '' }), { today }), '', 'training has no quantity box')
eq(sourceAgencies(form({ source_agencies: ['DA', 'PCIC'], source_other_on: true, source_other: ' Brgy. Council ' })), ['DA', 'PCIC', 'Brgy. Council'], 'the typed agency joins the chosen ones')
eq(sourceAgencies(form({ source_agencies: ['DA'], source_other_on: false, source_other: 'ignored' })), ['DA'], 'unticked Others is ignored')
eq(sourceAgencies(form({ source_agencies: ['DA'], source_other_on: true, source_other: 'da' })), ['DA'], 'not repeated')
eq(organizationRequest(form({ source_agencies: ['DA'], source_other_on: true, source_other: 'Brgy. Council' })).source_agencies, ['DA', 'Brgy. Council'], 'sent with the request')
eq(assistanceFormProblem(form({ date_given: '' }), { today }), 'Choose the date the assistance is given.', 'date needed')
eq(assistanceFormProblem(form({ date_given: '2026-10-26' }), { today }), 'Assistance can only be recorded for today or a future date.', 'not in the past')
eq(assistanceFormProblem(form({ date_given: '2026-12-01' }), { today }), '', 'a future date schedules it')
eq(assistanceFormProblem(form({ assistance_type: 'Cash Assistance', cash_amount: '0' }), { today }), 'Enter the cash amount per member.', 'cash needs an amount')
eq(assistanceFormProblem(form({ assistance_type: 'Cash Assistance', cash_amount: '250.50' }), { today }), '', 'cash with an amount')
eq(assistanceFormProblem(form({ assistance_type: 'Training', training_duration_days: '' }), { today }), 'Enter a valid training duration (1-3 days).', 'training needs days')
eq(assistanceFormProblem(form({ assistance_type: 'Training', training_duration_days: '4' }), { today }), 'Enter a valid training duration (1-3 days).', 'training 1 to 3 days')
eq(assistanceFormProblem(form({ assistance_type: 'Training', training_duration_days: '2' }), { today }), '', 'training with days')

// ── what is sent to an organization
eq(organizationRequest(form({ source_agencies: ['DA'], description: 'x' }), { dryRun: true }), {
  assistance_type: 'Seeds', source_agencies: ['DA'], date_given: today, quantity: '2 sacks', description: 'x',
  training_duration_days: null, equipment_type: '', seed_type: '', fertilizer_type: '', item_type: '', dry_run: true,
}, 'an organization preview')
eq(organizationRequest(form(), { memberIds: [3, 4] }).member_ids, [3, 4], 'the chosen members go with the real request')
assert.ok(!('dry_run' in organizationRequest(form(), { memberIds: [3] }))); n++
assert.ok(!('member_ids' in organizationRequest(form(), { dryRun: true }))); n++
eq(organizationRequest(form({ assistance_type: 'Equipment', equipment_type: ' Hand Tractor ', quantity_amount: '1', quantity_unit: 'pcs' })).equipment_type, 'Hand Tractor', 'the kind of equipment, trimmed')
eq(organizationRequest(form({ assistance_type: 'Training', training_duration_days: '2' })).training_duration_days, 2, 'training days as a number')

// ── what is sent for selected people
eq(peopleRequest(form({ source_agencies: ['DA'], description: 'Wet season' }), { idsKey: 'farmer_ids', ids: [1, 2], descriptionKey: 'remarks' }), {
  assistance_type: 'Seeds', source_agencies: ['DA'], date_given: today, quantity: '2 sacks', remarks: 'Wet season',
  training_duration_days: null, equipment_type: '', seed_type: '', fertilizer_type: '', item_type: '', farmer_ids: [1, 2],
}, 'farmers: the notes go as remarks')
const fisher = peopleRequest(form({ assistance_type: 'Feed', description: 'Pond A' }), { idsKey: 'fisherfolk_ids', ids: [7], descriptionKey: 'description', dryRun: true, allowSeedFertilizer: false })
eq([fisher.fisherfolk_ids, fisher.description, fisher.dry_run, fisher.seed_type, 'remarks' in fisher], [[7], 'Pond A', true, '', false], 'fisherfolk: description, never a seed type, a preview')

// ── the review of organizations
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
eq(personOutcomeTotals([{ status: 'created' }, { status: 'created' }, { status: 'error' }]), { created: 2, errors: 1 }, 'what happened to the people')

// ── the picked recipients (a Map of id -> record, kept across pages of the table)
const picked = toggleInMap(new Map(), { id: 1, name: 'A' })
eq([...picked.keys()], [1], 'ticking adds')
eq([...toggleInMap(picked, { id: 2, name: 'B' }).keys()], [1, 2], 'a second one on another page is kept')
eq([...toggleInMap(picked, { id: 1 }).keys()], [], 'ticking again removes')
assert.ok(picked !== toggleInMap(picked, { id: 2 })); n++

// ── the printable report: only what was created
const results = [
  { status: 'created', record_id: 11, name: 'Ana Cruz', barangay: 'Alaska' },
  { status: 'blocked', name: 'Blocked Person', barangay: 'Basca' },
  { status: 'created', record_id: 12, name: 'Ben Dizon', barangay: 'Basca', organization_name: 'Basca Growers' },
]
const records = reportRecords(results, form({ source_agencies: ['DA'], quantity_amount: '1', quantity_unit: 'sack' }), { organizationName: 'Alaska Farmers' })
eq(records.map((r) => [r.id, r.name, r.barangay, r.assistance_type, r.quantity, r.organization_name]),
  [[11, 'Ana Cruz', 'Alaska', 'Seeds', '1 sack', 'Alaska Farmers'], [12, 'Ben Dizon', 'Basca', 'Seeds', '1 sack', 'Basca Growers']], 'created records only, with the organization')
eq([records[0].source_agencies, records[0].date_given], [['DA'], today], 'agencies and date')
eq(reportRecords([], form(), {}), [], 'nothing created, nothing to print')

console.log(`ok - ${n} assertions`)
