// Crop Records is a table of farm parcels; opening a parcel lists the crop records on it. Pure helpers for that page and
// for the Add Crop page it links to, with no screen and no network, so they can be tested on their own.

export const parcelLabel = (parcel) => parcel.parcel_number || `Parcel #${parcel.id}`

export function cropCountLabel(count) {
  const n = Number(count) || 0
  if (n === 0) return 'No crops yet'
  return n === 1 ? '1 crop' : `${n} crops`
}

const typed = (value) => (typeof value === 'string' ? value.trim() : value)

// How the parcels can be grouped. The parcels come in the server's own order (farmer A-Z).
export const GROUP_OPTIONS = [
  { value: 'none', label: 'No grouping' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'barangay', label: 'Barangay' },
  { value: 'ownership', label: 'Land ownership' },
]
export const DEFAULT_GROUP = 'none'

// The parcel list's request: only what is typed or chosen is sent.
export function directoryParams({ search, barangay, pcic, page } = {}) {
  const params = { page: page || 1 }
  if (typed(search)) params.search = typed(search)
  if (barangay) params.barangay = barangay
  if (pcic) params.pcic = pcic
  return params
}

// The same filters and sort, without the page: what the groups are asked with (plus group_by) and what an opened group adds to.
export function groupFilterParams(filters) {
  const params = directoryParams(filters)
  delete params.page
  return params
}

// What to add to the filters to get one group's parcels; null when the group has nothing to open onto.
export function groupChildParams(groupBy, group) {
  if (groupBy === 'farmer') return group.id ? { farmer: group.id } : null
  if (groupBy === 'barangay') return group.id ? { barangay: group.id } : null
  if (groupBy === 'ownership') return group.id ? { land_ownership: group.id } : null
  return null
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function groupSummary(group) {
  const parts = [plural(group.parcels, 'parcel')]
  const area = Math.round((group.area_hectares || 0) * 100) / 100
  if (area > 0) parts.push(`${area} ha`)
  parts.push(cropCountLabel(group.crops))
  return parts.join(' · ')
}

export const groupHeading = (groupBy, group) => (groupBy === 'farmer' && group.barangay ? `${group.name} · ${group.barangay}` : group.name)

// The crops with no parcel on file (older records, organization crops). A parcel filter does not apply to them.
export function noParcelParams({ search, barangay, pcic } = {}) {
  const params = { farm_parcel: 'none' }
  if (typed(search)) params.search = typed(search)
  if (barangay) params.barangay = barangay
  if (pcic) params.pcic = pcic
  return params
}

// "Add crop records" on a parcel: the Add Crop page starts with this farmer and parcel already chosen.
export const addCropState = (parcel) => ({
  prefill: {
    farmerId: parcel.farmer,
    rsbsa: parcel.rsbsa_number,
    parcel: { id: parcel.id, barangay: parcel.barangay, landOwnership: parcel.land_ownership },
  },
})

// What a crop's row menu offers: view, edit (not once harvested) and remarks. Records are never deleted from this page.
export function recordActionKeys(record) {
  return ['view', ...(record.status === 'Harvested' ? [] : ['edit']), 'remarks']
}

// A farmer with exactly one parcel does not have to pick it: a row with no parcel gets it, with the parcel's barangay when that is
// still blank. A parcel already chosen, or several to choose from, is left alone. (The crop's status is its parcel's land ownership.)
export function ownerParcelFill(parcels, row) {
  if (parcels.length !== 1 || row.farm_parcel) {
    return { farm_parcel: row.farm_parcel, farm_location_barangay: row.farm_location_barangay }
  }
  const [parcel] = parcels
  return {
    farm_parcel: String(parcel.id),
    farm_location_barangay: row.farm_location_barangay || parcel.barangay || '',
  }
}

// Why the Add Crop form cannot be saved yet, as one sentence ('' when it can). Every crop sits on one of the farmer's parcels.
export function parcelProblem({ farmerId, ready, parcels, rows }) {
  if (!farmerId || !ready) return ''
  if (parcels.length === 0) return 'This farmer has no farm parcel yet. Add a farm parcel first, then add the crop.'
  const index = rows.findIndex((row) => !row.farm_parcel)
  return index === -1 ? '' : `Row ${index + 1}: choose the farm parcel this crop is grown on.`
}

// "Add crops" in a parcel's ⋮ menu: the Add Crop Records page locked to this parcel, so its farmer and parcel cannot be changed there
// and every row is recorded on it.
export const addCropsLockedState = (parcel) => {
  const { prefill } = addCropState(parcel)
  return { prefill: { ...prefill, lockParcel: true, parcelLabel: parcelLabel(parcel), parcelAreaHa: parcel.area_hectares, farmerName: parcel.farmer_name } }
}
