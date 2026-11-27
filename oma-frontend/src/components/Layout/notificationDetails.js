// What the notification bell and its details window decide: titles, which change request a notice is about, the number on the
// bell and where the window's button leads. No screen and no network.
import { hasApproved } from '../../utils/approvalStatus.js'
import { notificationRoute } from './notificationRoutes.js'

// Harvest reminders go to the farmer / fisherfolk who owns the crop record / production cycle: 30 and 7 and 3 days before,
// on the harvest day, and 7 days overdue (core/harvest_reminders.py). The type is `<prefix>_<milestone>`.
const HARVEST_REMINDER_TITLES = {
  '30d': 'Harvest in 30 Days',
  '7d': 'Harvest in 7 Days',
  '3d': 'Harvest in 3 Days',
  today: 'Harvest Day',
  overdue: 'Harvest Overdue',
}
const harvestReminderTitles = Object.fromEntries(
  ['crop_harvest_reminder', 'fisheries_harvest_reminder'].flatMap(prefix =>
    Object.entries(HARVEST_REMINDER_TITLES).map(([key, title]) => [`${prefix}_${key}`, title])),
)

// A short title shown above the message in the list for these event types (other notifications have none there).
export const RECORD_TYPE_TITLES = {
  ...harvestReminderTitles,
  fisheries_cycle_started: 'Production Cycle Started',
  fisheries_force_harvest: 'Force Harvest Recorded',
  fisheries_emergency_force_harvest: 'Emergency Force Harvest Recorded',
  fisheries_disaster_report: 'New Fisherfolk Disaster Report',
  equipment_loan: 'Equipment Loan',
}

// What the details window calls the other kinds, by what happened.
const VERB_TITLES = {
  'scheduled assistance for you:': 'Assistance Scheduled',
  'changed the schedule of your assistance:': 'Assistance Schedule Changed',
  'removed you from a scheduled distribution:': 'Removed from a Distribution',
  'recorded assistance for you:': 'Assistance Recorded',
  'requested a profile change': 'Profile Change Request',
  'needs your approval': 'Profile Change Needs Your Approval',
  'approved your profile change': 'Profile Change Approved',
  'rejected your profile change': 'Profile Change Rejected',
  'reported a disaster on': 'Disaster Reported',
  'logged an activity on': 'Activity Logged',
  'recorded a harvest for': 'Harvest Recorded',
}

export function notificationTitle(n) {
  if (RECORD_TYPE_TITLES[n.record_type]) return RECORD_TYPE_TITLES[n.record_type]
  // The first of a cooperative's two approvals uses the same words as the final one.
  if (n.verb === 'approved your profile change' && (n.detail || '').includes('waiting for')) return 'Profile Change Partly Approved'
  return VERB_TITLES[n.verb] || 'Notification'
}

// A citizen's request to change registry details sends notices typed by the kind of record.
export const CHANGE_REQUEST_TYPES = ['FARMER', 'FISHERFOLK', 'FARMERS_ORG', 'FISHERFOLK_ORG']
export const isChangeRequestNotice = (n) => CHANGE_REQUEST_TYPES.includes(n?.record_type)

// The notice does not carry the request's number, so it is found by its record, the field it names and the time: a notice is
// written moments after the filing or the decision it reports.
const SAME_MOMENT_MS = 5 * 60 * 1000
const EVENT_TIMES = {
  'requested a profile change': ['requested_at'],
  'needs your approval': ['admin_approved_at', 'focal_approved_at'],
}
const DECISION_TIMES = ['admin_approved_at', 'focal_approved_at', 'reviewed_at']

export function requestForNotification(n, requests) {
  const at = Date.parse(n.created_at)
  const times = EVENT_TIMES[n.verb] || DECISION_TIMES
  let best = null
  let bestGap = SAME_MOMENT_MS
  for (const r of requests || []) {
    if (r.linked_record_type !== n.record_type || r.linked_record_id !== n.record_id) continue
    if (n.detail && r.field_label && !n.detail.startsWith(r.field_label)) continue
    for (const key of times) {
      const gap = r[key] ? Math.abs(Date.parse(r[key]) - at) : NaN
      if (gap <= bestGap) { best = r; bestGap = gap }
    }
  }
  return best
}

// Waiting requests this person has not approved yet (a cooperative's change needs the Admin and the Focal Person).
export const toApproveCount = (requests, role) => (requests || []).filter(r => !hasApproved(r, role)).length

// The number on the bell: unread notices, with the "please review this" ones replaced by what really still waits for this
// person. `requests` is null for citizens, or when the waiting list could not be loaded: then every unread notice counts.
export function badgeCount({ unreadCount = 0, unreadChangeRequests = 0 }, requests, role) {
  if (!requests) return unreadCount
  return Math.max(0, unreadCount - unreadChangeRequests) + toApproveCount(requests, role)
}

const CITIZEN_HOME = '/my-account'

function actionLabel(path, isCitizen) {
  if (path.startsWith('/crop-monitoring')) return isCitizen ? 'Open my crops' : 'Open Crop Monitoring'
  if (path.startsWith('/fisheries-monitoring')) return isCitizen ? 'Open my cycles' : 'Open Aquaculture Monitoring'
  if (path.startsWith('/disaster')) return 'Open Disaster Reports'
  if (path === '/my-equipment' || path === '/my-organization?tab=borrowed') return 'View borrowed equipment'
  if (path === '/my-profile') return 'Open my profile'
  if (path.includes('-assistance')) return isCitizen ? 'View my assistance' : 'Open Assistance'
  if (path.startsWith('/reports')) return 'Open Reports'
  return 'View record'
}

// The window's button, or null when this account has no page for the notice.
export function notificationAction(n, viewer = {}) {
  const to = notificationRoute(n, viewer)
  if (!to || to === CITIZEN_HOME) return null
  return { to, label: actionLabel(to, Boolean(viewer.isCitizen)) }
}
