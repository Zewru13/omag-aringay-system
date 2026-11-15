// The Aquaculture Records report of the Reports page: the production cycles the Aquaculture Records page lists, as a printable report, read from
// GET /reports/aquaculture-records/. No screen and no network here, so the rules can be tested on their own.

export const AQUACULTURE_RECORDS_PATH = '/reports/aquaculture-records/'

// The values the filter dropdowns offer come from the records themselves: the same endpoint the Aquaculture Records page uses.
export const FILTER_OPTIONS_PATH = '/fisheries/stocking/filter-options/'

// Every filter the report takes (the names are the backend's), empty by default. The search is the page's: a fisherfolk's name or number, the species or the place.
export const NO_AQUACULTURE_FILTERS = {
  ownership: '', cycle: '', species: '', fisherfolk: '', barangay: '', pond_location: '', culture_type: '', organization: '', pcic: '',
  stocked_from: '', stocked_to: '', search: '',
}

// The Filters badge: the filters set, not the search bar (it has its own place).
export const activeAquacultureFilterCount = (filters) => Object.keys(NO_AQUACULTURE_FILTERS).filter((k) => k !== 'search' && filters[k]).length

// [value the backend takes, what the dropdown says]
export const AQUACULTURE_REPORT_PCIC = [
  { value: '', label: 'All' },
  { value: 'insured', label: 'PCIC insured' },
  { value: 'not_insured', label: 'Not PCIC insured' },
]

// The dropdown lists as the backend sends them; anything missing is an empty list.
export function aquacultureOptions(data) {
  const list = (key) => (Array.isArray(data?.[key]) ? data[key] : [])
  return {
    ownerships: list('ownerships'), cycles: list('cycles'), species: list('species'), fisherfolk: list('fisherfolk'),
    barangays: list('barangays'), pond_locations: list('pond_locations'), culture_types: list('culture_types'), organizations: list('organizations'),
  }
}
