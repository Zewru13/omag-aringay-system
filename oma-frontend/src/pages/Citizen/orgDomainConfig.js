// Batch 12: shared per-domain config for the ORGANIZATION-role citizen's
// "Report Assistance" flow — mirrors citizenDomainConfig.js's shape (Batch
// 11) but for the two organization types.
//
// Batch 2 (org dashboard) extends this with everything the new member /
// officer management screens need. Batch (Phase B — multi-org membership)
// converged the two domains onto one identical shape: both members
// endpoints now return real join-table rows, so memberIdOf/memberLabel/
// memberSubtitle/rowIsMain etc. read the same field names on both sides —
// kept as accessors rather than inlined field names purely so this file
// still reads the same way it always has, not because the shapes diverge
// any more:
//
//   farmers members    [{id, farmer, farmer_full_name, farmer_barangay,
//                        farmer_rsbsa_number, position, date_joined,
//                        is_active, deactivation_reason, is_main}]
//   fisherfolk members [{id, fisherfolk, fisherfolk_full_name,
//                        fisherfolk_barangay, fisherfolk_rsbsa_number,
//                        position, date_joined, is_active,
//                        deactivation_reason, is_main}]
//   `id` is the JOIN ROW id on both — removal/set-active/set-main address
//   that row, not the person, on both sides now.
//   farmers officers   [{id, position, full_name, farmer_id, ...}]
//   fisherfolk officers[{id, position, full_name, fisherfolk_id, ...}]

import { CROP_THEME, FISH_THEME } from './citizenUI.jsx'

// ── Organization Reference rebuild: dedicated theme tokens ─────────────────
// "Cultivated Ground" (Farmers Org) / "Tide" (Fisherfolk Org) — the exact
// palette specified for this rebuild, matching Staff/Admin's own established
// green (#1B4D2E, hardcoded the same way across every Staff page — e.g.
// ProfilePage.jsx, CropAssistancePage.jsx). Arbitrary-value Tailwind classes,
// matching that same established convention, not new named utilities — the
// existing --color-forest/--color-milk tokens in index.css sit in a plain
// :root, not the @theme block, so bg-forest etc. would silently generate no
// CSS.
//
// Used by `dashboardTheme` below (Home, Members, Assign Officer, Add Member,
// Report Assistance, History). `theme` above stays CROP_THEME/FISH_THEME —
// the organization screens read `dashboardTheme` instead (Phase 2 color fix,
// 2026-09-07), so the distinction is no longer load-bearing for this file,
// but `theme` is kept for CitizenProfileScreen.jsx's own dashboard-summary
// hero, which still legitimately wants the individual-citizen shell colour.
// CROP_THEME/FISH_THEME's own hex values (index.css) were realigned to
// these same #1B4D2E/#155E82 tokens in that same fix, so `theme` and
// `dashboardTheme` now render identically in colour — only the class
// mechanism (named CSS token vs. arbitrary value) differs between them.
const ORG_FARMERS_THEME = {
  header: 'bg-[#1B4D2E]',
  brand: 'text-[#C8E6D0]',
  name: 'text-white',
  meta: 'text-[#C8E6D0]',
  iconBtn: 'text-white',
  accentText: 'text-[#1B4D2E]',
  solidBtn: 'bg-[#1B4D2E] text-white',
  tileSelectedBg: 'bg-[#EBF5EE]',
  tileSelectedText: 'text-[#163318]',
  dot: 'bg-[#C8E6D0]',
  border: 'border-[#1B4D2E]',
  focusBorder: 'focus:border-[#1B4D2E]',
  focusWithinBorder: 'focus-within:border-[#1B4D2E]',
  heroGradient: 'bg-gradient-to-b from-[#1B4D2E] to-[#163318]',
  mutedOn: 'text-[#C8E6D0]',
  activeNavBg: 'bg-[#EBF5EE]',
  activeNavText: 'text-[#1B4D2E]',
  cta: 'bg-[#B45309] text-white',
}

