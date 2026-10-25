// The crop record form's rules, with no screen: the blank row, what a row is missing, and what is sent. The Add Crop Records page and
// the Add Farm Parcels form both use them (and CropRecordsTable.jsx), so a crop added in either place follows the same rules.
import { EMPTY_PCIC, pcicError, pcicPayload } from '../../utils/pcic.js'
import { areaProblem, materialFor, needsLandOwner, quantityPayload } from '../CropInformation/cropEntry.js'

export function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  const month = new Date(dateStr).getMonth() + 1
  return month >= 6 && month <= 11 ? 'Wet' : 'Dry'
}

export const makeCropRecord = (n) => ({
  _id: n,
  pcic: { ...EMPTY_PCIC },
  farm_location_barangay: '',
  land_status: '',
  land_status_other_specify: '',
  land_owner_name: '',
  crop_type: '',
  date_planted: '',
  area_planted_ha: '',
  season: detectSeason(''),
  variety_used: '',
  variety_used_is_other: false,
  seed_source: '',
  seed_source_other_specify: '',
  planting_material: 'Seed',          // follows the crop type; a crop that can be planted either way lets the person switch it
  quantity_of_seeds: '',
  quantity_of_trees: '',
  seed_quantity_unit: 'kg',
  farm_parcel: '',
})

// What a row is missing before it can be saved, as a list of words ([] when it has everything). `needsBarangay` is false when the
// crop's barangay is its parcel's (the row has no barangay column then).
export function cropRecordMissing(rec, { needsBarangay = true } = {}) {
  const missing = []
  if (needsBarangay && !rec.farm_location_barangay) missing.push('barangay')
  if (!rec.land_status) missing.push('crop status')
  else if (needsLandOwner(rec.land_status) && !rec.land_owner_name.trim()) missing.push("crop owner's name")
  if (!rec.crop_type) missing.push('crop type')
  if (!(rec.variety_used || '').trim()) missing.push('variety')
  if (!rec.date_planted) missing.push('date planted')
  if (!rec.area_planted_ha) missing.push('area planted')
  return missing
}

// Why one row cannot be saved ('' when it can): what is missing, then the area against its parcel, then the PCIC form. `parcels` are
// the parcels a row's farm_parcel can point at: [{ id, area_hectares, growing_area_ha }].
export function cropRecordProblem(records, index, parcels, options) {
  const rec = records[index]
  const missing = cropRecordMissing(rec, options)
  if (missing.length > 0) return `missing ${missing.join(', ')}.`
  return areaProblem(records, index, parcels) || pcicError(rec.pcic) || ''
}

// The body of one crop record as POST /production/monitoring/bulk/ takes it.
export function buildCropRecordPayload(rec, { farmerInfo, barangay, cropTypes }) {
  const year = new Date(rec.date_planted).getFullYear()
  return {
    farmer:                 farmerInfo.farmer_id,
    farmers_organization:    farmerInfo.farmer_assoc_id || null,
    farm_location_barangay: barangay || rec.farm_location_barangay || '',
    land_status:            rec.land_status || '',
    land_status_other_specify: rec.land_status === 'Other' ? (rec.land_status_other_specify || '') : '',
    land_owner_name:        needsLandOwner(rec.land_status) ? rec.land_owner_name.trim() : '',
    crop_type:              rec.crop_type || null,
    season:                 rec.season,
    year,
    date_planted:           rec.date_planted || null,
    area_planted_ha:        rec.area_planted_ha || null,
    variety_used:           rec.variety_used || '',
    seed_source:            rec.seed_source || '',
    seed_source_other_specify: rec.seed_source === 'Other' ? (rec.seed_source_other_specify || '') : '',
    ...quantityPayload({ ...rec, planting_material: materialFor(cropTypes.find(c => String(c.id) === String(rec.crop_type)), rec.planting_material) }),
    farm_parcel:            rec.farm_parcel || null,
    ...pcicPayload(rec.pcic),
  }
}
