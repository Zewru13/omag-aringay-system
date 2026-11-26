// The address that opens the Add Farm Parcels window: ?addParcels=1 on Crop Records (with &farmer=<id> for one farmer) or on a
// farmer's profile. No imports, so the pages that only link to the window stay light.
const OPEN = 'addParcels'

export function readAddParcels(params) {
  const isOpen = params.get(OPEN) === '1'
  const farmer = params.get('farmer') || ''
  return { isOpen, farmerId: isOpen && /^\d+$/.test(farmer) ? farmer : '' }
}

export function openAddParcelsParams(params) {
  const next = new URLSearchParams(params)
  next.set(OPEN, '1')
  return next
}

export function closeAddParcelsParams(params) {
  const next = new URLSearchParams(params)
  next.delete(OPEN)
  next.delete('farmer')
  return next
}

export function addParcelsAddress({ profileId, farmerId } = {}) {
  if (profileId) return `/farmers/${profileId}?${OPEN}=1`
  return `/crop-records?${OPEN}=1${farmerId ? `&farmer=${farmerId}` : ''}`
}
