import { useState } from 'react'
import { ChevronDown, ChevronRight, ChevronLeft, HelpCircle, LogOut, User } from 'lucide-react'
import NotificationBell from '../../components/Layout/NotificationBell.jsx'
import { labels } from './labels.js'

// ─── Desktop shell primitives (UI Base Desktop POV) ───────────────────────
// A genuinely different information architecture from the mobile citizen
// screens, not a wider version of them: a persistent full-height left
// sidebar (logo, nav list, a pinned utility item below a divider), a
// topbar (greeting on the home screen, title+back on every sub-screen,
// account dropdown on the right), and a two-column body with a right
// "quick actions / context" rail. Screens branch their entire render on
// useIsDesktop() and mount ONE of these or the existing mobile shell —
// never both — so state and data-fetching stay single-sourced above the
// branch and only the returned markup differs.
//
// Sidebar colour is the domain's own header token (bg-cz-crop-header /
// bg-cz-fish-header) — sampled directly from the reference and it lands on
// the existing tokens exactly (#1B4D2E, #1C4B6A), so no new colour was
// needed for it. Primary submit buttons in the reference render in a
// muted, desaturated tone; on closer inspection every one of those forms
// is captured empty, which is this app's existing disabled-button
// treatment (`disabled:opacity-50` on the theme's own solidBtn), not a
// distinct third accent — so desktop forms reuse solidBtn like every other
// citizen screen rather than introducing new tokens to chase a mockup's
// empty-state rendering.

export function DesktopShell({ sidebar, topbar, children }) {
  return (
    <div className="flex min-h-screen w-full bg-cz-page">
      <aside className="flex w-[220px] shrink-0 flex-col">{sidebar}</aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {topbar}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  )
}

// Two-column body: main content + an optional right rail. The rail is a
// fixed-ish column (not flex-1) so cards inside it don't stretch to match
// whatever the main column's tallest element happens to be.
export function DesktopBody({ children, rail }) {
  return (
    <div className="flex items-start gap-5 px-6 py-5">
      <div className="min-w-0 flex-1">{children}</div>
      {rail && <div className="w-[280px] shrink-0 space-y-4">{rail}</div>}
    </div>
  )
}

export function DesktopSidebar({ theme, brandIcon: BrandIcon, brandName, brandSub, activeKey, navItems, pinnedItem }) {
  return (
    <nav className={`flex h-full flex-col ${theme.header} px-3 py-4`}>
      <div className="mb-6 flex items-center gap-2.5 px-2">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-white/15">
          <BrandIcon size={17} className="text-white" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[13px] font-semibold leading-[1.2] text-white">{brandName}</p>
          <p className={`truncate text-[11px] leading-[1.2] ${theme.brand}`}>{brandSub}</p>
        </div>
      </div>

      <ul className="space-y-[2px]">
        {navItems.map((item) => {
          const isActive = item.key === activeKey
          const Icon = item.icon
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onClick}
                aria-current={isActive ? 'page' : undefined}
                className={`flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-left text-[13.5px] transition-colors ${
                  isActive ? 'bg-white/15 font-semibold text-white' : `${theme.brand} hover:bg-white/10 hover:text-white`
                }`}
              >
                <Icon size={16} className="shrink-0" aria-hidden="true" />
                <span className="truncate">{item.label}</span>
              </button>
            </li>
          )
        })}
      </ul>

      <div className="mt-auto border-t-[0.5px] border-white/15 pt-3">
        <button
          type="button"
          onClick={pinnedItem.onClick}
          className={`flex w-full items-center gap-2.5 rounded-[8px] px-3 py-2.5 text-left text-[13.5px] transition-colors ${theme.brand} hover:bg-white/10 hover:text-white`}
        >
          <pinnedItem.icon size={16} className="shrink-0" aria-hidden="true" />
          <span className="truncate">{pinnedItem.label}</span>
        </button>
      </div>
    </nav>
  )
}

