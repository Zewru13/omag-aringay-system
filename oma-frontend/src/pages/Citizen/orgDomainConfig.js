// Batch 12: shared per-domain config for the ORGANIZATION-role citizen's
// "Report Assistance" flow — mirrors citizenDomainConfig.js's shape (Batch
// 11) but for the two organization types. The member-search endpoints
// return genuinely different shapes per domain (Farmer rows directly vs.
// FisherfolkOrganizationMember join rows nesting fisherfolk), which is why
// memberIdOf/memberLabel/memberSubtitle exist as accessors rather than
// assuming a common field name.

export const FARMERS_ORG_DOMAIN = {
  key: 'farmers_org',
  personLabel: 'Farmer',
  memberSearchUrl: (orgId) => `/organizations/farmers/${orgId}/members/`,
  memberIdOf: (m) => m.id,
  memberLabel: (m) => m.full_name,
  memberSubtitle: (m) => [m.rsbsa_number, m.barangay].filter(Boolean).join(' · '),
  createUrl: '/interventions/beneficiaries/adhoc/',
  detailUrl: (id) => `/interventions/beneficiaries/${id}/detail/`,
  historyUrl: '/interventions/my-org-beneficiary-history/',
  personField: 'farmer',
  assistanceTypeOptions: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: ['Dry', 'Wet'],
}

export const FISHERFOLK_ORG_DOMAIN = {
  key: 'fisherfolk_org',
  personLabel: 'Fisherfolk',
  memberSearchUrl: (orgId) => `/organizations/fisherfolk/${orgId}/members/`,
  memberIdOf: (m) => m.fisherfolk,
  memberLabel: (m) => m.fisherfolk_full_name,
  memberSubtitle: (m) => [m.fisherfolk_lgu_number, m.fisherfolk_barangay].filter(Boolean).join(' · '),
  createUrl: '/interventions/fisherfolk-beneficiaries/adhoc/',
  detailUrl: (id) => `/interventions/fisherfolk-beneficiaries/${id}/detail/`,
  historyUrl: '/interventions/my-org-fisherfolk-beneficiary-history/',
  personField: 'fisherfolk',
  assistanceTypeOptions: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: null, // FisherfolkBeneficiaryRecord.season is a free CharField, not a fixed choice set
}
