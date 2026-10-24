import test from 'node:test'
import assert from 'node:assert/strict'
import {
  FORCE_REASONS, buildPayload, canForceHarvest, errorMessage, estimateText, flattenCycles, fmtKg, groupByCycle, isFutureDate,
  manilaToday, parseKg, reasonLabel, reviewRows, totalKg, validateForm,
} from '../src/pages/FisheriesRecords/emergencyForceHarvest.js'

const cycles = [
  { stocking_record: 11, species: 'Bangus', cycle_number: 1, cycle_name: 'Grow-out Phase', units: [
    { id: 101, label: 'Pond 1', estimated_harvest_kg: '29.75' },
    { id: 102, label: 'Pond 2', estimated_harvest_kg: null },
  ] },
  { stocking_record: 12, species: 'Tilapia', cycle_number: 2, cycle_name: 'Nursery', units: [
    { id: 201, label: 'Cage 1', estimated_harvest_kg: '10.00' },
  ] },
]
const rows = flattenCycles(cycles)

test('exactly the six reasons, in order, and no Other', () => {
  assert.deepEqual(FORCE_REASONS.map((r) => r.label), [
    'Upcoming Typhoon', 'Super Typhoon', 'El Niño', 'Drought', 'Possible Flooding', 'Fish Pest or Virus Spreading',
  ])
  assert.equal(FORCE_REASONS.length, 6)
  assert.ok(!FORCE_REASONS.some((r) => /other/i.test(r.label) || r.value === 'other'))
  assert.equal(reasonLabel('el_nino'), 'El Niño')
  assert.equal(reasonLabel('other'), '')
})

test('manilaToday is the Asia/Manila date, not the UTC date', () => {
  // 2026-10-22 18:30 UTC is already 2026-10-23 02:30 in Manila (UTC+8)
  assert.equal(manilaToday(new Date('2026-10-22T18:30:00Z')), '2026-10-23')
  // 2026-10-22 15:59 UTC is still 23:59 on the 22nd in Manila
  assert.equal(manilaToday(new Date('2026-10-22T15:59:00Z')), '2026-10-22')
  assert.match(manilaToday(), /^\d{4}-\d{2}-\d{2}$/)
})

test('a future date is detected against the given today', () => {
  assert.equal(isFutureDate('2026-10-23', '2026-10-22'), true)
  assert.equal(isFutureDate('2026-10-22', '2026-10-22'), false)
  assert.equal(isFutureDate('2026-10-01', '2026-10-22'), false)
  assert.equal(isFutureDate('', '2026-10-22'), false)
})

test('the menu offers Force Harvest for an ongoing record with a production cycle only', () => {
  assert.equal(canForceHarvest({ status: 'Stocked', production_cycle: 5 }), true)
  assert.equal(canForceHarvest({ status: 'Near Harvest', production_cycle: 5 }), true)
  assert.equal(canForceHarvest({ status: 'Harvested', production_cycle: 5 }), false)
  assert.equal(canForceHarvest({ status: 'Total Loss', production_cycle: 5 }), false)
  assert.equal(canForceHarvest({ status: 'Stocked', production_cycle: null }), false)
  assert.equal(canForceHarvest(null), false)
})

test('each pond or cage is its own row with its cycle, species and estimate; a missing estimate says so', () => {
  assert.equal(rows.length, 3)
  assert.deepEqual(rows.map((r) => [r.key, r.species, r.cycleLabel, r.unitLabel]), [
    ['11:101', 'Bangus', 'Cycle 1', 'Pond 1'], ['11:102', 'Bangus', 'Cycle 1', 'Pond 2'], ['12:201', 'Tilapia', 'Cycle 2', 'Cage 1'],
  ])
  assert.equal(estimateText(rows[0].estimate), '29.75')
  assert.equal(estimateText(rows[1].estimate), 'Estimate unavailable')
  assert.equal(estimateText(''), 'Estimate unavailable')
  assert.deepEqual(groupByCycle(rows).map((g) => [g.stockingRecord, g.species, g.rows.length]), [[11, 'Bangus', 2], [12, 'Tilapia', 1]])
})

