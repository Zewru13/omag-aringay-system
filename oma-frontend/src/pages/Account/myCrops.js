// The rules of the farmer's Crops page (MyCropsPage.jsx draws them): the sections, the wording of a status, the main button of a
// row and the order of the list. No screen and no network, so they can be tested on their own.

// The sections the crops are listed under. Every status has one, so a crop never disappears from the page.
export const CROP_SECTIONS = [
  { key: 'growing', label: 'Growing', match: (crop) => crop.status === 'Planted' },
  { key: 'ready', label: 'Ready to harvest', match: (crop) => crop.status === 'Near Harvest' },
  { key: 'harvested', label: 'Harvested', match: (crop) => crop.status === 'Harvested' },
  { key: 'lost', label: 'Lost', match: (crop) => crop.status === 'Total Loss' },
]

const STATUS_LABEL = { Planted: 'Growing', 'Near Harvest': 'Ready to harvest', Harvested: 'Harvested', 'Total Loss': 'Lost' }

// The status in plain words; one the page does not know is shown as it is.
export const cropStatusLabel = (crop) => STATUS_LABEL[crop.status] || crop.status

// The main button of a row: 'activity' (Log activity), 'harvest' (Record harvest) or none. Record harvest leads only for a crop
// that is ready and whose harvest is allowed (`gate` is harvestGateInfo's answer); a crop that is still growing leads with Log
// activity, and its harvest stays reachable from Details.
export function cropMainAction(crop, gate) {
  if (crop.status === 'Harvested' || crop.status === 'Total Loss') return null
  return crop.status === 'Near Harvest' && !gate?.gated ? 'harvest' : 'activity'
}

const byDate = (key, direction) => (a, b) => {
  if (!a[key] && !b[key]) return 0
  if (!a[key]) return 1          // no date: last
  if (!b[key]) return -1
  return direction * String(a[key]).localeCompare(String(b[key]))
}

// The order the crops are read in: those in the field first, the soonest harvest at the top; then the harvested ones, the newest
// first; then the lost ones, the newest first. A new list; the one given is left as it is.
export function sortCrops(crops) {
  const active = crops.filter((c) => c.status === 'Planted' || c.status === 'Near Harvest').sort(byDate('expected_harvest_date', 1))
  const harvested = crops.filter((c) => c.status === 'Harvested').sort(byDate('actual_harvest_date', -1))
  const lost = crops.filter((c) => c.status === 'Total Loss').sort(byDate('date_planted', -1))
  const other = crops.filter((c) => !['Planted', 'Near Harvest', 'Harvested', 'Total Loss'].includes(c.status))
  return [...active, ...harvested, ...lost, ...other]
}

// Everything the search box may look at.
export const cropText = (crop) => [crop.crop_type_name, crop.variety_used, crop.farm_location_barangay, crop.season, crop.year].filter(Boolean).join(' ')

// The date the Year filter reads.
export const cropDate = (crop) => crop.date_planted

// The Harvest date column: the day it was harvested once it is, the expected day until then.
export const cropHarvestDate = (crop) => (crop.status === 'Harvested' && crop.actual_harvest_date) || crop.expected_harvest_date
