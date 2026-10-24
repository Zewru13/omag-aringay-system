import assert from 'node:assert/strict'

const {
  daysEarly, notOffered, splitCrops, cropLabel, makeRow, rowProblem, rowWeight, formProblem, countLine, buildRequest, serverMessage, STANDARD_UNITS, MAX_CROPS,
} = await import(new URL('../src/pages/CropInformation/forcedHarvest.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// a 100-day crop planted 2026-05-01 is expected on 2026-08-09
const rec = (id, over = {}) => ({ id, crop_type_name: 'Palay (Rice)', variety_used: 'NSIC Rc222', status: 'Planted', date_planted: '2026-05-01',
  expected_harvest_date: '2026-08-09', date_planted_is_estimated: false, area_planted_ha: '2.0000', crop_allowed_units: [], crop_type: 4, ...over })
const TODAY = '2026-07-01'

// ── how early
eq(daysEarly(rec(1), TODAY), 39, 'days before the expected date')
eq(daysEarly(rec(1), '2026-08-09'), 0, 'on the expected date')
eq(daysEarly(rec(1), '2026-08-12'), -3, 'after it')
eq(daysEarly(rec(1, { expected_harvest_date: null }), TODAY), null, 'no expected date')

// ── which crops are offered
eq(notOffered(rec(1), TODAY), '', 'a young crop is offered')
eq(notOffered(rec(1, { status: 'Near Harvest' }), TODAY), '', 'a near harvest crop that is still 39 days away is offered')
eq(notOffered(rec(1, { status: 'Harvested' }), TODAY), 'Harvested', 'harvested')
eq(notOffered(rec(1, { status: 'Total Loss' }), TODAY), 'Total Loss', 'lost')
eq(notOffered(rec(1, { date_planted_is_estimated: true }), TODAY), 'planting date is only an estimate', 'estimated planting date')
eq(notOffered(rec(1, { expected_harvest_date: null }), TODAY), 'no expected harvest date', 'no expected date')
eq(notOffered(rec(1), '2026-08-02'), 'within 7 days of its expected harvest date', 'exactly 7 days early is an ordinary harvest')
eq(notOffered(rec(1), '2026-08-01'), '', '8 days early is a forced harvest')
const split = splitCrops([rec(1), rec(2, { status: 'Harvested' }), rec(3, { expected_harvest_date: '2026-07-05' }), rec(4, { status: 'Near Harvest' })], TODAY)
eq(split.offered.map((o) => [o.record.id, o.daysEarly]), [[1, 39], [4, 39]], 'offered crops with their days early')
eq(split.skipped.map((s) => [s.record.id, s.why]), [[3, 'within 7 days of its expected harvest date']], 'growing crops that are not offered (finished ones are not mentioned)')
eq(splitCrops(undefined, TODAY), { offered: [], skipped: [] }, 'nothing loaded')

// ── a row
eq(cropLabel(rec(1)), 'Palay (Rice) (NSIC Rc222)', 'label with variety')
eq(cropLabel(rec(1, { variety_used: '' })), 'Palay (Rice)', 'label without variety')
eq(makeRow(rec(1)), { id: 1, label: 'Palay (Rice) (NSIC Rc222)', cropTypeId: 4, plantedHa: 2, area: '2', quantity: '', total: '', unit: 'kg', units: STANDARD_UNITS }, 'a row starts with the whole planted area')
eq(makeRow(rec(2, { crop_allowed_units: ['bags', 'kg'] })).unit, 'bags', "the crop's own units")
eq(makeRow(rec(3, { area_planted_ha: null })).area, '', 'no planted area recorded')
const weights = [{ unit: 'Sack', crop_type: null, kg_per_unit: '50' }, { unit: 'Bundle', crop_type: null, kg_per_unit: null }]
const row = (over = {}) => ({ ...makeRow(rec(1)), quantity: '1500', ...over })
eq(rowProblem(row(), weights), '', 'a good row')
eq(rowProblem(row({ area: '' }), weights), 'Enter the area harvested.', 'area needed')
eq(rowProblem(row({ area: '2.5' }), weights), 'Cannot be more than the area planted (2 ha).', 'not more than planted')
eq(rowProblem(row({ quantity: '' }), weights), 'Quantity harvested is required.', 'quantity needed')
eq(rowProblem(row({ quantity: '0' }), weights), 'Quantity must be greater than 0.', 'quantity above zero')
eq(rowWeight(row({ unit: 'Sack' }), weights), 50, 'the weight of a unit')
eq(rowWeight(row({ unit: 'Sack' }), null), undefined, 'weights still loading')
eq(rowProblem(row({ unit: 'Bundle', quantity: '20' }), weights), 'Total weight (kg) is required for this unit.', 'a unit with no weight asks for the total kg')
eq(rowProblem(row({ unit: 'Bundle', quantity: '20', total: '40' }), weights), '', 'and is fine once it is typed')
eq(rowProblem(row({ unit: 'Sack', quantity: '20' }), weights), '', 'a unit with a weight asks for nothing more')

// ── the form
const ok = { date: TODAY, code: 'upcoming_typhoon', detail: '', rows: [row()] }
eq(formProblem(ok, TODAY), '', 'a good form')
eq(formProblem({ ...ok, rows: [] }, TODAY), 'Tick at least one crop.', 'at least one crop')
eq(formProblem({ ...ok, date: '' }, TODAY), 'Enter the harvested date.', 'date needed')
eq(formProblem({ ...ok, date: '2026-07-02' }, TODAY), 'The harvested date cannot be in the future.', 'no future date')
eq(formProblem({ ...ok, code: '' }, TODAY), 'Choose why the crop is being harvested early.', 'reason needed')
eq(formProblem({ ...ok, code: 'other', detail: ' ' }, TODAY), 'Describe the reason.', 'Other needs a description')
eq(formProblem({ ...ok, rows: Array.from({ length: MAX_CROPS + 1 }, () => row()) }, TODAY), `Choose at most ${MAX_CROPS} crops at a time.`, 'too many')
eq(countLine(0), 'No crops selected', 'count: none')
eq(countLine(1), '1 crop selected', 'count: one')
eq(countLine(3), '3 crops selected', 'count: many')

// ── what is sent
eq(buildRequest({ date: TODAY, code: 'upcoming_typhoon', detail: ' signal no. 3 ', remarks: ' whole parcel ' }, [row({ area: '1.5', quantity: '24', unit: 'Sack' })], weights), {
  harvest_date: TODAY, force_harvest_reason: 'upcoming_typhoon', force_harvest_detail: 'signal no. 3', remarks: 'whole parcel',
  crops: [{ monitoring_record: 1, area_harvested_hectares: 1.5, quantity_harvested: 24, unit_of_measure: 'Sack' }],
}, 'request: the server converts the quantity')
eq(buildRequest({ date: TODAY, code: 'drought', detail: '', remarks: '' }, [row({ unit: 'Bundle', quantity: '20', total: '40' })], weights).crops,
  [{ monitoring_record: 1, area_harvested_hectares: 2, quantity_harvested: 20, unit_of_measure: 'Bundle', volume_kg: 40 }], 'a unit with no weight sends the total kg')
eq(buildRequest({ date: TODAY, code: 'drought', detail: '', remarks: '' }, [row()], weights).force_harvest_detail, '', 'no detail')
eq(serverMessage({ detail: 'Palay (Rice): not early enough.' }), 'Palay (Rice): not early enough.', 'server detail')
eq(serverMessage({ crops: ['Choose at least one crop.'] }), 'Choose at least one crop.', 'server crops')
eq(serverMessage(undefined), 'Unable to save the forced harvest. Please try again.', 'unknown failure')

console.log(`forcedHarvest: ${n} checks passed`)