function DesktopAccountMenu({ theme, initials, name, roleLabel, onProfile, onHelp, onLogout }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex items-center gap-2 rounded-[8px] px-2 py-1.5 transition-colors hover:bg-cz-page"
      >
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${theme.solidBtn}`}>
          {initials}
        </span>
        <span className="text-[13.5px] font-medium text-cz-text">{name}</span>
        <ChevronDown size={15} className="text-cz-text-muted" aria-hidden="true" />
      </button>

      {open && (
        <>
          <button
            type="button"
            aria-label={labels.common.close}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-[calc(100%+6px)] z-50 w-[220px] overflow-hidden rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface shadow-lg">
            <div className="border-b-[0.5px] border-cz-border px-3.5 py-3">
              <p className="truncate text-[13.5px] font-semibold text-cz-text">{name}</p>
              <p className={`truncate text-[12px] ${theme.accentText}`}>{roleLabel}</p>
            </div>
            <button
              type="button"
              onClick={() => { setOpen(false); onProfile() }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-cz-text transition-colors hover:bg-cz-page"
            >
              <User size={15} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
              {labels.ffNew.desktop.accountProfile}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onHelp() }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] text-cz-text transition-colors hover:bg-cz-page"
            >
              <HelpCircle size={15} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
              {labels.ffNew.desktop.accountHelp}
            </button>
            <button
              type="button"
              onClick={() => { setOpen(false); onLogout() }}
              className="flex w-full items-center gap-2.5 border-t-[0.5px] border-cz-border px-3.5 py-2.5 text-left text-[13px] text-cz-danger-accent transition-colors hover:bg-cz-danger-bg"
            >
              <LogOut size={15} className="shrink-0" aria-hidden="true" />
              {labels.ffNew.desktop.accountLogout}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

// title+subtitle mode (every sub-screen) when `title` is given; otherwise
// greeting mode (home only) using `greetingName`+`metaLine`.
export function DesktopTopbar({ theme, title, subtitle, onBack, greetingName, metaLine, account }) {
  return (
    <header className="flex min-h-[64px] items-center justify-between border-b-[0.5px] border-cz-border bg-cz-surface px-6 py-3">
      <div className="flex min-w-0 items-center gap-3">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label={labels.farmerHome.secondary.backToHome}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-cz-text-2 transition-colors hover:bg-cz-page"
          >
            <ChevronLeft size={18} aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0">
          {title ? (
            <>
              <h1 className="truncate text-[16px] font-semibold text-cz-text">{title}</h1>
              {subtitle && <p className="truncate text-[12.5px] text-cz-text-2">{subtitle}</p>}
            </>
          ) : (
            <>
              <h1 className="truncate text-[16px] font-semibold text-cz-text">{greetingName}</h1>
              {metaLine && <p className="truncate text-[12.5px] text-cz-text-2">{metaLine}</p>}
            </>
          )}
        </div>
      </div>
      {/* Farmer/Fisherfolk parity batch: this desktop topbar previously had
          no bell at all. `light` is the cz-* dark-on-light treatment this
          component's own bg-cz-surface (white) background calls for —
          NotificationBell's 'dark' default would render white-on-white. */}
      <div className="flex items-center gap-2">
        <NotificationBell variant="light" />
        <DesktopAccountMenu theme={theme} {...account} />
      </div>
    </header>
  )
}

export function DesktopRailCard({ title, children }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4">
      {title && <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{title}</p>}
      {children}
    </div>
  )
}

export function DesktopQuickActions({ items }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-1.5">
      {items.map((item, i) => (
        <button
          key={item.label}
          type="button"
          onClick={item.onClick}
          className={`flex w-full items-center gap-3 rounded-[8px] px-2.5 py-2.5 text-left transition-colors hover:bg-cz-page ${
            i > 0 ? 'mt-0.5' : ''
          }`}
        >
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-cz-page">
            <item.icon size={16} className="text-cz-text-2" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-medium text-cz-text">{item.label}</span>
            {item.sublabel && <span className="block truncate text-[11.5px] text-cz-text-muted">{item.sublabel}</span>}
          </span>
          <ChevronRight size={15} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}

export function DesktopStatGrid({ title, items }) {
  return (
    <DesktopRailCard title={title}>
      <div className="grid grid-cols-2 gap-2">
        {items.map((item) => (
          <div key={item.label} className="rounded-[8px] bg-cz-page px-3 py-2.5">
            <p className="text-[17px] font-bold leading-[1.15] text-cz-text">{item.value}</p>
            <p className="mt-0.5 text-[11px] leading-[1.3] text-cz-text-muted">{item.label}</p>
          </div>
        ))}
      </div>
    </DesktopRailCard>
  )
}
