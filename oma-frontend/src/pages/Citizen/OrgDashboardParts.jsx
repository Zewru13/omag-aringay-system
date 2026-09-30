import { useRef, useState } from 'react'
import {
  AlertTriangle, ChevronDown, ChevronRight, FileText, HelpCircle, Home, Info, LogOut, Menu, User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import NotificationBell from '../../components/Layout/NotificationBell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import { useSidebarCollapsed } from './CitizenDesktopUI.jsx'
import omagLogo from '../../assets/LOGO OMAg.jpg'
import { labels } from './labels.js'

// ═══════════════════════════════════════════════════════════════════════
// ORGANIZATION REFERENCE REBUILD — new shell (OrgShell/OrgSidebar/OrgTopBar
// below), used by every rebuilt screen (Home, Members, Assign Officer, Add
// Member, Report Assistance, History) plus OrgHelpScreen/
// OrgOfficerHistoryScreen for chrome consistency (their own content is
// unchanged — the reference doesn't show either, so only their wrapper
// moved). Deliberately NOT a modification of OrgScreen/OrgAppBar/OrgNavRail
// below — those stay byte-for-byte as they were because OrgInfoScreen.jsx
// depends on them and is explicitly out of scope for this batch.
//
// Structurally different from the old shell on purpose, matching the
// reference exactly rather than reskinning the old one:
//   - Sidebar is plain white. Below 640px the existing CitizenTabBar already
//     covers navigation, so there is nothing to collapse INTO there — the
//     toggle only appears at >=640px, same breakpoint the sidebar itself
//     uses (`sm:flex`).
//   - The colored top bar is STATIC ("OMAg Aringay", always) — it never
//     carries a page title or back button. Per-page title + "< Bumalik"
//     back-link live in the plain content area as ordinary dark text,
//     exactly where the reference draws them (image3/4/6/7 all show this).
//
// Phase 3 (2026-09-07): a real collapse toggle was added — matching Admin/
// Staff's own hamburger pattern exactly (Menu icon, localStorage-persisted,
// icon-only collapsed state) — after finding neither Farmer, Fisherfolk, nor
// this shell actually had one, despite the reference showing a hamburger
// icon in every one of its frames. `useSidebarCollapsed` (CitizenDesktopUI)
// is shared with Farmer/Fisherfolk's own desktop shell so all three collapse
// under one persisted key, self-contained inside OrgShell below rather than
// threaded through every calling screen — OrgShell (unlike Farmer/
// Fisherfolk's DesktopShell) already owns the sidebar/topbar construction
// itself, so no call-site changes were needed anywhere else.
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
        <p className="truncate text-[15px] font-bold text-white sm:text-cz-text">{labels.orgHome.appNameDisplay}</p>
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

// ── New stat card (Kasapi / Posisyon) — two of these sit side-by-side on
// the reference's Home, replacing the old merged hero card's inline stats.
export function OrgStatCard({ theme, value, label, sub, isLoading, onClick, tone }) {
  const Comp = onClick ? 'button' : 'div'
  return (
    <Comp
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-[14px] border p-4 text-left transition-colors ${
        tone === 'warn' ? 'border-cz-alert-accent/40 bg-cz-alert-bg' : `${theme.border} bg-white`
      } ${onClick ? 'hover:bg-cz-page' : ''}`}
    >
      {isLoading ? (
        // Phase 5 (2026-09-07): the app's existing skeleton-shimmer utility
        // (index.css) was already built for exactly this — a loading dash
        // reads as "the value is a dash," a shimmer reads as "still
        // loading" — but nothing in the citizen app used it yet.
        <span className="skeleton-shimmer block h-[26px] w-12 rounded-[6px]" aria-hidden="true" />
      ) : (
        <p className={`text-[26px] font-bold leading-none tabular-nums ${tone === 'warn' ? 'text-cz-alert-title' : theme.accentText}`}>
          {value}
        </p>
      )}
      <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-cz-text-2">{label}</p>
      {sub && <p className={`mt-0.5 text-[12px] font-medium ${tone === 'warn' ? 'text-cz-alert-accent' : 'text-cz-text-2'}`}>{sub}</p>}
    </Comp>
  )
}

// ── Quick-action square tile — "Mabilis na Aksyon" (image1/image14/16),
// icon centered on top, label below, unlike the old horizontal ActionRow.
export function OrgActionTile({ theme, icon: Icon, title, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="press-scale flex flex-col items-center gap-2 rounded-[12px] border-[0.5px] border-cz-border bg-white p-4 text-center transition-colors hover:bg-cz-page"
    >
      <span className={`flex h-10 w-10 items-center justify-center rounded-[10px] ${theme.tileSelectedBg} ${theme.accentText}`} aria-hidden="true">
        <Icon size={19} />
      </span>
      <span className="text-[13px] font-semibold leading-[1.25] text-cz-text">{title}</span>
    </button>
  )
}

// Batch: presentational pieces of the Organization dashboard, extracted so
// the screen file stays readable and so the same pieces can be reused by the
// Organization Info screen.
//
// Every measurement here is taken from the approved reference images
// (image1/image2 mobile, image10/image11 desktop): 12px card radius, 16px
// card padding, 14px row padding, 40px member avatars, 34px roster avatars,
// 11px uppercase section labels at 0.06em tracking.

// ── Profile chip dropdown (>=640px) ─────────────────────────────────────
// My Profile routes to Impormasyon (that IS the org's profile), Help to the
// new Org Help screen, Logout via AuthContext directly — this is the one
// global action every screen needs identically, so it lives here rather
// than being threaded as a prop through every OrgScreen caller.
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
        className={`flex h-9 w-9 items-center justify-center rounded-full text-[13px] font-semibold transition-opacity hover:opacity-80 press-scale ${theme.tileSelectedBg} ${theme.tileSelectedText}`}
      >
        {orgInitials(chipLabel)}
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

function OrgAccountMenu({ chipLabel, onNav }) {
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
        className="flex items-center gap-2 rounded-full bg-white/15 py-1.5 pl-2 pr-3 transition-colors hover:bg-white/20 press-scale"
      >
        <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
          <User size={13} className="text-white" />
        </span>
        <span className="max-w-[140px] truncate text-[13px] font-medium text-white">{chipLabel}</span>
        <ChevronDown size={14} className={`text-white/80 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
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

// ── App bar ───────────────────────────────────────────────────────────────
// Field & Tide: an organisation now takes its own domain's colour (`theme`,
// CROP_THEME or FISH_THEME) instead of the old hardcoded navy — a Farmers
// Organization reads as Field green, a Fisherfolk Organization as Tide navy,
// same as their Farmer/Fisherfolk counterparts.
//
// `chipLabel` + `onNav` together turn on the real profile dropdown at
// >=640px (My Profile / Help / Logout) — without onNav it falls back to the
// old inert chip, so nothing breaks for a caller mid-migration.
export function OrgAppBar({ title, chipLabel, onBack, theme, onNav, onToggleRail, railCollapsed }) {
  return (
    <header className={`w-full ${theme.header}`}>
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
        {onToggleRail && (
          <button
            type="button"
            onClick={onToggleRail}
            aria-label={railCollapsed ? labels.orgHome.expandNav : labels.orgHome.collapseNav}
            aria-expanded={!railCollapsed}
            className="hidden h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 press-scale sm:flex"
          >
            <Menu size={19} aria-hidden="true" />
          </button>
        )}
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={labels.orgHome.backToDashboard}
            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10 press-scale"
          >
            <ChevronRight size={20} className="rotate-180" aria-hidden="true" />
          </button>
        ) : !onToggleRail && (
          <span
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] bg-white/15"
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2.2" className="text-white">
              <path d="M3 15l5-6 4 4 3-4 6 6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] font-semibold uppercase tracking-[0.12em] ${theme.mutedOn}`}>
            {labels.orgHome.appName}
          </p>
          <h1 className="truncate text-[17px] font-semibold text-white sm:text-[18px]">{title}</h1>
        </div>
        <NotificationBell />
        {chipLabel && (
          onNav ? <OrgAccountMenu chipLabel={chipLabel} onNav={onNav} /> : (
            <span className="hidden items-center gap-2 rounded-full bg-white/15 py-1.5 pl-2 pr-3.5 sm:flex">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
                <User size={13} className="text-white" />
              </span>
              <span className="max-w-[160px] truncate text-[13px] font-medium text-white">{chipLabel}</span>
            </span>
          )
        )}
      </div>
    </header>
  )
}

// ── Nav rail (>=640px) ───────────────────────────────────────────────────
// Replaces the bottom tab bar at this width. Two states: expanded (icon +
// label) and collapsed (icon only, via the hamburger in OrgAppBar) — width
// alone animates between them so nothing reflows abruptly.
const RAIL_ITEMS = [
  { key: 'home', label: () => labels.tabBar.home, icon: 'home' },
  { key: 'history', label: () => labels.orgHome.reportingHistory, icon: 'history' },
  { key: 'orgInfo', label: () => labels.orgHome.orgInfoRow, icon: 'info' },
]

export function OrgNavRail({ theme, active, collapsed, onNav }) {
  return (
    <nav
      className={`sticky top-0 hidden h-screen flex-col border-r-[0.5px] border-black/10 ${theme.header} py-3 transition-[width] duration-200 ease-out sm:flex`}
      // Inline width, not a Tailwind w-[] utility, AND an explicit
      // minWidth: 0 override — a flex item's default min-width:auto pins it
      // to its content's min-content size (here, the longest nav label),
      // so the collapse to 68px was silently refusing to apply at all no
      // matter what width value was set, class or inline. This is the
      // standard fix for that flexbox trap, not a Tailwind quirk.
      style={{ width: collapsed ? 68 : 212, minWidth: 0, flexShrink: 0 }}
      aria-label={labels.orgHome.navRailLabel}
    >
      <ul className="space-y-1 px-2.5">
        {RAIL_ITEMS.map((item) => {
          const isActive = item.key === active
          const Icon = item.icon === 'home' ? Home : item.icon === 'history' ? FileText : Info
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={() => onNav(item.key)}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label() : undefined}
                className={`flex min-h-[44px] w-full items-center gap-3 rounded-[10px] px-3 text-left text-[13.5px] transition-colors ${
                  isActive ? 'bg-white/18 font-semibold text-white' : `${theme.mutedOn} hover:bg-white/10 hover:text-white`
                }`}
              >
                <Icon size={18} className="shrink-0" aria-hidden="true" />
                <span className={`truncate transition-opacity duration-150 ${collapsed ? 'w-0 opacity-0' : 'opacity-100'}`}>
                  {item.label()}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

// ── Org hero card ─────────────────────────────────────────────────────────
// Dark card: type pill, org name in a large serif-ish bold, address line,
// hairline divider, then the two stats. Both numbers are REAL — member count
// from the member list's length, positions from the officer list measured
// against the domain's actual position set (seven, not the mockup's five).
export function OrgHeroCard({ theme, typeLabel, name, addressLine, memberCount, filled, total, isLoading, onMembersClick }) {
  return (
    <section className={`rounded-[14px] p-5 text-white ${theme.heroGradient}`}>
      <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden="true" />
        {typeLabel}
      </span>
      <h2 className="mt-3 text-[22px] font-bold leading-[1.2] sm:text-[26px]">{name}</h2>
      <p className={`mt-1 text-[13px] ${theme.mutedOn}`}>{addressLine}</p>
      <div className="my-4 h-px bg-white/15" />
      <div className="flex items-end justify-between">
        <button
          type="button"
          onClick={onMembersClick}
          disabled={!onMembersClick}
          className="-m-1 rounded-[10px] p-1 text-left transition-colors enabled:hover:bg-white/10 enabled:press-scale"
        >
          <p className={`flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.08em] ${theme.mutedOn}`}>
            {labels.orgHome.statMembers}
            {onMembersClick && <ChevronRight size={12} aria-hidden="true" />}
          </p>
          <p className="mt-0.5 text-[30px] font-bold leading-none tabular-nums">
            {isLoading ? '—' : memberCount}
          </p>
        </button>
        <div className="text-right">
          <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${theme.mutedOn}`}>
            {labels.orgHome.statPositions}
          </p>
          <p className="mt-0.5 text-[30px] font-bold leading-none tabular-nums">
            {isLoading ? '—' : filled}
            <span className={`text-[18px] font-semibold ${theme.mutedOn}`}>/{total}</span>
          </p>
        </div>
      </div>
    </section>
  )
}

// ── Screen shell ──────────────────────────────────────────────────────────
// Navy app bar over the reference's cool #F0F4F7 panel ground, plus the same
// fluid container the rest of the citizen app uses. Every organisation screen
// goes through this so the chrome can never drift between them.
//
// Note this ground is cz-org-panel, NOT the citizen app's warm cz-page: the
// reference draws the organisation screens on a cool grey (visible in image2
// and image3 alike), and that reads as part of the same decision as the navy.
export function OrgScreen({
  title, chipLabel, onBack, tabBar, children, wide = false, theme,
  active, onNav, railCollapsed, onToggleRail,
}) {
  return (
    <div className="flex min-h-screen w-full bg-cz-org-panel">
      {onNav && <OrgNavRail theme={theme} active={active} collapsed={railCollapsed} onNav={onNav} />}
      <div className="min-w-0 flex-1">
        <OrgAppBar
          title={title} chipLabel={chipLabel} onBack={onBack} theme={theme}
          onNav={onNav} onToggleRail={onNav ? onToggleRail : undefined} railCollapsed={railCollapsed}
        />
        <main
          className={`mx-auto w-full ${wide ? 'max-w-[1240px]' : 'max-w-[720px]'} px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-10`}
        >
          {children}
        </main>
      </div>
      {tabBar}
    </div>
  )
}

// ── Instruction line ──────────────────────────────────────────────────────
// The muted sentence the reference puts between the app bar and the first
// card ("Pumili ng posisyon para italaga:").
export function OrgPrompt({ children }) {
  return <p className="mb-3 text-[13px] leading-[1.45] text-cz-text-2">{children}</p>
}

// ── Vacancy alert ─────────────────────────────────────────────────────────
export function OrgAlertBanner({ positions }) {
  return (
    <div className="flex gap-2.5 rounded-[12px] border border-[#F5E0A3] bg-cz-alert-bg p-3.5">
      <AlertTriangle size={17} className="mt-px shrink-0 text-cz-alert-accent" aria-hidden="true" />
      <div className="min-w-0">
        <p className="text-[14px] font-semibold text-cz-alert-title">{labels.orgHome.vacancyTitle}</p>
        <p className="mt-0.5 text-[13px] leading-[1.45] text-cz-alert-title/80">
          {labels.orgHome.vacancyBody(positions)}
        </p>
      </div>
    </div>
  )
}

// ── Action / navigation row ───────────────────────────────────────────────
// One component for both the "MGA AKSYON" rows and the plain nav rows
// ("History ng Reporting", "Impormasyon ng Organisasyon") — the mockup draws
// them identically apart from the trailing chevron.
const TILE = {
  blue: 'bg-cz-tile-blue-bg text-cz-tile-blue-fg',
  amber: 'bg-cz-tile-amber-bg text-cz-tile-amber-fg',
  green: 'bg-cz-badge-green text-[#15803D]',
  slate: 'bg-cz-tile-slate-bg text-cz-tile-slate-fg',
}

export function OrgActionRow({ icon: Icon, tone = 'blue', title, subtitle, onClick, showChevron = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3.5 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:bg-cz-page"
    >
      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] ${TILE[tone]}`} aria-hidden="true">
        <Icon size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-semibold text-cz-text">{title}</span>
        {subtitle && <span className="mt-0.5 block text-[13px] leading-[1.4] text-cz-text-2">{subtitle}</span>}
      </span>
      {showChevron && <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />}
    </button>
  )
}

// ── Section label ─────────────────────────────────────────────────────────
export function OrgSectionLabel({ children }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-text-2">{children}</p>
  )
}

// ── Officer roster ────────────────────────────────────────────────────────
// A vacant position draws a dashed-outline "+" circle and an amber VACANT
// pill instead of a solid avatar and a name — straight from image11.
export function OrgOfficerRoster({ positions, officerByPosition, officerPersonId }) {
  return (
    <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      {positions.map((position, i) => {
        const o = officerByPosition[position]
        return (
          <li
            key={position}
            className={`flex items-center gap-3 px-4 py-3 ${
              i === positions.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
            }`}
          >
            {o ? (
              <OrgAvatar name={o.full_name} id={officerPersonId(o)} size={38} />
            ) : (
              <span
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-cz-alert-accent text-[17px] leading-none text-cz-alert-accent"
                aria-hidden="true"
              >
                +
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-tile-slate-fg">
                {position}
              </p>
              {o ? (
                <p className="mt-0.5 truncate text-[15px] text-cz-text">{o.full_name}</p>
              ) : (
                <span className="mt-1 inline-block rounded-full bg-cz-tile-amber-bg px-2.5 py-0.5 text-[11px] font-bold tracking-[0.02em] text-cz-tile-amber-fg">
                  {labels.orgHome.vacant}
                </span>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

// ── Member card ───────────────────────────────────────────────────────────
export function OrgMemberCard({ name, barangay, role, personId }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
      <OrgAvatar name={name} id={personId} size={48} />
      <p className="mt-3 truncate text-[15px] font-semibold text-cz-text">{name}</p>
      <p className="mt-0.5 truncate text-[13px] text-cz-text-2">
        {barangay ? `Brgy. ${barangay}` : labels.common.unknown}
      </p>
      {role && (
        <span className="mt-2.5 inline-block rounded-[5px] bg-cz-role-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-role-fg">
          {role}
        </span>
      )}
    </div>
  )
}
