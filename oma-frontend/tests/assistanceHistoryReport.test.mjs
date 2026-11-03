import assert from 'node:assert/strict'

const { buildDistributionsReportSpec, buildDistributionRecordSpec, buildPersonHistorySpec, loadAllDistributions, historyFilterPairs, buildStaffHistoryReport } =
  await import(new URL('../src/pages/AssistanceManagement/assistanceHistoryReport.js', import.meta.url).href)
const { formatAssistanceQuantity } = await import(new URL('../src/pages/AssistanceManagement/assistanceFieldHelpers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const NOW = new Date(2026, 10, 4, 9, 30)   // 4 Nov 2026, 09:30

const member = (id, name, status = 'CONFIRMED', barangay = 'Alaska') => ({ record_id: id, name, barangay, status })
const group = (over = {}) => ({
  id: 'g1', date_given: '2026-08-01', organization_name: 'Alaska Farmers Association', member_count: 2, assistance_type: 'Seeds',
  source_agencies: ['DA', 'PhilRice'], quantity: '10 sack', summary_status: 'Confirmed', members: [member(1, 'Cora Reyes'), member(2, 'Ana Cruz', 'RESOLVED')], ...over,
})

// ── the History list (bulk): one row per distribution
const bulk = buildDistributionsReportSpec({
  domain: 'crop', noun: 'farmers', now: NOW,
  filters: [['Year', '2026'], ['Barangay', ''], ['Status', 'History']],
  distributions: [group(), group({ id: 'g2', date_given: '2026-09-15', organization_name: null, member_count: 1, source_agencies: [], quantity: '', members: [member(3, 'Ben Lim')], summary_status: 'Resolved', assistance_type: 'Training' })],
})
eq(bulk.title, 'ASSISTANCE HISTORY REPORT', 'the heading')
eq(bulk.landscape, true, 'seven columns print on landscape paper')
eq(bulk.header, [['Date printed', 'November 4, 2026'], ['Year', '2026'], ['Status', 'History'], ['Records', '2 distributions']], 'what it was filtered by, blanks left out')
eq(bulk.sections[0].table.head, ['No.', 'Date Given', 'Given To', 'Assistance Type', 'Source Agency', 'Quantity', 'Recipients', 'Status'], 'the columns')
eq(bulk.sections[0].table.rows[0], ['1', 'Aug 1, 2026', 'Alaska Farmers Association', 'Seeds', 'DA, PhilRice', formatAssistanceQuantity('Seeds', '10 sack') || '—', '2', 'Confirmed'], 'a distribution to an organization')
eq(bulk.sections[0].table.rows[1], ['2', 'Sep 15, 2026', 'Ben Lim', 'Training', '—', formatAssistanceQuantity('Training', '') || '—', '1', 'Resolved'], 'a distribution to one person is named, empty values are dashes')
eq(buildDistributionsReportSpec({ domain: 'crop', noun: 'farmers', distributions: [], filters: [], now: NOW }).header.at(-1), ['Records', '0 distributions'], 'nothing in the list')
eq(buildDistributionsReportSpec({ domain: 'crop', noun: 'farmers', distributions: [group()], filters: [], now: NOW }).header.at(-1), ['Records', '1 distribution'], 'one distribution')
eq(buildDistributionsReportSpec({ domain: 'crop', noun: 'farmers', distributions: [group()], filters: [], now: NOW }).header[1], ['Filters', 'None (every record)'], 'no filter says so')

// an organization's own History: its name is in the heading and the header
const orgSpec = buildDistributionsReportSpec({ domain: 'fisheries', noun: 'fisherfolk', organizationName: 'Samara Fishers', distributions: [group({ organization_name: null, members: [member(1, 'Pedro Sea'), member(2, 'Ana Lim')] })], filters: [], now: NOW })
eq(orgSpec.title, 'ORGANIZATION ASSISTANCE HISTORY REPORT', 'the organization report heading')
eq(orgSpec.header.find(([k]) => k === 'Organization'), ['Organization', 'Samara Fishers'], 'the organization is named')
eq(orgSpec.sections[0].table.rows[0][2], 'Pedro Sea, Ana Lim', 'inside an organization each row says who received it')

// ── one distribution, with every recipient
const record = buildDistributionRecordSpec({ domain: 'crop', noun: 'farmers', distribution: group(), now: NOW })
eq(record.title, 'ASSISTANCE DISTRIBUTION RECORD', 'one distribution: the heading')
eq(record.sections[0].rows, [
  ['Sector', 'Crop (Farmers)'], ['Given to', 'Alaska Farmers Association'], ['Date given', 'Aug 1, 2026'], ['Assistance type', 'Seeds'],
  ['Source agency', 'DA, PhilRice'], ['Quantity', formatAssistanceQuantity('Seeds', '10 sack') || '—'], ['Status', 'Confirmed'], ['Recipients', '2'],
], 'the details of the distribution')
eq(record.sections[1].title, 'Recipients', 'the recipients section')
eq(record.sections[1].table.head, ['No.', 'Name', 'Barangay', 'Status'], 'recipient columns')
eq(record.sections[1].table.rows, [['1', 'Ana Cruz', 'Alaska', 'Resolved'], ['2', 'Cora Reyes', 'Alaska', 'Confirmed']], 'recipients in name order, with their own status')
eq(buildDistributionRecordSpec({ domain: 'fisheries', noun: 'fisherfolk', distribution: group({ organization_name: null, members: [member(1, 'Pedro Sea', 'NOT_RECEIVED', '')] }), now: NOW }).sections[1].table.rows,
  [['1', 'Pedro Sea', '—', 'Not Received']], 'a missing barangay is a dash and the status reads in words')
eq(buildDistributionRecordSpec({ domain: 'fisheries', noun: 'fisherfolk', distribution: group({ organization_name: null }), now: NOW }).sections[0].rows[1], ['Given to', 'Ana Cruz, Cora Reyes'], 'given to selected people names them')

// ── one person's history
const person = buildPersonHistorySpec({
  domain: 'crop', person: { name: 'Maria Santos', rsbsa: '01-033-02-019-000151', barangay: 'Alaska' }, now: NOW,
  records: [
    { assistance_type: 'Seeds', source_agencies: ['DA'], quantity: '5 kg', season: 'Wet', year: 2025, date_given: '2025-06-01' },
    { assistance_type: 'Fertilizer', source_agencies: [], quantity: '', season: '', year: 2026, date_given: '2026-02-10' },
    { assistance_type: 'Training', source_agencies: ['ATI'], quantity: '', season: '', year: null, date_given: null },
  ],
})
eq(person.title, 'FARMER ASSISTANCE HISTORY REPORT', 'a farmer: the heading')
eq(person.sections[0].rows, [['Name', 'Maria Santos'], ['RSBSA No.', '01-033-02-019-000151'], ['Barangay', 'Alaska'], ['Assistance records', '3']], 'who it is about')
eq(person.sections[1].title, 'Assistance records', 'the history section')
eq(person.sections[1].table.head, ['No.', 'Date Given', 'Assistance Type', 'Source Agency', 'Quantity', 'Season', 'Year', 'Status'], 'history columns')
eq(person.sections[1].table.rows.map((r) => r[2]), ['Fertilizer', 'Seeds', 'Training'], 'newest first, a record with no date last')
eq(person.sections[1].table.rows[0], ['1', 'Feb 10, 2026', 'Fertilizer', '—', '—', '—', '2026', '—'], 'empty values are dashes')
eq(buildPersonHistorySpec({ domain: 'crop', person: {}, records: [{ assistance_type: 'Seeds', date_given: '2026-01-01', status: 'AWAITING_CONFIRMATION' }, { assistance_type: 'Seeds', date_given: '2025-01-01', status: 'CONFIRMED' }], now: NOW }).sections[1].table.rows.map((r) => r.at(-1)), ['Awaiting Confirmation', 'Confirmed'], 'each record says where it stands')
eq(buildPersonHistorySpec({ domain: 'fisheries', person: { name: 'Pedro Sea', rsbsa: '', barangay: '' }, records: [], now: NOW }).title, 'FISHERFOLK ASSISTANCE HISTORY REPORT', 'a fisherfolk: the heading')
eq(buildPersonHistorySpec({ domain: 'fisheries', person: { name: 'Pedro Sea' }, records: [], now: NOW }).sections[0].rows, [['Name', 'Pedro Sea'], ['RSBSA No.', '—'], ['Barangay', '—'], ['Assistance records', '0']], 'no records, no RSBSA')

// ── reading every distribution: the staff list is paged ten at a time and says how many there are, but gives no "next" link
const fakeServer = (total, pageSize = 10) => {
  const calls = []
  const get = async (url, { params }) => {
    calls.push({ url, params })
    const start = (params.page - 1) * pageSize
    const results = Array.from({ length: Math.max(0, Math.min(pageSize, total - start)) }, (_, i) => ({ id: start + i + 1 }))
    return { data: { count: total, results } }
  }
  return { get, calls }
}
const server25 = fakeServer(25)
const all25 = await loadAllDistributions(server25.get, '/x/', { year: '2026', status: 'history' })
eq([all25.length, all25[0].id, all25.at(-1).id], [25, 1, 25], 'every page is read')
eq(server25.calls.map((c) => c.params.page), [1, 2, 3], 'three pages for 25 rows')
eq(server25.calls[0].params, { year: '2026', status: 'history', page: 1 }, 'the filters are sent on every page')
eq((await loadAllDistributions(fakeServer(10).get, '/x/', {})).length, 10, 'exactly one full page')
eq((await loadAllDistributions(fakeServer(0).get, '/x/', {})).length, 0, 'nothing to read')
const runaway = fakeServer(1000000)
eq((await loadAllDistributions(runaway.get, '/x/', {}, 5)).length, 50, 'a cap on the number of pages stops a list that never ends')
eq(runaway.calls.length, 5, 'the cap is respected')
const stuck = { get: async () => ({ data: { count: 30, results: [] } }) }
eq((await loadAllDistributions(stuck.get, '/x/', {})).length, 0, 'a page that comes back empty ends the loop')

// ── what the list was narrowed by, in words
eq(historyFilterPairs({ year: '2026', barangay: 'Alaska', member: ' Cruz ', source_agency: 'DA', assistance_type: 'Seeds', status: 'history' }),
  [['Year', '2026'], ['Barangay', 'Alaska'], ['Search', 'Cruz'], ['Source agency', 'DA'], ['Assistance', 'Seeds'], ['Status', 'History']], 'every filter, labelled')
eq(historyFilterPairs({ year: '', barangay: '', status: 'history' }), [['Status', 'History']], 'blank filters are left out')
eq(historyFilterPairs({ status: 'current' }), [['Status', 'Current']], 'the other tab')
eq(historyFilterPairs({}), [], 'no filters')
eq(historyFilterPairs({ date_from: '2026-01-05', date_to: '2026-06-30', status: 'CONFIRMED' }),
  [['Given from', 'Jan 5, 2026'], ['Given to', 'Jun 30, 2026'], ['Status', 'Confirmed']], 'an organization history: the dates and a member status')
eq(historyFilterPairs({ status: 'needs-follow-up' }), [['Status', 'Needs follow-up']], 'needs follow-up')
eq(historyFilterPairs({ status: 'WEIRD' }), [['Status', 'WEIRD']], 'a status it does not know is shown as it is')

// ── the whole bulk report: read every page, then lay it out
const bulkServer = fakeServer(23)
const built = await buildStaffHistoryReport({ get: bulkServer.get, url: '/interventions/beneficiaries/distributions/', filters: { year: '2026', barangay: '', status: 'history' }, noun: 'farmers', now: NOW })
eq(built.header, [['Date printed', 'November 4, 2026'], ['Year', '2026'], ['Status', 'History'], ['Records', '23 distributions']], 'the report says what it covers')
eq(built.sections[0].table.rows.length, 23, 'every distribution is in it, not only the first page')
eq(bulkServer.calls[0].params, { year: '2026', status: 'history', page: 1 }, 'blank filters are not sent')

// every report is signed off by the preparer and the noting officer, like the other list reports
eq(bulk.signatures, ['Prepared by', 'Noted by'], 'signature lines')
eq(record.signatures, ['Prepared by', 'Noted by'], 'signature lines of a record')
eq(person.signatures, ['Prepared by', 'Noted by'], 'signature lines of a history')

console.log(`assistanceHistoryReport: ${n} checks passed`)