test('an actual quantity must be a positive number with at most two decimals', () => {
  assert.equal(parseKg('12'), 12)
  assert.equal(parseKg(' 7.25 '), 7.25)
  for (const bad of ['', '0', '0.00', '-3', 'abc', '1.234', '1,5', null, undefined]) assert.ok(Number.isNaN(parseKg(bad)), String(bad))
})

test('the total is the sum of the selected units only, without floating-point noise', () => {
  const selected = new Set(['11:101', '12:201'])
  assert.equal(totalKg(rows, selected, { '11:101': '0.1', '12:201': '0.2', '11:102': '50' }), 0.3)
  assert.equal(totalKg(rows, new Set(), { '11:101': '5' }), 0)
  assert.equal(totalKg(rows, selected, { '11:101': '', '12:201': '4.5' }), 4.5)       // an empty or invalid entry adds nothing
})

test('validation needs a reason, a date not in the future, a selection and a positive quantity for every selected unit', () => {
  const ok = { reason: 'drought', date: '2026-10-22', today: '2026-10-22', rows, selected: new Set(['11:101']), actual: { '11:101': '5' } }
  assert.equal(validateForm(ok).ok, true)
  assert.match(validateForm({ ...ok, reason: '' }).errors.reason, /reason/i)
  assert.match(validateForm({ ...ok, date: '' }).errors.date, /date/i)
  assert.match(validateForm({ ...ok, date: '2026-10-23' }).errors.date, /future/i)
  assert.match(validateForm({ ...ok, selected: new Set() }).errors.selection, /at least one/i)
  const bad = validateForm({ ...ok, selected: new Set(['11:101', '12:201']), actual: { '11:101': '5', '12:201': '0' } })
  assert.equal(bad.ok, false)
  assert.deepEqual(Object.keys(bad.errors.kg), ['12:201'])                              // only the unit with the bad quantity
})

test('the request groups the selected units by cycle and keeps the typed quantities', () => {
  const payload = buildPayload({
    reason: 'super_typhoon', date: '2026-10-22', rows, selected: new Set(['11:101', '11:102', '12:201']),
    actual: { '11:101': '12.5', '11:102': ' 7 ', '12:201': '3' },
  })
  assert.deepEqual(payload, {
    reason: 'super_typhoon',
    harvest_date: '2026-10-22',
    cycles: [
      { stocking_record: 11, units: [{ production_unit: 101, quantity_kg: '12.5' }, { production_unit: 102, quantity_kg: '7' }] },
      { stocking_record: 12, units: [{ production_unit: 201, quantity_kg: '3' }] },
    ],
  })
  assert.ok(!('description' in payload) && !('notes' in payload) && !('photo' in payload))   // the reason is the only justification
})

test('the review table lists each selected unit with its estimate, or Estimate unavailable, and its actual', () => {
  const review = reviewRows({ rows, selected: new Set(['11:102', '12:201']), actual: { '11:102': '7', '12:201': '3.5' } })
  assert.deepEqual(review.map((r) => [r.species, r.cycleLabel, r.unitLabel, r.estimate, r.actual]), [
    ['Bangus', 'Cycle 1', 'Pond 2', 'Estimate unavailable', '7.00'],
    ['Tilapia', 'Cycle 2', 'Cage 1', '10.00', '3.50'],
  ])
})

test('kilograms are formatted with two decimals', () => {
  assert.equal(fmtKg('1234.5'), '1,234.50')
  assert.equal(fmtKg(null), '—')
})

test('an API error becomes one readable message', () => {
  assert.equal(errorMessage({ response: { data: { cycles: ['Pond 1 has already been harvested.'] } } }), 'Pond 1 has already been harvested.')
  assert.equal(errorMessage({ response: { data: { detail: 'Not found.' } } }), 'Not found.')
  assert.match(errorMessage({}), /Nothing was saved/)
})

import { FORCED_UNIT_STATUS, cycleStatusText } from '../src/pages/FisheriesRecords/emergencyForceHarvest.js'

const unitRows = (...harvested) => harvested.map((h, i) => ({ id: i + 1, label: `Pond ${i + 1}`, harvested: h, force_harvested: false }))

test('a force harvested pond shows Forced Harvested, never Stocked', () => {
  assert.equal(FORCED_UNIT_STATUS, 'Forced Harvested')
})

