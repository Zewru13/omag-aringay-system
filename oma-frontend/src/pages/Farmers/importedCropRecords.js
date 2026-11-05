// The crops read from a crops file (POST /farmers/parcel-crop-records/parse/) as rows of the parcel's crops table, with no screen and no
// network, so they can be tested on their own. The rows are the same Add Crop rows the person types in, so the same rules check them.
import { materialFor, withParcelStatus } from '../CropInformation/cropEntry.js'
import { makeCropRecord } from '../Monitoring/cropRecordForm.js'

// How the crop is planted: a seed crop as seed, a tree crop as trees; a crop that is both as trees only when the file gave trees and no seeds.
function plantingMaterial(cropType, imported) {
  const type = cropType?.planting_type || 'Seed'
  if (type !== 'Both') return materialFor(cropType, 'Seed')
  return imported.quantity_of_trees && !imported.quantity_of_seeds ? 'Tree' : 'Seed'
}

export function cropRecordsFromImport(imported, { parcel, cropTypes, varieties, firstId }) {
  return imported.map((c, i) => {
    const cropType = cropTypes.find((t) => String(t.id) === String(c.crop_type))
    const material = plantingMaterial(cropType, c)
    const listed = varieties.find((v) => v.is_active && String(v.crop_type) === String(c.crop_type) && v.name.toLowerCase() === (c.variety_used || '').toLowerCase())
    // Whose crop it is is the parcel's land ownership (whatever status the file gave), taken from the parcel like any other row.
    return withParcelStatus({
      ...makeCropRecord(firstId + i),
      crop_type: String(c.crop_type),
      date_planted: c.date_planted,
      area_planted_ha: c.area_planted_ha,
      variety_used: listed ? listed.name : c.variety_used,   // a listed variety is picked by its own spelling
      variety_used_is_other: !listed,
      seed_source: c.seed_source || '',
      seed_source_other_specify: c.seed_source_other_specify || '',
      planting_material: material,
      quantity_of_seeds: material === 'Seed' ? (c.quantity_of_seeds || '') : '',
      quantity_of_trees: material === 'Tree' ? (c.quantity_of_trees || '') : '',
    }, parcel)
  })
}
