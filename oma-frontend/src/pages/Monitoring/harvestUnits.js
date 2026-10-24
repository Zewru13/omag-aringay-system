// Harvest units and their weight in kg (Settings > Harvest Units). A harvest is typed in the unit it was counted in (20 sacks) and
// saved in kg: the server does the real conversion (production/unit_weights.py); these pure helpers give the forms the same answer
// while typing, and say when a unit has no standard weight so the form asks for the total kg instead.

export const KG = 'kg'

const normalize = (unit) => String(unit || KG).trim().replace(/\s+/g, ' ').toLowerCase()

// The kg one `unit` weighs for a crop (a number), or null when it has no standard weight. `weights` is the settings list
// [{ unit, crop_type, kg_per_unit }]. kg is built in; the crop's own row wins over the row for every crop (even when it is empty).
export function weightFor(weights, unit, cropTypeId = null) {
  const name = normalize(unit)
  if (name === KG) return 1
  const rows = (weights || []).filter((w) => normalize(w.unit) === name)
  const own = cropTypeId ? rows.find((w) => Number(w.crop_type) === Number(cropTypeId)) : null
  const row = own || rows.find((w) => w.crop_type === null || w.crop_type === undefined)
  if (!row || row.kg_per_unit === null || row.kg_per_unit === undefined || row.kg_per_unit === '') return null
  const kg = Number(row.kg_per_unit)
  return Number.isNaN(kg) || kg <= 0 ? null : kg
}

const num = (v) => {
  if (v === '' || v === null || v === undefined) return null
  const n = Number(v)
  return Number.isNaN(n) ? null : n
}

const fmt = (n) => n.toLocaleString('en-US', { maximumFractionDigits: 2 })

// The kg for a quantity at a weight (rounded to 2 decimals, as the server does); null when either is missing.
export function computeKg(quantity, weight) {
  const q = num(quantity)
  if (q === null || weight === null || weight === undefined) return null
  return Math.round(q * weight * 100) / 100
}

// While the weights are still loading the weight is `undefined`: nothing is shown and nothing is asked until it is known.
export const needsTotalKg = (weight) => weight === null

// The line under the quantity box: "20 Sack × 50 kg = 1,000 kg", or why the total kg is asked for.
export function unitPreview(quantity, unit, weight) {
  if (weight === undefined) return ''
  if (weight === null) return `${unit} has no standard weight: enter the total weight in kg. An Admin can set one in Harvest Unit Settings.`
  const kg = computeKg(quantity, weight)
  if (normalize(unit) === KG) return kg === null ? '' : `${fmt(kg)} kg`
  return kg === null ? `1 ${unit} = ${fmt(weight)} kg` : `${fmt(num(quantity))} ${unit} × ${fmt(weight)} kg = ${fmt(kg)} kg`
}

export function quantityProblem(value) {
  const n = num(value)
  if (n === null) return 'Quantity harvested is required.'
  return n <= 0 ? 'Quantity must be greater than 0.' : ''
}

export function totalKgProblem(value) {
  const n = num(value)
  if (n === null) return 'Total weight (kg) is required for this unit.'
  return n <= 0 ? 'Total weight must be greater than 0.' : ''
}

// The kg the harvest will be saved as: quantity x weight, or the total typed for a unit with no weight (null while unknown).
export function harvestKg(quantity, weight, totalKg) {
  if (weight === null) return num(totalKg)
  return computeKg(quantity, weight)
}

// What is sent for the quantity: the quantity and unit, plus the total kg only when the unit has no standard weight (the server
// computes the kg itself otherwise).
export function quantityPayload({ quantity, unit, weight, totalKg }) {
  const body = { quantity_harvested: Number(quantity), unit_of_measure: unit }
  if (weight === null) body.volume_kg = Number(totalKg)
  return body
}

// How a saved harvest reads: "20 Sack (1,000 kg)" for one counted in a unit, "1,000 kg" for an older one or one counted in kg.
export function harvestAmountText(harvest) {
  const kg = num(harvest.volume_kg)
  const unit = harvest.unit_of_measure || KG
  const quantity = num(harvest.quantity_harvested)
  if (kg === null) return ''
  if (quantity === null || normalize(unit) === KG) return `${fmt(kg)} kg${quantity === null && normalize(unit) !== KG ? ` (recorded in ${unit})` : ''}`
  return `${fmt(quantity)} ${unit} (${fmt(kg)} kg)`
}