const ORG_FISHERFOLK_THEME = {
  header: 'bg-[#155E82]',
  brand: 'text-[#93C2D8]',
  name: 'text-white',
  meta: 'text-[#93C2D8]',
  iconBtn: 'text-white',
  accentText: 'text-[#155E82]',
  solidBtn: 'bg-[#155E82] text-white',
  tileSelectedBg: 'bg-[#EAF3F7]',
  tileSelectedText: 'text-[#0E3C56]',
  dot: 'bg-[#93C2D8]',
  border: 'border-[#155E82]',
  focusBorder: 'focus:border-[#155E82]',
  focusWithinBorder: 'focus-within:border-[#155E82]',
  heroGradient: 'bg-gradient-to-b from-[#155E82] to-[#0E3C56]',
  mutedOn: 'text-[#93C2D8]',
  activeNavBg: 'bg-[#EAF3F7]',
  activeNavText: 'text-[#155E82]',
  cta: 'bg-[#B45309] text-white',
}

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
  registryName: 'RSBSA',
  // Organizations take the SAME domain colour as the rest of the app —
  // Farmers Organization is crop green, Fisherfolk Organization is fish
  // teal. No separate organization identity.
  theme: CROP_THEME,
  // Organization Reference rebuild — see ORG_FARMERS_THEME's own comment.
  dashboardTheme: ORG_FARMERS_THEME,
  officerPositions: OFFICER_POSITIONS,

  // ── Batch 2: member + officer management ──
  // Batch (Phase B — multi-org membership): mirrors the fisherfolk side's
  // shape exactly now — FarmersOrganizationMember is a real join row, so
  // there is no reassignment concept any more, and `id`/rowIsActive/
  // memberIdOf all address the JOIN ROW, not the farmer directly.
  membersUrl: (orgId) => `/organizations/farmers/${orgId}/members/`,
  officersUrl: (orgId) => `/organizations/farmers/${orgId}/officers/`,
  addCandidateSearchUrl: (orgId) => `/organizations/farmers/${orgId}/member-search/`,
  addMemberBody: (personId) => ({
    farmer: personId,
    date_joined: new Date().toISOString().split('T')[0],
  }),
  // Farmers active/inactive is addressed by the JOIN ROW id now, same as
  // fisherfolk — PATCHed with {is_active}.
  setMemberActiveUrl: (orgId, row) => `/organizations/farmers/${orgId}/members/${row.id}/`,
  setMainUrl: (orgId, row) => `/organizations/farmers/${orgId}/members/${row.id}/set-main/`,
  assignOfficerBody: (position, personId) => ({ position, farmer: personId }),

  // Row accessors for the MEMBER LIST shape (not the search shape).
  rowPersonId: (row) => row.farmer,
  rowName: (row) => row.farmer_full_name,
  rowBarangay: (row) => row.farmer_barangay,
  rowIsActive: (row) => row.is_active !== false,
  rowIsMain: (row) => row.is_main === true,
  rowIdNumber: (row) => row.farmer_rsbsa_number,
  officerPersonId: (o) => o.farmer_id,
  // Multi-org is legitimate here now, so adding someone never reassigns
  // them. Existing memberships are still worth SHOWING, so an officer can
  // see at a glance that someone already belongs elsewhere. Informational
  // only: adding them takes nothing away from those organizations.
  candidateMembershipNote: (cand) => {
    const names = (cand.current_organizations || []).map((o) => o.name)
    return names.length > 0 ? names.join(', ') : null
  },
  memberSearchUrl: (orgId) => `/organizations/farmers/${orgId}/members/`,
  memberIdOf: (m) => m.farmer,
  memberLabel: (m) => m.farmer_full_name,
  memberSubtitle: (m) => [m.farmer_rsbsa_number, m.farmer_barangay].filter(Boolean).join(' · '),
  createUrl: '/interventions/beneficiaries/adhoc/',
  detailUrl: (id) => `/interventions/beneficiaries/${id}/detail/`,
  historyUrl: '/interventions/my-org-beneficiary-history/',
  distributeUrl: (orgId) => `/organizations/farmers/${orgId}/distribute-assistance/`,
  personField: 'farmer',
  assistanceTypeOptions: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: ['Dry', 'Wet'],

  // Accountless-beneficiary on-behalf-of confirmation (Piece 2). The list
  // endpoint already only returns records the org may act on (AWAITING_
  // CONFIRMATION, for a current member with no working account) — the
  // frontend trusts that entirely rather than re-deriving eligibility.
  accountlessConfirmablesUrl: '/interventions/my-org-accountless-confirmables/',
  confirmOnBehalfUrl: (recordId) => `/interventions/beneficiaries/${recordId}/confirm-on-behalf/`,
  // Several members at once, one set of photos (the organization's Confirm for Members list).
  confirmOnBehalfBulkUrl: '/interventions/beneficiaries/confirm-on-behalf/',
  confirmableName: (row) => row.farmer_full_name,
}

