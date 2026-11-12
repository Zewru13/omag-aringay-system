// The Organization Assistance report of the Reports page: every organization of a kind, read from the backend report
// GET /reports/organization-assistance/. No screen and no network here, so the rules can be tested on their own.

export const ORG_ASSISTANCE_PATH = '/reports/organization-assistance/'

// The kinds of organization, the list their organizations are read from, and the assistance types each kind can give.
export const ORG_KINDS = [
  { id: 'farmers', label: 'Farmers Organizations', listPath: '/organizations/farmers/',
    types: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'] },
  { id: 'fisherfolk', label: 'Fisherfolk Organizations', listPath: '/organizations/fisherfolk/',
    types: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'] },
]
export const orgKind = (id) => ORG_KINDS.find((k) => k.id === id) || ORG_KINDS[0]

// [value the backend takes, what the dropdown says]
export const ORG_ASSISTANCE_STATUSES = [['confirmed', 'Confirmed'], ['awaiting', 'Awaiting confirmation'], ['follow_up', 'Needs follow-up']]

// The filters of the report (the page adds a name search of its own).
export const NO_ORG_ASSISTANCE_FILTERS = { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '' }
export const activeOrgFilterCount = (filters) => Object.keys(NO_ORG_ASSISTANCE_FILTERS).filter((k) => filters[k]).length
