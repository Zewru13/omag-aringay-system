// The Print Report button on the registration tables (Farmers, Fisherfolk and the two kinds of organizations): the table's own filters
// become the Registered report's filters, so the printed report holds exactly the rows the table shows. No screen and no network.
import { reportQuery } from './documentReport.js'

const PATH = '/reports/registered/'
const text = (value) => (typeof value === 'string' ? value.trim() : '')
const chosen = (value) => (text(value) && text(value) !== 'all' ? text(value) : '')

// `filters` is the page's own state: search, gender ('all' or a value), farmerType ('all' | 'true' | 'false'), typeFilter (fisherfolk
// type or 'all'), seniorOnly / filterICC / filterPWD / filter4Ps (ticked boxes), barangay, registeredFrom, registeredTo.
export function registeredReportParams(kind, filters = {}) {
  const params = { kind }
  const add = (key, value) => { if (value) params[key] = value }
  add('search', text(filters.search))
  add('barangay', text(filters.barangay))
  add('registered_from', text(filters.registeredFrom))
  add('registered_to', text(filters.registeredTo))
  if (kind === 'farmers' || kind === 'fisherfolk') {
    add('gender', chosen(filters.gender))
    if (filters.seniorOnly) params.is_senior = 'true'
    if (filters.filterPWD) params.is_pwd = 'true'
  }
  if (kind === 'farmers') {
    add('is_farm_laborer', chosen(filters.farmerType))
    if (filters.filterICC) params.is_icc_ip = 'true'
  }
  if (kind === 'fisherfolk') {
    add('fisherfolk_type', chosen(filters.typeFilter))
    if (filters.filter4Ps) params.is_4ps = 'true'
  }
  return params
}

// The PDF's address: the same report (and the same PDF) as Reports > Registered.
export const registeredReportUrl = (kind, filters) => `${PATH}?${reportQuery(registeredReportParams(kind, filters), 'pdf')}`
