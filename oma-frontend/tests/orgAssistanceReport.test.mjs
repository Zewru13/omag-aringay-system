import assert from 'node:assert/strict'
import fs from 'node:fs'

// Reports > Organization Assistance (the Individual Organization Assistance report was removed from the Report type list).
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const {
  ORG_ASSISTANCE_PATH, ORG_KINDS, ORG_ASSISTANCE_STATUSES, NO_ORG_ASSISTANCE_FILTERS, activeOrgFilterCount, orgKind, orgReportParams, orgReportStem, ...rest
} = await import(new URL('../src/pages/Reports/orgAssistanceReport.js', import.meta.url).href)
const { REPORT_TYPES, reportType, reportTypeFromParam } = await import(new URL('../src/pages/Reports/reportPaper.js', import.meta.url).href)

// ── no Individual Organization Assistance in the Report type list
eq(REPORT_TYPES.map((r) => r.id).includes('organization_assistance_individual'), false, 'not a report type any more')
eq(REPORT_TYPES.map((r) => r.id).slice(-1), ['organization_assistance'], 'Cooperative Assistance is the last report')
eq(REPORT_TYPES.some((r) => /Individual Cooperative Assistance/.test(r.label)), false, 'no report is called that')
eq(reportTypeFromParam('organization_assistance_individual'), REPORT_TYPES[0].id, 'an old link to it opens the first report')
eq(Object.keys(rest), [], 'the one-cooperative helpers are gone')

// ── the same backend report, asked for one organization
eq(ORG_ASSISTANCE_PATH, '/reports/organization-assistance/', 'the existing endpoint')
eq(ORG_KINDS.map((k) => [k.id, k.label, k.individual]), [
  ['farmers', 'Farmers Cooperatives', false], ['fisherfolk', 'Fisherfolk Cooperatives', false],
  ['individual_farmers', 'Individual Farmers', true], ['individual_fisherfolk', 'Individual Fisherfolk', true],
], 'the Report on options: the two kinds of cooperative, then the individuals who were given assistance directly')
eq(orgKind('individual_fisherfolk').label, 'Individual Fisherfolk', 'an individual kind is found by its id')
eq(orgKind('nonsense').id, 'farmers', 'an unknown kind falls back to the first')
eq(orgKind('individual_farmers').types, orgKind('farmers').types, 'individual farmers can be given what farmers cooperatives are')
eq(orgKind('individual_fisherfolk').types, orgKind('fisherfolk').types, 'individual fisherfolk can be given what fisherfolk cooperatives are')
eq(ORG_KINDS.map((k) => k.searchPlaceholder), ['Search cooperative name', 'Search cooperative name', 'Search farmer name', 'Search fisherfolk name'], 'the search bar says what it searches')
eq(ORG_KINDS.every((k) => k.types.includes('Cash Assistance') && k.types.includes('Other')), true, 'each kind has its assistance types')
eq(ORG_ASSISTANCE_STATUSES.map((s) => s[0]), ['confirmed', 'awaiting', 'follow_up'], 'the statuses the backend accepts')
eq(NO_ORG_ASSISTANCE_FILTERS, { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '' }, 'no filter by default')

// what is asked of the backend
eq(orgReportStem('farmers'), 'farmers_organization_assistance', 'the file name of a cooperative report is unchanged')
eq(orgReportStem('individual_farmers'), 'individual_farmers_assistance', 'the file name of an individuals report')
const filters = { ...NO_ORG_ASSISTANCE_FILTERS, search: 'ana' }
eq(orgReportParams('farmers', filters, null), { kind: 'farmers', ...filters, individual: 'auto' }, 'a cooperative report may narrow to one cooperative by its search')
eq(orgReportParams('farmers', filters, { id: 7, label: 'Alaska' }), { kind: 'farmers', ...filters, id: 7 }, 'or by a clicked row')
eq(orgReportParams('individual_farmers', filters, null), { kind: 'individual_farmers', ...filters }, 'an individuals report has no cooperative to narrow to')
eq(orgReportParams('individual_fisherfolk', filters, { id: 7, label: 'x' }), { kind: 'individual_fisherfolk', ...filters }, 'and ignores a leftover pick')

eq(activeOrgFilterCount({ ...NO_ORG_ASSISTANCE_FILTERS, date_from: '2026-01-01', status: 'awaiting' }), 2, 'the Filters badge')

// ── the screens
const page = read('../src/pages/Reports/ReportsPage.jsx')
eq(page.includes('organization_assistance_individual') || page.includes('IndividualOrganizationAssistanceTab'), false, 'the Reports page does not show it')
eq(fs.existsSync(new URL('../src/pages/Reports/IndividualOrganizationAssistanceTab.jsx', import.meta.url)), false, 'its screen is gone')
const all = read('../src/pages/Reports/OrganizationAssistanceReportTab.jsx')
eq(all.includes("from './orgAssistanceReport.js'") && all.includes('OrgAssistanceFilterFields'), true, 'the all-cooperatives report shares the kinds, statuses and filter boxes (no second copy)')
eq(/const KINDS = \[|const STATUSES = \[/.test(all), false, 'and keeps no list of its own')
eq(all.includes('current.searchPlaceholder') && all.includes('orgReportParams(') && all.includes('orgReportStem('), true, 'the tab uses the kind\'s search wording, params and file name')
eq(all.includes('picked') && all.includes('current.individual'), true, 'and a clicked cooperative row only applies to cooperative reports')

console.log(`ok - ${n} assertions`)
