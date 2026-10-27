// The Add Crop Records table: pure rules for a crop's ownership (whose land it grows on), how it was planted (seed or trees) and
// whether its area fits its parcel, with no screen and no network, so they can be tested on their own.
export const CROP_OWNERSHIP_OPTIONS = ['Owner', 'Lessee', 'Tenant']
export const PLANTING_MATERIALS = ['Seed', 'Tree']

// How a crop type is planted (Crop Settings > Planted as): from seed, as trees, or either way.
export const PLANTING_TYPES = [
  { value: 'Seed', label: 'Seed' },
  { value: 'Tree', label: 'Tree' },
  { value: 'Both', label: 'Seed or Tree' },
]
export const plantingTypeOf = (cropType) => cropType?.planting_type || 'Seed'
export const plantingTypeLabel = (cropType) => PLANTING_TYPES.find((t) => t.value === plantingTypeOf(cropType))?.label || 'Seed'

// Only a crop that can be planted either way lets the person choose per crop record.
export const canChoosePlanting = (cropType) => plantingTypeOf(cropType) === 'Both'

// What a crop record is planted as: a Seed crop as seed, a Tree crop as trees, and a crop that is both as the person chose (seed to begin with).
export function materialFor(cropType, chosen) {
  const type = plantingTypeOf(cropType)
  if (type === 'Tree') return 'Tree'
  if (type === 'Seed') return 'Seed'
  return chosen === 'Tree' ? 'Tree' : 'Seed'
}

// A Tenant or Lessee crop grows on someone else's land, so it carries that owner's name (as a farm parcel does).
export const needsLandOwner = (status) => status === 'Tenant' || status === 'Lessee'

// On a parcel the farmer owns, every crop is the owner's own: there is no crop status to choose and no other owner to name.
export const ownerParcel = (parcel) => parcel?.land_ownership === 'Owner'
export const statusFixedByParcels = (parcels) => parcels.length > 0 && parcels.every(ownerParcel)

// The crop as it is recorded on `parcel`: on an Owner parcel its status is Owner (whatever the row held before the parcel's ownership
// was chosen or changed) and it has no other owner's name; on any other parcel it is left as it is.
export function withFixedStatus(record, parcel) {
  if (!ownerParcel(parcel)) return record
  return { ...record, land_status: 'Owner', land_status_other_specify: '', land_owner_name: '' }
}

// Picking another crop ownership: anything but Tenant / Lessee clears the owner's name, so an outdated one is never saved.
// Going to Tenant or Lessee keeps a name already typed (and offers the parcel's own owner when there is none yet).
export function chooseCropOwnership(row, next, parcelOwnerName = '') {
  if (!needsLandOwner(next)) return { land_status: next, land_owner_name: '' }
  return { land_status: next, land_owner_name: row.land_owner_name || parcelOwnerName || '' }
}

// What a crop table cell shows: the ownership, and under it (Tenant / Lessee) the owner's name.
export function cropOwnershipCell(record) {
  const status = record.land_status === 'Other'
    ? (record.land_status_other_specify ? `Other — ${record.land_status_other_specify}` : 'Other')
    : (record.land_status || '—')
  const owner = needsLandOwner(record.land_status) ? (record.land_owner_name ? `Owner: ${record.land_owner_name}` : 'Owner not recorded') : ''
  return { status, owner }
}

// What a row starts as when its crop is picked: the crop's own way (a crop that is both starts as seed).
export const defaultPlantingMaterial = (cropType) => materialFor(cropType, 'Seed')

export const quantityLabel = (material) => (material === 'Tree' ? 'Qty of Trees' : 'Qty of Seeds (kg)')

// The column heading: what every row says, or both when the rows differ.
export function quantityHeader(rows) {
  const materials = new Set(rows.map((r) => r.planting_material || 'Seed'))
  if (materials.size > 1) return 'Qty of Seeds / Trees'
  return quantityLabel([...materials][0])
}

// What is sent for the quantity: only the one that matches how the crop was planted; the other is left out as null.
export function quantityPayload(row) {
  if (row.planting_material === 'Tree') {
    const trees = row.quantity_of_trees === '' || row.quantity_of_trees == null ? null : parseInt(row.quantity_of_trees, 10)
    return { planting_material: 'Tree', quantity_of_trees: Number.isFinite(trees) ? trees : null, quantity_of_seeds: null, seed_quantity_unit: 'kg' }
  }
  return {
    planting_material: 'Seed',
    quantity_of_seeds: row.quantity_of_seeds ? parseFloat(row.quantity_of_seeds) : null,
    quantity_of_trees: null,
    seed_quantity_unit: row.seed_quantity_unit || 'kg',
  }
}

const hundredths = (value) => Math.round((Number(value) || 0) * 100)
const ha = (units) => String(Number((units / 100).toFixed(2)))

// Why a row's area cannot be saved ('' when it fits): not more than its parcel, and not more than what is left of it after the
// plantings already growing there and the rows above on the same parcel (the same rule the server enforces on save).
// `parcels` is [{ id, area_hectares, growing_area_ha }]; each row has farm_parcel and area_planted_ha.
export function areaProblem(rows, index, parcels) {
  const row = rows[index]
  const parcel = parcels.find((p) => String(p.id) === String(row.farm_parcel))
  const area = hundredths(row.area_planted_ha)
  if (!parcel || !(area > 0)) return ''
  const size = hundredths(parcel.area_hectares)
  if (area > size) return `This area (${ha(area)} ha) is bigger than its parcel (${ha(size)} ha).`
  const above = rows.slice(0, index).filter((r) => String(r.farm_parcel) === String(parcel.id)).reduce((sum, r) => sum + hundredths(r.area_planted_ha), 0)
  const taken = hundredths(parcel.growing_area_ha) + above
  if (taken + area > size) {
    return `Only ${ha(Math.max(size - taken, 0))} ha of this ${ha(size)} ha parcel is free (${ha(taken)} ha is already planted).`
  }
  return ''
}