export const FISHERFOLK_ORG_DOMAIN = {
  key: 'fisherfolk_org',
  personLabel: 'Fisherfolk',
  registryName: 'FishR',
  theme: FISH_THEME,
  // Organization Reference rebuild — see ORG_FISHERFOLK_THEME's own comment.
  dashboardTheme: ORG_FISHERFOLK_THEME,
  officerPositions: OFFICER_POSITIONS,

  // ── Batch 2: member + officer management ──
  membersUrl: (orgId) => `/organizations/fisherfolk/${orgId}/members/`,
  officersUrl: (orgId) => `/organizations/fisherfolk/${orgId}/officers/`,
  addCandidateSearchUrl: (orgId) => `/organizations/fisherfolk/${orgId}/member-search/`,
  // date_joined is required by the join-table serializer — both domains
  // send it now that farmers is also a real join row (Batch Phase B).
  addMemberBody: (personId) => ({
    fisherfolk: personId,
    date_joined: new Date().toISOString().split('T')[0],
  }),
  // Fisherfolk active/inactive is addressed by the JOIN ROW id, not the
  // person's — same URL the old hard-remove used, now PATCHed with
  // {is_active} instead of DELETEd.
  setMemberActiveUrl: (orgId, row) => `/organizations/fisherfolk/${orgId}/members/${row.id}/`,
  setMainUrl: (orgId, row) => `/organizations/fisherfolk/${orgId}/members/${row.id}/set-main/`,
  assignOfficerBody: (position, personId) => ({ position, fisherfolk: personId }),

  rowPersonId: (row) => row.fisherfolk,
  rowName: (row) => row.fisherfolk_full_name,
  rowBarangay: (row) => row.fisherfolk_barangay,
  rowIsActive: (row) => row.is_active !== false,
  rowIsMain: (row) => row.is_main === true,
  rowIdNumber: (row) => row.fisherfolk_rsbsa_number,
  officerPersonId: (o) => o.fisherfolk_id,
  // Multi-org is legitimate here, so adding someone never reassigns them.
  // Existing memberships are still worth SHOWING, so an officer can
  // see at a glance that someone already belongs elsewhere. Informational
  // only: adding them takes nothing away from those organizations.
  candidateMembershipNote: (cand) => {
    const names = (cand.current_organizations || []).map((o) => o.name)
    return names.length > 0 ? names.join(', ') : null
  },

  memberSearchUrl: (orgId) => `/organizations/fisherfolk/${orgId}/members/`,
  memberIdOf: (m) => m.fisherfolk,
  memberLabel: (m) => m.fisherfolk_full_name,
  memberSubtitle: (m) => [m.fisherfolk_rsbsa_number, m.fisherfolk_barangay].filter(Boolean).join(' · '),
  createUrl: '/interventions/fisherfolk-beneficiaries/adhoc/',
  detailUrl: (id) => `/interventions/fisherfolk-beneficiaries/${id}/detail/`,
  historyUrl: '/interventions/my-org-fisherfolk-beneficiary-history/',
  distributeUrl: (orgId) => `/organizations/fisherfolk/${orgId}/distribute-assistance/`,
  personField: 'fisherfolk',
  assistanceTypeOptions: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: null, // FisherfolkBeneficiaryRecord.season is a free CharField, not a fixed choice set

  // Accountless-beneficiary on-behalf-of confirmation (Piece 2) — see the
  // farmers domain's own comment above.
  accountlessConfirmablesUrl: '/interventions/my-org-fisherfolk-accountless-confirmables/',
  confirmOnBehalfUrl: (recordId) => `/interventions/fisherfolk-beneficiaries/${recordId}/confirm-on-behalf/`,
  confirmOnBehalfBulkUrl: '/interventions/fisherfolk-beneficiaries/confirm-on-behalf/',
  confirmableName: (row) => row.fisherfolk_full_name,
}
