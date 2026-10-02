import { useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, FileText, HelpCircle, Home, Info, LogOut, Menu, User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NotificationBell from '../../components/Layout/NotificationBell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useSidebarCollapsed } from './CitizenDesktopUI.jsx'
import omagLogo from '../../assets/LOGO OMAg.jpg'
import { labels } from './labels.js'

// ═══════════════════════════════════════════════════════════════════════
// Organization account shell — OrgShell (sidebar + top bar + content column +
// mobile tab bar), the OrgPageHeader every sub-screen uses for its
// "< Bumalik" and title, OrgListSkeleton for loading lists and
// OrgSectionLabel for section headings. Every Organization screen mounts
// through OrgShell, so the chrome cannot drift between them.
//
//   - Sidebar: from 640px up; below that the bottom CitizenTabBar covers
//     navigation. It collapses to icons via the hamburger in the top bar,
//     persisted through useSidebarCollapsed (shared with Farmer/Fisherfolk's
//     desktop shell) and owned by OrgShell itself, so no screen threads it.
//   - Top bar: static, never a page title or back button. The brand text shows
//     only on phones; from 640px the sidebar already carries it.
//   - The older OrgScreen / OrgAppBar / OrgNavRail shell and the tile/hero
//     components that went with it were removed once nothing mounted through
//     them any more.
// ═══════════════════════════════════════════════════════════════════════

const ORG_SIDEBAR_ITEMS = [
  { key: 'home', labelKey: 'home', icon: Home },
  { key: 'history', labelKey: 'reportingHistory', icon: FileText },
  { key: 'orgInfo', labelKey: 'orgInfoRow', icon: Info },
]

export function OrgSidebar({ theme, active, onNav, collapsed }) {
  return (
    <nav
      className={`sticky top-0 hidden h-screen shrink-0 flex-col transition-[width] duration-200 ease-out sm:flex ${theme.header}`}
      // 64px collapsed matches Admin/Staff's Sidebar.jsx/PageLayout.jsx and
      // Farmer/Fisherfolk's own new DesktopShell exactly — confirmed via
      // direct comparison, not assumed. (The OLD OrgNavRail below, used only
      // by out-of-scope OrgInfoScreen/OrgHelpScreen/OrgOfficerHistoryScreen,
      // pre-dates this and still collapses to 68px — untouched, since
      // changing it would be a structural edit to an out-of-scope screen.)
      style={{ width: collapsed ? 64 : 220 }}
      aria-label={labels.orgHome.navRailLabel}
    >
      <div className={`flex h-14 items-center gap-2 border-b-[0.5px] border-white/15 ${collapsed ? 'justify-center px-0' : 'px-4'}`}>
        {/* The real OMAg seal — sidebar carries the domain color (2026-09-07
            direct request: the header went white like Admin/Staff, but the
            sidebar takes the color the header used to have). */}
        <img src={omagLogo} alt="OMAg" className="h-6 w-6 shrink-0 rounded-[6px] object-cover" title={collapsed ? labels.orgHome.appNameDisplay : undefined} />
        {!collapsed && <p className="truncate text-[14px] font-bold text-white">{labels.orgHome.appNameDisplay}</p>}
      </div>
      <ul className="space-y-1 px-3 py-3">
        {ORG_SIDEBAR_ITEMS.map((item) => {
          const isActive = item.key === active
          const Icon = item.icon
          const label = item.labelKey === 'home' ? labels.orgHome.homeNav
            : item.labelKey === 'reportingHistory' ? labels.orgHome.historyNav
              : labels.orgHome.orgInfoNav
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onNav(item.key)}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? label : undefined}
                className={`flex w-full items-center gap-3 rounded-[10px] py-2.5 text-left text-[14px] transition-colors ${collapsed ? 'justify-center px-0' : 'px-3'} ${
                  isActive ? 'bg-white/18 font-semibold text-white' : `${theme.mutedOn} hover:bg-white/10 hover:text-white`
                }`}
              >
                <Icon size={18} className="shrink-0" aria-hidden="true" />
                {/* Phase 5 (2026-09-07): fade instead of an instant snap,
                    matching the old OrgNavRail's own collapse treatment. */}
                <span className={`truncate transition-opacity duration-150 ${collapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>
                  {label}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// Static app-title bar — never carries a page title, matching every one of
// the reference's frames (image1 through image24 all show the identical
// "OMAg Aringay" header regardless of which screen is open underneath it).
// The hamburger toggle (Phase 3) sits at the far left, same position as
// Admin/Staff's own Navbar.jsx.
export function OrgTopBar({ theme, chipLabel, onNav, onToggleSidebar }) {
  // Cellphone POV keeps the domain color; only the desktop shell (sm:+,
  // matching OrgSidebar's own sm:flex cutoff) goes white like Admin/Staff
  // (2026-09-07 direct request). One shared component for both breakpoints
  // here — unlike Farmer/Fisherfolk's separate mobile/desktop component
  // trees — so the color swap and the two NotificationBell variants below
  // are both done with responsive classes rather than a second component.
  return (
    <header className={`sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between border-b-[0.5px] border-white/15 px-4 sm:border-cz-border sm:bg-white sm:px-6 ${theme.header}`}>
      <div className="flex items-center gap-2">
        {onToggleSidebar && (
          <button
            type="button"
            onClick={onToggleSidebar}
            aria-label={labels.common.toggleSidebar}
            className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-cz-text-2 transition-colors hover:bg-cz-page sm:flex"
          >
            <Menu size={18} aria-hidden="true" />
          </button>
        )}
        {/* The sidebar already carries the brand from 640px up; the top bar only
            shows it on phones, where the sidebar is hidden. */}
        <p className="truncate text-[15px] font-bold text-white sm:hidden">{labels.orgHome.appNameDisplay}</p>
      </div>
      <div className="flex items-center gap-1.5">
        <span className="sm:hidden"><NotificationBell /></span>
        <span className="hidden sm:block"><NotificationBell variant="light" /></span>
        {onNav && (
          // Mobile-only profile icon (2026-09-07 direct request) — replaces
          // the "Impormasyon" bottom tab; goes straight to the org's own
          // profile screen, no dropdown. OrgAccountBadge (desktop, sm:+)
          // already has its own Profile/Help/Logout menu, untouched.
          <button
            type="button"
            onClick={() => onNav('orgInfo')}
            aria-label={labels.orgHome.orgInfoNav}
            className="press-scale flex h-8 w-8 items-center justify-center rounded-full bg-white/20 text-white transition-colors hover:bg-white/30 sm:hidden"
          >
            <User size={15} aria-hidden="true" />
          </button>
        )}
        {onNav ? (
          <OrgAccountBadge theme={theme} chipLabel={chipLabel} onNav={onNav} />
        ) : (
          <span className={`flex h-8 w-8 items-center justify-center rounded-full ${theme.tileSelectedBg}`} aria-hidden="true">
            <User size={15} className={theme.tileSelectedText} />
          </span>
        )}
      </div>
    </header>
  )
}

// The screen shell every rebuilt Organization screen mounts through — the
// nav rail (>=640px) + static top bar + fluid content column + mobile tab
// bar. `active` drives the sidebar highlight; `onNav` navigates between the
// three sidebar destinations (Home is always reached via the dashboard's
// own `view` state, so onNav here only ever needs to cover that one case
// from a sub-screen). Collapse state (Phase 3) is self-contained here via
// `useSidebarCollapsed`, so no calling screen needs to know about it.
export function OrgShell({ theme, chipLabel, active, onNav, tabBar, wide = false, pageKey, children }) {
  const [collapsed, toggleCollapsed] = useSidebarCollapsed()
  return (
    <div className="flex min-h-screen w-full bg-cz-page">
      <OrgSidebar theme={theme} active={active} onNav={onNav} collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <OrgTopBar theme={theme} chipLabel={chipLabel} onNav={onNav} onToggleSidebar={toggleCollapsed} />
        <main className={`mx-auto w-full flex-1 ${wide ? 'max-w-[1240px]' : 'max-w-[820px]'} px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-5 sm:px-6 sm:pb-10`}>
          {/* Each screen mounts a fresh OrgShell, so this wrapper's entrance
              plays on every screen change while the sidebar and top bar
              (outside it) stay put. */}
          <div key={pageKey} className="org-page-in">{children}</div>
        </main>
      </div>
      {tabBar}
    </div>
  )
}

// Placeholder cards while a list loads — the same white surface the real
// cards use, so the page doesn't jump when the data arrives, and a shimmer
// reads as "still loading" where plain text reads as "nothing here".
export function OrgListSkeleton({ rows = 3 }) {
  return (
    <div className="space-y-3" aria-hidden="true">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-[14px] bg-white p-4 shadow-[var(--shadow-xs)]">
          <span className="skeleton-shimmer block h-4 w-2/5 rounded-[6px]" />
          <span className="skeleton-shimmer mt-3 block h-3 w-3/4 rounded-[6px]" />
        </div>
      ))}
    </div>
  )
}

// A page-level "< Bumalik" back-link + title, in plain dark text directly
// in the content area — exactly where the reference draws it (never inside
// the colored bar). `onBack` is optional: the Home dashboard itself has no
// back-link, only its sub-screens do.
export function OrgPageHeader({ title, subtitle, onBack }) {
  return (
    <div className="mb-4">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          className="mb-3 flex items-center gap-1 text-[13px] font-medium text-cz-text-2 transition-colors hover:text-cz-text"
        >
          <ChevronRight size={15} className="rotate-180" aria-hidden="true" />
          {labels.orgHome.backLink}
        </button>
      )}
      <h1 className="text-[22px] font-bold text-cz-text">{title}</h1>
      {subtitle && <p className="mt-0.5 text-[13px] text-cz-text-2">{subtitle}</p>}
    </div>
  )
}

// Two-letter initials from an org name ("Basca Integrated Farmers
// Cooperative" -> "BI") — the reference's compact top-bar badge, not the
// full name + chevron the OLD shell's account chip (below) still uses.
function orgInitials(name) {
  const words = (name || '').trim().split(/\s+/).filter(Boolean)
  return words.slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?'
}

// NEW-shell trigger only (OrgTopBar) — a compact initials badge, matching
// every reference frame's "BI" chip exactly. Kept as a separate component
// from OrgAccountMenu (below) rather than a shared prop-toggle, since
// OrgAccountMenu is also used by the OLD OrgAppBar for OrgInfoScreen.jsx/
// OrgHelpScreen.jsx/OrgOfficerHistoryScreen.jsx — out of scope, must not
// change even its trigger's visual shape.
function OrgAccountBadge({ theme, chipLabel, onNav }) {
  const [open, setOpen] = useState(false)
  const { logout } = useAuth()
  const navigate = useNavigate()
  const ref = useRef(null)

  const close = () => setOpen(false)
  const doLogout = () => { close(); logout(); navigate('/login') }

  return (
    <div className="relative hidden sm:block" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={chipLabel}
        title={chipLabel}
        className="press-scale flex items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-cz-page"
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold text-white ${theme.solidBtn}`}>
          {orgInitials(chipLabel)}
        </span>
        <span className="max-w-[240px] truncate text-[13.5px] font-medium text-cz-text">{chipLabel}</span>
        <ChevronDown size={15} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button type="button" aria-label={labels.common.close} className="fixed inset-0 z-40 cursor-default" onClick={close} />
          <div className="modal-content absolute right-0 top-[calc(100%+8px)] z-50 w-[210px] origin-top-right overflow-hidden rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface shadow-lg">
            <button
              type="button"
              onClick={() => { close(); onNav('orgInfo') }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-cz-text transition-colors hover:bg-cz-page"
            >
              <User size={15} className="shrink-0 text-cz-text-muted" aria-hidden="true" /> {labels.orgHome.accountProfile}
            </button>
            <button
              type="button"
              onClick={() => { close(); onNav('help') }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-cz-text transition-colors hover:bg-cz-page"
            >
              <HelpCircle size={15} className="shrink-0 text-cz-text-muted" aria-hidden="true" /> {labels.orgHome.accountHelp}
            </button>
            <button
              type="button"
              onClick={doLogout}
              className="flex w-full items-center gap-2.5 border-t-[0.5px] border-cz-border px-3.5 py-2.5 text-left text-[13px] text-cz-danger-accent transition-colors hover:bg-cz-danger-bg"
            >
              <LogOut size={15} className="shrink-0" aria-hidden="true" /> {labels.orgHome.accountLogout}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// ── Section label ─────────────────────────────────────────────────────────
export function OrgSectionLabel({ children }) {
  return (
    <p className="mb-2 text-[14px] font-semibold text-cz-text">{children}</p>
  )
}
