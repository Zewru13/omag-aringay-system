import assert from 'node:assert/strict'

const {
  parcelLabel, cropCountLabel, directoryParams, noParcelParams, addCropState, recordActionKeys, ownerParcelFill, parcelProblem,
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
eq(directoryParams({ barangay: 'Alaska', page: 3 }), { page: 3, barangay: 'Alaska' }, 'barangay only')

// ── the request for the crops that have no parcel on file (only the filters that apply to them)
eq(noParcelParams({ search: 'Ana', barangay: 'Alaska', farmStatus: 'Inactive' }), { farm_parcel: 'none', search: 'Ana', barangay: 'Alaska' }, 'no-parcel request')
eq(noParcelParams({}), { farm_parcel: 'none' }, 'no-parcel request, no filters')

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
eq(ownerParcelFill([owner], { farm_parcel: '', farm_location_barangay: '', land_status: '' }),
  { farm_parcel: '3', farm_location_barangay: 'Poblacion', land_status: 'Owner' }, 'single parcel fills the row')
eq(ownerParcelFill([owner], { farm_parcel: '8', farm_location_barangay: 'Basca', land_status: 'Tenant' }),
  { farm_parcel: '8', farm_location_barangay: 'Basca', land_status: 'Tenant' }, 'a chosen parcel is kept')
eq(ownerParcelFill([owner, { ...owner, id: 4 }], { farm_parcel: '', farm_location_barangay: '', land_status: '' }),
  { farm_parcel: '', farm_location_barangay: '', land_status: '' }, 'several parcels: the person chooses')
eq(ownerParcelFill([{ id: 5, barangay: 'Alaska', land_ownership: 'Lessee' }], { farm_parcel: '', farm_location_barangay: 'Basca', land_status: '' }),
  { farm_parcel: '5', farm_location_barangay: 'Basca', land_status: 'Lessee' }, 'a typed barangay is kept')
eq(ownerParcelFill([], { farm_parcel: '', farm_location_barangay: '', land_status: '' }),
  { farm_parcel: '', farm_location_barangay: '', land_status: '' }, 'no parcels')

// ── the message when the farmer cannot get a crop yet
eq(parcelProblem({ farmerId: null, ready: false, parcels: [], rows: [] }), '', 'no farmer yet')
eq(parcelProblem({ farmerId: 1, ready: false, parcels: [], rows: [] }), '', 'parcels still loading')
eq(parcelProblem({ farmerId: 1, ready: true, parcels: [], rows: [{ farm_parcel: '' }] }),
  'This farmer has no farm parcel yet. Add a farm parcel first, then add the crop.', 'no parcel at all')
eq(parcelProblem({ farmerId: 1, ready: true, parcels: [owner, { ...owner, id: 4 }], rows: [{ farm_parcel: '3' }, { farm_parcel: '' }] }),
  'Row 2: choose the farm parcel this crop is grown on.', 'row without a parcel')
eq(parcelProblem({ farmerId: 1, ready: true, parcels: [owner, { ...owner, id: 4 }], rows: [{ farm_parcel: '3' }, { farm_parcel: '4' }] }), '', 'all chosen')

console.log(`parcelRecords: ${n} checks passed`)
