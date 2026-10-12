// User Management is four separate tables, one per kind of account, each with its own filters:
//   Staff          Admin / Focal Person           - filters: role, status (Active by default, so people who left are out of sight)
//   Fisherfolk     citizen accounts of fisherfolk - filter: type of fisherfolk
//   Farmers        citizen accounts of farmers    - filter: farm operator or farm laborer
//   Organizations  citizen accounts of organizations - filter: fisherfolk or farmers organization
// Pure helpers, so what each tab asks the server for can be tested.

export const USER_TABS = [
  { id: 'staff', label: 'Staff', subtitle: 'Admin and Focal Person accounts' },
  { id: 'fisherfolk', label: 'Fisherfolk', subtitle: 'Accounts of registered fisherfolk' },
  { id: 'farmers', label: 'Farmers', subtitle: 'Accounts of registered farmers' },
  { id: 'organizations', label: 'Organizations', subtitle: 'Accounts of registered organizations' },
]

export const STAFF_ROLE_OPTIONS = [
  { value: '', label: 'Admin and Focal Person' },
  { value: 'ADMIN', label: 'Admin' },
  { value: 'EVALUATOR', label: 'Focal Person' },
]
export const STAFF_STATUS_OPTIONS = [
  { value: 'active', label: 'Active' },
  { value: 'deactivated', label: 'Deactivated' },
  { value: 'unverified', label: 'Unverified' },
  { value: 'all', label: 'All' },
]
export const TYPE_OPTIONS = {
  fisherfolk: {
    label: 'Fisherfolk type',
    options: [
      { value: '', label: 'All types' },
      { value: 'Aquaculture', label: 'Aquaculture' },
      { value: 'Capture', label: 'Capture Fishery' },
      { value: 'Mariculture', label: 'Mariculture' },
      { value: 'Inland', label: 'Inland Fishery' },
      { value: 'Unspecified', label: 'Not Yet Classified' },
    ],
  },
  farmers: {
    label: 'Farmer type',
    options: [
      { value: '', label: 'All types' },
      { value: 'operator', label: 'Farm operator' },
      { value: 'laborer', label: 'Farm laborer' },
    ],
  },
  organizations: {
    label: 'Organization type',
    options: [
      { value: '', label: 'All types' },
      { value: 'fisherfolk', label: 'Fisherfolk organization' },
      { value: 'farmers', label: 'Farmers organization' },
    ],
  },
}

export const tabFromParam = (value) => (USER_TABS.some((t) => t.id === value) ? value : 'staff')

export const defaultFilters = (tab) => ({ role: '', status: tab === 'staff' ? 'active' : '', type: '' })

const ROLE_OF_TAB = { fisherfolk: 'FISHERFOLK', farmers: 'FARMER', organizations: 'ORGANIZATION' }
const TYPE_PARAM = { fisherfolk: 'fisherfolk_type', farmers: 'farmer_type', organizations: 'organization_type' }

// The query string parameters for one tab, its filters, the search text and the page.
export const buildUserQuery = (tab, filters, search, page) => {
  const params = { page }
  if (search) params.search = search
  if (tab === 'staff') {
    if (filters.role) params.role = filters.role          // no role: the server lists Admin and Focal Person
    if (filters.status) params.status = filters.status
    return params
  }
  params.role = ROLE_OF_TAB[tab]
  if (filters.type) params[TYPE_PARAM[tab]] = filters.type
  return params
}

// How many of a tab's filters differ from where it starts (for the filter badge).
export const filterCount = (tab, filters) => {
  const start = defaultFilters(tab)
  if (tab === 'staff') return Number(filters.role !== start.role) + Number(filters.status !== start.status)
  return Number(filters.type !== start.type)
}
