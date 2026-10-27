import assert from 'node:assert/strict'

const { cropRecordsFromImport } = await import(new URL('../src/pages/Farmers/importedCropRecords.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const cropTypes = [
  { id: 7, name: 'Rice', planting_type: 'Seed' },
  { id: 8, name: 'Mango', planting_type: 'Tree' },
  { id: 9, name: 'Banana', planting_type: 'Both' },
]
const varieties = [{ name: 'NSIC Rc 222', crop_type: 7, is_active: true }, { name: 'Carabao', crop_type: 8, is_active: true }, { name: 'Old', crop_type: 7, is_active: false }]
const line = (over = {}) => ({
  row: 2, crop_type: 7, crop_name: 'Rice', date_planted: '2026-09-15', area_planted_ha: '1.5', variety_used: 'NSIC Rc 222', land_status: '',
  land_owner_name: '', seed_source: 'Certified Seed', seed_source_other_specify: '', quantity_of_seeds: '40', quantity_of_trees: '', ...over,
})
const ownerParcel = { land_ownership: 'Owner', land_owner_name: '' }
const tenantParcel = { land_ownership: 'Tenant', land_owner_name: 'Rosa Reyes' }
const make = (imported, parcel = ownerParcel, firstId = 100) => cropRecordsFromImport(imported, { parcel, cropTypes, varieties, firstId })

// the crop as a row of the crops table
const [rice] = make([line()])
eq([rice._id, rice.crop_type, rice.date_planted, rice.season, rice.area_planted_ha, rice.variety_used, rice.variety_used_is_other],
  [100, '7', '2026-09-15', 'Wet', '1.5', 'NSIC Rc 222', false], 'a seed crop becomes a table row')
eq([rice.seed_source, rice.seed_source_other_specify, rice.planting_material, rice.quantity_of_seeds, rice.quantity_of_trees], ['Certified Seed', '', 'Seed', '40', ''], 'seed and quantity')
eq(make([line(), line({ row: 3 })]).map((r) => r._id), [100, 101], 'each row gets its own id')
eq(make([line({ date_planted: '2026-02-10' })])[0].season, 'Dry', 'the season follows the planting date')

// how it is planted follows the crop type
eq(make([line({ crop_type: 8, quantity_of_seeds: '', quantity_of_trees: '12', variety_used: 'Carabao' })])[0].planting_material, 'Tree', 'a tree crop is planted as trees')
const tree = make([line({ crop_type: 8, quantity_of_seeds: '5', quantity_of_trees: '12' })])[0]
eq([tree.quantity_of_trees, tree.quantity_of_seeds], ['12', ''], 'only the quantity that matches how it is planted is kept')
eq(make([line({ crop_type: 7, quantity_of_seeds: '', quantity_of_trees: '12' })])[0].quantity_of_trees, '', 'a seed crop has no tree count')
eq(make([line({ crop_type: 9, quantity_of_seeds: '', quantity_of_trees: '30' })])[0].planting_material, 'Tree', 'a crop that is both, given trees only, is trees')
eq(make([line({ crop_type: 9, quantity_of_seeds: '10', quantity_of_trees: '' })])[0].planting_material, 'Seed', 'a crop that is both, given seeds, is seed')
eq(make([line({ crop_type: 9, quantity_of_seeds: '', quantity_of_trees: '' })])[0].planting_material, 'Seed', 'a crop that is both, given nothing, starts as seed')

// the variety: one on the crop's list is a pick, anything else is typed in
eq(make([line({ variety_used: 'nsic rc 222' })])[0].variety_used_is_other, false, 'a listed variety, whatever its case')
eq(make([line({ variety_used: 'Home-grown' })])[0].variety_used_is_other, true, 'an unlisted variety is typed')
eq(make([line({ variety_used: 'Old' })])[0].variety_used_is_other, true, 'a switched-off variety is typed')
eq(make([line({ variety_used: 'Carabao' })])[0].variety_used_is_other, true, 'another crop\'s variety is typed')

// whose crop it is: the file's status, else the parcel's own
eq([make([line()], ownerParcel)[0].land_status, make([line()], ownerParcel)[0].land_owner_name], ['Owner', ''], 'a blank status on an owner parcel is the owner')
eq([make([line()], tenantParcel)[0].land_status, make([line()], tenantParcel)[0].land_owner_name], ['Tenant', 'Rosa Reyes'], 'a blank status on a tenant parcel is the tenant, with the parcel\'s land owner')
eq([make([line({ land_status: 'Lessee', land_owner_name: 'Ben' })], tenantParcel)[0].land_status, make([line({ land_status: 'Lessee', land_owner_name: 'Ben' })], tenantParcel)[0].land_owner_name], ['Lessee', 'Ben'], 'the file says whose land')
eq(make([line({ land_status: 'Lessee' })], tenantParcel)[0].land_owner_name, 'Rosa Reyes', 'no owner in the file: the parcel\'s land owner')
eq([make([line({ land_status: 'Tenant', land_owner_name: 'Ben' })], ownerParcel)[0].land_status, make([line({ land_status: 'Tenant', land_owner_name: 'Ben' })], ownerParcel)[0].land_owner_name], ['Owner', ''], 'an owner parcel\'s crops are the owner\'s own, whatever the file says')
eq(make([line({ land_status: 'Owner' })], tenantParcel)[0].land_owner_name, '', 'an Owner crop on a tenant parcel has no other owner')
eq(make([line()], { land_ownership: '', land_owner_name: '' })[0].land_status, '', 'a parcel whose ownership is not chosen yet leaves the status to be picked')
eq(make([]), [], 'nothing imported')

console.log(`importedCropRecords: ${n} checks passed`)
