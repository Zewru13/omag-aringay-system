import { useCallback, useEffect, useRef, useState } from 'react'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'

// Simple polling, not websockets — this is a LAN office app with a handful
// of concurrent users, so the extra infrastructure (channels/ASGI/a message
// broker) wouldn't pay for itself here.
const POLL_INTERVAL_MS = 45 * 1000

const RECORD_TYPE_ROUTES = {
  crop: '/crop-monitoring',
  stocking: '/fisheries-monitoring?tab=stocking',
  fisherfolk_disaster: '/fisheries-monitoring?tab=disasters',
}

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
  const [open, setOpen] = useState(false)
  const [notifications, setNotifications] = useState([])
  const [unreadCount, setUnreadCount] = useState(0)
  const ref = useRef(null)

  const fetchNotifications = useCallback(async () => {
    try {
      const r = await api.get('/notifications/')
      setNotifications(r.data.results || [])
      setUnreadCount(r.data.unread_count || 0)
    } catch { /* transient — next poll retries */ }
  }, [])

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
      setNotifications(prev => prev.map(x => (x.id === n.id ? { ...x, is_read: true } : x)))
      setUnreadCount(c => Math.max(0, c - 1))
      api.post(`/notifications/${n.id}/read/`).catch(() => {})
    }
    const target = RECORD_TYPE_ROUTES[n.record_type]
    if (target) navigate(target)
  }

  const handleMarkAllRead = async () => {
    setNotifications(prev => prev.map(x => ({ ...x, is_read: true })))
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
          <span className="absolute top-1 right-1 min-w-[16px] h-4 px-1 flex items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white leading-none animate-pulse">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="modal-content absolute right-0 top-full mt-1 z-50 bg-white border border-[#E2E8E2] rounded-xl shadow-[0_8px_24px_rgba(0,0,0,0.08)] w-80 max-h-96 flex flex-col origin-top-right">
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-[#F0F4F0] flex-shrink-0">
            <p className="text-[13px] font-semibold text-[#1A2B1A]">Notifications</p>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAllRead}
                className="text-[11px] font-medium text-[#1B4D2E] hover:underline"
              >
                Mark all as read
              </button>
            )}
          </div>
          <div className="overflow-y-auto flex-1">
            {notifications.length === 0 ? (
              <p className="px-3 py-6 text-center text-[12px] text-[#A8BCA8]">No notifications yet.</p>
            ) : notifications.map(n => (
              <button
                key={n.id}
                type="button"
                onClick={() => handleNotificationClick(n)}
                className={`w-full text-left px-3 py-2.5 border-b border-[#F5F7F5] hover:bg-[#F9FAF9] transition-colors ${!n.is_read ? 'bg-[#EBF5EE]' : ''}`}
              >
                <p className="text-[12px] text-[#1A2B1A] leading-snug">
                  <span className="font-semibold">{n.actor_name}</span> {n.verb}{' '}
                  <span className="font-medium">{n.record_label}</span>
                  {n.detail && <span className="text-[#7A8E7A]"> — {n.detail}</span>}
                </p>
                <div className="flex items-center gap-1.5 mt-1">
                  {!n.is_read && <span className="w-1.5 h-1.5 rounded-full bg-[#1B4D2E]" />}
                  <span className="text-[10px] text-[#A8BCA8]">{timeAgo(n.created_at)}</span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default NotificationBell
