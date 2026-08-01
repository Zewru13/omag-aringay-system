// Per-organization bulk assistance distribution — staff-facing domain config.
// Mirrors Citizen/orgDomainConfig.js's shape but for DistributeAssistanceModal
// (org picker included, since staff may distribute to ANY organization —
// unlike the citizen flow, which is locked to the citizen's own org).
export const FARMER_DISTRIBUTION_DOMAIN = {
  key: 'farmers_org',
  personLabel: 'Farmer',
  orgLabel: 'Farmers Organization',
  orgSearchUrl: '/organizations/farmers/',
  distributeUrl: (orgId) => `/organizations/farmers/${orgId}/distribute-assistance/`,
  assistanceTypeOptions: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'],
  seasonOptions: ['Dry', 'Wet'],
}

export const FISHERFOLK_DISTRIBUTION_DOMAIN = {
  key: 'fisherfolk_org',
  personLabel: 'Fisherfolk',
  orgLabel: 'Fisherfolk Organization',
  orgSearchUrl: '/organizations/fisherfolk/',
  distributeUrl: (orgId) => `/organizations/fisherfolk/${orgId}/distribute-assistance/`,
  assistanceTypeOptions: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Cash Assistance', 'Equipment', 'Training', 'Other'],
  seasonOptions: null,
}
