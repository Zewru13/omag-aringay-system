import assert from 'node:assert/strict'

const { disasterReportParams, disasterReportUrl, disasterReportStem, disasterListParams } = await import(new URL('../src/utils/disasterReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const table = { search: ' flood ', barangay: 'Alaska', type: 'Typhoon', status: 'Active', year: '2026', dateFrom: '2026-05-01', dateTo: '2026-05-31' }

// the table's filters become the report's filters, so the printed report holds exactly what the table shows
eq(disasterReportParams(table), { search: 'flood', barangay: 'Alaska', disaster_type: 'Typhoon', status: 'Active', year: '2026', date_from: '2026-05-01', date_to: '2026-05-31' }, 'every filter, under the names the report takes')
eq(disasterReportParams({}), {}, 'no filters')
eq(disasterReportParams({ search: '  ', barangay: '', type: '', status: '', year: '' }), {}, 'blank filters are left out')
eq(disasterReportParams({ dateFrom: '2026-06-01', dateTo: '2026-05-01' }), {}, 'a reversed date range is not sent')

// the list of the table asks with the same names (plus its page)
eq(disasterListParams({ ...table, page: 2 }), { search: 'flood', barangay: 'Alaska', disaster_type: 'Typhoon', status: 'Active', year: '2026', date_from: '2026-05-01', date_to: '2026-05-31', page: 2 }, 'the table request')

// one person's report: their id joins the table's filters
eq(disasterReportParams(table, { kind: 'farmer', id: 7 }).farmer, 7, 'a farmer')
eq(disasterReportParams({}, { kind: 'fisherfolk', id: 9 }), { fisherfolk: 9 }, 'a fisherfolk')
eq(disasterReportParams({}, { kind: 'farmer', id: null }), {}, 'no id, nothing added')

// the address
assert.equal(disasterReportUrl('crops', {}, null, 'pdf'), '/reports/disasters/crops/?format=pdf'); n++
assert.equal(disasterReportUrl('fisheries', { status: 'Recovered', dateFrom: '2026-01-01' }, null, 'json'), '/reports/disasters/fisheries/?format=json&status=Recovered&date_from=2026-01-01'); n++
assert.match(disasterReportUrl('crops', {}, { kind: 'farmer', id: 7 }, 'pdf'), /farmer=7/); n++

// the file name
eq(disasterReportStem('crops'), 'crop_disaster_reports', 'crop file')
eq(disasterReportStem('fisheries'), 'fisheries_disaster_reports', 'fisheries file')
eq(disasterReportStem('crops', { kind: 'farmer', id: 7, name: 'Maria Santos' }), 'crop_disaster_report_maria_santos', 'one farmer')
eq(disasterReportStem('fisheries', { kind: 'fisherfolk', id: 9, name: 'Pedro  Sea!' }), 'fisheries_disaster_report_pedro_sea', 'one fisherfolk, unsafe characters dropped')

console.log(`disasterReport: ${n} checks passed`)
