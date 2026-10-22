import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'

// Simple polling, not websockets — this is a LAN office app with a handful
// of concurrent users, so the extra infrastructure (channels/ASGI/a message
// broker) wouldn't pay for itself here.
const POLL_INTERVAL_MS = 45 * 1000

// Where a notification takes a STAFF account, keyed by record_type. Every
// record_type the backend emits has an entry: crop/stocking/fisherfolk_disaster
// (activity, harvest, disaster), beneficiary/ff_beneficiary (assistance
// reported as not received), beneficiary_obo/ff_beneficiary_obo (an
// organization's on-behalf-of confirmation awaiting review) and the four
// registry types (a citizen's profile-change request). The two review queues
// live on the staff dashboard.
const STAFF_ROUTES = {
  crop: '/crop-monitoring',
  stocking: '/fisheries-monitoring?tab=stocking',
  // Disaster management moved out of Fisheries Monitoring into Admin > Disaster > Fisheries Disaster.
  fisherfolk_disaster: '/disaster?tab=fisheries',
  // A fisherfolk "logged a fisheries disaster" (submitted to Admin): opens that log (record_id) in
  // Admin > Disaster > Fisheries Disaster.
  fisheries_disaster_report: (id) => `/disaster?tab=fisheries${id ? `&report=${id}` : ''}`,
  // Fisheries production-cycle events (record_id = the production cycle): open that cycle's details.
  fisheries_cycle_started: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  fisheries_force_harvest: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  // The emergency Force Harvest (record_id = the saved harvest): opens its details window.
  fisheries_emergency_force_harvest: (id) => `/fisheries-monitoring?tab=stocking${id ? `&forced=${id}` : ''}`,
  fisheries_harvest_reminder_7d: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  fisheries_harvest_reminder_3d: (id) => `/fisheries-monitoring?tab=stocking${id ? `&cycle=${id}` : ''}`,
  beneficiary: '/crop-assistance?tab=needs-follow-up',
  ff_beneficiary: '/fisheries-assistance?tab=needs-follow-up',
  beneficiary_obo: '/dashboard',
  ff_beneficiary_obo: '/dashboard',
  // An organization's confirmation for its members is final: staff only need to see it (the report lists every one).
  beneficiary_obo_confirmed: '/reports',
  ff_beneficiary_obo_confirmed: '/reports',
  FARMER: '/dashboard',
  FISHERFOLK: '/dashboard',
  FARMERS_ORG: '/dashboard',
  FISHERFOLK_ORG: '/dashboard',
}

// Fisherfolk accounts have no category tabs on Fisheries Monitoring; their disaster list has its own page.
const FISHERFOLK_RECORD_TYPE_ROUTES = {
  stocking: '/fisheries-monitoring',
  fisherfolk_disaster: '/disaster',
  fisheries_cycle_started: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_force_harvest: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_emergency_force_harvest: (id) => `/fisheries-monitoring${id ? `?forced=${id}` : ''}`,
  fisheries_harvest_reminder_7d: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_3d: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_30d: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_today: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
  fisheries_harvest_reminder_overdue: (id) => `/fisheries-monitoring${id ? `?cycle=${id}` : ''}`,
}

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

// A short title shown above the message for these event types (other notifications are unchanged).
const RECORD_TYPE_TITLES = {
  ...harvestReminderTitles,
  fisheries_cycle_started: 'Production Cycle Started',
  fisheries_force_harvest: 'Force Harvest Recorded',
  fisheries_emergency_force_harvest: 'Emergency Force Harvest Recorded',
  fisheries_disaster_report: 'New Fisherfolk Disaster Report',
  equipment_loan: 'Equipment Loan',
}

// A CITIZEN account may only open /my-account — every staff route above ends
// in a full-page "Access Denied" for them (ProtectedRoute), so a citizen's
// notification never navigates to one. Their screens are state-driven inside
// /my-account, so the click just marks it read and lands them at home.
const CITIZEN_HOME = '/my-account'