test('the cycle shows In Progress while some ponds are emergency force harvested and others are still growing', () => {
  const rec = { status: 'Stocked', display_status: 'Stocked', forced_harvests: [{ id: 1 }], harvest_units: unitRows(true, false) }
  assert.equal(cycleStatusText(rec), 'In Progress')
  assert.equal(cycleStatusText({ ...rec, harvest_units: unitRows(true, false, false) }), 'In Progress')
})

test('Near Harvest and Late are kept while some ponds are still growing', () => {
  const base = { forced_harvests: [{ id: 1 }], harvest_units: unitRows(true, false) }
  assert.equal(cycleStatusText({ ...base, status: 'Near Harvest', display_status: 'Near Harvest' }), 'Near Harvest')
  assert.equal(cycleStatusText({ ...base, status: 'Stocked', display_status: 'Late' }), 'Late')
})

test('a cycle finished by an emergency Force Harvest shows Forced Harvested in place of Harvested (and Stocked), one status only', () => {
  const done = { status: 'Harvested', display_status: 'Harvested', forced_harvests: [{ id: 1 }], harvest_units: unitRows(true, true) }
  assert.equal(cycleStatusText(done), 'Forced Harvested')
  assert.equal(cycleStatusText({ ...done, harvest_units: unitRows(true) }), 'Forced Harvested')                  // a single pond
  assert.equal(cycleStatusText({ ...done, forced_harvests: [{ id: 1 }, { id: 2 }] }), 'Forced Harvested')        // two Force Harvests
  assert.equal(cycleStatusText({ ...done, status: 'Stocked', display_status: 'Stocked' }), 'Stocked')   // not closed yet: unchanged
})

test('a finished cycle without an emergency Force Harvest is still Harvested (a normal or Health Log harvest)', () => {
  const done = { status: 'Harvested', display_status: 'Harvested', harvest_units: unitRows(true, true) }
  assert.equal(cycleStatusText({ ...done, forced_harvests: [] }), 'Harvested')
  assert.equal(cycleStatusText(done), 'Harvested')
  // forced harvests listed but the cycle was closed without unit data: the record's own status stands
  assert.equal(cycleStatusText({ status: 'Harvested', display_status: 'Harvested', forced_harvests: [{ id: 1 }] }), 'Harvested')
})

test('a cycle with no emergency Force Harvest (or no harvested pond) is shown exactly as before, Health Log ones included', () => {
  const rec = { status: 'Stocked', display_status: 'Stocked', harvest_units: unitRows(true, false) }
  assert.equal(cycleStatusText({ ...rec, forced_harvests: [] }), 'Stocked')            // e.g. only a Health Log Force Harvest (HP badge)
  assert.equal(cycleStatusText(rec), 'Stocked')
  assert.equal(cycleStatusText({ status: 'Stocked', forced_harvests: [{ id: 1 }], harvest_units: unitRows(false, false) }), 'Stocked')
  assert.equal(cycleStatusText({ status: 'Stocked', forced_harvests: [{ id: 1 }] }), 'Stocked')   // no unit data: unchanged
})

test('a web page or no reply is never shown as an error message', () => {
  const html = '<!doctype html> <html lang="en"> <head> <title>Not Found</title> </head> <body> <h1>Not Found</h1><p>The requested resource was not found on this server.</p> </body> </html>'
  const notFound = errorMessage({ response: { status: 404, data: html } })
  assert.match(notFound, /does not have Force Harvest yet/)
  assert.ok(!/<|doctype/i.test(notFound))
  assert.match(errorMessage({ response: { status: 500, data: '<html><body>Server Error</body></html>' } }), /server had a problem/i)
  assert.match(errorMessage({ response: { status: 502, data: '<html>Bad gateway</html>' } }), /server had a problem/i)
  assert.match(errorMessage({ message: 'Network Error' }), /Could not reach the server/)
  assert.equal(errorMessage({ response: { status: 400, data: 'Plain text reason' } }), 'Plain text reason')
  assert.equal(errorMessage({ response: { status: 400, data: { cycles: ['Pond 1 has already been harvested.'] } } }), 'Pond 1 has already been harvested.')
})
