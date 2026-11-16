// The rules of an organization account's own pages (Members, Equipment, Officers, Assistance): which page /my-organization shows for
// each link, what differs between a farmers' and a fisherfolk organization, the member sections and the officer rows. No screen and
// no network, so they can be tested on their own.
import { OFFICER_POSITIONS } from '../Organizations/positionRules.js'

// What /my-organization?tab=… opens. Every link that exists today (the Home shortcuts, the bell's ?tab=borrowed) lands on the page
// that now holds that view; Confirmed for Members moved to Assistance's Confirm for members tab.
const VIEWS = {
  members: { page: 'members' },
  equipment: { page: 'equipment', tab: 'items' },
  borrowed: { page: 'equipment', tab: 'loans' },
  'borrowed-history': { page: 'equipment', tab: 'loans' },
  officers: { page: 'officers' },
  confirmed: { page: 'assistance-confirm' },
}
export const orgView = (search) => VIEWS[new URLSearchParams(search).get('tab')] || VIEWS.members

// What differs between the two kinds of organization account.
const DOMAINS = {
  orgFarm: { type: 'farmers', nameField: 'farmer_full_name', idField: 'farmer_rsbsa_number', personField: 'farmer', personLabel: 'farmers', assistancePath: '/crop-assistance' },
  orgFish: { type: 'fisherfolk', nameField: 'fisherfolk_full_name', idField: 'fisherfolk_rsbsa_number', personField: 'fisherfolk', personLabel: 'fisherfolk', assistancePath: '/fisheries-assistance' },
}
export const orgDomain = (kind) => DOMAINS[kind] || DOMAINS.orgFarm

// Members still in the organization first; one marked inactive is kept, under Inactive.
export const MEMBER_SECTIONS = [
  { key: 'active', label: 'Active', match: (m) => m.is_active !== false },
  { key: 'inactive', label: 'Inactive', match: (m) => m.is_active === false },
]

// Everything the search box may look at.
export const memberText = (m, domain) => [m[domain.nameField], m[domain.idField], m.position].filter(Boolean).join(' ')

// The officers holding a position now, in the order of the positions (President first). `memberText` says whether the officer is a
// member (one who is not cannot receive assistance through the organization).
export function officerRows(org) {
  const order = (position) => {
    const i = OFFICER_POSITIONS.indexOf(position)
    return i === -1 ? OFFICER_POSITIONS.length : i
  }
  return (org?.officers || [])
    .filter((o) => o.is_active !== false)
    .map((o) => ({ ...o, memberText: o.is_member === false ? 'Not a member' : 'Yes' }))
    .sort((a, b) => order(a.position) - order(b.position))
}

// ── Assistance ──────────────────────────────────────────────────────────────────────────────────────────────────────

// The tab of the Assistance page a link opens: ?tab=history, ?tab=confirm (Home's "Confirm for members", and the old Confirmed for
// Members tab); anything else, including the old words current / needs-follow-up, opens To do.
export function orgAssistanceTab(search) {
  const tab = new URLSearchParams(search).get('tab')
  return tab === 'history' || tab === 'confirm' ? tab : 'todo'
}

// Where a member's confirmation stands: sent to the office and waiting, turned down (and why), or not sent yet.
export function confirmReview(record) {
  if (record.latest_request_status === 'PENDING') return { text: 'Pending review', tone: 'amber' }
  if (record.latest_request_status === 'REJECTED') {
    return { text: record.latest_request_reason ? `Rejected: ${record.latest_request_reason}` : 'Rejected', tone: 'red' }
  }
  return { text: 'Needs confirmation', tone: 'amber' }
}

// The kind of assistance an organization gives: crop for a farmers' organization, fisheries for a fisherfolk one.
export const orgAssistanceDomain = (kind) => (kind === 'orgFish'
  ? { domain: 'fisheries', nameField: 'fisherfolk_full_name' }
  : { domain: 'crop', nameField: 'farmer_full_name' })
