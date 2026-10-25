import assert from 'node:assert/strict'

const {
  CROP_OWNERSHIP_OPTIONS, PLANTING_MATERIALS, PLANTING_TYPES, plantingTypeOf, plantingTypeLabel, canChoosePlanting, materialFor, needsLandOwner,
  chooseCropOwnership, cropOwnershipCell, defaultPlantingMaterial, quantityLabel, quantityHeader, quantityPayload, areaProblem,
} = await import(new URL('../src/pages/CropInformation/cropEntry.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// who needs the land owner's name
eq(CROP_OWNERSHIP_OPTIONS, ['Owner', 'Lessee', 'Tenant'], 'ownership choices')
eq(['Tenant', 'Lessee', 'Owner', 'Other', ''].map(needsLandOwner), [true, true, false, false, false], 'only a tenant or lessee')

// switching: anything else clears the name; a name already typed is kept; the parcel's own owner is offered when blank
eq(chooseCropOwnership({ land_owner_name: 'Rosa' }, 'Owner'), { land_status: 'Owner', land_owner_name: '' }, 'owner clears the name')
eq(chooseCropOwnership({ land_owner_name: 'Rosa' }, 'Other'), { land_status: 'Other', land_owner_name: '' }, 'other clears the name')
eq(chooseCropOwnership({ land_owner_name: 'Rosa' }, 'Lessee'), { land_status: 'Lessee', land_owner_name: 'Rosa' }, 'lessee keeps what was typed')
eq(chooseCropOwnership({ land_owner_name: '' }, 'Tenant', 'Pedro Reyes'), { land_status: 'Tenant', land_owner_name: 'Pedro Reyes' }, 'the parcel owner is offered')
eq(chooseCropOwnership({ land_owner_name: 'Rosa' }, 'Tenant', 'Pedro Reyes'), { land_status: 'Tenant', land_owner_name: 'Rosa' }, 'a typed name wins')

// the crop table cell
eq(cropOwnershipCell({ land_status: 'Owner' }), { status: 'Owner', owner: '' }, 'owner shows nothing more')
eq(cropOwnershipCell({ land_status: 'Tenant', land_owner_name: 'Rosa Landlord' }), { status: 'Tenant', owner: 'Owner: Rosa Landlord' }, 'tenant shows the owner')
eq(cropOwnershipCell({ land_status: 'Lessee', land_owner_name: '' }), { status: 'Lessee', owner: 'Owner not recorded' }, 'an older lessee crop')
eq(cropOwnershipCell({ land_status: 'Other', land_status_other_specify: 'Shared' }), { status: 'Other — Shared', owner: '' }, 'other')
eq(cropOwnershipCell({}), { status: '—', owner: '' }, 'nothing saved')

// seed or trees
eq(PLANTING_MATERIALS, ['Seed', 'Tree'], 'planting choices')
// how a crop type is planted (Crop Settings > Planted as)
eq(PLANTING_TYPES.map((t) => t.value), ['Seed', 'Tree', 'Both'], 'planting types')
eq(PLANTING_TYPES.map((t) => t.label), ['Seed', 'Tree', 'Seed or Tree'], 'their labels')
eq([plantingTypeOf({ planting_type: 'Tree' }), plantingTypeOf({}), plantingTypeOf(undefined)], ['Tree', 'Seed', 'Seed'], 'a crop with no setting is planted as seed')
eq([plantingTypeLabel({ planting_type: 'Both' }), plantingTypeLabel({ planting_type: 'Tree' }), plantingTypeLabel(null)], ['Seed or Tree', 'Tree', 'Seed'], 'labels of a crop type')
eq([canChoosePlanting({ planting_type: 'Both' }), canChoosePlanting({ planting_type: 'Seed' }), canChoosePlanting({ planting_type: 'Tree' }), canChoosePlanting(undefined)], [true, false, false, false], 'only a crop that is both lets the person switch')
eq([materialFor({ planting_type: 'Seed' }, 'Tree'), materialFor({ planting_type: 'Tree' }, 'Seed'), materialFor({ planting_type: 'Tree' }, undefined)], ['Seed', 'Tree', 'Tree'], 'a seed or tree crop ignores the choice')
eq([materialFor({ planting_type: 'Both' }, 'Tree'), materialFor({ planting_type: 'Both' }, 'Seed'), materialFor({ planting_type: 'Both' }, undefined)], ['Tree', 'Seed', 'Seed'], 'a crop that is both takes the choice, seed by default')
eq([defaultPlantingMaterial({ planting_type: 'Tree' }), defaultPlantingMaterial({ planting_type: 'Both' }), defaultPlantingMaterial({ planting_type: 'Seed' }), defaultPlantingMaterial(undefined)], ['Tree', 'Seed', 'Seed', 'Seed'], 'what a row starts as')
eq([quantityLabel('Seed'), quantityLabel('Tree'), quantityLabel(undefined)], ['Qty of Seeds (kg)', 'Qty of Trees', 'Qty of Seeds (kg)'], 'labels')
eq(quantityHeader([{ planting_material: 'Seed' }, {}]), 'Qty of Seeds (kg)', 'all seeds')
eq(quantityHeader([{ planting_material: 'Tree' }]), 'Qty of Trees', 'all trees')
eq(quantityHeader([{ planting_material: 'Tree' }, { planting_material: 'Seed' }]), 'Qty of Seeds / Trees', 'mixed rows')
eq(quantityPayload({ planting_material: 'Tree', quantity_of_trees: '120', quantity_of_seeds: '5' }),
  { planting_material: 'Tree', quantity_of_trees: 120, quantity_of_seeds: null, seed_quantity_unit: 'kg' }, 'trees send the count only')
eq(quantityPayload({ planting_material: 'Tree', quantity_of_trees: '' }).quantity_of_trees, null, 'no count')
eq(quantityPayload({ planting_material: 'Seed', quantity_of_seeds: '25.5', quantity_of_trees: '9', seed_quantity_unit: 'kg' }),
  { planting_material: 'Seed', quantity_of_seeds: 25.5, quantity_of_trees: null, seed_quantity_unit: 'kg' }, 'seeds send the weight only')
eq(quantityPayload({}), { planting_material: 'Seed', quantity_of_seeds: null, quantity_of_trees: null, seed_quantity_unit: 'kg' }, 'a blank row')

// the area against the parcel
const parcels = [{ id: 1, area_hectares: '5.00', growing_area_ha: '0' }, { id: 2, area_hectares: '5.00', growing_area_ha: '3.00' }]
const row = (parcel, area) => ({ farm_parcel: String(parcel), area_planted_ha: area })
eq(areaProblem([row(1, '5.00')], 0, parcels), '', 'exactly the parcel fits')
eq(areaProblem([row(1, '5.01')], 0, parcels), 'This area (5.01 ha) is bigger than its parcel (5 ha).', 'more than the parcel')
eq(areaProblem([row(2, '2.00')], 0, parcels), '', 'what is left fits')
eq(areaProblem([row(2, '2.50')], 0, parcels), 'Only 2 ha of this 5 ha parcel is free (3 ha is already planted).', 'more than what is left')
eq([areaProblem([row(1, '3.00'), row(1, '2.00')], 1, parcels), areaProblem([row(1, '3.00'), row(1, '2.50')], 1, parcels)],
  ['', 'Only 2 ha of this 5 ha parcel is free (3 ha is already planted).'], 'rows on one parcel count together')
eq(areaProblem([row(1, '4.00'), row(2, '2.00')], 1, parcels), '', 'another parcel is not counted')
eq([areaProblem([row('', '9')], 0, parcels), areaProblem([row(1, '')], 0, parcels), areaProblem([row(1, '0')], 0, parcels)], ['', '', ''], 'nothing to check yet')
eq(areaProblem([row(1, '1.10'), row(1, '0.20')], 1, [{ id: 1, area_hectares: '1.30', growing_area_ha: '0' }]), '', 'decimals are exact')

console.log(`cropEntry: ${n} checks passed`)
