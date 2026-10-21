// Logging one disaster on several of a farmer's crops at once (POST /production/disasters/multi/). Pure functions - no
// screen, no network - so the rules can be tested on their own. The server checks everything again.

export const MAX_CROPS = 50

const WHOLE_AREA_TOLERANCE = 0.00005   // the same tolerance the single-crop form uses

const numberOrNull = (v) => {
  if (v === null || v === undefined || v === '') return null
  const num = Number(v)
  return Number.isNaN(num) ? null : num
}

// One row per chosen crop. Each starts with its whole planted area affected (the usual case for a storm or a flood).
export function toRows(crops) {
  return crops.map((c) => {
    const plantedHa = numberOrNull(c.area_planted_ha)
    return { id: c.id, label: c.label || c.crop_type_name || 'Crop', plantedHa, area: plantedHa === null ? '' : String(plantedHa), total: false }
  })
}

// Total Loss means the whole planted area is affected. A crop with no recorded area has no limit to compare with.
export function isWholeArea(row) {
  if (row.plantedHa === null) return true
  const area = parseFloat(row.area)
  return !Number.isNaN(area) && Math.abs(area - row.plantedHa) < WHOLE_AREA_TOLERANCE
}

export const withArea = (row, value) => {
  const next = { ...row, area: value }
  return { ...next, total: row.total && isWholeArea(next) }
}

export const withTotal = (row, checked) => ({ ...row, total: Boolean(checked) && isWholeArea(row) })

export function areaProblem(row) {
  if (row.area === '' || row.area === null || row.area === undefined) return 'Area affected is required.'
  const area = parseFloat(row.area)
  if (Number.isNaN(area) || area <= 0) return 'Area must be greater than 0.'
  if (row.plantedHa !== null && area > row.plantedHa) return `Cannot exceed the area planted (${row.plantedHa} ha).`
  return ''
}

// The date is shared by every chosen crop: not in the future, and not before the latest planting date among them.
export function dateProblem(date, rows, crops, today) {
  if (!date) return 'Date of occurrence is required.'
  if (date > today) return 'Date cannot be in the future.'
  const chosen = rows.map((r) => crops.find((c) => c.id === r.id)).filter((c) => c && c.date_planted)
  const latest = chosen.reduce((best, c) => (!best || c.date_planted > best.date_planted ? c : best), null)
  if (latest && date < latest.date_planted) {
    return `Date cannot be before the planting date of ${latest.crop_type_name || 'this crop'} (${latest.date_planted}).`
  }
  return ''
}

// shared = { disasterType, other, date, damage, loss }; the server also gets the photos (added by the form).
export function buildRequest(shared, rows) {
  return {
    fields: {
      disaster_type: shared.disasterType,
      disaster_type_other_specify: shared.disasterType === 'Other' ? String(shared.other || '').trim() : '',
      date_of_occurrence: shared.date,
      estimated_damage: shared.damage,
      production_loss: shared.loss,
    },
    crops: rows.map((r) => ({ monitoring_record: r.id, area_affected_ha: parseFloat(r.area), is_total_loss: r.total && isWholeArea(r) })),
  }
}

export function selectionSummary(rows) {
  if (!rows.length) return 'No crops selected'
  return `${rows.length} crop${rows.length === 1 ? '' : 's'} selected`
}

export function filterCrops(crops, query) {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return crops
  return crops.filter((c) => `${c.label || ''} ${c.crop_type_name || ''}`.toLowerCase().includes(q))
}
