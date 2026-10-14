import { useEffect, useRef, useState } from 'react'
import { ChevronRight, ClipboardList, Ellipsis, HandHeart, HelpCircle, History, House, LogOut, TrendingUp, User } from 'lucide-react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext.jsx'
import omagLogo from '../../assets/LOGO OMAg.jpg'
import ConfirmDialog from '../UI/ConfirmDialog.jsx'
import NotificationBell from './NotificationBell.jsx'
import { ADMIN_GROUP, DASHBOARD_ITEM, DISASTER_GROUP, GROUPS, REPORTS_GROUP, isItemActive } from './Sidebar.jsx'
import { buildPhoneTabs } from './staffPhoneNav.js'

// The phone layout for the Admin and Focal Person accounts: a slim top bar (page name, notifications, account menu)
// and five bottom tabs. Home opens the dashboard; the other four open a bottom sheet listing that area's pages, taken
// from the sidebar's own groups (see staffPhoneNav.js). PageLayout renders this instead of the sidebar layout below 768px
// for staff only; tablets, desktops and the citizen accounts are unchanged.

const TAB_ICONS = { home: House, registry: ClipboardList, monitoring: TrendingUp, assistance: HandHeart, more: Ellipsis }

const isTabActive = (tab, location) => (
  tab.leaf
    ? isItemActive(tab.leaf.to, location)
    : tab.groups.some((group) => group.items.some((item) => isItemActive(item.to, location)))
)

// ─── Bottom sheet ───────────────────────────────────────────────────────────