function timeAgo(iso) {
  const diffSec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

// `variant`: 'dark' (default, unchanged) is for a colored/dark bar — white
// icon, white/10 hover — still correct for the citizen Organization header,
// which really is a colored bar. 'light' is the citizen-palette (cz-*) dark-
// on-light treatment for the citizen desktop topbar. 'staff' is the staff
// app's own design-system tokens (text-text-primary / surface-2) — added
// after the staff Navbar's header was restyled from a dark bar to bg-white
// (commit d9d45b4) without this component being touched, which left the
// bell rendering white-on-white: present, but invisible. Not reusing
// 'light' there on purpose — its hardcoded hex is the citizen app's
// palette, not the staff app's tokens, and would drift from its sibling
// header icons (the hamburger button, the account chevron) the moment
// either palette's tokens change independently.
const VARIANT_CLASSES = {
  dark: 'text-white hover:bg-white/10',
  light: 'text-[#4A5E4A] hover:bg-black/5',
  staff: 'text-text-primary hover:bg-surface-2',
}

function NotificationBell({ variant = 'dark' }) {
  const navigate = useNavigate()
  const { user, isFisherfolk } = useAuth()
  const [open, setOpen] = useState(false)
  // `notifications` is always the newest page (refreshed by the poll);
  // `older` holds pages the user asked for with "Load older", so a poll never
  // throws away what they scrolled to. The badge counts EVERY unread row, so
  // without this the list could show far fewer than the badge promised.
  const [notifications, setNotifications] = useState([])
  const [older, setOlder] = useState([])
  const [nextPage, setNextPage] = useState(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef(null)
  const pagingStarted = useRef(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await api.get('/notifications/')
      setNotifications(r.data.results || [])
      setUnreadCount(r.data.unread_count || 0)
      // Only the very first fetch decides where "Load older" starts; after
      // that the user's own paging owns it.
      if (!pagingStarted.current) {
        pagingStarted.current = true
        setNextPage(r.data.next ?? null)
      }
    } catch { /* transient — next poll retries */ }
  }, [])

  const loadOlder = async () => {
    if (!nextPage || loadingMore) return
    setLoadingMore(true)
    try {
      const r = await api.get('/notifications/', { params: { page: nextPage } })
      setOlder(prev => [...prev, ...(r.data.results || [])])
      setNextPage(r.data.next ?? null)
    } catch { /* leave the button so they can retry */ }
    finally { setLoadingMore(false) }
  }

  // Newest page first, then older pages; the same row can appear in both when
  // new notifications shift the page boundary, so de-duplicate by id.
  const seen = new Set()
  const visible = [...notifications, ...older].filter(n => (seen.has(n.id) ? false : seen.add(n.id)))
  const markLocalRead = (id) => {
    const mark = list => list.map(x => (x.id === id ? { ...x, is_read: true } : x))
    setNotifications(mark)
    setOlder(mark)
  }

  useEffect(() => {
    fetchNotifications()
    const id = setInterval(fetchNotifications, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [fetchNotifications])

  useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleNotificationClick = (n) => {
    setOpen(false)
    if (!n.is_read) {
      markLocalRead(n.id)
      setUnreadCount(c => Math.max(0, c - 1))
      api.post(`/notifications/${n.id}/read/`).catch(() => {})
    }
    // A fisherfolk account opens the destination his fisheries notification types point to
    // (production cycle, disaster log, ...); anything else falls through to the normal rules.
    if (isFisherfolk) {
      const own = FISHERFOLK_RECORD_TYPE_ROUTES[n.record_type]
      const ownTarget = typeof own === 'function' ? own(n.record_id) : own
      if (ownTarget) { navigate(ownTarget); return }
    }
    // An equipment loan opens the organization's Borrowed tab, or a member's Borrow Equipment page.
    if (user?.role === 'CITIZEN' && n.record_type === 'equipment_loan') {
      navigate(['FARMERS_ORG', 'FISHERFOLK_ORG'].includes(user.linked_record_type) ? '/my-organization?tab=borrowed' : '/my-equipment')
      return
    }
    if (user?.role === 'CITIZEN') {
      if (window.location.pathname !== CITIZEN_HOME) navigate(CITIZEN_HOME)
      return
    }
    const route = STAFF_ROUTES[n.record_type]
    const target = typeof route === 'function' ? route(n.record_id) : route
    if (target) navigate(target)
  }

  const handleMarkAllRead = async () => {
    const markAll = list => list.map(x => ({ ...x, is_read: true }))
    setNotifications(markAll)
    setOlder(markAll)
    setUnreadCount(0)
    try {
      await api.post('/notifications/read-all/')
    } catch {
      fetchNotifications()
    }
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg press-scale transition-colors ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.dark}`}
        onClick={() => setOpen(v => !v)}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span key={unreadCount} className="badge-pop absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-content absolute right-0 top-full mt-1 z-50 bg-white border border-[#E2E8E2] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-80 max-h-96 flex flex-col origin-top-right max-md:fixed max-md:inset-x-3 max-md:top-[60px] max-md:mt-0 max-md:w-auto max-md:max-h-[70vh]">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#F0F4F0] flex-shrink-0">
            <p className="text-[13px] font-semibold text-[#1A2B1A]">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-[#1B4D2E] hover:underline max-md:min-h-[36px] max-md:px-2 max-md:text-[12px]"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {visible.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-[#A8BCA8]">No notifications yet.</p>
            ) : visible.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-[#F5F7F5] hover:bg-[#F9FAF9] transition-colors ${!n.is_read ? 'bg-[#EBF5EE]' : ''}`}
              >
                {RECORD_TYPE_TITLES[n.record_type] && (
                  <p className="mb-0.5 text-[12px] font-semibold text-[#1A2B1A]" data-testid="notification-title">{RECORD_TYPE_TITLES[n.record_type]}</p>
                )}
                <p className="text-[12px] text-[#1A2B1A] leading-snug">
                  {/* Automatic (system) notifications with a title read as a sentence on their own. */}
                  {(n.actor || !RECORD_TYPE_TITLES[n.record_type]) && <><span className="font-semibold">{n.actor_name}</span>{' '}</>}
                  {n.verb}{' '}
                  <span className="font-medium">{n.record_label}</span>
                  {n.detail && <span className="text-[#7A8E7A]"> — {n.detail}</span>}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#1B4D2E]" />}
                  <span className="text-[10px] text-[#A8BCA8]">{timeAgo(n.created_at)}</span>
                </div>
              </button>
            ))}
            {nextPage && (
              <button
                type="button"
                onClick={loadOlder}
                disabled={loadingMore}
                className="w-full px-3 py-2.5 text-center text-[11px] font-medium text-[#1B4D2E] hover:bg-[#F9FAF9] disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load older notifications'}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
