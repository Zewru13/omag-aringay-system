// The assistance history as printable documents (Print Report / Download Report): the History list (bulk), one distribution with its recipients,
// and one person's history. Pure (no screen, no network); the print itself is printSpec() and the download is the same document laid out as a
// PDF by the server (utils/specPdf.js), so the two always agree. Layouts come from utils/listReport.js, like the other list reports.
import { buildDetailReportSpec, buildListReportSpec } from '../../utils/listReport.js'
import { formatAssistanceQuantity } from './assistanceFieldHelpers.js'
import { agenciesText, distributionRowLabel } from './distributionsTableRows.js'

const SECTORS = { crop: 'Crop (Farmers)', fisheries: 'Fisheries (Fisherfolk)' }
const MEMBER_STATUS = { PENDING: 'Pending', AWAITING_CONFIRMATION: 'Awaiting Confirmation', CONFIRMED: 'Confirmed', NOT_RECEIVED: 'Not Received', RESOLVED: 'Resolved' }

const fmtDate = (value) => (value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
  : '—')
const dash = (value) => (value === null || value === undefined || value === '' ? '—' : String(value))
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' })

// The History list: one row per distribution. `distributions` are the groups the server sends (date_given, organization_name, members,
// member_count, assistance_type, source_agencies, quantity, summary_status); `filters` is [[label, value]] of what the list was narrowed by
// (blank values are left out). `organizationName` makes it an organization's own report: each row then says which members received it.
export function buildDistributionsReportSpec({ noun, distributions, filters = [], organizationName = '', now = new Date() }) {
  const applied = [...(organizationName ? [['Organization', organizationName]] : []), ...filters]
  return buildListReportSpec({
      title: organizationName ? 'ORGANIZATION ASSISTANCE HISTORY REPORT' : 'ASSISTANCE HISTORY REPORT',
      noun: 'distribution',
      filters: applied,
      head: ['Date Given', 'Given To', 'Assistance Type', 'Source Agency', 'Quantity', 'Recipients', 'Status'],
      rows: distributions.map((g) => [
        fmtDate(g.date_given),
        distributionRowLabel(organizationName ? { ...g, organization_name: null } : g, noun),
        g.assistance_type,
        agenciesText(g.source_agencies),
        formatAssistanceQuantity(g.assistance_type, g.quantity),
        g.member_count ?? (g.members || []).length,
        g.summary_status,
      ]),
      wide: true,
      now,
  })
}

// Every distribution a staff list matches. That list is paged ten at a time and says how many there are but gives no "next" link, so the
// pages are read until that many have arrived (or a page comes back empty, or `maxPages` is reached). `get` is api.get.
export async function loadAllDistributions(get, url, params = {}, maxPages = 200) {
  const rows = []
  for (let page = 1; page <= maxPages; page += 1) {
    const { data } = await get(url, { params: { ...params, page } })
    const results = Array.isArray(data) ? data : (data?.results || [])
    rows.push(...results)
    if (Array.isArray(data) || results.length === 0 || rows.length >= (data?.count ?? 0)) break
  }
  return rows
}

// One distribution: its details, then every recipient with their own status.
export function buildDistributionRecordSpec({ domain = 'crop', noun, distribution: g, now = new Date() }) {
  const members = [...(g.members || [])].sort(byName)
  const givenTo = g.organization_name || members.map((m) => String(m.name || '').trim()).filter(Boolean).join(', ') || distributionRowLabel(g, noun)
  return buildDetailReportSpec({
    title: 'ASSISTANCE DISTRIBUTION RECORD',
    noun: 'distribution',
    details: [
      ['Sector', SECTORS[domain] || ''],
      ['Given to', givenTo],
      ['Date given', fmtDate(g.date_given)],
      ['Assistance type', g.assistance_type],
      ['Source agency', agenciesText(g.source_agencies)],
      ['Quantity', formatAssistanceQuantity(g.assistance_type, g.quantity)],
      ['Status', g.summary_status],
      ['Recipients', g.member_count ?? members.length],
    ],
    sections: [{
      title: 'Recipients',
      table: {
        head: ['No.', 'Name', 'Barangay', 'Status'],
        rows: members.map((m, i) => [String(i + 1), dash(m.name), dash(m.barangay), MEMBER_STATUS[m.status] || dash(m.status)]),
        boldRows: new Set(),
      },
    }],
    now,
  })
}

// One person's history (the rows of the profile's Assistance History): newest first, a record with no date last.
export function buildPersonHistorySpec({ domain = 'crop', person = {}, records, now = new Date() }) {
  const sorted = [...records].sort((a, b) => String(b.date_given || '').localeCompare(String(a.date_given || '')))
  return buildDetailReportSpec({
    title: `${domain === 'fisheries' ? 'FISHERFOLK' : 'FARMER'} ASSISTANCE HISTORY REPORT`,
    noun: 'assistance record',
    details: [['Name', person.name], ['RSBSA No.', person.rsbsa], ['Barangay', person.barangay], ['Assistance records', records.length]],
    sections: [{
      title: 'Assistance records',
      table: {
        head: ['No.', 'Date Given', 'Assistance Type', 'Source Agency', 'Quantity', 'Season', 'Year', 'Status'],
        rows: sorted.map((r, i) => [
          String(i + 1), fmtDate(r.date_given), dash(r.assistance_type), agenciesText(r.source_agencies),
          dash(formatAssistanceQuantity(r.assistance_type, r.quantity)), dash(r.season), dash(r.year), MEMBER_STATUS[r.status] || dash(r.status),
        ]),
        boldRows: new Set(),
      },
    }],
    now,
  })
}

// What a distributions list was narrowed by, as [[label, value]] for the report's header (blank filters are left out).
const STATUS_WORDS = { history: 'History', current: 'Current', 'needs-follow-up': 'Needs follow-up', ...MEMBER_STATUS }
export function historyFilterPairs(filters = {}) {
  const text = (value) => String(value ?? '').trim()
  return [
    ['Year', text(filters.year)], ['Barangay', text(filters.barangay)], ['Search', text(filters.member)],
    ['Source agency', text(filters.source_agency)], ['Assistance', text(filters.assistance_type)],
    ['Given from', text(filters.date_from) ? fmtDate(filters.date_from) : ''], ['Given to', text(filters.date_to) ? fmtDate(filters.date_to) : ''],
    ['Status', STATUS_WORDS[filters.status] || text(filters.status)],
  ].filter(([, value]) => value)
}

// The Print Report / Download Report of a staff History list: every distribution the list's filters match (not only the page on screen), laid
// out as the history report. `filters` are the table's own filters (blanks are not sent); `get` is api.get.
export async function buildStaffHistoryReport({ get, url, filters, noun, now = new Date() }) {
  const params = {}
  Object.entries(filters).forEach(([key, value]) => { if (value !== '' && value !== null && value !== undefined) params[key] = typeof value === 'string' ? value.trim() : value })
  const distributions = await loadAllDistributions(get, url, params)
  return buildDistributionsReportSpec({ noun, distributions, filters: historyFilterPairs(filters), now })
}
