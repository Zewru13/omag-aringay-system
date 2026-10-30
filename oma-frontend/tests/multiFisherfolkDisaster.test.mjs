import assert from 'node:assert/strict'

const { rowKey, rowsFor, rowProblem, effectiveLost, buildGroups, eventProblem, pickedSummary } = await import(new URL('../src/pages/Monitoring/multiFisherfolkDisaster.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const stockA = { id: 1, fisherfolk: 10, fisherfolk_name: 'Ann', species_name: 'Tilapia', number_of_fingerlings: 500 }
const stockB = { id: 2, fisherfolk: 11, fisherfolk_name: 'Ben', species_name: 'Dalag', number_of_fingerlings: 150 }
const unitsA = [{ id: 7, label: 'Pond 1', fingerling_count: 300, status: 'active' }, { id: 8, label: 'Pond 2', fingerling_count: 200, status: 'harvested' }, { id: 9, label: 'Pond 3', fingerling_count: null, status: 'active' }]

// the rows of a stock: its open ponds / cages (a harvested one cannot lose fingerlings), or the whole stock when it has none
eq(rowsFor(stockA, { state: 'ok', units: unitsA }).map((r) => [r.key, r.unitLabel, r.stocked]), [['1:7', 'Pond 1', 300], ['1:9', 'Pond 3', null]], 'open units only')
eq(rowsFor(stockB, { state: 'ok', units: [] }), [{ key: '2:all', unitId: null, unitLabel: 'Whole stock', stocked: 150 }], 'no units: the whole stock')
eq(rowsFor(stockB, { state: 'loading', units: [] }), [], 'still loading: no rows yet')
eq(rowKey(3, null), '3:all', 'row key, whole stock')

// what a row loses: typed number, or the full stocked count when Total Loss and the count is known
const row = { stocked: 300 }
eq(effectiveLost(row, { lost: '40', total: false }), '40', 'typed')
eq(effectiveLost(row, { lost: '40', total: true }), '300', 'total loss takes the stocked count')
eq(effectiveLost({ stocked: null }, { lost: '12', total: true }), '12', 'total loss with no stocked count keeps what was typed')
eq(rowProblem(row, { lost: '', total: false }), '', 'blank = not recorded')
assert.match(rowProblem(row, { lost: '301', total: false }), /300/); n++
assert.match(rowProblem(row, { lost: 'x', total: false }), /Whole number/); n++
assert.match(rowProblem({ stocked: null }, { lost: '', total: true }), /Enter the fingerlings lost/); n++

// one group per fisherfolk, in the order they were first picked; their ponds on their own stock
const picked = {
  1: { stock: stockA, info: { state: 'ok', units: unitsA }, values: { '1:7': { lost: '40' }, '1:9': { lost: '5', total: true } } },
  2: { stock: stockB, info: { state: 'ok', units: [] }, values: { '2:all': { lost: '25' } } },
}
eq(buildGroups(picked), [
  { fisherfolk: 10, stock_losses: [{ stocking_record: 1, production_unit: 7, fingerlings_lost: 40, is_total_loss: false }, { stocking_record: 1, production_unit: 9, fingerlings_lost: 5, is_total_loss: true }] },
  { fisherfolk: 11, stock_losses: [{ stocking_record: 2, production_unit: null, fingerlings_lost: 25, is_total_loss: false }] },
], 'the request groups')
eq(buildGroups({ 1: picked[1], 3: { stock: { ...stockA, id: 3 }, info: { state: 'ok', units: [] }, values: {} } })[0].stock_losses.length, 3, 'two stocks of one fisherfolk share one group')
eq(pickedSummary(picked), { fisherfolk: 2, stocks: 2, rows: 3 }, 'counts')

// the form
const form = { disaster_type: 'Typhoon', disaster_type_other_specify: '', date_of_occurrence: '2026-10-29' }
eq(eventProblem(form, picked, '2026-10-30'), '', 'a good event')
assert.match(eventProblem(form, {}, '2026-10-30'), /pond or cage/); n++
assert.match(eventProblem({ ...form, date_of_occurrence: '' }, picked, '2026-10-30'), /date/i); n++
assert.match(eventProblem({ ...form, date_of_occurrence: '2026-11-01' }, picked, '2026-10-30'), /future/); n++
assert.match(eventProblem({ ...form, disaster_type: 'Other' }, picked, '2026-10-30'), /Specify/); n++
assert.match(eventProblem(form, { 1: { ...picked[1], info: { state: 'loading', units: [] } } }, '2026-10-30'), /loading/i); n++
assert.match(eventProblem(form, { 1: { ...picked[1], values: { '1:7': { lost: '999' } } } }, '2026-10-30'), /Cannot exceed/); n++

console.log(`multiFisherfolkDisaster: ${n} checks passed`)
