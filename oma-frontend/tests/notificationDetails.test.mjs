// Every notification opens a details window; a change request shows the old and new value with Approve / Reject. Requests waiting
// for review sit on top of the bell under "Needs action" and are gone from the staff dashboard. No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const load = (p) => import(at(p).href)

const {
  isChangeRequestNotice, notificationTitle, requestForNotification, toApproveCount, badgeCount, notificationAction,
} = await load('../src/components/Layout/notificationDetails.js')
const { notificationRoute } = await load('../src/components/Layout/notificationRoutes.js')

const eq = (actual, expected, message) => assert.deepStrictEqual(actual, expected, message)
const ok = (value, message) => assert.ok(value, message)

// ── which notices are about a change request, and what each window is called ──
ok(isChangeRequestNotice({ record_type: 'FARMER' }) && isChangeRequestNotice({ record_type: 'FISHERFOLK_ORG' }), 'registry types')
ok(!isChangeRequestNotice({ record_type: 'crop' }) && !isChangeRequestNotice(null), 'others are not')
eq(notificationTitle({ record_type: 'beneficiary', verb: 'scheduled assistance for you:' }), 'Assistance Scheduled')
eq(notificationTitle({ record_type: 'ff_beneficiary', verb: 'removed you from a scheduled distribution:' }), 'Removed from a Distribution')
eq(notificationTitle({ record_type: 'equipment_loan', verb: 'approved' }), 'Equipment Loan', 'a title by type wins')
eq(notificationTitle({ record_type: 'crop_harvest_reminder_7d', verb: 'x' }), 'Harvest in 7 Days')
eq(notificationTitle({ record_type: 'FARMER', verb: 'requested a profile change' }), 'Profile Change Request')
eq(notificationTitle({ record_type: 'FARMER', verb: 'approved your profile change', detail: 'barangay is now "Basca"' }), 'Profile Change Approved')
eq(notificationTitle({ record_type: 'FARMERS_ORG', verb: 'approved your profile change', detail: 'barangay approved by the Admin; waiting for the Focal Person' }),
  'Profile Change Partly Approved', 'one approval of two is not yet approved')
eq(notificationTitle({ record_type: 'something_new', verb: 'did a thing' }), 'Notification')

// ── finding the request a notice is about ──
const req = (id, field_label, requested_at, over = {}) => ({
  id, field_label, requested_at, linked_record_type: 'FARMER', linked_record_id: 7, status: 'PENDING',
  admin_approved_at: null, focal_approved_at: null, reviewed_at: null, ...over,
})
const filed = (detail, created_at) => ({ record_type: 'FARMER', record_id: 7, verb: 'requested a profile change', detail, created_at })
const three = [
  req(3, 'last name', '2026-11-27T01:00:00.500Z'),
  req(2, 'middle name', '2026-11-27T01:00:00.300Z'),
  req(1, 'first name', '2026-11-27T01:00:00.000Z'),
]
eq(requestForNotification(filed('first name: "A" → "B"', '2026-11-27T01:00:00.280Z'), three).id, 1,
  'three name parts sent together: the field in the notice decides, not the nearest time')
eq(requestForNotification(filed('last name: "A" → "B"', '2026-11-27T01:00:00.600Z'), three).id, 3)
const again = [req(9, 'barangay', '2026-11-27T05:00:00Z'), req(4, 'barangay', '2026-10-01T05:00:00Z', { status: 'REJECTED' })]
eq(requestForNotification(filed('barangay: "A" → "B"', '2026-10-01T05:00:01Z'), again).id, 4, 'the same field asked twice: the one from that time')
eq(requestForNotification(filed('barangay: "A" → "B"', '2026-09-01T05:00:01Z'), again), null, 'nothing from that time: no guess')
eq(requestForNotification({ ...filed('barangay: x', '2026-11-27T05:00:01Z'), record_id: 8 }, again), null, "another record's request never shows")
const decided = [req(5, 'barangay', '2026-11-01T00:00:00Z', { status: 'REJECTED', reviewed_at: '2026-11-20T08:00:00Z' })]
eq(requestForNotification({ record_type: 'FARMER', record_id: 7, verb: 'rejected your profile change', detail: 'barangay — no proof', created_at: '2026-11-20T08:00:01Z' }, decided).id, 5,
  'an answer is matched by the time it was decided')
const half = [req(6, 'barangay', '2026-11-01T00:00:00Z', { focal_approved_at: '2026-11-21T08:00:00Z' })]
eq(requestForNotification({ record_type: 'FARMER', record_id: 7, verb: 'needs your approval', detail: 'barangay: "A" → "B"', created_at: '2026-11-21T08:00:02Z' }, half).id, 6)

