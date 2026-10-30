// The Disaster tables (Crop Disaster, Fisheries Disaster) and the Reports page's disaster reports speak about the same filters. The table's
// own filters become the report's, so Print / Download hold exactly the rows the table shows, and one farmer's or fisherfolk's report is
// the same report with their id added. No screen and no network, so it can be tested on its own.
import { dateRangeParams } from './dateRange.js'
import { reportQuery } from './documentReport.js'

const PATH = { crops: '/reports/disasters/crops/', fisheries: '/reports/disasters/fisheries/' }
const STEM = { crops: 'crop_disaster_report', fisheries: 'fisheries_disaster_report' }
const text = (value) => (typeof value === 'string' ? value.trim() : (value == null ? '' : String(value).trim()))

// `filters` is the page's state: search, barangay, type, status, year, dateFrom, dateTo. Returns the request's params under the names the
// backend takes (date_from / date_to, disaster_type); blank filters are left out, and so is a reversed date range.
export function disasterListParams(filters = {}) {
  const params = {}
  const add = (key, value) => { if (text(value)) params[key] = text(value) }
  add('search', filters.search)
  add('barangay', filters.barangay)
  add('disaster_type', filters.type)
  add('status', filters.status)
  add('year', filters.year)
  Object.assign(params, dateRangeParams(text(filters.dateFrom), text(filters.dateTo), 'date_from', 'date_to'))
  if (filters.page) params.page = filters.page
  return params
}

// The report's filters: the table's, and the person when the report is for one farmer or fisherfolk ({ kind: 'farmer' | 'fisherfolk', id }).
export function disasterReportParams(filters = {}, person = null) {
  const params = disasterListParams({ ...filters, page: undefined })
  if (person?.id) params[person.kind] = person.id
  return params
}

// format: 'json' (the on-screen document) | 'pdf'.
export const disasterReportUrl = (kind, filters, person, format) => `${PATH[kind]}?${reportQuery(disasterReportParams(filters, person), format)}`

// The download's name: one file per kind, or per person ('crop_disaster_report_maria_santos').
export function disasterReportStem(kind, person = null) {
  const name = text(person?.name).toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  if (person && name) return `${STEM[kind]}_${name}`
  return `${STEM[kind]}s`
}
