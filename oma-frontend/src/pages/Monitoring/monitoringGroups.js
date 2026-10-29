// Crop Monitoring grouped by crop, by farmer or by farm parcel (GET /production/monitoring/groups/). Pure helpers, no screen and no
// network, so the rules can be tested on their own.

import { dateRangeParams } from '../../utils/dateRange.js'

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

// The stage choices of a crop list (Crop Monitoring, and a farmer's own crop list): Planted first, "All Status" last.
export const STATUS_FILTER_OPTIONS = [
  { value: 'Planted', label: 'Planted' },
  { value: 'Near Harvest', label: 'Near Harvest' },
  { value: 'Due Harvest', label: 'Due Harvest' },
  { value: 'Ready for Harvest', label: 'Ready for Harvest' },
  { value: 'Overdue', label: 'Overdue' },
  { value: 'Harvested', label: 'Harvested' },
  { value: 'Total Loss', label: 'Total Loss' },
  { value: 'all', label: 'All Status' },
]

// What a record's status pill says. Only a "Near Harvest" record is split by how far its expected date is (the same days the
// server uses for display_status): Due Harvest = still ahead, Ready for Harvest = today or up to 7 days past, Overdue = more than
// 7 days past with no harvest recorded. Every other status (Planted / Harvested / Total Loss) passes through.
export function cropDisplayStatus(rec, today = new Date()) {
  if (rec.status !== 'Near Harvest' || !rec.expected_harvest_date) return rec.status
  const start = new Date(today)
  start.setHours(0, 0, 0, 0)
  const expected = new Date(`${rec.expected_harvest_date}T00:00:00`)
  const diffDays = Math.round((expected - start) / (1000 * 60 * 60 * 24))
  if (diffDays < -7) return 'Overdue'
  return diffDays <= 0 ? 'Ready for Harvest' : 'Due Harvest'
}

// A farmer's own crop list is asked with the same filters as Crop Monitoring; "All Status" lists every status including Total Loss
// (an omitted status would leave Total Loss out, which is right for the operational list but not for a farmer's whole history).
export function farmerCropParams(farmerId, statusFilter) {
  const params = monitoringParams({ statusFilter })
  if (!params.status) params.status = 'Planted,Near Harvest,Harvested,Total Loss'
  return { farmer: farmerId, ...params }
}

// The filters the list AND the groups are asked with, so a group's count is always the number of records it opens onto.
export function monitoringParams({ statusFilter, season, year, barangay, cropType, pcic, search, plantedFrom, plantedTo }) {
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
  if (pcic) params.pcic = pcic
  Object.assign(params, dateRangeParams(plantedFrom, plantedTo, 'planted_from', 'planted_to'))
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
