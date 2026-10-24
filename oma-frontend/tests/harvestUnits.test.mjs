import assert from 'node:assert/strict'

const {
  weightFor, computeKg, needsTotalKg, unitPreview, quantityProblem, totalKgProblem, harvestKg, quantityPayload, harvestAmountText,
} = await import(new URL('../src/pages/Monitoring/harvestUnits.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const weights = [
  { unit: 'Metric Ton', crop_type: null, kg_per_unit: '1000.0000' },
  { unit: 'Cavan (50kg)', crop_type: null, kg_per_unit: '50.0000' },
  { unit: 'Sack', crop_type: 7, kg_per_unit: '50.0000' },
  { unit: 'Sack', crop_type: null, kg_per_unit: '30.0000' },
  { unit: 'Bundle', crop_type: 9, kg_per_unit: null },
  { unit: 'Bundle', crop_type: null, kg_per_unit: '1.5' },
]

// ── finding the weight
eq(weightFor(weights, 'kg'), 1, 'kg is built in')
eq(weightFor([], 'KG'), 1, 'kg without any settings')
eq(weightFor(weights, ''), 1, 'no unit is kg')
eq(weightFor(weights, 'metric ton'), 1000, 'case does not matter')
eq(weightFor(weights, 'Cavan (50kg)'), 50, 'cavan')
eq(weightFor(weights, 'Sack', 7), 50, 'the crop has its own row')
eq(weightFor(weights, 'Sack', 8), 30, 'another crop uses the row for every crop')
eq(weightFor(weights, 'Sack'), 30, 'no crop')
eq(weightFor(weights, 'Bundle', 9), null, 'a crop with an empty row has no standard weight')
eq(weightFor(weights, 'Bundle', 8), 1.5, 'other crops use the general bundle weight')
eq(weightFor(weights, 'Crate'), null, 'a unit with no row has no standard weight')
eq(weightFor(undefined, 'Sack'), null, 'nothing loaded')

// ── the kg
eq(computeKg('20', 50), 1000, 'quantity x weight')
eq(computeKg('0.333', 3), 1, 'rounded to two decimals')
eq(computeKg('', 50), null, 'no quantity yet')
eq(computeKg('20', null), null, 'no weight')
eq([needsTotalKg(null), needsTotalKg(50), needsTotalKg(undefined)], [true, false, false], 'when the total kg is asked for')
eq(harvestKg('20', 50, ''), 1000, 'kg from the quantity')
eq(harvestKg('20', null, '40'), 40, 'the typed total for a unit with no weight')
eq(harvestKg('20', null, ''), null, 'no total typed yet')

// ── what is shown while typing
eq(unitPreview('20', 'Sack', 50), '20 Sack × 50 kg = 1,000 kg', 'sacks')
eq(unitPreview('', 'Sack', 50), '1 Sack = 50 kg', 'nothing typed yet')
eq(unitPreview('125.5', 'kg', 1), '125.5 kg', 'kg')
eq(unitPreview('20', 'Crate', null), 'Crate has no standard weight: enter the total weight in kg. An Admin can set one in Harvest Unit Settings.', 'no weight')
eq(unitPreview('20', 'Sack', undefined), '', 'weights still loading')
eq(quantityProblem(''), 'Quantity harvested is required.', 'quantity needed')
eq(quantityProblem('0'), 'Quantity must be greater than 0.', 'quantity above zero')
eq(quantityProblem('12'), '', 'a good quantity')
eq(totalKgProblem(''), 'Total weight (kg) is required for this unit.', 'total needed')
eq(totalKgProblem('-1'), 'Total weight must be greater than 0.', 'total above zero')
eq(totalKgProblem('40'), '', 'a good total')

// ── what is sent
eq(quantityPayload({ quantity: '20', unit: 'Sack', weight: 50, totalKg: '' }), { quantity_harvested: 20, unit_of_measure: 'Sack' }, 'the server computes the kg')
eq(quantityPayload({ quantity: '20', unit: 'Bundle', weight: null, totalKg: '40' }), { quantity_harvested: 20, unit_of_measure: 'Bundle', volume_kg: 40 }, 'the total kg for a unit with no weight')

// ── how a saved harvest reads
eq(harvestAmountText({ volume_kg: '1000.00', quantity_harvested: '20.00', unit_of_measure: 'Sack' }), '20 Sack (1,000 kg)', 'counted in sacks')
eq(harvestAmountText({ volume_kg: '125.50', quantity_harvested: '125.50', unit_of_measure: 'kg' }), '125.5 kg', 'counted in kg')
eq(harvestAmountText({ volume_kg: '8000.00', quantity_harvested: null, unit_of_measure: 'kg' }), '8,000 kg', 'an older harvest in kg')
eq(harvestAmountText({ volume_kg: '50.00', quantity_harvested: null, unit_of_measure: 'cavan' }), '50 kg (recorded in cavan)', 'an older harvest in another unit keeps its number and says so')
eq(harvestAmountText({ volume_kg: null }), '', 'nothing')

console.log(`harvestUnits: ${n} checks passed`)
