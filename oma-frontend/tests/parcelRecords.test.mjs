import assert from 'node:assert/strict'

const {
  parcelLabel, cropCountLabel, directoryParams, noParcelParams, addCropState, recordActionKeys, ownerParcelFill, parcelProblem,
  addCropsLockedState,
  GROUP_OPTIONS, DEFAULT_GROUP, groupFilterParams, groupChildParams, groupSummary, groupHeading,
} = await import(new URL('../src/pages/CropInformation/parcelRecords.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── how a parcel is named on screen
eq(parcelLabel({ id: 7, parcel_number: '01-33-02-005-001-02-003' }), '01-33-02-005-001-02-003', 'parcel number')
eq(parcelLabel({ id: 7, parcel_number: '' }), 'Parcel #7', 'no parcel number yet')

// ── the crop count under a parcel
eq(cropCountLabel(0), 'No crops yet', 'none')
eq(cropCountLabel(1), '1 crop', 'one')
eq(cropCountLabel(4), '4 crops', 'many')
eq(cropCountLabel(undefined), 'No crops yet', 'unknown counts as none')

// ── the request for the parcel list: blanks are left out
eq(directoryParams({ search: ' Ana ', barangay: '', page: 2 }), { page: 2, search: 'Ana' }, 'filters')
eq(directoryParams({}), { page: 1 }, 'nothing typed')
eq(directoryParams({ pcic: 'insured', page: 2 }), { page: 2, pcic: 'insured' }, 'the PCIC filter is sent')
eq(directoryParams({ pcic: '' }), { page: 1 }, 'all PCIC sends nothing')
eq(directoryParams({ planted: { planted_from: '2026-05-01', planted_to: '2026-06-30' }, page: 2 }), { page: 2, planted_from: '2026-05-01', planted_to: '2026-06-30' }, 'the Date Planted range is sent')
eq(directoryParams({ planted: {} }), { page: 1 }, 'no range sends nothing')
eq(directoryParams({ barangay: 'Alaska', page: 3 }), { page: 3, barangay: 'Alaska' }, 'barangay only')

// ── group by / sort by
eq(GROUP_OPTIONS.map((o) => o.value), ['none', 'farmer', 'barangay', 'ownership'], 'group choices')
eq(DEFAULT_GROUP, 'none', 'no grouping by default')
eq(groupChildParams('farmer', { key: 'f12', id: 12 }), { farmer: 12 }, 'a farmer group opens onto ?farmer=')
eq(groupChildParams('barangay', { key: 'bAlaska', id: 'Alaska' }), { barangay: 'Alaska' }, 'a barangay group')
eq(groupChildParams('ownership', { key: 'oTenant', id: 'Tenant' }), { land_ownership: 'Tenant' }, 'an ownership group')
eq(groupChildParams('barangay', { key: 'b', id: '' }), null, 'a group with no value has nothing to open onto')
eq(groupChildParams('none', { id: 1 }), null, 'no grouping has no groups')
eq(groupSummary({ parcels: 2, area_hectares: 3.5, crops: 5 }), '2 parcels · 3.5 ha · 5 crops', 'summary')
eq(groupSummary({ parcels: 1, area_hectares: 0, crops: 0 }), '1 parcel · No crops yet', 'summary of an empty parcel')
eq(groupHeading('farmer', { name: 'Ben Dizon', barangay: 'Poblacion' }), 'Ben Dizon · Poblacion', 'farmer heading shows the home barangay')
eq(groupHeading('barangay', { name: 'Alaska', barangay: '' }), 'Alaska', 'barangay heading')

// ── the request for the crops that have no parcel on file (only the filters that apply to them)
eq(noParcelParams({ search: 'Ana', barangay: 'Alaska', farmStatus: 'Inactive' }), { farm_parcel: 'none', search: 'Ana', barangay: 'Alaska' }, 'no-parcel request')
eq(noParcelParams({}), { farm_parcel: 'none' }, 'no-parcel request, no filters')
eq(noParcelParams({ pcic: 'not_insured' }), { farm_parcel: 'none', pcic: 'not_insured' }, 'no-parcel request with the PCIC filter')
eq(noParcelParams({ planted: { planted_from: '2026-05-01' } }), { farm_parcel: 'none', planted_from: '2026-05-01' }, 'no-parcel request with the Date Planted range')

// ── "Add crop records" opens the Add Crop page with this parcel's farmer and parcel chosen
eq(
  addCropState({ id: 9, farmer: 4, rsbsa_number: '01-033-02-019-000001', barangay: 'Alaska', land_ownership: 'Tenant' }),
  { prefill: { farmerId: 4, rsbsa: '01-033-02-019-000001', parcel: { id: 9, barangay: 'Alaska', landOwnership: 'Tenant' } } },
  'add crop state',
)

// ── a crop's row actions: view and edit only (no delete), and no edit once harvested
eq(recordActionKeys({ status: 'Planted' }), ['view', 'edit', 'remarks'], 'planted')
eq(recordActionKeys({ status: 'Near Harvest' }), ['view', 'edit', 'remarks'], 'near harvest')
eq(recordActionKeys({ status: 'Harvested' }), ['view', 'remarks'], 'harvested is not editable')
assert.ok(!recordActionKeys({ status: 'Planted' }).includes('delete')); n++

// ── on the Add Crop page: a farmer with exactly one parcel gets it chosen for every row that has none
const owner = { id: 3, barangay: 'Poblacion', land_ownership: 'Owner' }
const blank = { farm_parcel: '', farm_location_barangay: '' }
eq(ownerParcelFill([owner], blank), { farm_parcel: '3', farm_location_barangay: 'Poblacion' }, 'single parcel fills the row')
eq(ownerParcelFill([owner], { farm_parcel: '8', farm_location_barangay: 'Basca' }), { farm_parcel: '8', farm_location_barangay: 'Basca' }, 'a chosen parcel is kept')
eq(ownerParcelFill([owner, { ...owner, id: 4 }], blank), blank, 'several parcels: the person chooses')
eq(ownerParcelFill([{ id: 5, barangay: 'Alaska', land_ownership: 'Lessee', land_owner_name: 'Pedro Reyes' }], { ...blank, farm_location_barangay: 'Basca' }),
  { farm_parcel: '5', farm_location_barangay: 'Basca' }, 'a typed barangay is kept')
eq(ownerParcelFill([], blank), blank, 'no parcels')

// ── the message when the farmer cannot get a crop yet
eq(parcelProblem({ farmerId: null, ready: false, parcels: [], rows: [] }), '', 'no farmer yet')
eq(parcelProblem({ farmerId: 1, ready: false, parcels: [], rows: [] }), '', 'parcels still loading')
eq(parcelProblem({ farmerId: 1, ready: true, parcels: [], rows: [{ farm_parcel: '' }] }),
  'This farmer has no farm parcel yet. Add a farm parcel first, then add the crop.', 'no parcel at all')
eq(parcelProblem({ farmerId: 1, ready: true, parcels: [owner, { ...owner, id: 4 }], rows: [{ farm_parcel: '3' }, { farm_parcel: '' }] }),
  'Row 2: choose the farm parcel this crop is grown on.', 'row without a parcel')
eq(parcelProblem({ farmerId: 1, ready: true, parcels: [owner, { ...owner, id: 4 }], rows: [{ farm_parcel: '3' }, { farm_parcel: '4' }] }), '', 'all chosen')

// ── "Add crops" from a parcel's menu locks the Add Crop Records page to that parcel
const parcelRow = { id: 3, farmer: 9, farmer_name: 'Ana Cruz', rsbsa_number: '01-033-02-019-000001', parcel_number: '01-33-02-005-001-02-003', barangay: 'Alaska', land_ownership: 'Owner', area_hectares: '5.00' }
const locked = addCropsLockedState(parcelRow)
eq([locked.prefill.lockParcel, locked.prefill.farmerId, locked.prefill.parcel.id, locked.prefill.parcelLabel, locked.prefill.farmerName, locked.prefill.parcelAreaHa],
  [true, 9, 3, '01-33-02-005-001-02-003', 'Ana Cruz', '5.00'], 'locked add-crops state')
eq(addCropState(parcelRow).prefill.lockParcel, undefined, 'the plain prefill is not locked')

// ── purging a parcel

console.log(`parcelRecords: ${n} checks passed`)
