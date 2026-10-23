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
export function directoryParams({ search, barangay, page } = {}) {
  const params = { page: page || 1 }
  if (typed(search)) params.search = typed(search)
  if (barangay) params.barangay = barangay
  return params
}

// The crops with no parcel on file (older records, organization crops). A parcel filter does not apply to them.
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

// "Add crops" in a parcel's ⋮ menu: the Add Crop Records page locked to this parcel, so its farmer and parcel cannot be changed there
// and every row is recorded on it.
export const addCropsLockedState = (parcel) => {
  const { prefill } = addCropState(parcel)
  return { prefill: { ...prefill, lockParcel: true, parcelLabel: parcelLabel(parcel), parcelAreaHa: parcel.area_hectares, farmerName: parcel.farmer_name } }
}

// ── purging a parcel that was sold or transferred
export const PURGE_REASONS = [
  { value: 'Sold', label: 'Sold' },
  { value: 'Transferred', label: 'Transferred to someone else' },
]
export const PURGE_NOTE_MAX = 500
export const purgeReasonLabel = (reason) => PURGE_REASONS.find((r) => r.value === reason)?.label || reason || '—'

// Why the Purge Parcel form cannot be sent yet ('' when it can). `today` is YYYY-MM-DD.
export function purgeProblem({ reason, date, note }, today) {
  if (!PURGE_REASONS.some((r) => r.value === reason)) return 'Choose why the parcel is leaving: sold or transferred.'
  if (date && date > today) return 'The date cannot be in the future.'
  if ((note || '').length > PURGE_NOTE_MAX) return `Keep the note under ${PURGE_NOTE_MAX} characters.`
  return ''
}

export const purgePayload = ({ reason, date, note }) => ({ reason, date: date || null, note: (note || '').trim() })

// The server's answer to a refused purge as one sentence.
export function purgeServerMessage(data) {
  const first = (value) => (Array.isArray(value) ? value[0] : value)
  return first(data?.detail) || first(data?.reason) || first(data?.date) || first(data?.note) || 'Unable to purge the parcel. Please try again.'
}

// The Purged Parcels table's request: only what is typed is sent.
export function purgedParams({ search, page } = {}) {
  const params = { page: page || 1 }
  if (typed(search)) params.search = typed(search)
  return params
}
