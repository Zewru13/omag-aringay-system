// The two Organization Assistance reports of the Reports page: every organization of a kind (Organization Assistance) and one chosen
// organization (Individual Organization Assistance). Both read the same backend report, GET /reports/organization-assistance/; the
// individual one sends the organization's id. No screen and no network here, so the rules can be tested on their own.

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

// The filters both reports share (the all-organizations report adds a name search of its own).
export const NO_ORG_ASSISTANCE_FILTERS = { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '' }
export const activeOrgFilterCount = (filters) => Object.keys(NO_ORG_ASSISTANCE_FILTERS).filter((k) => filters[k]).length

// The organizations of a kind as the choices of the picker, by name (the list endpoint answers a plain list or a paged one).
export function organizationOptions(data) {
  const rows = Array.isArray(data) ? data : (data?.results || [])
  return rows
    .map((o) => ({ value: o.id, label: o.name }))
    .sort((a, b) => String(a.label).localeCompare(String(b.label), undefined, { sensitivity: 'base' }))
}

// What the individual report asks the backend: nothing (null) until an organization is chosen, then that organization's id with the
// filters. It never sends a name search: the organization is chosen exactly.
export function oneOrganizationParams({ kind, organization, filters }) {
  if (organization === null || organization === undefined || organization === '') return null
  return { kind, id: organization, ...filters }
}

// The download's file name (without extension), as the backend names the same report.
export const oneOrganizationStem = (kind, organization) => `${kind}_organization_assistance_${organization}`