function Sheet({ tab, location, onGo, onClose }) {
  const [shown, setShown] = useState(false)
  const closeTimer = useRef(null)

  // Slide in on the next frame; the page behind stays put while the sheet is open.
  useEffect(() => {
    const frame = requestAnimationFrame(() => setShown(true))
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      cancelAnimationFrame(frame)
      clearTimeout(closeTimer.current)
      document.body.style.overflow = previous
    }
  }, [])

  const close = (after) => {
    setShown(false)
    closeTimer.current = setTimeout(() => { onClose(); after?.() }, 160)
  }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') close() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  return (
    <div className="fixed inset-0 z-50">
      <button
        type="button"
        aria-label="Close menu"
        onClick={() => close()}
        className={`absolute inset-0 cursor-default bg-black/40 transition-opacity duration-150 motion-reduce:transition-none ${shown ? 'opacity-100' : 'opacity-0'}`}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tab.sheetTitle}
        className={`absolute inset-x-0 bottom-0 flex max-h-[82vh] flex-col rounded-t-2xl bg-white shadow-[0_-8px_30px_rgba(0,0,0,0.12)] transition-transform duration-200 ease-out motion-reduce:transition-none ${shown ? 'translate-y-0' : 'translate-y-full'}`}
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-border-strong" aria-hidden="true" />
        <h2 className="shrink-0 px-5 pb-2 pt-3 font-display text-[16px] font-semibold text-text-primary">{tab.sheetTitle}</h2>
        <div className="overflow-y-auto px-3 pb-[calc(16px+env(safe-area-inset-bottom))]">
          {tab.groups.map((group) => (
            <section key={group.key} className="mb-2">
              <p className="px-2 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">{group.label}</p>
              {group.items.map((item) => {
                const active = isItemActive(item.to, location)
                const Icon = item.icon
                return (
                  <button
                    key={item.to}
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => close(() => onGo(item.to))}
                    className={`flex min-h-[48px] w-full items-center gap-3 rounded-xl px-2 text-left transition-colors ${active ? 'bg-primary-light' : 'hover:bg-surface-2 active:bg-surface-2'}`}
                  >
                    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${active ? 'bg-white text-primary' : 'bg-surface-2 text-text-secondary'}`}>
                      <Icon size={18} aria-hidden="true" />
                    </span>
                    <span className={`flex-1 text-[14px] ${active ? 'font-semibold text-primary' : 'font-medium text-text-primary'}`}>{item.label}</span>
                    <ChevronRight size={16} className="shrink-0 text-text-muted" aria-hidden="true" />
                  </button>
                )
              })}
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Top bar ────────────────────────────────────────────────────────────────

function AccountMenu({ onLogout }) {
  const navigate = useNavigate()
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const initial = (user?.full_name || user?.email || 'U').charAt(0).toUpperCase()
  const role = user?.role === 'ADMIN' ? 'Administrator' : 'Focal Person'

  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  const go = (path) => { setOpen(false); navigate(path) }
  const item = 'flex min-h-[44px] w-full items-center gap-3 px-4 text-left text-[14px] text-text-primary transition-colors hover:bg-surface-2'

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        className={`flex h-9 w-9 items-center justify-center rounded-full bg-primary-light text-[13px] font-semibold text-primary transition-shadow ${open ? 'ring-2 ring-primary' : ''}`}
      >
        {initial}
      </button>
      {open && (
        <>
          <button type="button" aria-label="Close menu" className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 top-[calc(100%+8px)] z-50 w-[220px] overflow-hidden rounded-xl border border-border bg-white py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)]">
            <div className="border-b border-border px-4 pb-2.5 pt-2">
              <p className="truncate text-[13px] font-semibold text-text-primary">{user?.full_name || user?.email}</p>
              <p className="text-[12px] text-text-muted">{role}</p>
            </div>
            <button type="button" role="menuitem" className={item} onClick={() => go('/profile')}>
              <User size={16} className="text-text-muted" aria-hidden="true" /> My Profile
            </button>
            {user?.role === 'ADMIN' && (
              <button type="button" role="menuitem" className={item} onClick={() => go('/audit-log')}>
                <History size={16} className="text-text-muted" aria-hidden="true" /> Activity Log
              </button>
            )}
            <button type="button" role="menuitem" className={item} onClick={() => go('/help')}>
              <HelpCircle size={16} className="text-text-muted" aria-hidden="true" /> Help
            </button>
            <div className="my-1 border-t border-border" />
            <button
              type="button"
              role="menuitem"
              className={`${item} !text-[color:var(--color-semantic-critical)]`}
              onClick={() => { setOpen(false); onLogout() }}
            >
              <LogOut size={16} aria-hidden="true" /> Log out
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ─── Shell ──────────────────────────────────────────────────────────────────

export default function StaffPhoneShell({ title, action, children }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { user, logout } = useAuth()
  const [sheetKey, setSheetKey] = useState(null)
  const [confirmLogout, setConfirmLogout] = useState(false)

  const tabs = buildPhoneTabs({
    dashboard: DASHBOARD_ITEM, groups: GROUPS, disaster: DISASTER_GROUP, reports: REPORTS_GROUP, admin: ADMIN_GROUP,
    isAdmin: user?.role === 'ADMIN',
  })
  const openTab = tabs.find((t) => t.key === sheetKey)

  const handleLogout = async () => {
    setConfirmLogout(false)
    await logout()
    navigate('/login', { replace: true })
  }

  const onTab = (tab) => {
    if (tab.leaf) { setSheetKey(null); navigate(tab.leaf.to) } else setSheetKey(tab.key)
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="sticky top-0 z-30 border-b border-border bg-white">
        <div className="flex h-14 items-center gap-2.5 px-4">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-[9px] bg-nav-logo">
            <img src={omagLogo} alt="OMAg" className="h-full w-full object-cover" />
          </span>
          <h1 className="min-w-0 flex-1 truncate font-display text-[16px] font-semibold tracking-tight text-text-primary">{title || 'OMAg Aringay'}</h1>
          <NotificationBell variant="staff" />
          <AccountMenu onLogout={() => setConfirmLogout(true)} />
        </div>
      </header>

      {/* Bottom padding clears the fixed tab bar (60px) and the device's home-indicator inset. */}
      <main className="px-4 pb-[calc(60px+env(safe-area-inset-bottom)+20px)] pt-4">
        {action && <div className="mb-4 flex justify-end">{action}</div>}
        {children}
      </main>

      <nav
        aria-label="Main navigation"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-white pb-[env(safe-area-inset-bottom)]"
      >
        <div className="flex">
          {tabs.map((tab) => {
            const Icon = TAB_ICONS[tab.key]
            const active = (sheetKey ? sheetKey === tab.key : isTabActive(tab, location))
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => onTab(tab)}
                aria-current={active ? 'page' : undefined}
                aria-haspopup={tab.leaf ? undefined : 'dialog'}
                className="press-scale flex min-h-[60px] flex-1 flex-col items-center justify-center gap-0.5 px-1 py-1.5"
              >
                <span className={`flex h-7 w-14 items-center justify-center rounded-full transition-colors ${active ? 'bg-primary-light text-primary' : 'text-text-muted'}`}>
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className={`text-[10.5px] leading-tight ${active ? 'font-semibold text-primary' : 'font-medium text-text-muted'}`}>{tab.label}</span>
              </button>
            )
          })}
        </div>
      </nav>

      {openTab && (
        <Sheet tab={openTab} location={location} onGo={(to) => navigate(to)} onClose={() => setSheetKey(null)} />
      )}

      {confirmLogout && (
        <ConfirmDialog
          title="Confirm Logout"
          message="Are you sure you want to log out?"
          confirmLabel="Log Out"
          onConfirm={handleLogout}
          onCancel={() => setConfirmLogout(false)}
        />
      )}
    </div>
  )
}