// ── what still needs this person, and the number on the bell ──
const pending = [
  { id: 1, status: 'PENDING', requires_both: false },
  { id: 2, status: 'PENDING', requires_both: true, admin_approved_at: '2026-11-01', focal_approved_at: null },
]
eq(toApproveCount(pending, 'ADMIN'), 1, 'the admin already approved the second one')
eq(toApproveCount(pending, 'EVALUATOR'), 2)
eq(badgeCount({ unreadCount: 5, unreadChangeRequests: 2 }, pending, 'EVALUATOR'), 5, '3 other unread + 2 waiting')
eq(badgeCount({ unreadCount: 0, unreadChangeRequests: 0 }, pending, 'ADMIN'), 1, 'read notices do not hide what still waits')
eq(badgeCount({ unreadCount: 3, unreadChangeRequests: 3 }, [], 'ADMIN'), 0, 'already decided by someone else')
eq(badgeCount({ unreadCount: 4, unreadChangeRequests: 2 }, null, 'ADMIN'), 4, 'the waiting list could not be loaded: nothing is hidden')
eq(badgeCount({ unreadCount: 4 }, null, 'CITIZEN'), 4)

// ── where the window's button leads ──
const staff = {}
const farmer = { isCitizen: true, isFarmer: true, linkedRecordType: 'FARMER' }
const fisher = { isCitizen: true, isFisherfolk: true, linkedRecordType: 'FISHERFOLK' }
const coop = { isCitizen: true, linkedRecordType: 'FARMERS_ORG' }
const action = (record_type, viewer, record_id = 4) => notificationAction({ record_type, record_id }, viewer)
eq(action('crop', staff), { to: '/crop-monitoring', label: 'Open Crop Monitoring' })
eq(action('crop', farmer), { to: '/crop-monitoring', label: 'Open my crops' })
eq(action('crop_harvest_reminder_3d', farmer), { to: '/crop-monitoring', label: 'Open my crops' })
eq(action('fisheries_cycle_started', fisher), { to: '/fisheries-monitoring?cycle=4', label: 'Open my cycles' })
eq(action('fisheries_cycle_started', staff), { to: '/fisheries-monitoring?tab=stocking&cycle=4', label: 'Open Aquaculture Monitoring' })
eq(action('fisherfolk_disaster', fisher), { to: '/disaster', label: 'Open Disaster Reports' })
eq(action('beneficiary', farmer), { to: '/crop-assistance', label: 'View my assistance' })
eq(action('ff_beneficiary', staff), { to: '/fisheries-assistance', label: 'Open Assistance' })
eq(action('equipment_loan', farmer), { to: '/my-equipment', label: 'View borrowed equipment' })
eq(action('equipment_loan', coop), { to: '/my-organization?tab=borrowed', label: 'View borrowed equipment' })
eq(action('FARMER', staff), { to: '/farmers/4', label: 'View record' })
eq(action('FISHERFOLK', staff), { to: '/fisheries/4', label: 'View record' })
eq(action('FARMERS_ORG', staff), { to: '/organizations/farmers/4', label: 'View record' })
eq(action('FISHERFOLK_ORG', staff), { to: '/organizations/fisherfolk/4', label: 'View record' })
eq(action('FARMER', staff, null), null, 'no record number, no button')
eq(action('FARMER', farmer), { to: '/my-profile', label: 'Open my profile' })
eq(action('crop', coop), null, 'a page that account does not have: no button')
eq(action('something_new', staff), null)
eq(notificationRoute({ record_type: 'crop' }, { isCitizen: true }), '/my-account', 'the route itself still ends on Home')

// ── the screens ──
const dashboard = read('../src/pages/Dashboard/StaffDashboard.jsx')
ok(!dashboard.includes('change-requests') && !dashboard.includes('Pending Change Requests'), 'the dashboard no longer lists change requests')
const bell = read('../src/components/Layout/NotificationBell.jsx')
ok(bell.includes('Needs action'), 'the bell has a Needs action section')
ok(bell.includes('/staff/change-requests/') && bell.includes('NotificationDetailsWindow'), 'it loads what waits and opens the window')
const windowSource = read('../src/components/Layout/NotificationDetailsWindow.jsx')
for (const piece of ['Approve', 'Reject', 'Current', 'Requested', 'Reason', 'rejection_reason', 'ModalShell']) {
  ok(windowSource.includes(piece), `the window has ${piece}`)
}
ok(!windowSource.includes('Rejected from dashboard review.'), 'no made-up rejection reason')

console.log('notification details: all checks passed')
