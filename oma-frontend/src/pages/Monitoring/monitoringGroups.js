// Crop Monitoring grouped by crop, by farmer or by farm parcel (GET /production/monitoring/groups/). Pure helpers, no screen and no
// network, so the rules can be tested on their own.

export const GROUP_OPTIONS = [
  { value: 'crop', label: 'Crop' },
  { value: 'farmer', label: 'Farmer' },
  { value: 'parcel', label: 'Farm Parcel' },
  { value: 'none', label: 'No grouping' },
]
export const DEFAULT_GROUP = 'none'
// Crop Monitoring opens on the crops that are still in the ground; "All Status" is one choice away.
export const DEFAULT_STATUS = 'Planted'
// A farmer account's crops are always grouped by its own farm parcels.
export const FARMER_GROUP = 'parcel'

// "Due / Ready / Overdue" are not real statuses: they split Near Harvest by how far the expected date is, and the server
// does that split when it is given display_status.
export const DISPLAY_STATUSES = ['Due Harvest', 'Ready for Harvest', 'Overdue']

// The filters the list AND the groups are asked with, so a group's count is always the number of records it opens onto.
export function monitoringParams({ statusFilter, season, year, barangay, cropType, search }) {
  const params = {}
  if (DISPLAY_STATUSES.includes(statusFilter)) {
    params.status = 'Near Harvest'
    params.display_status = statusFilter
  } else if (statusFilter && statusFilter !== 'all') {
    params.status = statusFilter
  }
  if (season) params.season = season
  if (year) params.year = year
  if (barangay) params.barangay = barangay
  if (cropType) params.crop_type = cropType
  if (search) params.search = search
  return params
}

// What to add to the list's filters to get one group's records; null when the group has nothing to open onto.
export function groupChildParams(groupBy, group) {
  if (groupBy === 'crop') return { crop_type: group.id }
  if (groupBy === 'parcel') return { farm_parcel: group.id || 'none' }   // the crops with no parcel are ?farm_parcel=none
  if (String(group.key).startsWith('o')) return { farmers_organization: group.id }
  if (group.id) return { farmer: group.id }
  return null
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export function groupSummary(group) {
  const parts = [plural(group.count, 'record')]
  const area = Math.round((group.area_planted_ha || 0) * 100) / 100
  if (area > 0) parts.push(`${area} ha`)
  if (group.near_harvest > 0) parts.push(`${group.near_harvest} near harvest`)
  return parts.join(' · ')
}

// "Group by Farm Parcel" shows each parcel as a row of columns, not just a name: who owns it, where, how big, and what is on it.
export const PARCEL_GROUP_COLUMNS = ['Farm parcel', 'Farmer', 'Barangay', 'Area (ha)', 'Ownership', 'Records']

// What those columns hold for one parcel group; a group with no parcel (older records) has only its records.
export function parcelGroupFacts(group) {
  if (!group.id) return { farmer: '', rsbsa: '', barangay: '', area: '', ownership: '', records: groupSummary(group) }
  const area = Number(group.parcel_area_hectares)
  return {
    farmer: group.farmer_name || '',
    rsbsa: group.rsbsa_number || '',
    barangay: group.barangay || '',
    area: Number.isFinite(area) && area > 0 ? area.toFixed(2) : '',
    ownership: group.land_ownership || '',
    records: groupSummary(group),
  }
}

export const groupHeading = (groupBy, group) => (groupBy !== 'crop' && group.barangay ? `${group.name} · ${group.barangay}` : group.name)
