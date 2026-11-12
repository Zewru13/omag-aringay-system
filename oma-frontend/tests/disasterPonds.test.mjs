// The Fisheries Log Disaster table (Fisheries Disaster > Log Disaster): every active pond and cage, to tick the ones a disaster hit - the
// fisheries counterpart of the crop table (disasterTargets.js + disasterEvent.js). The rules need no screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const {
  PAGE_SIZE, stockTitle, placeOf, prepareStocks, filterStocks, sortStocks, pageOf, pageCount, rowsOf, barangayOptions, stockProblem,
  selectRows, markTotal, updateRow, allSelected, pruneSelection, selectedPeople, stockLossesOf, rowsProblem, summaryLine, selectionStats,
} = await import(new URL('../src/pages/Monitoring/disasterPonds.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')

const stock = (id, ff, name, barangay, units, over = {}) => ({
  stock_id: id, fisherfolk_id: ff, fisherfolk_name: name, rsbsa_number: `RS-${ff}`, fishr_number: '', barangay, pond_location: '',
  species_name: 'Tilapia', cycle_name: 'Grow-out', cycle_no: 1, date_stocked: '2026-10-01', number_of_fingerlings: units.reduce((s, u) => s + (u.fingerlings || 0), 0),
  units, ...over,
})
const unit = (id, label, fingerlings) => ({ id, label, fingerlings })
const stocks = prepareStocks([
  stock(1, 10, 'Ana Cruz', 'Samara', [unit(11, 'Pond 1', 300), unit(12, 'Pond 2', 200)], { pond_location: 'Dulao', date_stocked: '2026-10-05' }),
  stock(2, 10, 'Ana Cruz', 'Samara', [unit(21, 'Cage 1', 100)], { species_name: 'Bangus', cycle_name: 'Nursery', cycle_no: 2 }),
  stock(3, 11, 'Ben Dizon', 'Basca', [unit(31, 'Pond 1', 400)], { date_stocked: '2026-09-20' }),
  stock(4, 12, 'Cora Lim', 'Alaska', [unit(null, 'Whole stock', 800)], { species_name: 'Shrimp', cycle_name: '', cycle_no: null, number_of_fingerlings: 800 }),
])

// ── what is shown
eq(stocks.map((s) => s.title), ['Tilapia · Grow-out · Cycle 1', 'Bangus · Nursery · Cycle 2', 'Tilapia · Grow-out · Cycle 1', 'Shrimp'], 'stock titles')
eq(stockTitle({ species_name: '', cycle_name: '', cycle_no: null }), 'Stock', 'a stock with nothing to say')
eq(stocks[0].rows.map((r) => [r.key, r.unitId, r.unitLabel, r.stocked]), [['1:11', 11, 'Pond 1', 300], ['1:12', 12, 'Pond 2', 200]], 'pond rows')
eq(stocks[3].rows.map((r) => [r.key, r.unitId, r.unitLabel, r.stocked]), [['4:all', null, 'Whole stock', 800]], 'a stock with no ponds is one whole-stock row, with the stock\'s count')
eq(stocks[0].rows[0].fisherfolkId, 10, 'a row knows its fisherfolk')
eq(placeOf(stocks[0]), 'Dulao', 'the barangay is where the ponds are')
eq(placeOf(stocks[1]), 'Samara', '...or the fisherfolk\'s own barangay when none is recorded')
eq(rowsOf(stocks).length, 5, 'every pond and cage')
eq(barangayOptions(stocks), ['Alaska', 'Basca', 'Dulao', 'Samara'], 'barangays')

// ── search and filters
eq(filterStocks(stocks, { search: 'ana' }).map((s) => s.stock_id), [1, 2], 'search a name')
eq(filterStocks(stocks, { search: 'RS-11' }).map((s) => s.stock_id), [3], 'search a registration number')
eq(filterStocks(stocks, { search: 'bangus' }).map((s) => s.stock_id), [2], 'search a species')
eq(filterStocks(stocks, { search: 'cage' }).map((s) => s.stock_id), [2], 'search a pond or cage label')
eq(filterStocks(stocks, { search: 'ana pond 2' }).map((s) => s.stock_id), [1], 'every word has to match')
eq(filterStocks(stocks, { barangay: 'Dulao' }).map((s) => s.stock_id), [1], 'filter by where the ponds are')
eq(filterStocks(stocks, { fisherfolk: '11' }).map((s) => s.stock_id), [1, 2, 3, 4], 'there is no fisherfolk filter: the search finds a fisherfolk by name')
eq(filterStocks(stocks, { search: '', barangay: '', fisherfolk: '' }).length, 4, 'no filter keeps everything')

// ── order and pages
eq(sortStocks(stocks).map((s) => s.stock_id), [1, 2, 3, 4], 'by fisherfolk, then the order of the server (there is no Sort choice)')
eq(sortStocks(stocks, 'barangay').map((s) => s.stock_id), [1, 2, 3, 4], 'a sort name makes no difference any more')
eq(PAGE_SIZE, 10, 'ten stocks a page')
eq(pageCount(0), 1, 'always one page')
eq(pageCount(25), 3, 'pages')
eq(pageOf(Array.from({ length: 25 }, (_, i) => i), 3), [20, 21, 22, 23, 24], 'the last page')

// ── ticking
let sel = {}
sel = selectRows(sel, stocks[0].rows, true)
eq(Object.keys(sel), ['1:11', '1:12'], 'ticking a stock ticks its ponds and cages')
eq(sel['1:11'], { lost: '', total: false }, 'a ticked row starts empty')
ok(allSelected(sel, stocks[0].rows) && !allSelected(sel, rowsOf(stocks)), 'all ticked or not')
eq(Object.keys(selectRows(sel, [stocks[0].rows[0]], false)), ['1:12'], 'un-ticking one leaves the other')
sel = updateRow(sel, '1:11', (v) => ({ ...v, lost: '40' }))
eq(sel['1:11'].lost, '40', 'a row takes its fingerlings lost')
eq(updateRow(sel, 'nope', (v) => v), sel, 'an unknown row changes nothing')
sel = markTotal(sel, [stocks[0].rows[1], stocks[2].rows[0]], true)
eq(Object.keys(sel).sort(), ['1:11', '1:12', '3:31'], 'total loss ticks the rows too')
eq([sel['1:12'].total, sel['3:31'].total, sel['1:11'].total], [true, true, false], 'and marks only those')
sel = markTotal(sel, [stocks[0].rows[1]], false)
eq([sel['1:12'].total, '1:12' in sel], [false, true], 'switching total loss off keeps the row ticked')
eq(Object.keys(pruneSelection({ ...sel, '9:9': { lost: '', total: false } }, stocks)).sort(), ['1:11', '1:12', '3:31'], 'a restored draft drops ponds that are gone')

// ── a mistake inside one stock (so a closed cycle can be opened on it)
const bad = updateRow(selectRows({}, stocks[0].rows, true), '1:11', (v) => ({ ...v, lost: '301' }))
eq(stockProblem(stocks[0], bad), 'Cannot exceed 300 stocked.', 'a stock with a mistake')
eq(stockProblem(stocks[0], selectRows({}, stocks[0].rows, true)), '', 'a stock without one')
eq(stockProblem(stocks[2], bad), '', 'a stock with nothing ticked')

// ── who is affected
eq(selectedPeople(sel, stocks).map((p) => [p.id, p.full_name, p.stocks, p.units, p.total]), [[10, 'Ana Cruz', 1, 2, 0], [11, 'Ben Dizon', 1, 1, 1]], 'one entry a fisherfolk, in table order')
eq(selectedPeople(sel, stocks)[0].latestStocked, '2026-10-05', 'the latest stocking date of what they lost')
eq(selectedPeople(sel, stocks)[0].barangay, 'Samara', 'their own barangay')
eq(selectionStats(sel, stocks), { rows: 3, stocks: 2, fisherfolk: 2, total: 1 }, 'counts')
eq(summaryLine({ rows: 0, stocks: 0, fisherfolk: 0, total: 0 }), 'No ponds or cages selected', 'nothing ticked')
eq(summaryLine({ rows: 3, stocks: 2, fisherfolk: 2, total: 1 }), '3 ponds/cages of 2 stocks, 2 fisherfolk selected', 'the summary')
eq(summaryLine({ rows: 1, stocks: 1, fisherfolk: 1, total: 0 }), '1 pond/cage of 1 stock, 1 fisherfolk selected', 'singular')

// ── what is sent: one row per ticked pond or cage of that fisherfolk
let pay = selectRows({}, [...stocks[0].rows, ...stocks[2].rows], true)
pay = updateRow(pay, '1:11', (v) => ({ ...v, lost: '40' }))
pay = markTotal(pay, [stocks[0].rows[1], stocks[2].rows[0]], true)
eq(stockLossesOf(10, pay, stocks), [
  { stocking_record: 1, production_unit: 11, fingerlings_lost: 40, is_total_loss: false },
  { stocking_record: 1, production_unit: 12, fingerlings_lost: 200, is_total_loss: true },
], 'a typed count, and a total loss is the whole stocked count')
eq(stockLossesOf(11, pay, stocks), [{ stocking_record: 3, production_unit: 31, fingerlings_lost: 400, is_total_loss: true }], 'another fisherfolk')
eq(stockLossesOf(10, selectRows({}, stocks[0].rows, true), stocks).map((r) => r.fingerlings_lost), [null, null], 'blank is not recorded')
let whole = selectRows({}, stocks[3].rows, true)
eq(stockLossesOf(12, whole, stocks), [{ stocking_record: 4, production_unit: null, fingerlings_lost: null, is_total_loss: false }], 'a whole-stock row has no unit')
whole = markTotal(whole, stocks[3].rows, true)
eq(stockLossesOf(12, whole, stocks)[0].fingerlings_lost, 800, 'total loss of a whole stock is its count')
eq(stockLossesOf(99, pay, stocks), [], 'nothing for someone with nothing ticked')

// ── mistakes
eq(rowsProblem(pay, stocks), '', 'a good selection')
eq(rowsProblem(updateRow(pay, '1:11', (v) => ({ ...v, lost: '301' })), stocks), 'Cannot exceed 300 stocked.', 'more than was stocked')
eq(rowsProblem(updateRow(pay, '1:11', (v) => ({ ...v, lost: 'abc' })), stocks), 'Whole number of 0 or more.', 'not a number')

// ── the window and the server list
const modal = read('../src/pages/Monitoring/MultiFisherfolkDisasterModal.jsx')
ok(modal.includes("'/fisheries/disaster-reports/targets/'"), 'the window reads the list of ponds and cages from the server')
ok(modal.includes('FisheriesDisasterTargetsTable'), 'the window shows the table')
ok(modal.includes('FisherfolkMultiSelect'), 'a fisherfolk with damage not linked to a stock is still chosen by name')
ok(modal.includes('stockLossesOf('), 'what is sent is built from the ticked rows')
const table = read('../src/pages/Monitoring/FisheriesDisasterTargetsTable.jsx')
ok(table.includes('Select every pond/cage shown') && table.includes('FilterPanel') && table.includes('PaginationBar'), 'the table has select-all, search/filters and pages')
ok(table.includes('Total loss') && table.includes('Fingerlings Lost'), 'each row takes the fingerlings lost and a total loss')
ok(!table.includes('aria-label="Fisherfolk"') && !table.includes('aria-label="Sort"') && !table.includes('SORTS'), 'no Fisherfolk filter and no Sort')
ok(table.includes('aria-label="Barangay"'), 'the Barangay filter stays')
ok(table.includes('aria-expanded') && table.includes('the ponds and cages of'), 'a cycle opens to show its ponds and cages when it is clicked')

console.log(`disasterPonds: ${n} checks passed`)
