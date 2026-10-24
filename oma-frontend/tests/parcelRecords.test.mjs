import assert from 'node:assert/strict'

const {
  parcelLabel, cropCountLabel, directoryParams, noParcelParams, addCropState, recordActionKeys, ownerParcelFill, parcelProblem,
  addCropsLockedState, PURGE_REASONS, purgeReasonLabel, purgeProblem, purgePayload, purgeServerMessage, purgedParams,
  GROUP_OPTIONS, SORT_OPTIONS, DEFAULT_GROUP, DEFAULT_SORT, groupFilterParams, groupChildParams, groupSummary, groupHeading,
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
eq(directoryParams({ ordering: 'crops' }), { page: 1, ordering: 'crops' }, 'a sort is sent')
eq(directoryParams({ ordering: DEFAULT_SORT }), { page: 1 }, 'the default sort is the server own order, so it is not sent')

// ── group by / sort by
eq(GROUP_OPTIONS.map((o) => o.value), ['none', 'farmer', 'barangay', 'ownership'], 'group choices')
eq(DEFAULT_GROUP, 'none', 'no grouping by default')
eq(SORT_OPTIONS.map((o) => o.value), ['name', 'crops', 'crops_asc', 'area', 'number'], 'sort choices')
eq(groupFilterParams({ search: 'Ana', barangay: 'Alaska', ordering: 'area', page: 4 }), { search: 'Ana', barangay: 'Alaska', ordering: 'area' }, 'group filters carry no page')
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

// ── "Add crops" from a parcel's menu locks the Add Crop Records page to that parcel
const parcelRow = { id: 3, farmer: 9, farmer_name: 'Ana Cruz', rsbsa_number: '01-033-02-019-000001', parcel_number: '01-33-02-005-001-02-003', barangay: 'Alaska', land_ownership: 'Owner', area_hectares: '5.00' }
const locked = addCropsLockedState(parcelRow)
eq([locked.prefill.lockParcel, locked.prefill.farmerId, locked.prefill.parcel.id, locked.prefill.parcelLabel, locked.prefill.farmerName, locked.prefill.parcelAreaHa],
  [true, 9, 3, '01-33-02-005-001-02-003', 'Ana Cruz', '5.00'], 'locked add-crops state')
eq(addCropState(parcelRow).prefill.lockParcel, undefined, 'the plain prefill is not locked')

// ── purging a parcel
eq(PURGE_REASONS.map((r) => r.value), ['Sold', 'Transferred', 'Other'], 'the choices')
eq(purgeReasonLabel('Transferred'), 'Transferred to someone else', 'reason label')
eq(purgeReasonLabel('Other', ' Taken by the road project '), 'Taken by the road project', 'Others shows what was typed')
eq(purgeReasonLabel('Other', ''), 'Others', 'Others with nothing typed (older rows)')
eq(purgeReasonLabel(''), '—', 'no reason')
eq(purgeProblem({ reason: '', date: '2026-10-01', note: '' }, '2026-10-23'), 'Choose why the parcel is leaving.', 'reason needed')
eq(purgeProblem({ reason: 'Other', reasonOther: '  ', date: '2026-10-01', note: '' }, '2026-10-23'), 'Type the reason, since you chose Others.', 'Others needs the reason typed')
eq(purgeProblem({ reason: 'Other', reasonOther: 'x'.repeat(101), date: '', note: '' }, '2026-10-23'), 'Keep the reason under 100 characters.', 'typed reason length')
eq(purgeProblem({ reason: 'Other', reasonOther: 'Road project', date: '', note: '' }, '2026-10-23'), '', 'Others with a reason')
eq(purgeProblem({ reason: 'Sold', date: '2026-10-30', note: '' }, '2026-10-23'), 'The date cannot be in the future.', 'no future date')
eq(purgeProblem({ reason: 'Sold', date: '', note: '' }, '2026-10-23'), '', 'the date may be left blank (today)')
eq(purgeProblem({ reason: 'Sold', date: '2026-10-23', note: 'x'.repeat(501) }, '2026-10-23'), 'Keep the note under 500 characters.', 'note length')
eq(purgeProblem({ reason: 'Transferred', date: '2026-10-01', note: 'to his son' }, '2026-10-23'), '', 'a good form')
eq(purgePayload({ reason: 'Sold', date: '', note: '  to a neighbour ' }), { reason: 'Sold', date: null, note: 'to a neighbour' }, 'payload trims and sends no blank date')
eq(purgePayload({ reason: 'Other', reasonOther: ' Road project ', date: '2026-10-01', note: '' }), { reason: 'Other', reason_other: 'Road project', date: '2026-10-01', note: '' }, 'Others sends the typed reason')
eq(purgePayload({ reason: 'Sold', reasonOther: 'left over', date: '', note: '' }), { reason: 'Sold', date: null, note: '' }, 'a typed reason is not sent for another choice')
eq(purgeServerMessage({ reason_other: ['Type the reason.'] }), 'Type the reason.', 'typed reason refusal')
eq(purgeServerMessage({ detail: '2 crop records are still growing.' }), '2 crop records are still growing.', 'growing refusal')
eq(purgeServerMessage({ reason: ['Choose why.'] }), 'Choose why.', 'field refusal')
eq(purgeServerMessage(undefined), 'Unable to purge the parcel. Please try again.', 'unknown failure')
eq(purgedParams({ search: ' Ana ', page: 2 }), { page: 2, search: 'Ana' }, 'purged table request')
eq(purgedParams({}), { page: 1 }, 'purged table, nothing typed')
eq(purgedParams({ dateFrom: '2026-09-01', dateTo: '2026-09-30', page: 2 }), { page: 2, date_from: '2026-09-01', date_to: '2026-09-30' }, 'purged table date range')

console.log(`parcelRecords: ${n} checks passed`)
