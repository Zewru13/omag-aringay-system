import assert from 'node:assert/strict'
import fs from 'node:fs'

// Fisheries Disaster > Log Disaster for several fisherfolk: the pure rules (who is selected, the shared event's check, the request body).
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const { MAX_FISHERFOLK, togglePerson, removePerson, personLine, eventProblem, buildGroups, multiPayload } =
  await import(new URL('../src/pages/Monitoring/multiFisherfolkDisaster.js', import.meta.url).href)

const ann = { id: 1, full_name: 'Ann Cruz', barangay: 'Samara', rsbsa_number: '01-033-02-019-000001', fishr_number: '', extra: 'ignored' }
const ben = { id: 2, full_name: 'Ben Diaz', barangay: 'Basca', rsbsa_number: '', fishr_number: 'FR-2' }

// ── the multi-select: add, never twice, remove
eq(togglePerson([], ann), [{ id: 1, full_name: 'Ann Cruz', barangay: 'Samara', rsbsa_number: '01-033-02-019-000001', fishr_number: '' }], 'add keeps only what the form needs')
eq(togglePerson(togglePerson([], ann), ben).map((p) => p.id), [1, 2], 'a second fisherfolk is added after the first')
eq(togglePerson(togglePerson([], ann), ann), [], 'choosing the same fisherfolk again removes them')
eq(removePerson([ann, ben], 1).map((p) => p.id), [2], 'remove')
eq(removePerson([ann], 99).map((p) => p.id), [1], 'removing someone not selected changes nothing')
eq(personLine(ann), 'Ann Cruz · 01-033-02-019-000001 · Samara', 'name, registration number, barangay')
eq(personLine(ben), 'Ben Diaz · FR-2 · Basca', 'the FishR number when there is no RSBSA')
eq(personLine({ id: 3, full_name: 'Cy Lee' }), 'Cy Lee', 'only a name')

// ── the shared event
const ok = { date: '2026-11-01', type: 'Typhoon', typeOther: '', people: [ann] }
eq(eventProblem(ok, '2026-11-05'), '', 'a good event')
eq(eventProblem({ ...ok, people: [] }, '2026-11-05'), 'Choose at least one fisherfolk.', 'nobody chosen')
eq(eventProblem({ ...ok, date: '' }, '2026-11-05'), 'Date of occurrence is required.', 'no date')
eq(eventProblem({ ...ok, date: '2026-11-06' }, '2026-11-05'), 'Date of occurrence cannot be in the future.', 'a future date')
eq(eventProblem({ ...ok, date: '2026-11-05' }, '2026-11-05'), '', 'today is fine')
eq(eventProblem({ ...ok, type: 'Other', typeOther: '  ' }, '2026-11-05'), 'Please specify the disaster type.', 'Other needs its words')
eq(eventProblem({ ...ok, type: 'Other', typeOther: 'Oil spill' }, '2026-11-05'), '', 'Other with words')
eq(eventProblem({ ...ok, people: Array.from({ length: MAX_FISHERFOLK + 1 }, (_, i) => ({ id: i })) }, '2026-11-05'), `At most ${MAX_FISHERFOLK} fisherfolk can be logged at once.`, 'too many')

// ── each fisherfolk's own group
const losses = [{ stocking_record: 5, production_unit: 9, fingerlings_lost: 40, is_total_loss: false }]
eq(buildGroups([
  { person: ann, mode: 'stocks', stockLosses: losses, volume: '12.5', equipment: 'Nets' },
  { person: ben, mode: 'unlinked', stockLosses: losses, volume: '', equipment: '' },
]), [
  { fisherfolk: 1, stock_losses: losses, volume_lost_kg: 12.5, equipment_damaged: 'Nets' },
  { fisherfolk: 2, stock_losses: [] },
], 'stocks for one, "not linked" (no stocks) for the other; empty volume and equipment are left out')
eq(buildGroups([{ person: ann, mode: 'stocks', stockLosses: losses, volume: '0', equipment: '' }])[0].volume_lost_kg, 0, 'a volume of 0 is kept')

// ── the request: plain JSON, or a form with each fisherfolk's own photos once there are some (the details are in userPhotos.test.mjs)
const fields = { disaster_type: 'Typhoon', disaster_type_other_specify: '', date_of_occurrence: '2026-11-01', estimated_damage: 'Dikes overtopped' }
const groups = buildGroups([{ person: ann, mode: 'stocks', stockLosses: losses, volume: '', equipment: '' }])
eq(multiPayload({ fields, groups, photosByUser: {} }), { ...fields, fisherfolk_groups: groups }, 'no photos: JSON')
const file = new File(['x'], 'damage.png', { type: 'image/png' })
const form = multiPayload({ fields, groups, photosByUser: { 1: [{ file }] } })
eq(form instanceof FormData, true, 'photos: a form')
eq(form.get('disaster_type'), 'Typhoon', 'the shared fields are in it')
eq(JSON.parse(form.get('fisherfolk_groups')), groups, 'the groups travel as one JSON string')
eq(form.getAll('photos_1').length, 1, "the photo travels under its fisherfolk's own field")
eq(form.has('photos'), false, 'no shared photos field')
eq(form.has('disaster_type_other_specify'), true, 'an empty text field is still sent')

// ── the screen: a multi-select with removable chips, one panel per fisherfolk, one request, one atomic save
const modal = read('../src/pages/Monitoring/MultiFisherfolkDisasterModal.jsx')
eq(modal.includes('/fisheries/disaster-reports/multi/'), true, 'one request for everyone')
eq(modal.includes('FisherfolkMultiSelect') && modal.includes('FisherfolkDisasterPanel'), true, 'the multi-select and a panel per fisherfolk')
eq(modal.includes('eventProblem(') && modal.includes('buildGroups('), true, 'the shared rules are used')
const page = read('../src/pages/Monitoring/AdminDisasterPage.jsx')
eq(page.includes('MultiFisherfolkDisasterModal'), true, 'Admin > Fisheries Disaster > Log Disaster opens it')
eq(/ChoosePersonModal/.test(page), false, 'the one-fisherfolk chooser is gone from the page')
const select = read('../src/pages/Monitoring/FisherfolkMultiSelect.jsx')
eq(select.includes('/fisheries/fisherfolk/') && select.includes('aria-multiselectable'), true, 'search the fisherfolk registry; a multi-select list')
eq(select.includes('Remove ') , true, 'every chip can be removed')
// the form a fisherfolk uses for their own account is untouched
eq(read('../src/pages/Monitoring/FisherfolkStockDisasterModal.jsx').includes('/fisheries/disaster-reports/stocks/'), true, 'the single-fisherfolk form keeps its endpoint')

console.log(`ok - ${n} assertions`)
