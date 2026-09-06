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
// OrgInfoScreen.jsx now reads `dashboardTheme` instead (Phase 2 color fix,
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
  membersUrl: (orgId) => `/organizations/farmers/${orgId}/members/`,
  officersUrl: (orgId) => `/organizations/farmers/${orgId}/officers/`,
  addCandidateSearchUrl: (orgId) => `/organizations/farmers/${orgId}/member-search/`,
  addMemberBody: (personId, confirm) => ({
    farmer: personId,
    ...(confirm ? { confirm_reassignment: true } : {}),
  }),
  // Farmers active/inactive is addressed by FARMER id (the membership link
  // is a field on Farmer, not a row) — same URL the old hard-remove used,
  // now PATCHed with {is_active} instead of DELETEd.
  setMemberActiveUrl: (orgId, row) => `/organizations/farmers/${orgId}/members/${row.id}/`,
  assignOfficerBody: (position, personId) => ({ position, farmer: personId }),

  // Row accessors for the MEMBER LIST shape (not the search shape).
  rowPersonId: (row) => row.id,
  rowName: (row) => row.full_name,
  rowBarangay: (row) => row.barangay,
  rowIsActive: (row) => row.is_org_membership_active !== false,
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
  registryName: 'FishR',
  theme: FISH_THEME,
  // Organization Reference rebuild — see ORG_FISHERFOLK_THEME's own comment.
  dashboardTheme: ORG_FISHERFOLK_THEME,
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
  // Fisherfolk active/inactive is addressed by the JOIN ROW id, not the
  // person's — same URL the old hard-remove used, now PATCHed with
  // {is_active} instead of DELETEd.
  setMemberActiveUrl: (orgId, row) => `/organizations/fisherfolk/${orgId}/members/${row.id}/`,
  assignOfficerBody: (position, personId) => ({ position, fisherfolk: personId }),

  rowPersonId: (row) => row.fisherfolk,
  rowName: (row) => row.fisherfolk_full_name,
  rowBarangay: (row) => row.fisherfolk_barangay,
  rowIsActive: (row) => row.is_active !== false,
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
