import assert from 'node:assert/strict'
import fs from 'node:fs'

// Reports > Organization Assistance (the Individual Organization Assistance report was removed from the Report type list).
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const {
  ORG_ASSISTANCE_PATH, ORG_KINDS, ORG_ASSISTANCE_STATUSES, NO_ORG_ASSISTANCE_FILTERS, activeOrgFilterCount, ...rest
} = await import(new URL('../src/pages/Reports/orgAssistanceReport.js', import.meta.url).href)
const { REPORT_TYPES, reportType, reportTypeFromParam } = await import(new URL('../src/pages/Reports/reportPaper.js', import.meta.url).href)

// ── no Individual Organization Assistance in the Report type list
eq(REPORT_TYPES.map((r) => r.id).includes('organization_assistance_individual'), false, 'not a report type any more')
eq(REPORT_TYPES.map((r) => r.id).slice(-1), ['organization_assistance'], 'Organization Assistance is the last report')
eq(REPORT_TYPES.some((r) => /Individual Organization Assistance/.test(r.label)), false, 'no report is called that')
eq(reportTypeFromParam('organization_assistance_individual'), REPORT_TYPES[0].id, 'an old link to it opens the first report')
eq(Object.keys(rest), ['orgKind'], 'the one-organization helpers are gone')

// ── the same backend report, asked for one organization
eq(ORG_ASSISTANCE_PATH, '/reports/organization-assistance/', 'the existing endpoint')
eq(ORG_KINDS.map((k) => [k.id, k.label, k.listPath]), [['farmers', 'Farmers Organizations', '/organizations/farmers/'], ['fisherfolk', 'Fisherfolk Organizations', '/organizations/fisherfolk/']], 'the two kinds and where their organizations are listed')
eq(ORG_KINDS.every((k) => k.types.includes('Cash Assistance') && k.types.includes('Other')), true, 'each kind has its assistance types')
eq(ORG_ASSISTANCE_STATUSES.map((s) => s[0]), ['confirmed', 'awaiting', 'follow_up'], 'the statuses the backend accepts')
eq(NO_ORG_ASSISTANCE_FILTERS, { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '' }, 'no filter by default')

eq(activeOrgFilterCount({ ...NO_ORG_ASSISTANCE_FILTERS, date_from: '2026-01-01', status: 'awaiting' }), 2, 'the Filters badge')

// ── the screens
const page = read('../src/pages/Reports/ReportsPage.jsx')
eq(page.includes('organization_assistance_individual') || page.includes('IndividualOrganizationAssistanceTab'), false, 'the Reports page does not show it')
eq(fs.existsSync(new URL('../src/pages/Reports/IndividualOrganizationAssistanceTab.jsx', import.meta.url)), false, 'its screen is gone')
const all = read('../src/pages/Reports/OrganizationAssistanceReportTab.jsx')
eq(all.includes("from './orgAssistanceReport.js'") && all.includes('OrgAssistanceFilterFields'), true, 'the all-organizations report shares the kinds, statuses and filter boxes (no second copy)')
eq(/const KINDS = \[|const STATUSES = \[/.test(all), false, 'and keeps no list of its own')

console.log(`ok - ${n} assertions`)
