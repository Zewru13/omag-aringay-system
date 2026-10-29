import assert from 'node:assert/strict'

const { dateRangeProblem, dateRangeParams, dateRangeText } = await import(new URL('../src/utils/dateRange.js', import.meta.url).href)
const { buildListReportSpec, fetchAllRows } = await import(new URL('../src/utils/listReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the range
eq(dateRangeProblem('2026-05-01', '2026-05-31'), '', 'a good range')
eq(dateRangeProblem('2026-05-01', '2026-05-01'), '', 'one day')
eq(dateRangeProblem('2026-05-01', ''), '', 'only a From')
eq(dateRangeProblem('', '2026-05-01'), '', 'only a To')
eq(dateRangeProblem('', ''), '', 'nothing chosen')
assert.match(dateRangeProblem('2026-06-01', '2026-05-01'), /cannot be before/); n++

eq(dateRangeParams('2026-05-01', '2026-05-31', 'planted_from', 'planted_to'), { planted_from: '2026-05-01', planted_to: '2026-05-31' }, 'both sent')
eq(dateRangeParams('2026-05-01', '', 'planted_from', 'planted_to'), { planted_from: '2026-05-01' }, 'only the From')
eq(dateRangeParams('', '2026-05-31', 'planted_from', 'planted_to'), { planted_to: '2026-05-31' }, 'only the To')
eq(dateRangeParams('', '', 'planted_from', 'planted_to'), {}, 'nothing')
eq(dateRangeParams('2026-06-01', '2026-05-01', 'planted_from', 'planted_to'), {}, 'a reversed range is not sent')

eq(dateRangeText('2026-05-01', '2026-06-30'), 'May 1, 2026 to June 30, 2026', 'both in words')
eq(dateRangeText('2026-05-01', '2026-05-01'), 'May 1, 2026', 'one day in words')
eq(dateRangeText('2026-05-01', ''), 'May 1, 2026 onward', 'from only')
eq(dateRangeText('', '2026-06-30'), 'up to June 30, 2026', 'to only')
eq(dateRangeText('', ''), '', 'no range')
eq(dateRangeText('2026-06-01', '2026-05-01'), '', 'a reversed range says nothing')

// ── the printed list
const now = new Date(2026, 9, 30, 9, 5)
const spec = buildListReportSpec({
  title: 'CROP MONITORING REPORT', noun: 'crop record', now, wide: true,
  filters: [['Barangay', 'Alaska'], ['Date Planted', ''], ['Status', 'Planted']],
  head: ['Crop', 'Farmer'], rows: [['Palay', 'Ana Cruz'], ['Corn', null]],
})
eq(spec.title, 'CROP MONITORING REPORT', 'title')
eq(spec.reference, 'LR-20261030-0905', 'reference')
eq(spec.landscape, true, 'wide tables print landscape')
eq(spec.header, [['Date printed', 'October 30, 2026'], ['Barangay', 'Alaska'], ['Status', 'Planted'], ['Records', '2 crop records']], 'header lists only the applied filters')
eq(spec.sections[0].table.head, ['No.', 'Crop', 'Farmer'], 'numbered columns')
eq(spec.sections[0].table.rows, [['1', 'Palay', 'Ana Cruz'], ['2', 'Corn', '—']], 'rows, blanks as a dash')
eq(spec.footerLabel, 'crop record list', 'footer label')
eq(buildListReportSpec({ title: 'T', noun: 'trip', head: ['A'], rows: [['x']], now }).header.at(1), ['Filters', 'None (every record)'], 'unfiltered says so')
eq(buildListReportSpec({ title: 'T', noun: 'trip', head: ['A'], rows: [['x']], now }).header.at(-1), ['Records', '1 trip'], 'one row singular')
eq(buildListReportSpec({ title: 'T', noun: 'trip', head: ['A'], rows: [], now }).header.at(-1), ['Records', '0 trips'], 'no rows')

// ── every page of a list is read
const pages = { 1: { results: [1, 2], next: 'x' }, 2: { results: [3], next: null } }
const seen = []
const api = { get: async (url, { params }) => { seen.push(params); return { data: pages[params.page] } } }
eq(await fetchAllRows(api, '/x/', { barangay: 'Alaska' }), [1, 2, 3], 'pages joined')
eq(seen, [{ barangay: 'Alaska', page: 1, page_size: 200 }, { barangay: 'Alaska', page: 2, page_size: 200 }], 'asks 200 at a time with the filters')
eq(await fetchAllRows({ get: async () => ({ data: [7, 8] }) }, '/x/'), [7, 8], 'an unpaginated list is an array')
let calls = 0
eq((await fetchAllRows({ get: async () => { calls += 1; return { data: { results: [0], next: 'more' } } } }, '/x/', {}, 3)).length, 3, 'stops at the page cap')
eq(calls, 3, 'no further requests after the cap')

console.log(`dateRange: ${n} checks passed`)
