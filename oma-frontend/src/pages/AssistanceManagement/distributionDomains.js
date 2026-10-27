// Per-domain config of giving assistance from the Assistance pages (farmers / fisherfolk, and their organizations): what the tables of
// recipients list, where they come from and where the request goes. Staff may give to anyone; an organization account gives only to its
// own members (`loadOwnMembers`) or to its own organization (`fixedOrg` in the window).
import api from '../../api/axiosInstance.js'

const asList = (data) => (Array.isArray(data) ? data : (data?.results || []))
const pageOf = (data, map) => ({ rows: asList(data).map(map), count: typeof data?.count === 'number' ? data.count : asList(data).length })

const PERSON_COLUMNS = [
  { key: 'name', label: 'Name' },
  { key: 'rsbsa', label: 'RSBSA No.' },
  { key: 'barangay', label: 'Barangay' },
]
const ORG_COLUMNS = [
  { key: 'name', label: 'Organization' },
  { key: 'barangay', label: 'Barangay' },
  { key: 'members', label: 'Members' },
]
const orgRow = (o) => ({ id: o.id, name: o.name, barangay: o.barangay, members: o.member_count ?? '—' })

// A member list that has no paging or search of its own (an organization's members), paged and searched here.
const MEMBER_PAGE = 10
function pageMembers(all, { search, page }, map) {
  const words = search.toLowerCase().split(/\s+/).filter(Boolean)
  const found = all.map(map).filter((m) => words.every((w) => `${m.name} ${m.rsbsa} ${m.barangay}`.toLowerCase().includes(w)))
  return { rows: found.slice((page - 1) * MEMBER_PAGE, page * MEMBER_PAGE), count: found.length }
}

export const FARMER_DISTRIBUTION_DOMAIN = {
  key: 'farmers_org',
  reportDomain: 'crop',
  personLabel: 'Farmer',
  peopleLabel: 'farmers',
  orgLabel: 'Farmers Organization',
  orgSearchUrl: '/organizations/farmers/',
  distributeUrl: (orgId) => `/organizations/farmers/${orgId}/distribute-assistance/`,
  assistanceTypeOptions: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  bulkUrl: '/interventions/beneficiaries/adhoc/bulk/',
  idsKey: 'farmer_ids',
  descriptionKey: 'remarks',
  allowSeedFertilizer: true,
  personColumns: PERSON_COLUMNS,
  orgColumns: ORG_COLUMNS,
  loadPeople: ({ search, page }) => api.get('/farmers/', { params: { search, page } })
    .then((r) => pageOf(r.data, (f) => ({ id: f.id, name: f.full_name, rsbsa: f.rsbsa_number || '—', barangay: f.barangay || '—' }))),
  loadOrganizations: ({ search, page }) => api.get('/organizations/farmers/', { params: { search, page } }).then((r) => pageOf(r.data, orgRow)),
  loadOwnMembers: (memberUrl, query) => api.get(memberUrl)
    .then((r) => pageMembers(asList(r.data), query, (m) => ({ id: m.farmer, name: m.farmer_full_name, rsbsa: m.farmer_rsbsa_number || '—', barangay: m.farmer_barangay || '—' }))),
}

export const FISHERFOLK_DISTRIBUTION_DOMAIN = {
  key: 'fisherfolk_org',
  reportDomain: 'fisheries',
  personLabel: 'Fisherfolk',
  peopleLabel: 'fisherfolk',
  orgLabel: 'Fisherfolk Organization',
  orgSearchUrl: '/organizations/fisherfolk/',
  distributeUrl: (orgId) => `/organizations/fisherfolk/${orgId}/distribute-assistance/`,
  // Unchanged by Step 5's "standardize to CropAssistanceRecord's set"
  // instruction — that set (Fertilizer/Seeds/...) is the FARMER domain's own
  // established list (see FARMER_DISTRIBUTION_DOMAIN above, already
  // matching, no change needed there either). This fisherfolk list mirrors
  // FisherfolkBeneficiaryRecord.AssistanceType's real model choices, which
  // has neither 'Fertilizer' nor plain 'Seeds' — swapping in the farmer set
  // here would submit values the backend rejects.
  assistanceTypeOptions: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  bulkUrl: '/interventions/fisherfolk-beneficiaries/adhoc/bulk/',
  idsKey: 'fisherfolk_ids',
  descriptionKey: 'description',
  allowSeedFertilizer: false,
  personColumns: [...PERSON_COLUMNS, { key: 'type', label: 'Type' }],
  orgColumns: ORG_COLUMNS,
  loadPeople: ({ search, page }) => api.get('/fisheries/fisherfolk/', { params: { search, page } })
    .then((r) => pageOf(r.data, (f) => ({ id: f.id, name: f.full_name, rsbsa: f.rsbsa_number || '—', barangay: f.barangay || '—', type: f.fisherfolk_type || '—' }))),
  loadOrganizations: ({ search, page }) => api.get('/organizations/fisherfolk/', { params: { search, page } }).then((r) => pageOf(r.data, orgRow)),
  loadOwnMembers: (memberUrl, query) => api.get(memberUrl)
    .then((r) => pageMembers(asList(r.data), query, (m) => ({
      id: m.fisherfolk, name: m.fisherfolk_full_name, rsbsa: m.fisherfolk_rsbsa_number || '—', barangay: m.fisherfolk_barangay || '—', type: '—',
    }))),
}
