// The crops read from a crops file (POST /farmers/parcel-crop-records/parse/) as rows of the parcel's crops table, with no screen and no
// network, so they can be tested on their own. The rows are the same Add Crop rows the person types in, so the same rules check them.
import { materialFor, needsLandOwner, ownerParcel } from '../CropInformation/cropEntry.js'
import { detectSeason, makeCropRecord } from '../Monitoring/cropRecordForm.js'

const LAND_STATUSES = ['Owner', 'Tenant', 'Lessee']

// How the crop is planted: a seed crop as seed, a tree crop as trees; a crop that is both as trees only when the file gave trees and no seeds.
function plantingMaterial(cropType, imported) {
  const type = cropType?.planting_type || 'Seed'
  if (type !== 'Both') return materialFor(cropType, 'Seed')
  return imported.quantity_of_trees && !imported.quantity_of_seeds ? 'Tree' : 'Seed'
}

// Whose crop it is: on an Owner parcel always the owner's own; else the file's status, else the parcel's own tenure, with the land owner's
// name from the file or, failing that, the parcel's.
function cropStatus(imported, parcel) {
  if (ownerParcel(parcel)) return { land_status: 'Owner', land_owner_name: '' }
  const land_status = imported.land_status || (LAND_STATUSES.includes(parcel?.land_ownership) ? parcel.land_ownership : '')
  const land_owner_name = needsLandOwner(land_status) ? (imported.land_owner_name || parcel?.land_owner_name || '') : ''
  return { land_status, land_owner_name }
}

export function cropRecordsFromImport(imported, { parcel, cropTypes, varieties, firstId }) {
  return imported.map((c, i) => {
    const cropType = cropTypes.find((t) => String(t.id) === String(c.crop_type))
    const material = plantingMaterial(cropType, c)
    const listed = varieties.find((v) => v.is_active && String(v.crop_type) === String(c.crop_type) && v.name.toLowerCase() === (c.variety_used || '').toLowerCase())
    return {
      ...makeCropRecord(firstId + i),
      ...cropStatus(c, parcel),
      crop_type: String(c.crop_type),
      date_planted: c.date_planted,
      season: detectSeason(c.date_planted),
      area_planted_ha: c.area_planted_ha,
      variety_used: listed ? listed.name : c.variety_used,   // a listed variety is picked by its own spelling
      variety_used_is_other: !listed,
      seed_source: c.seed_source || '',
      seed_source_other_specify: c.seed_source_other_specify || '',
      planting_material: material,
      quantity_of_seeds: material === 'Seed' ? (c.quantity_of_seeds || '') : '',
      quantity_of_trees: material === 'Tree' ? (c.quantity_of_trees || '') : '',
    }
  })
}
