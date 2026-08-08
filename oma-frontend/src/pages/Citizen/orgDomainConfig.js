// Batch 12: shared per-domain config for the ORGANIZATION-role citizen's
// "Report Assistance" flow — mirrors citizenDomainConfig.js's shape (Batch
// 11) but for the two organization types. The member-search endpoints
// return genuinely different shapes per domain (Farmer rows directly vs.
// FisherfolkOrganizationMember join rows nesting fisherfolk), which is why
// memberIdOf/memberLabel/memberSubtitle exist as accessors rather than
// assuming a common field name.
//
// Batch 2 (org dashboard) extends this with everything the new member /
// officer management screens need. The two domains diverge more than they
// look like they should, so nothing below is guessed — each accessor was
// written against a captured live response:
//
//   farmers members    [{id, full_name, barangay, rsbsa_number}]
//                      `id` IS the farmer id; removal addresses the farmer.
//   fisherfolk members [{id, fisherfolk, fisherfolk_full_name,
//                        fisherfolk_barangay, position, date_joined, ...}]
//                      `id` is the JOIN ROW id; removal addresses that row,
//                      not the person.
//   farmers officers   [{id, position, full_name, farmer_id, ...}]
//   fisherfolk officers[{id, position, full_name, fisherfolk_id, ...}]

import { CROP_THEME, FISH_THEME } from './citizenUI.jsx'

// Mirrors OrganizationOfficer.POSITION_CHOICES /
// FisherfolkOrganizationOfficer.POSITION_CHOICES on the backend — currently
// identical for both domains, but kept per-domain here so they can diverge
// without this file needing restructuring. The backend is the source of
// truth; this list exists because no endpoint exposes the choice set, and
// the staff OrganizationDetailPage already hardcodes the same seven.
const OFFICER_POSITIONS = [
  'President', 'Vice President', 'Secretary', 'Treasurer',
  'Auditor', 'Board Member', 'Manager',
]

export const FARMERS_ORG_DOMAIN = {
  key: 'farmers_org',
  personLabel: 'Farmer',
  // Organizations take the SAME domain colour as the rest of the app —
  // Farmers Organization is crop green, Fisherfolk Organization is fish
  // teal. No separate organization identity.
  theme: CROP_THEME,
  officerPositions: OFFICER_POSITIONS,

  // ── Batch 2: member + officer management ──
  membersUrl: (orgId) => `/organizations/farmers/${orgId}/members/`,
  officersUrl: (orgId) => `/organizations/farmers/${orgId}/officers/`,
  addCandidateSearchUrl: (orgId) => `/organizations/farmers/${orgId}/member-search/`,
  addMemberBody: (personId, confirm) => ({
    farmer: personId,
    ...(confirm ? { confirm_reassignment: true } : {}),
  }),
  // Farmers removal is addressed by FARMER id (the membership link is a
  // field on Farmer, not a row).
  removeMemberUrl: (orgId, row) => `/organizations/farmers/${orgId}/members/${row.id}/`,
  assignOfficerBody: (position, personId) => ({ position, farmer: personId }),

  // Row accessors for the MEMBER LIST shape (not the search shape).
  rowPersonId: (row) => row.id,
  rowName: (row) => row.full_name,
  rowBarangay: (row) => row.barangay,
  officerPersonId: (o) => o.farmer_id,
  // Farmers are single-org, so a search hit already in another org means a
  // reassignment is about to happen.
  candidateCurrentOrgName: (cand) => cand.current_organization_name,
  // Same value, used purely as context on the row. Kept separate from the
  // warning accessor because the fisherfolk side has memberships worth
  // SHOWING but nothing to warn about.
  candidateMembershipNote: (cand) => cand.current_organization_name || null,
  memberSearchUrl: (orgId) => `/organizations/farmers/${orgId}/members/`,
  memberIdOf: (m) => m.id,
  memberLabel: (m) => m.full_name,
  memberSubtitle: (m) => [m.rsbsa_number, m.barangay].filter(Boolean).join(' · '),
  createUrl: '/interventions/beneficiaries/adhoc/',
  detailUrl: (id) => `/interventions/beneficiaries/${id}/detail/`,
  historyUrl: '/interventions/my-org-beneficiary-history/',
  distributeUrl: (orgId) => `/organizations/farmers/${orgId}/distribute-assistance/`,
  personField: 'farmer',
  assistanceTypeOptions: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: ['Dry', 'Wet'],
}

export const FISHERFOLK_ORG_DOMAIN = {
  key: 'fisherfolk_org',
  personLabel: 'Fisherfolk',
  theme: FISH_THEME,
  officerPositions: OFFICER_POSITIONS,

  // ── Batch 2: member + officer management ──
  membersUrl: (orgId) => `/organizations/fisherfolk/${orgId}/members/`,
  officersUrl: (orgId) => `/organizations/fisherfolk/${orgId}/officers/`,
  addCandidateSearchUrl: (orgId) => `/organizations/fisherfolk/${orgId}/member-search/`,
  // date_joined is required by the join-table serializer; the farmers side
  // has nowhere to put it (direct FK) and so omits it entirely.
  addMemberBody: (personId) => ({
    fisherfolk: personId,
    date_joined: new Date().toISOString().split('T')[0],
  }),
  // Fisherfolk removal is addressed by the JOIN ROW id, not the person's.
  removeMemberUrl: (orgId, row) => `/organizations/fisherfolk/${orgId}/members/${row.id}/`,
  assignOfficerBody: (position, personId) => ({ position, fisherfolk: personId }),

  rowPersonId: (row) => row.fisherfolk,
  rowName: (row) => row.fisherfolk_full_name,
  rowBarangay: (row) => row.fisherfolk_barangay,
  officerPersonId: (o) => o.fisherfolk_id,
  // Multi-org is legitimate here, so there is never a reassignment warning —
  // this stays null and the Add Member screen skips the whole branch.
  candidateCurrentOrgName: () => null,
  // ...but existing memberships are still worth SHOWING, so an officer can
  // see at a glance that someone already belongs elsewhere. Informational
  // only: adding them takes nothing away from those organizations.
  candidateMembershipNote: (cand) => {
    const names = (cand.current_organizations || []).map((o) => o.name)
    return names.length > 0 ? names.join(', ') : null
  },

  memberSearchUrl: (orgId) => `/organizations/fisherfolk/${orgId}/members/`,
  memberIdOf: (m) => m.fisherfolk,
  memberLabel: (m) => m.fisherfolk_full_name,
  memberSubtitle: (m) => [m.fisherfolk_lgu_number, m.fisherfolk_barangay].filter(Boolean).join(' · '),
  createUrl: '/interventions/fisherfolk-beneficiaries/adhoc/',
  detailUrl: (id) => `/interventions/fisherfolk-beneficiaries/${id}/detail/`,
  historyUrl: '/interventions/my-org-fisherfolk-beneficiary-history/',
  distributeUrl: (orgId) => `/organizations/fisherfolk/${orgId}/distribute-assistance/`,
  personField: 'fisherfolk',
  assistanceTypeOptions: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: null, // FisherfolkBeneficiaryRecord.season is a free CharField, not a fixed choice set
}
