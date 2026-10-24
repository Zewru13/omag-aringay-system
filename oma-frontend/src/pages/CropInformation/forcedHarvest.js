// Force Harvest of a parcel (Crop Records > a parcel's ⋮ menu > Force harvest): several crops that are not ready yet, harvested together
// for one reason (an upcoming typhoon, a drought...). Pure functions - no screen, no network - for which crops are offered, what each row
// needs, and what is sent (POST /production/forced-harvest/). The server checks everything again.
import { FORCED_OTHER, FORCED_REASONS, TOLERANCE_DAYS, forcedProblem, harvestTiming } from '../Monitoring/harvestReport.js'
import { needsTotalKg, quantityProblem, totalKgProblem, weightFor } from '../Monitoring/harvestUnits.js'

export const STANDARD_UNITS = ['kg', 'bags', 'cavan', 'sacks', 'pieces', 'bundles', 'boxes']
export const MAX_CROPS = 100   // the most the server takes in one request
const GROWING = ['Planted', 'Near Harvest']

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

// How many days before its expected harvest date the crop would be harvested on `harvestISO` (null when that cannot be told).
export function daysEarly(record, harvestISO) {
  const { varianceDays } = harvestTiming(record.date_planted, record.expected_harvest_date, harvestISO)
  return varianceDays === null ? null : 0 - varianceDays
}

// Why a crop cannot be force harvested on that date ('' when it can): it is not growing any more, its planting date is only an estimate,
// or it is not early enough (within TOLERANCE_DAYS of its expected date it is an ordinary harvest: Record Harvest).
export function notOffered(record, harvestISO) {
  if (!GROWING.includes(record.status)) return `${record.status}`
  if (record.date_planted_is_estimated) return 'planting date is only an estimate'
  if (!record.expected_harvest_date) return 'no expected harvest date'
  const early = daysEarly(record, harvestISO)
  if (early === null || early <= TOLERANCE_DAYS) return `within ${TOLERANCE_DAYS} days of its expected harvest date`
  return ''
}

// The parcel's crops split for the table: the ones that can be force harvested, and how many cannot (with why).
export function splitCrops(records, harvestISO) {
  const offered = []
  const skipped = []
  ;(records || []).forEach((record) => {
    const why = notOffered(record, harvestISO)
    if (!why) offered.push({ record, daysEarly: daysEarly(record, harvestISO) })
    else if (GROWING.includes(record.status)) skipped.push({ record, why })
  })
  return { offered, skipped }
}

export const cropLabel = (r) => `${r.crop_type_name || 'Crop'}${r.variety_used ? ` (${r.variety_used})` : ''}`

// A row of the table once its crop is ticked: the whole planted area to start with, the quantity still to type (in the unit chosen).
// `total` is the total kg, only asked for when the unit has no standard weight (Settings > Harvest Units).
export function makeRow(record) {
  const planted = num(record.area_planted_ha)
  const units = record.crop_allowed_units && record.crop_allowed_units.length ? record.crop_allowed_units : STANDARD_UNITS
  return {
    id: record.id, label: cropLabel(record), cropTypeId: record.crop_type ?? null, plantedHa: planted, area: planted === null ? '' : String(planted),
    quantity: '', total: '', unit: units[0], units,
  }
}

// The kg one unit of this row weighs: undefined while the weights load, null when it has no standard weight.
export const rowWeight = (row, weights) => (weights === null || weights === undefined ? undefined : weightFor(weights, row.unit, row.cropTypeId))

export function rowProblem(row, weights) {
  const area = num(row.area)
  if (area === null || area <= 0) return 'Enter the area harvested.'
  if (row.plantedHa !== null && area > row.plantedHa) return `Cannot be more than the area planted (${row.plantedHa} ha).`
  const quantity = quantityProblem(row.quantity)
  if (quantity) return quantity
  return needsTotalKg(rowWeight(row, weights)) ? totalKgProblem(row.total) : ''
}

// Why the form cannot be sent yet ('' when it can). `today` is YYYY-MM-DD.
export function formProblem({ date, code, detail, rows }, today) {
  if (!rows.length) return 'Tick at least one crop.'
  if (rows.length > MAX_CROPS) return `Choose at most ${MAX_CROPS} crops at a time.`
  if (!date) return 'Enter the harvested date.'
  if (date > today) return 'The harvested date cannot be in the future.'
  const reason = forcedProblem(code, detail)
  if (reason) return reason
  return ''
}

export const countLine = (n) => (n ? `${n} crop${n === 1 ? '' : 's'} selected` : 'No crops selected')

export function buildRequest({ date, code, detail, remarks }, rows, weights) {
  return {
    harvest_date: date,
    force_harvest_reason: code,
    force_harvest_detail: code === FORCED_OTHER || (detail || '').trim() ? (detail || '').trim() : '',
    remarks: (remarks || '').trim(),
    crops: rows.map((r) => ({
      monitoring_record: r.id, area_harvested_hectares: Number(r.area), quantity_harvested: Number(r.quantity), unit_of_measure: r.unit,
      // the server converts the quantity to kg; only a unit with no standard weight needs the total kg typed
      ...(needsTotalKg(rowWeight(r, weights)) ? { volume_kg: Number(r.total) } : {}),
    })),
  }
}

export { FORCED_REASONS }

// The server's refusal as one sentence.
export function serverMessage(data) {
  const first = (value) => (Array.isArray(value) ? value[0] : value)
  return first(data?.detail) || first(data?.crops) || first(data?.harvest_date) || first(data?.force_harvest_reason) || first(data?.force_harvest_detail)
    || 'Unable to save the forced harvest. Please try again.'
}
