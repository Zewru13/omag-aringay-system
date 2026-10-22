import assert from 'node:assert/strict'

const { pieSlices, pieNote, yearChoices, comparisonUrl } = await import(new URL('../src/components/dashboard/harvestPie.js', import.meta.url).href)
const { defaultRange, rangeProblem, monthLabel, chartData, typeBars, rangeTitle } = await import(new URL('../src/pages/Dashboard/disasterChart.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── harvest pie
const counts = { total: 25, compared: 20, increased: 4, decreased: 15, on_target: 1, no_data: 5 }
eq(pieSlices(counts), [
  { key: 'increased', label: 'Exceeded the estimate', value: 4, percent: 20 },
  { key: 'decreased', label: 'Below the estimate', value: 15, percent: 75 },
  { key: 'on_target', label: 'Exactly on the estimate', value: 1, percent: 5 },
], 'slices, as a share of the people compared')
eq(pieSlices({ ...counts, on_target: 0, increased: 5, decreased: 15 }).map((s) => s.key), ['increased', 'decreased'], 'a slice with nobody in it is left out')
eq(pieSlices({ total: 3, compared: 0, increased: 0, decreased: 0, on_target: 0, no_data: 3 }), [], 'nothing to compare')
eq(pieSlices({ total: 3, compared: 3, increased: 1, decreased: 2, on_target: 0, no_data: 0 }).map((s) => s.percent), [33.3, 66.7], 'percent has one decimal')
eq(pieSlices(null), [], 'not loaded')
eq(pieNote(counts, 'farmers'), '20 of 25 farmers compared · 5 with no harvest to compare', 'note')
eq(pieNote({ total: 1, compared: 1, increased: 1, decreased: 0, on_target: 0, no_data: 0 }, 'farmer'), '1 of 1 farmer compared', 'note, all compared')
eq(pieNote({ total: 0, compared: 0, increased: 0, decreased: 0, on_target: 0, no_data: 0 }, 'farmers'), 'No farmers match the filters.', 'note, empty list')
eq(pieNote({ total: 4, compared: 0, increased: 0, decreased: 0, on_target: 0, no_data: 4 }, 'fisherfolk'), 'None of the 4 fisherfolk has a harvested record with an estimate to compare.', 'note, none compared')

eq(yearChoices(2026), [{ value: '2026', label: '2026' }, { value: '2025', label: '2025' }, { value: '2024', label: '2024' }, { value: 'all', label: 'All years' }], 'year choices')
eq(comparisonUrl('/farmers/harvest-comparison/', 'search=Ana&gender=Female&page=3', '2026'), '/farmers/harvest-comparison/?search=Ana&gender=Female&year=2026', 'the list filters are kept, the page is dropped')
eq(comparisonUrl('/farmers/harvest-comparison/', '', 'all'), '/farmers/harvest-comparison/?year=all', 'no filters')

// ── disaster chart
eq(defaultRange(new Date('2026-10-22T08:00:00')), { from: '2026-01', to: '2026-12' }, 'this calendar year')
eq(rangeProblem('2026-01', '2026-12'), '', 'a good range'); eq(rangeProblem('2026-05', '2026-01'), 'The From month must not be after the To month.', 'reversed')
eq(rangeProblem('', '2026-01'), 'Choose both months.', 'missing'); eq(rangeProblem('2023-01', '2026-02'), 'Choose a range of at most 36 months.', 'too long')
eq(rangeProblem('2023-03', '2026-02'), '', 'exactly 36 months')
eq(monthLabel('2026-03'), 'Mar 2026', 'month label'); eq(rangeTitle('2026-01', '2026-12'), 'January 2026 to December 2026', 'range title'); eq(rangeTitle('2026-05', '2026-05'), 'May 2026', 'one month')
const months = [{ month: '2026-01', crop: 2, fisheries: 1 }, { month: '2026-02', crop: 0, fisheries: 0 }]
eq(chartData(months), [{ month: '2026-01', label: 'Jan', crop: 2, fisheries: 1, total: 3 }, { month: '2026-02', label: 'Feb', crop: 0, fisheries: 0, total: 0 }], 'chart rows (short month names within one year)')
eq(chartData([{ month: '2025-12', crop: 1, fisheries: 0 }, { month: '2026-01', crop: 0, fisheries: 1 }]).map((r) => r.label), ['Dec 2025', 'Jan 2026'], 'the year is shown when the range crosses years')
const types = [{ type: 'Typhoon', crop: 4, fisheries: 2, total: 6 }, { type: 'Flood', crop: 1, fisheries: 1, total: 2 }, { type: 'Drought', crop: 1, fisheries: 0, total: 1 }, { type: 'Pest', crop: 1, fisheries: 0, total: 1 }]
eq(typeBars(types, 3), [{ type: 'Typhoon', total: 6, percent: 100 }, { type: 'Flood', total: 2, percent: 33 }, { type: 'Others (2)', total: 2, percent: 33 }], 'the biggest types, the rest grouped; bars are relative to the biggest')
eq(typeBars(types.slice(0, 2), 3).map((t) => t.type), ['Typhoon', 'Flood'], 'few types: no "Others"')
eq(typeBars([], 3), [], 'no types')

console.log(`chartHelpers: ${n} checks passed`)
