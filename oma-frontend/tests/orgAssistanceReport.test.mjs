import assert from 'node:assert/strict'
import fs from 'node:fs'

// Reports > Individual Organization Assistance: one organization is chosen and its own report (its distributions and every recipient) is shown.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const {
  ORG_ASSISTANCE_PATH, ORG_KINDS, ORG_ASSISTANCE_STATUSES, NO_ORG_ASSISTANCE_FILTERS, organizationOptions, oneOrganizationParams, oneOrganizationStem,
  activeOrgFilterCount,
} = await import(new URL('../src/pages/Reports/orgAssistanceReport.js', import.meta.url).href)
const { REPORT_TYPES, reportType, reportTypeFromParam } = await import(new URL('../src/pages/Reports/reportPaper.js', import.meta.url).href)

// ── it is its own entry in the Report type list, right after Organization Assistance
eq(REPORT_TYPES.map((r) => r.id).slice(-2), ['organization_assistance', 'organization_assistance_individual'], 'listed after the all-organizations report')
eq(reportType('organization_assistance_individual').label, 'Individual Organization Assistance', 'its name')
eq(Boolean(reportType('organization_assistance_individual').description), true, 'it says what it is')
eq(reportTypeFromParam('organization_assistance_individual'), 'organization_assistance_individual', 'it has its own link (?tab=)')

// ── the same backend report, asked for one organization
eq(ORG_ASSISTANCE_PATH, '/reports/organization-assistance/', 'the existing endpoint')
eq(ORG_KINDS.map((k) => [k.id, k.label, k.listPath]), [['farmers', 'Farmers Organizations', '/organizations/farmers/'], ['fisherfolk', 'Fisherfolk Organizations', '/organizations/fisherfolk/']], 'the two kinds and where their organizations are listed')
eq(ORG_KINDS.every((k) => k.types.includes('Cash Assistance') && k.types.includes('Other')), true, 'each kind has its assistance types')
eq(ORG_ASSISTANCE_STATUSES.map((s) => s[0]), ['confirmed', 'awaiting', 'follow_up'], 'the statuses the backend accepts')
eq(NO_ORG_ASSISTANCE_FILTERS, { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '' }, 'no filter by default')

eq(oneOrganizationParams({ kind: 'farmers', organization: null, filters: NO_ORG_ASSISTANCE_FILTERS }), null, 'nothing is asked until an organization is chosen')
eq(oneOrganizationParams({ kind: 'farmers', organization: '', filters: NO_ORG_ASSISTANCE_FILTERS }), null, 'an empty choice is no choice')
eq(oneOrganizationParams({ kind: 'fisherfolk', organization: 7, filters: { ...NO_ORG_ASSISTANCE_FILTERS, date_from: '2026-10-01', status: 'confirmed' } }),
  { kind: 'fisherfolk', id: 7, date_from: '2026-10-01', date_to: '', assistance_type: '', source_agency: '', status: 'confirmed' }, 'the organization id and the filters')
eq(Object.prototype.hasOwnProperty.call(oneOrganizationParams({ kind: 'farmers', organization: 3, filters: NO_ORG_ASSISTANCE_FILTERS }), 'search'), false, 'never a name search: the organization is chosen exactly')
eq(oneOrganizationStem('farmers', 3), 'farmers_organization_assistance_3', 'the file name, as the backend names it')

eq(organizationOptions([{ id: 2, name: 'Samara Fishers' }, { id: 1, name: 'alaska Growers' }, { id: 3, name: 'Basca Farmers' }]),
  [{ value: 1, label: 'alaska Growers' }, { value: 3, label: 'Basca Farmers' }, { value: 2, label: 'Samara Fishers' }], 'by name, whatever the case')
eq(organizationOptions({ results: [{ id: 5, name: 'Paged' }] }), [{ value: 5, label: 'Paged' }], 'a paged answer')
eq(organizationOptions(null), [], 'nothing loaded')
eq(activeOrgFilterCount({ ...NO_ORG_ASSISTANCE_FILTERS, date_from: '2026-01-01', status: 'awaiting' }), 2, 'the Filters badge')

// ── the screens
const page = read('../src/pages/Reports/ReportsPage.jsx')
eq(page.includes("activeTab === 'organization_assistance_individual'") && page.includes('<IndividualOrganizationAssistanceTab'), true, 'the Reports page shows it')
const tab = read('../src/pages/Reports/IndividualOrganizationAssistanceTab.jsx')
eq(tab.includes('SearchSelect') && tab.includes('oneOrganizationParams('), true, 'an organization is chosen from a searchable list')
eq(tab.includes('reportId="organization_assistance_individual"') && tab.includes('DocumentReport'), true, 'the same paper, Print Report and Download Report as the other reports')
eq(tab.includes('OrgAssistanceFilterFields'), true, 'the same filter boxes as the all-organizations report')
eq(/Choose an organization/.test(tab), true, 'it says what to do before an organization is chosen')
const all = read('../src/pages/Reports/OrganizationAssistanceReportTab.jsx')
eq(all.includes("from './orgAssistanceReport.js'") && all.includes('OrgAssistanceFilterFields'), true, 'the all-organizations report shares the kinds, statuses and filter boxes (no second copy)')
eq(/const KINDS = \[|const STATUSES = \[/.test(all), false, 'and keeps no list of its own')

console.log(`ok - ${n} assertions`)
