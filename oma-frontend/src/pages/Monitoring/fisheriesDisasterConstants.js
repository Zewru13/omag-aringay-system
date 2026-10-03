// Shared by the fisherfolk disaster forms (Log Disaster, and Report Disaster on a stock): the disaster
// types, the aquaculture equipment list, photo rules, and error/payload helpers.

// Fisherfolk accounts: no Disease Outbreak (disease is handled through the Health Log / Force Harvest).
// Values are the backend's own FisheriesDisasterReport choices (it enforces this same list for fisherfolk).
export const FISHERFOLK_DISASTER_TYPES = ['Typhoon', 'Flooding', 'Storm Surge', 'El Nino Drought', 'Red Tide', 'Other']

// Aquaculture equipment/facilities only - no capture-fishing gear (boat, engine, paddle, fishing net/gear,
// fish/crab traps, ice box). One option per kind of equipment: combined labels (Air Pump / Blower,
// Cage Frame / Floats, Mooring / Anchor) cover what would otherwise be near-duplicates. Earlier labels
// (Fishpond Dike, Pond Gate, Fish Cage, Fish Pen, Fingerlings, Feeds, ...) are kept exactly.
export const AQUACULTURE_EQUIPMENT_GROUPS = [
  { label: 'Pond / Farm Infrastructure', options: ['Fishpond Dike', 'Pond Gate', 'Pond Inlet / Outlet Pipe', 'Water Pump'] },
  { label: 'Water Management / Aeration', options: ['Paddlewheel Aerator', 'Air Pump / Blower', 'Aeration Diffuser / Air Stone'] },
  { label: 'Fish Cage / Culture Structures', options: ['Fish Cage', 'Cage Net', 'Cage Frame / Floats', 'Mooring / Anchor', 'Fish Pen', 'Hapa Net', 'Feeding Platform'] },
  { label: 'Feeding / Handling', options: ['Feeding Tray', 'Feed Storage Container', 'Scoop / Handling Net'] },
  { label: 'Monitoring / Farm Equipment', options: ['Water Quality Testing Kit', 'Dissolved Oxygen Meter', 'pH Meter', 'Salinity Meter', 'Weighing Scale', 'Generator', 'Electrical Control Panel'] },
  { label: 'Farm Inputs', options: ['Feeds', 'Fingerlings'] },
  { label: null, options: ['Other'] },
]
export const AQUACULTURE_EQUIPMENT_OPTIONS = AQUACULTURE_EQUIPMENT_GROUPS.flatMap(g => g.options)

// Photo Documentation of Damage: optional, 0-10 photos; same formats/size as the backend's
// validate_uploaded_image (JPG/PNG/WEBP, 5 MB each).
export const MAX_DAMAGE_PHOTOS = 10
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
export const PHOTO_MAX_BYTES = 5 * 1024 * 1024

// First readable message from a DRF error response ({detail} or {field: [msg]}), so a rejected report
// shows WHY instead of a generic failure.
export function firstApiError(data, fallback) {
  if (!data) return fallback
  if (typeof data === 'string') return fallback
  if (data.detail) return String(data.detail)
  for (const value of Object.values(data)) {
    const msg = Array.isArray(value) ? value[0] : value
    if (msg && typeof msg === 'string') return msg
  }
  return fallback
}

// The error toast for a failed save: the server's reason, or - for a server error - a clear "nothing saved".
export function saveErrorMessage(err, fallback = 'Failed to save the disaster report.') {
  const status = err?.response?.status
  if (status >= 500) return 'The server could not save this report. Nothing was saved - please try again or contact the office.'
  if (!err?.response) return 'Could not reach the server. Nothing was saved - check your connection and try again.'
  return firstApiError(err.response.data, fallback)
}

// "Equipment Damaged" selections are stored as one comma-separated text ("Other" -> its specified text).
export function equipmentPayload(selected, otherText) {
  return selected.map(item => (item === 'Other' ? otherText.trim() : item)).filter(Boolean).join(', ')
}
