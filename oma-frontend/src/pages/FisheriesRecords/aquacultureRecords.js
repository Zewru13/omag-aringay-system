// Aquaculture Records (Fisheries Management): one row per production cycle, listed from the existing stocking records
// (GET /fisheries/stocking/), with filters. No screen and no network here, so the rules can be tested on their own.
import { dateRangeParams, dateRangeProblem } from '../../utils/dateRange.js'
import { ownerLine, ownershipLabel } from '../../utils/ownership.js'

export const PAGE_SIZE = 10

// Every status, so a record is never hidden from the page that lists them all.
export const RECORDS_STATUS = 'Stocked,Near Harvest,Harvested,Total Loss'

// The ten columns, in this order. Barangay is the fisherfolk's registered barangay; Pond/Cage Location is the barangay the
// ponds/cages are in (it can differ: the Start Production Cycle form lets the Admin pick it).
export const RECORD_COLUMNS = [
  { key: 'ownership_cell',     label: 'OWNERSHIP' },
  { key: 'cycle_cell',         label: 'CYCLE' },
  { key: 'species_cell',       label: 'SPECIES' },
  { key: 'fisherfolk_cell',    label: 'FISHERFOLK' },
  { key: 'barangay_cell',      label: 'BARANGAY' },
  { key: 'pond_location_cell', label: 'POND/CAGE LOCATION' },
  { key: 'culture_type_cell',  label: 'CULTURE TYPE' },
  { key: 'organization_cell',  label: 'ORGANIZATION' },
  { key: 'date_stocked_cell',  label: 'DATE STOCKED' },
  { key: 'pcic_cell',          label: 'PCIC INSURED' },
]

// All / empty by default.
export const EMPTY_FILTERS = {
  ownership: '', cycle: '', species: '', fisherfolk: '', barangay: '', pondLocation: '', cultureType: '', organization: '',
  stockedFrom: '', stockedTo: '', pcic: '',
}

export const activeFilterCount = (filters) => Object.values(filters).filter(Boolean).length

// What is picked in the panel is a draft until Apply Filters: true when it differs from what the table shows.
export const filtersChanged = (draft, applied) => Object.keys(EMPTY_FILTERS).some((key) => (draft[key] || '') !== (applied[key] || ''))

// Why the draft cannot be applied ('' when it can).
export const applyProblem = (filters) => dateRangeProblem(filters.stockedFrom, filters.stockedTo)

// The request: only what was chosen, plus the page and the status scope. The search travels with the filters, so they work together.
export function recordsParams({ filters, search, page }) {
  const params = { page, status: RECORDS_STATUS }
  const text = String(search || '').trim()
  if (text) params.search = text
  const map = {
    ownership: 'ownership', cycle: 'cycle', species: 'species', fisherfolk: 'fisherfolk', barangay: 'fisherfolk_barangay',
    pondLocation: 'pond_location', cultureType: 'culture_type', organization: 'organization', pcic: 'pcic',
  }
  Object.entries(map).forEach(([key, name]) => { if (filters[key]) params[name] = filters[key] })
  Object.assign(params, dateRangeParams(filters.stockedFrom, filters.stockedTo, 'stocked_from', 'stocked_to'))
  return params
}

const dash = (value) => (value === null || value === undefined || value === '' ? '—' : value)

const fmtShort = (iso) => {
  if (!iso) return '—'
  const d = new Date(`${iso}T00:00:00`)
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

// What one table row shows, from the saved production-cycle record (nothing invented: a missing value is a dash).
export function recordRow(rec) {
  const number = rec.production_cycle_no ? `#${rec.production_cycle_no}` : ''
  return {
    ownership: ownershipLabel(rec.ownership),
    ownerLine: ownerLine(rec),
    cycle: rec.production_cycle_name || number || '—',
    cycleNo: rec.production_cycle_name ? number : '',
    species: dash(rec.species_name),
    fisherfolk: dash(rec.fisherfolk_name),
    barangay: dash(rec.fisherfolk_barangay),
    pondLocation: dash(rec.pond_location_barangay),
    cultureType: dash(rec.culture_type),
    organization: dash(rec.organization_name),
    dateStocked: fmtShort(rec.date_stocked),
    insured: Boolean(rec.has_pcic_insurance),
  }
}

export function countLabel(count) {
  if (!count) return 'No production cycles'
  return `${count.toLocaleString()} production cycle${count === 1 ? '' : 's'}`
}
