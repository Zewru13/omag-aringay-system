import assert from 'node:assert/strict'

const {
  makeParcelRow, makeCropRow, makeMachineryRow, addImportedCrops, canSkipSchedule, toggleClassification, cropLabel, machineryLabel,
  rowProblem, cropProblem, machineryProblem, validateRows, duplicateNumberProblems, parcelPayload, cropPayload, machineryPayload,
  buildPayload, pcicUploads, serverErrorsToMessages, PERENNIAL_CROPS, cropsAreaUsed, cropCapacity, cropAreaProblems,
} = await import(new URL('../src/pages/Farmers/parcelRows.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const ok = (id = 1, over = {}) => ({ ...makeParcelRow(id), area_hectares: '1.5', barangay: 'Alaska', ...over })
const crop = (over = {}) => ({ ...makeCropRow(1), area_hectares: '1', ...over })
const NO = '01-33-02-005-001-02-003'

// ── blank rows
eq(makeParcelRow(7)._id, 7, 'parcel row id')
eq(makeParcelRow(1).classifications, [], 'no classifications yet')
eq(makeParcelRow(1).land_ownership, 'Owner', 'owner by default')
eq(makeCropRow(3).crop_name, 'Palay (Rice)', 'crop default')
eq(makeMachineryRow(3).quantity, '1', 'machinery default')

// ── ticking classifications
eq(toggleClassification([], 'Organic Farm', true), ['Organic Farm'], 'tick the first')
eq(toggleClassification(['Organic Farm'], 'Organic Farm', true), ['Organic Farm'], 'ticking twice adds nothing')
eq(toggleClassification(['Organic Farm', 'Within Ancestral Domain'], 'Organic Farm', false), ['Within Ancestral Domain'], 'un-tick')
eq(toggleClassification(undefined, 'Organic Farm', true), ['Organic Farm'], 'nothing yet')

// ── labels and the perennial rule
eq(cropLabel({ crop_name: 'Other', crop_name_other: 'Dragon fruit' }), 'Dragon fruit', 'other crop label')
eq(cropLabel({ crop_name: 'Onion' }), 'Onion', 'crop label')
eq(machineryLabel({ machinery_type: 'Other', machinery_type_other: 'Drone' }), 'Drone', 'other machinery label')
assert.ok(PERENNIAL_CROPS.includes('Banana (Saging)')); n++
eq(canSkipSchedule({ crops: [crop({ crop_name: 'Mango', is_main_crop: true })] }), true, 'perennial main crop')
eq(canSkipSchedule({ crops: [crop({ crop_name: 'Mango', is_main_crop: false })] }), false, 'perennial but not main')
eq(canSkipSchedule({ crops: [] }), false, 'no crops')

// ── what is wrong with a row
eq(rowProblem(ok()), '', 'a good row')
eq(rowProblem(ok(1, { area_hectares: '' })), 'enter the area (ha)', 'area needed')
eq(rowProblem(ok(1, { area_hectares: '0' })), 'enter the area (ha)', 'zero area')
eq(rowProblem(ok(1, { barangay: '' })), 'choose the barangay', 'barangay needed')
assert.match(rowProblem(ok(1, { tax_declaration_number: '01-002' })), /18 digits/); n++
assert.match(rowProblem(ok(1, { tax_declaration_number: '01-002-00005-2023-0142' })), /parcel number is required/); n++
eq(rowProblem(ok(1, { tax_declaration_number: '01-002-00005-2023-0142', parcel_number: NO })), '', 'tax dec with a parcel number')
assert.match(rowProblem(ok(1, { land_ownership: 'Tenant' })), /land owner name/); n++
eq(rowProblem(ok(1, { land_ownership: 'Lessee', land_owner_name: 'Juan' })), '', 'lessee with an owner name')
assert.match(rowProblem(ok(1, { land_ownership: 'Tenant', land_owner_name: 'Juan', land_owner_rsbsa_number: '1'.repeat(25) })), /RSBSA/); n++
eq(rowProblem(ok(1, { crops: [crop()] })), '', 'a good crop')
eq(rowProblem(ok(1, { crops: [crop(), crop({ area_hectares: '' })] })), 'crop 2: enter the crop area', 'crop area needed')
eq(cropProblem(crop({ crop_name: 'Other', crop_name_other: ' ' })), 'type the crop name', 'other crop needs a name')
eq(cropProblem(crop({ pcic: { insured: true, file: null, url: '' } })), 'Upload a photo of the PCIC insurance form.', 'PCIC needs a photo')
eq(cropProblem(crop({ number_of_trees: '-2' })), 'the number of trees cannot be negative', 'trees')
eq(rowProblem(ok(1, { crops: [crop({ is_main_crop: true }), crop({ is_main_crop: true })] })), 'only one crop can be the main crop', 'two main crops')
eq(machineryProblem({ machinery_type: 'Hand Tractor', quantity: '0', ownership: 'Owned' }), 'enter a quantity of at least 1', 'machinery quantity')
eq(machineryProblem({ machinery_type: 'Other', machinery_type_other: '', quantity: '1' }), 'type the machinery name', 'other machinery')
eq(rowProblem(ok(1, { machinery: [makeMachineryRow(1)] })), '', 'good machinery')
eq(rowProblem(ok(1, { machinery: [{ ...makeMachineryRow(1), quantity: '' }] })), 'machinery 1: enter a quantity of at least 1', 'machinery in a row')

// ── how much land the crops may use
const five = (over = {}) => ok(1, { area_hectares: '5', ...over })
eq(cropsAreaUsed(five({ crops: [crop({ area_hectares: '3' }), crop({ area_hectares: '1.5' })] })), 4.5, 'area used so far')
eq(cropsAreaUsed(five()), 0, 'no crops use nothing')
eq(cropCapacity(five()), 5, 'one cropping a year: the parcel area')
eq(cropCapacity(five({ cropping_schedule: 'Double Cropping' })), 10, 'double cropping: twice the area')
eq(cropCapacity(five({ cropping_schedule: 'Triple Cropping' })), 15, 'triple cropping: three times the area')
eq(cropCapacity(five({ cropping_schedule: 'Triple Cropping', crops: [crop({ crop_name: 'Mango', is_main_crop: true })] })), 5, 'a tree main crop has no schedule')
eq(cropAreaProblems(five({ crops: [crop({ area_hectares: '3' }), crop({ area_hectares: '2' })] })), ['', ''], 'crops that exactly fill the parcel')
eq(cropAreaProblems(five({ crops: [crop({ area_hectares: '5.5' })] })), ['a crop cannot be bigger than its parcel (5.5 ha crop, 5 ha parcel)'], 'one crop too big')
eq(cropAreaProblems(five({ crops: [crop({ area_hectares: '3' }), crop({ area_hectares: '2.5' })] })), ['', 'the crops would come to 5.5 ha, more than the 5 ha this parcel allows'], 'the crop that tips the total over')
eq(cropAreaProblems(five({ cropping_schedule: 'Double Cropping', crops: [crop({ area_hectares: '5' }), crop({ area_hectares: '4' })] })), ['', ''], 'double cropping may use twice the area')
eq(cropAreaProblems(five({ cropping_schedule: 'Double Cropping', crops: [crop({ area_hectares: '6' })] })).length, 1, 'still one message per crop')
assert.match(cropAreaProblems(five({ cropping_schedule: 'Triple Cropping', crops: [crop({ area_hectares: '6' })] }))[0], /bigger than its parcel/); n++
eq(cropAreaProblems(ok(1, { area_hectares: '', crops: [crop({ area_hectares: '9' })] })), [''], 'no parcel area yet: nothing to compare with')
eq(cropAreaProblems(five({ crops: [crop({ area_hectares: '0.1' }), crop({ area_hectares: '0.2' }), crop({ area_hectares: '4.7' })] })), ['', '', ''], 'decimals add up without float drift')
eq(rowProblem(five({ crops: [crop({ area_hectares: '5.5' })] })), 'crop 1: a crop cannot be bigger than its parcel (5.5 ha crop, 5 ha parcel)', 'the row cannot be saved')
eq(rowProblem(five({ crops: [crop({ area_hectares: '3' }), crop({ area_hectares: '2.5' })] })), 'crop 2: the crops would come to 5.5 ha, more than the 5 ha this parcel allows', 'the total is named')
eq(rowProblem(five({ crops: [crop({ area_hectares: '3' }), crop({ area_hectares: '2' })] })), '', 'crops that fit')

// ── the whole form
eq(validateRows([ok(1), ok(2)]), {}, 'all fine')
eq(validateRows([ok(1), ok(2, { barangay: '' })]), { 2: 'Parcel 2: choose the barangay.' }, 'the second row is named')
eq(duplicateNumberProblems([ok(1, { parcel_number: NO }), ok(2, { parcel_number: NO }), ok(3)]), { 2: `parcel number ${NO} is already used by parcel 1` }, 'duplicate number')
eq(validateRows([ok(1, { parcel_number: NO }), ok(2, { parcel_number: NO })]), { 2: `Parcel 2: parcel number ${NO} is already used by parcel 1.` }, 'duplicate in the form')
eq(duplicateNumberProblems([ok(1), ok(2)]), {}, 'blank numbers never clash')

// ── what is sent
eq(cropPayload(crop({ crop_name: 'Palay (Rice)', area_hectares: '2.5', quantity_of_seeds_used: '40', number_of_trees: '9', is_main_crop: true })), {
  crop_name: 'Palay (Rice)', crop_name_other: '', area_hectares: 2.5, is_main_crop: true, variety_used: '', seed_source: 'Certified Seed',
  quantity_of_seeds_used: 40, seeds_unit: 'kg', number_of_trees: null, has_pcic_insurance: false,
}, 'crop payload: trees only for tree crops, numbers as numbers')
eq(cropPayload(crop({ crop_name: 'Mango', number_of_trees: '12' })).number_of_trees, 12, 'tree crop keeps its trees')
eq(cropPayload(crop({ crop_name: 'Other', crop_name_other: 'Dragon fruit' })).crop_name_other, 'Dragon fruit', 'other crop name')
eq(cropPayload(crop({ crop_name: 'Onion', crop_name_other: 'stale' })).crop_name_other, '', 'stale other name dropped')
eq(cropPayload(crop({ pcic: { insured: true, file: {}, url: '' } })).has_pcic_insurance, true, 'PCIC flag')
eq(machineryPayload({ _uid: 1, machinery_type: 'Other', machinery_type_other: 'Drone', quantity: '2', ownership: 'Rented' }),
  { machinery_type: 'Other', machinery_type_other: 'Drone', quantity: 2, ownership: 'Rented' }, 'machinery payload')
const sent = parcelPayload(ok(1, {
  parcel_number: NO, land_ownership: 'Owner', land_owner_name: 'stale', land_owner_rsbsa_number: 'stale', farm_type: 'Irrigated',
  cropping_schedule: 'Double Cropping', classifications: ['Organic Farm'], crops: [crop()], machinery: [makeMachineryRow(1)],
}))
eq([sent.parcel_number, sent.area_hectares, sent.barangay, sent.farm_type, sent.cropping_schedule, sent.classifications],
  [NO, 1.5, 'Alaska', 'Irrigated', 'Double Cropping', ['Organic Farm']], 'parcel payload')
eq([sent.land_owner_name, sent.land_owner_rsbsa_number], ['', ''], 'an owner parcel sends no land owner')
eq([sent.crops.length, sent.machinery.length], [1, 1], 'nested rows sent')
eq(parcelPayload(ok(1, { land_ownership: 'Tenant', land_owner_name: 'Juan', land_owner_rsbsa_number: '01-33-02-014-058212' })).land_owner_name, 'Juan', 'tenant keeps the owner')
eq(parcelPayload(ok(1, { cropping_schedule: 'Double Cropping', crops: [crop({ crop_name: 'Mango', is_main_crop: true })] })).cropping_schedule, '', 'perennial main crop: no schedule')
eq(buildPayload([ok(1), ok(2)]).length, 2, 'one entry per row')
assert.ok(!('_id' in sent) && !('_uid' in sent.crops[0])); n++

// ── PCIC photos
const file = { name: 'form.jpg' }
const rows = [ok(1, { crops: [crop({ pcic: { insured: true, file, url: '' } }), crop({ crop_name: 'Onion' })] }), ok(2, { crops: [crop({ crop_name: 'Garlic', pcic: { insured: true, file, url: '' } })] })]
eq(pcicUploads(rows, [{ crop_ids: [11, 12] }, { crop_ids: [21] }]), [
  { cropId: 11, pcic: { insured: true, file, url: '' }, label: 'Palay (Rice)' },
  { cropId: 21, pcic: { insured: true, file, url: '' }, label: 'Garlic' },
], 'photos pair with the ids the server gave')
eq(pcicUploads(rows, undefined), [], 'no answer, nothing to upload')

// ── imported crops
const imported = addImportedCrops([crop({ _uid: 1, is_main_crop: true })], [{ crop_name: 'Onion', area_hectares: 0.5, is_main_crop: true, quantity_of_seeds_used: null, number_of_trees: null }], 100)
eq(imported.map((c) => [c.crop_name, c.is_main_crop, c.area_hectares, c._uid]), [['Palay (Rice)', false, '1', 1], ['Onion', true, '0.5', 100]], 'a main crop in the file replaces the old one')
eq(addImportedCrops([], [], 1), [], 'an empty file adds nothing')

// ── the server's answer, mapped onto the rows
eq(serverErrorsToMessages([{}, { area_hectares: ['A valid number is required.'], crops: [{}, { area_hectares: ['The crop area must be more than 0.'] }], machinery: [{ quantity: ['The quantity must be at least 1.'] }] }, { parcel_number: ['This farmer already has parcel X.'] }],
  [ok(1), ok(2), ok(3)]), {
  2: 'Parcel 2: area hectares: A valid number is required. · crop 2 area hectares: The crop area must be more than 0. · machinery 1 quantity: The quantity must be at least 1.',
  3: 'Parcel 3: parcel number: This farmer already has parcel X.',
}, 'server errors')
eq(serverErrorsToMessages([{ non_field_errors: ['Each parcel must be an object.'] }], [ok(1)]), { 1: 'Parcel 1: Each parcel must be an object.' }, 'non-field error')
eq(serverErrorsToMessages(undefined, [ok(1)]), {}, 'no errors')

console.log(`parcelRows: ${n} checks passed`)
