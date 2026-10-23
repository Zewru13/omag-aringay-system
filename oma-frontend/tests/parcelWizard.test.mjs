import assert from 'node:assert/strict'

const {
  STEPS, PERENNIAL_CROPS, TAX_DECLARATION_RE, validateStep, cropLabel, machineryLabel, parcelPayload, summarizeParcel, canSkipSchedule, cropPayload, machineryPayload, addImportedCrops, toggleClassification,
} = await import(new URL('../src/pages/Farmers/parcelWizard.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const base = () => ({
  parcel_number: '', area_hectares: '', land_ownership: 'Owner', land_owner_name: '', land_owner_rsbsa_number: '',
  tax_declaration_number: '', barangay: '', farm_type: '', classifications: [], cropping_schedule: '', crops: [], machinery: [],
  _cropArea: '',
})

// ── the five steps, in the order the registration form asks for them
eq(STEPS.map((s) => s.key), ['core', 'classification', 'crops', 'machinery', 'confirm'], 'step keys')
eq(STEPS.map((s) => s.label), ['Core Parcel Details', 'RSBSA Parcel Classification', 'Crops Grown', 'Agricultural Machinery', 'Confirm'], 'step labels')

// ── step 1: the required details
eq(validateStep('core', base()), 'Area is required.', 'area first')
eq(validateStep('core', { ...base(), area_hectares: '1.5' }), 'Barangay is required.', 'then barangay')
const core = { ...base(), area_hectares: '1.5', barangay: 'Alaska' }
eq(validateStep('core', core), '', 'minimum core is fine')
eq(validateStep('core', { ...core, tax_declaration_number: '01-002-0000' }), 'Tax declaration number needs all 18 digits: RR-MMM-BBBBB-YYYY-NNNN, e.g. 01-002-00005-2023-0142.', 'short tax dec')
eq(validateStep('core', { ...core, tax_declaration_number: '01-002-00005-2023-0142' }), 'Parcel Number is required when a Tax Declaration Number is provided.', 'tax dec needs the parcel number')
eq(validateStep('core', { ...core, tax_declaration_number: '01-002-00005-2023-0142', parcel_number: '01-33-02-005-001-02-003' }), '', 'tax dec with parcel number')
eq(validateStep('core', { ...core, land_ownership: 'Tenant' }), 'Land Owner Name is required for a Tenant or Lessee parcel.', 'tenant needs the owner')
eq(validateStep('core', { ...core, land_ownership: 'Lessee', land_owner_name: 'Juan Dela Cruz' }), '', 'lessee with owner')
eq(validateStep('core', { ...core, land_ownership: 'Tenant', land_owner_name: 'Juan', land_owner_rsbsa_number: '123456789012345678901' }),
  'Invalid RSBSA number. Type the digits only (up to 20); the dashes are added as you type.', 'bad owner RSBSA')
assert.ok(TAX_DECLARATION_RE.test('01-002-00005-2023-0142')); n++

// ── steps 2 and 4 have nothing required; step 3 only stops a crop that was typed but not added
eq(validateStep('classification', base()), '', 'classification is optional')
eq(validateStep('machinery', base()), '', 'machinery is optional')
eq(validateStep('crops', base()), '', 'crops are optional')
eq(validateStep('crops', { ...base(), _cropArea: '0.5' }), 'You typed a crop area but did not add the crop. Press "Add Crop to This Parcel", or clear the area.', 'crop typed, not added')

// ── names on screen
eq(cropLabel({ crop_name: 'Palay (Rice)' }), 'Palay (Rice)', 'crop name')
eq(cropLabel({ crop_name: 'Other', crop_name_other: 'Dragon fruit' }), 'Dragon fruit', 'other crop')
eq(machineryLabel({ machinery_type: 'Hand Tractor' }), 'Hand Tractor', 'machinery name')
eq(machineryLabel({ machinery_type: 'Other', machinery_type_other: 'Drone' }), 'Drone', 'other machinery')

// ── a perennial main crop has no cropping schedule
eq(canSkipSchedule({ crops: [{ crop_name: 'Mango', is_main_crop: true }] }), true, 'perennial main crop')
eq(canSkipSchedule({ crops: [{ crop_name: 'Mango', is_main_crop: false }, { crop_name: 'Onion', is_main_crop: true }] }), false, 'seasonal main crop')
eq(canSkipSchedule({ crops: [] }), false, 'no crops yet')
assert.ok(PERENNIAL_CROPS.includes('Banana (Saging)')); n++

// ── ticking and un-ticking classifications keeps each name once, in the order ticked
eq(toggleClassification([], 'Organic Farm', true), ['Organic Farm'], 'tick the first')
eq(toggleClassification(['Organic Farm'], 'Within Ancestral Domain', true), ['Organic Farm', 'Within Ancestral Domain'], 'tick another')
eq(toggleClassification(['Organic Farm'], 'Organic Farm', true), ['Organic Farm'], 'ticking twice adds nothing')
eq(toggleClassification(['Organic Farm', 'Within Ancestral Domain'], 'Organic Farm', false), ['Within Ancestral Domain'], 'un-tick')
eq(toggleClassification(undefined, 'Organic Farm', true), ['Organic Farm'], 'nothing yet')

