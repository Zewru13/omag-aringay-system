// The Organization Assistance report of the Reports page: every organization of a kind, read from the backend report
// GET /reports/organization-assistance/. No screen and no network here, so the rules can be tested on their own.

import { individualParams } from './reportPaper.js'

export const ORG_ASSISTANCE_PATH = '/reports/organization-assistance/'

// What the Report on box offers, and the assistance types each can have been given. Two kinds of organization (the assistance they
// distributed to their members, with the members by name) and the individuals who were given assistance directly, not through an
// organization (`individual`: no organization to narrow to, and the search looks for the person).
const FARMER_TYPES = ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other']
const FISHERFOLK_TYPES = ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other']
export const ORG_KINDS = [
  { id: 'farmers', label: 'Farmers Organizations', individual: false, searchPlaceholder: 'Search organization name', types: FARMER_TYPES },
  { id: 'fisherfolk', label: 'Fisherfolk Organizations', individual: false, searchPlaceholder: 'Search organization name', types: FISHERFOLK_TYPES },
  { id: 'individual_farmers', label: 'Individual Farmers', individual: true, searchPlaceholder: 'Search farmer name', types: FARMER_TYPES },
  { id: 'individual_fisherfolk', label: 'Individual Fisherfolk', individual: true, searchPlaceholder: 'Search fisherfolk name', types: FISHERFOLK_TYPES },
]
export const orgKind = (id) => ORG_KINDS.find((k) => k.id === id) || ORG_KINDS[0]

// The download name (without extension) of a kind's report.
export const orgReportStem = (kindId) => (orgKind(kindId).individual ? `${kindId}_assistance` : `${kindId}_organization_assistance`)

// The query of the backend report. An organization report can narrow to one organization (a clicked row, or a search that leaves one);
// an individuals report has no organization to narrow to, so it never asks.
export function orgReportParams(kindId, filters, picked) {
  const params = { kind: kindId, ...filters }
  if (orgKind(kindId).individual) return params
  return individualParams(params, picked)
}

// [value the backend takes, what the dropdown says]
export const ORG_ASSISTANCE_STATUSES = [['confirmed', 'Confirmed'], ['awaiting', 'Awaiting confirmation'], ['follow_up', 'Needs follow-up']]

// The filters of the report (the page adds a name search of its own).
export const NO_ORG_ASSISTANCE_FILTERS = { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '' }
export const activeOrgFilterCount = (filters) => Object.keys(NO_ORG_ASSISTANCE_FILTERS).filter((k) => filters[k]).length
