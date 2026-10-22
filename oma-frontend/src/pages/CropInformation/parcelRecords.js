// Crop Records is a table of farm parcels; opening a parcel lists the crop records on it. Pure helpers for that page and
// for the Add Crop page it links to, with no screen and no network, so they can be tested on their own.

export const parcelLabel = (parcel) => parcel.parcel_number || `Parcel #${parcel.id}`

export function cropCountLabel(count) {
  const n = Number(count) || 0
  if (n === 0) return 'No crops yet'
  return n === 1 ? '1 crop' : `${n} crops`
}

const typed = (value) => (typeof value === 'string' ? value.trim() : value)

// The parcel list's request: only what is typed or chosen is sent.
export function directoryParams({ search, barangay, farmStatus, page } = {}) {
  const params = { page: page || 1 }
  if (typed(search)) params.search = typed(search)
  if (barangay) params.barangay = barangay
  if (farmStatus) params.farm_status = farmStatus
  return params
}

// The crops with no parcel on file (older records, organization crops). A parcel's own status does not apply to them.
export function noParcelParams({ search, barangay } = {}) {
  const params = { farm_parcel: 'none' }
  if (typed(search)) params.search = typed(search)
  if (barangay) params.barangay = barangay
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

const LAND_STATUSES = ['Owner', 'Tenant', 'Lessee']

// A farmer with exactly one parcel does not have to pick it: a row with no parcel gets it, with the parcel's barangay and
// the farmer's tenure there when those are still blank. A parcel already chosen, or several to choose from, is left alone.
export function ownerParcelFill(parcels, row) {
  if (parcels.length !== 1 || row.farm_parcel) return { farm_parcel: row.farm_parcel, farm_location_barangay: row.farm_location_barangay, land_status: row.land_status }
  const [parcel] = parcels
  return {
    farm_parcel: String(parcel.id),
    farm_location_barangay: row.farm_location_barangay || parcel.barangay || '',
    land_status: row.land_status || (LAND_STATUSES.includes(parcel.land_ownership) ? parcel.land_ownership : ''),
  }
}

// Why the Add Crop form cannot be saved yet, as one sentence ('' when it can). Every crop sits on one of the farmer's parcels.
export function parcelProblem({ farmerId, ready, parcels, rows }) {
  if (!farmerId || !ready) return ''
  if (parcels.length === 0) return 'This farmer has no farm parcel yet. Add a farm parcel first, then add the crop.'
  const index = rows.findIndex((row) => !row.farm_parcel)
  return index === -1 ? '' : `Row ${index + 1}: choose the farm parcel this crop is grown on.`
}
