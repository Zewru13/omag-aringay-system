import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { approvalLines, hasApproved } from '../../utils/approvalStatus.js'
import { formatDate } from '../../utils/dateFormat.js'
import NotificationDetailsWindow from './NotificationDetailsWindow.jsx'
import { RECORD_TYPE_TITLES, badgeCount, isChangeRequestNotice, notificationAction } from './notificationDetails.js'

// Simple polling, not websockets — this is a LAN office app with a handful
// of concurrent users, so the extra infrastructure (channels/ASGI/a message
// broker) wouldn't pay for itself here.
const POLL_INTERVAL_MS = 45 * 1000

function timeAgo(iso) {
  const diffSec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (diffSec < 60) return 'just now'
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`
  return `${Math.floor(diffSec / 86400)}d ago`
}

// The staff notices that announce a request waiting for review (core.notifications.CHANGE_REQUEST_WAITING_VERBS).
const WAITING_VERBS = ['requested a profile change', 'needs your approval']
const isWaitingNotice = (n) => isChangeRequestNotice(n) && WAITING_VERBS.includes(n.verb)

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
  const { user, isFarmer, isFisherfolk } = useAuth()
  const isStaff = user?.role === 'ADMIN' || user?.role === 'EVALUATOR'
  const viewer = { isCitizen: user?.role === 'CITIZEN', isFarmer, isFisherfolk, linkedRecordType: user?.linked_record_type || '' }
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
  const [unreadChangeRequests, setUnreadChangeRequests] = useState(0)
  // Staff only: the change requests waiting for review, listed on top. null until they are loaded.
  const [waiting, setWaiting] = useState(null)
  // What the details window shows: { notification } or { request }, or null when it is closed.
  const [selected, setSelected] = useState(null)
  const ref = useRef(null)
  const pagingStarted = useRef(false)

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await api.get('/notifications/')
      setNotifications(r.data.results || [])
      setUnreadCount(r.data.unread_count || 0)
      setUnreadChangeRequests(r.data.unread_change_requests || 0)
      // Only the very first fetch decides where "Load older" starts; after
      // that the user's own paging owns it.
      if (!pagingStarted.current) {
        pagingStarted.current = true
        setNextPage(r.data.next ?? null)
      }
    } catch { /* transient — next poll retries */ }
  }, [])

  const fetchWaiting = useCallback(async () => {
    if (!isStaff) return
    try {
      const r = await api.get('/staff/change-requests/', { params: { status: 'PENDING' } })
      setWaiting(Array.isArray(r.data) ? r.data : r.data?.results || [])
    } catch { /* transient — next poll retries */ }
  }, [isStaff])

  const refresh = useCallback(() => {
    fetchNotifications()
    fetchWaiting()
  }, [fetchNotifications, fetchWaiting])

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
    refresh()
    const id = setInterval(refresh, POLL_INTERVAL_MS)
    return () => clearInterval(id)
  }, [refresh])

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
      if (isWaitingNotice(n)) setUnreadChangeRequests(c => Math.max(0, c - 1))
      api.post(`/notifications/${n.id}/read/`).catch(() => {})
    }
    setSelected({ notification: n })
  }

  const openWaiting = (request) => {
    setOpen(false)
    setSelected({ request })
  }

  // The window's button. Where each kind of notification leads is in notificationRoutes.js.
  const goTo = (target) => {
    setSelected(null)
    if (window.location.pathname + window.location.search !== target) navigate(target)
  }

  const handleMarkAllRead = async () => {
    const markAll = list => list.map(x => ({ ...x, is_read: true }))
    setNotifications(markAll)
    setOlder(markAll)
    setUnreadCount(0)
    setUnreadChangeRequests(0)
    try {
      await api.post('/notifications/read-all/')
    } catch {
      fetchNotifications()
    }
  }

  const badge = badgeCount({ unreadCount, unreadChangeRequests }, waiting, user?.role)
  // The window's button. A request opened from "Needs action" has no notice: its button leads to the record it is about.
  const selectedAction = selected && notificationAction(
    selected.notification || { record_type: selected.request.linked_record_type, record_id: selected.request.linked_record_id }, viewer)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        className={`relative w-9 h-9 flex items-center justify-center rounded-lg press-scale transition-colors ${VARIANT_CLASSES[variant] || VARIANT_CLASSES.dark}`}
        onClick={() => { if (!open) refresh(); setOpen(v => !v) }}
        aria-label="Notifications"
      >
        <Bell size={18} />
        {badge > 0 && (
          <span key={badge} className="badge-pop absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none">
            {badge > 99 ? '99+' : badge}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-content absolute right-0 top-full mt-1 z-50 bg-white border border-[#E2E8E2] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-80 max-h-[min(32rem,80vh)] flex flex-col origin-top-right max-md:fixed max-md:inset-x-3 max-md:top-[60px] max-md:mt-0 max-md:w-auto max-md:max-h-[70vh]">
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
            {waiting?.length > 0 && (
              <section aria-label="Needs action" data-testid="needs-action">
                <p className="border-b border-[#F0E6C8] bg-[#FEF6E0] px-3 py-1.5 text-[11px] font-bold uppercase tracking-[0.05em] text-[#8A6100]">
                  Needs action ({waiting.length})
                </p>
                {waiting.map(r => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => openWaiting(r)}
                    className="w-full border-b border-[#F0E6C8] bg-[#FFFBEF] px-3 py-2.5 text-left transition-colors hover:bg-[#FEF6E0]"
                  >
                    <p className="text-[12px] font-semibold text-[#1A2B1A]">{r.record_label || r.requested_by_name || `Request #${r.id}`}</p>
                    <p className="break-words text-[12px] leading-snug text-[#1A2B1A]">
                      <span className="capitalize">{r.field_label}</span>: {r.old_value || '—'} → {r.requested_value || '—'}
                    </p>
                    <p className="mt-1 text-[10px] text-[#7A8E7A]">
                      {formatDate(r.requested_at, { empty: '' })}
                      {hasApproved(r, user?.role) && ` · You approved. Waiting for the ${approvalLines(r).find(line => !line.done)?.role || 'other approval'}.`}
                    </p>
                  </button>
                ))}
              </section>
            )}
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

      {selected && (
        <NotificationDetailsWindow
          key={selected.notification ? `n${selected.notification.id}` : `r${selected.request.id}`}
          notification={selected.notification}
          request={selected.request}
          role={user?.role}
          action={selectedAction}
          onAction={goTo}
          onClose={() => setSelected(null)}
          onDecided={refresh}
        />
      )}
    </div>
  )
}

export default NotificationBell