// ── the request that saves the parcel
eq(parcelPayload({ ...core, parcel_number: '01-33-02-005-001-02-003', area_hectares: '2.50', farm_type: 'Irrigated', classifications: ['Organic Farm'] }), {
  parcel_number: '01-33-02-005-001-02-003', area_hectares: 2.5, land_ownership: 'Owner', land_owner_name: '', land_owner_rsbsa_number: '',
  tax_declaration_number: '', barangay: 'Alaska', farm_type: 'Irrigated', classifications: ['Organic Farm'], cropping_schedule: '',
}, 'parcel payload')

// ── crop and machinery rows are sent without the form's own bookkeeping
eq(cropPayload({ _uid: 5, pcic: { insured: true }, crop_name: 'Onion', area_hectares: 1 }), { crop_name: 'Onion', area_hectares: 1 }, 'crop payload')
eq(machineryPayload({ _uid: 6, machinery_type: 'Sprayer', quantity: 1, ownership: 'Owned' }), { machinery_type: 'Sprayer', quantity: 1, ownership: 'Owned' }, 'machinery payload')

// ── crops read from a file join the wizard's list; a main crop in the file replaces the main crop already there
const fileCrops = [
  { crop_name: 'Onion', crop_name_other: '', area_hectares: 1, is_main_crop: true, variety_used: '', seed_source: '', quantity_of_seeds_used: null, seeds_unit: '', number_of_trees: null },
  { crop_name: 'Garlic', crop_name_other: '', area_hectares: 0.5, is_main_crop: false, variety_used: '', seed_source: '', quantity_of_seeds_used: null, seeds_unit: '', number_of_trees: null },
]
const existing = [{ _uid: 1, crop_name: 'Palay (Rice)', is_main_crop: true, area_hectares: 2, pcic: { insured: true } }]
const merged = addImportedCrops(existing, fileCrops, 100)
eq(merged.map((c) => c.crop_name), ['Palay (Rice)', 'Onion', 'Garlic'], 'imported crops are added after the existing ones')
eq(merged.map((c) => c.is_main_crop), [false, true, false], 'the file main crop replaces the old one')
eq(merged.map((c) => c._uid), [1, 100, 101], 'imported crops get their own ids')
eq(merged[1].pcic, { insured: false, file: null, url: '' }, 'imported crops are not PCIC insured')
eq(addImportedCrops(existing, [fileCrops[1]], 5).map((c) => c.is_main_crop), [true, false], 'no main crop in the file leaves the old one')
eq(addImportedCrops([], [], 1), [], 'an empty file adds nothing')
eq(existing[0].is_main_crop, true, 'the old list is not changed in place')

// ── the confirmation page lists everything that will be saved
const full = {
  ...core, parcel_number: '01-33-02-005-001-02-003', area_hectares: '2.5', farm_type: 'Irrigated', cropping_schedule: 'Double Cropping',
  classifications: ['Organic Farm', 'Agrarian Reform Beneficiary'],
  crops: [{ crop_name: 'Palay (Rice)', area_hectares: 2, is_main_crop: true, variety_used: 'NSIC Rc 222', pcic: { insured: true } },
          { crop_name: 'Other', crop_name_other: 'Dragon fruit', area_hectares: 0.5, is_main_crop: false, variety_used: '', pcic: { insured: false } }],
  machinery: [{ machinery_type: 'Hand Tractor', quantity: 2, ownership: 'Owned' }],
}
const summary = summarizeParcel(full)
eq(summary.map((s) => s.title), ['Core Parcel Details', 'RSBSA Parcel Classification', 'Crops Grown', 'Agricultural Machinery'], 'summary sections')
eq(summary[0].rows.find(([k]) => k === 'Parcel number')[1], '01-33-02-005-001-02-003', 'summary parcel number')
eq(summary[0].rows.find(([k]) => k === 'Area (ha)')[1], '2.5', 'summary area')
eq(summary[0].rows.find(([k]) => k === 'Tax declaration number')[1], '—', 'blank tax dec')
eq(summary[1].rows.find(([k]) => k === 'Classification')[1], 'Organic Farm, Agrarian Reform Beneficiary', 'summary classification')
eq(summary[1].rows.find(([k]) => k === 'Cropping schedule')[1], 'Double Cropping', 'summary schedule')
eq(summary[2].rows, [['Palay (Rice)', '2 ha · Main crop · NSIC Rc 222 · PCIC insured'], ['Dragon fruit', '0.5 ha']], 'summary crops')
eq(summary[3].rows, [['Hand Tractor', 'Qty 2 · Owned']], 'summary machinery')
eq(summarizeParcel(base()).find((s) => s.title === 'Crops Grown').rows, [['No crops added', '']], 'no crops')
eq(summarizeParcel({ ...base(), land_ownership: 'Tenant', land_owner_name: 'Juan', land_owner_rsbsa_number: '01-33-02-014-058212' })[0].rows
  .filter(([k]) => /owner/i.test(k)).map(([k, v]) => `${k}: ${v}`),
  ['Land ownership: Tenant', 'Land owner: Juan', 'Land owner RSBSA: 01-33-02-014-058212'], 'tenant rows')

console.log(`parcelWizard: ${n} checks passed`)
