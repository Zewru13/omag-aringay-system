import { useEffect, useState } from 'react'
import { ArrowLeftRight, ChevronDown, ChevronLeft, HelpCircle, Menu, User } from 'lucide-react'
import NotificationBell from '../../components/Layout/NotificationBell.jsx'
import omagLogo from '../../assets/LOGO OMAg.jpg'
import { labels } from './labels.js'

// Farmer-only chrome for the citizen redesign (UPDATED FARMER CITIZEN UI.docx):
// phone header with an avatar menu, the five-tab bar, and the desktop sidebar
// and topbar. Deliberately separate from citizenUI.jsx / CitizenDesktopUI.jsx,
// which Fisherfolk and Organization still use unchanged.
//
// FarmerChromeContext (farmerChromeContext.js) is how the phone header reaches screens this file does
// not own (Profile, Help): FarmerHomeScreen provides it, and citizenUI's
// CitizenHomeHeader/CitizenSubHeader render FarmerHeader instead of their own
// bar when it is present. With no provider they behave exactly as before.
//
// Button labels sit in <span>s that carry the type styles: index.css sets
// `button { font: inherit }` outside any layer, which discards font utilities
// placed directly on a <button> (see the note at the top of citizenUI.jsx).

function MenuPanel({ onProfile, onHelp, onLogout, onClose, className }) {
  const M = labels.farmerChrome.menu
  const item = 'flex h-[36px] w-full items-center gap-3 px-4 text-left transition-colors hover:bg-cz-page'
  return (
    <div
      role="menu"
      className={`z-50 overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface py-1 shadow-[0_8px_24px_rgba(0,0,0,0.12)] ${className}`}
    >
      <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onProfile() }}>
        <User size={15} className="shrink-0 text-cz-text-2" aria-hidden="true" />
        <span className="text-[13px] text-cz-text">{M.viewProfile}</span>
      </button>
      <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onHelp() }}>
        <HelpCircle size={15} className="shrink-0 text-cz-text-2" aria-hidden="true" />
        <span className="text-[13px] text-cz-text">{M.help}</span>
      </button>
      <div className="mx-1.5 my-0.5 border-t-[0.5px] border-cz-border" />
      <button type="button" role="menuitem" className={item} onClick={() => { onClose(); onLogout() }}>
        <ArrowLeftRight size={15} className="shrink-0 text-cz-danger-accent" aria-hidden="true" />
        <span className="text-[13px] text-cz-danger-accent">{M.logout}</span>
      </button>
    </div>
  )
}

function useMenuState() {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])
  return [open, setOpen]
}

function Seal({ size }) {
  return (
    <span
      className="flex shrink-0 items-center justify-center overflow-hidden bg-white/[0.16]"
      style={{ width: size, height: size, borderRadius: size >= 33 ? 9 : 8 }}
    >
      <img src={omagLogo} alt="OMAg" className="h-full w-full object-cover" />
    </span>
  )
}

// ─── Phone ────────────────────────────────────────────────────────────────

export function FarmerHeader({ initials, onProfile, onHelp, onLogout }) {
  const [open, setOpen] = useMenuState()
  return (
    <header className="sticky top-0 z-30 bg-cz-crop-header">
      <div className="flex h-[55px] items-center justify-between px-4 sm:px-6">
        <span className="flex items-center gap-2">
          <Seal size={28} />
          <span className="text-[13.5px] font-semibold text-white">{labels.header.appName}</span>
        </span>
        <div className="flex items-center gap-1">
          <NotificationBell />
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={open}
            aria-label={labels.header.profileNav}
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.16] transition-shadow ${open ? 'ring-2 ring-white' : ''}`}
          >
            <span className="text-[10px] font-bold text-white">{initials}</span>
          </button>
        </div>
      </div>
      {open && (
        <>
          <button
            type="button"
            aria-label={labels.common.close}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <MenuPanel
            onProfile={onProfile}
            onHelp={onHelp}
            onLogout={onLogout}
            onClose={() => setOpen(false)}
            className="absolute right-3.5 top-[53px] w-[196px]"
          />
        </>
      )}
    </header>
  )
}

export function FarmerTabBar({ active, items }) {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t-[0.5px] border-cz-border bg-cz-surface pb-[env(safe-area-inset-bottom)] sm:hidden"
      aria-label={labels.tabBar.ariaLabel}
    >
      <div className="mx-auto flex w-full max-w-[720px]">
        {items.map((item) => {
          const isActive = item.key === active
          const Icon = item.icon
          return (
            <button
              key={item.key}
              type="button"
              onClick={item.onClick}
              aria-current={isActive ? 'page' : undefined}
              className="press-scale flex min-h-[60px] flex-1 flex-col items-center justify-center gap-[5px] px-1 py-1.5"
            >
              <Icon
                size={20}
                className={`transition-colors ${isActive ? 'text-cz-crop-deep' : 'text-cz-text-muted'}`}
                aria-hidden="true"
              />
              <span
                className={`text-center text-[9.5px] leading-[1.15] transition-colors ${
                  isActive ? 'font-semibold text-cz-crop-deep' : 'font-medium text-cz-text-muted'
                }`}
              >
                {item.label}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}

// ─── Desktop ──────────────────────────────────────────────────────────────

export function FarmerDesktopSidebar({ collapsed, activeKey, navItems }) {
  return (
    <nav className={`flex h-full flex-col bg-cz-crop-deeper py-6 ${collapsed ? 'items-center px-2' : 'px-[14px]'}`}>
      <div className={`mb-9 flex items-center gap-3 ${collapsed ? 'justify-center' : ''}`}>
        <Seal size={33} />
        {!collapsed && (
          <span className="truncate text-[15px] font-semibold text-white">{labels.header.appName}</span>
        )}
      </div>
      <ul className="w-full space-y-[5px]">
        {navItems.map((item) => {
          const isActive = item.key === activeKey
          const Icon = item.icon
          return (
            <li key={item.key}>
              <button
                type="button"
                onClick={item.onClick}
                aria-current={isActive ? 'page' : undefined}
                title={collapsed ? item.label : undefined}
                className={`flex h-[41px] w-full items-center gap-3 rounded-[10px] text-left transition-colors ${
                  collapsed ? 'justify-center px-0' : 'px-3.5'
                } ${isActive ? 'bg-cz-crop-header text-white' : 'text-cz-crop-100 hover:bg-white/10 hover:text-white'}`}
              >
                <Icon size={17} className="shrink-0" aria-hidden="true" />
                {!collapsed && (
                  <span className={`truncate text-[13.5px] ${isActive ? 'font-semibold' : 'font-medium'}`}>
                    {item.label}
                  </span>
                )}
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function AccountMenu({ initials, name, roleLabel, onProfile, onHelp, onLogout }) {
  const [open, setOpen] = useMenuState()
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 rounded-[10px] px-1.5 py-1 transition-colors hover:bg-cz-page"
      >
        <span className="flex h-[30px] w-[30px] shrink-0 items-center justify-center rounded-full bg-cz-crop-pale">
          <span className="text-[11px] font-bold text-cz-crop-deeper">{initials}</span>
        </span>
        <span className="min-w-0 text-left">
          <span className="block truncate text-[12.5px] font-semibold leading-[1.25] text-cz-text">{name}</span>
          <span className="block truncate text-[10px] leading-[1.25] text-cz-text-2">{roleLabel}</span>
        </span>
        <ChevronDown size={14} className="shrink-0 text-cz-text" aria-hidden="true" />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label={labels.common.close}
            className="fixed inset-0 z-40 cursor-default"
            onClick={() => setOpen(false)}
          />
          <MenuPanel
            onProfile={onProfile}
            onHelp={onHelp}
            onLogout={onLogout}
            onClose={() => setOpen(false)}
            className="absolute right-0 top-[calc(100%+8px)] w-[208px]"
          />
        </>
      )}
    </div>
  )
}

// `title`/`subtitle`/`onBack` keep the page-title row that screens not yet
// rebuilt (and Profile/Help, which stay as they are) still rely on; the
// redesigned screens simply do not pass them.
export function FarmerDesktopTopbar({ title, subtitle, onBack, account, onToggleSidebar }) {
  return (
    <>
      <header className="sticky top-0 z-30 flex h-[60px] items-center justify-between border-b-[0.5px] border-cz-border bg-cz-surface px-6">
        <div className="flex min-w-0 items-center gap-3">
          {onToggleSidebar && (
            <button
              type="button"
              onClick={onToggleSidebar}
              aria-label={labels.common.toggleSidebar}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-cz-text-2 transition-colors hover:bg-cz-page"
            >
              <Menu size={18} aria-hidden="true" />
            </button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <NotificationBell variant="light" />
          <AccountMenu {...account} />
        </div>
      </header>
      {title && (
        <div className="flex items-center gap-3 border-b-[0.5px] border-cz-border px-6 py-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label={labels.farmerHome.secondary.backToHome}
              className="press-scale flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-cz-text-2 transition-colors hover:bg-cz-page"
            >
              <ChevronLeft size={18} aria-hidden="true" />
            </button>
          )}
          <div className="min-w-0">
            <h1 className="truncate text-[16px] font-semibold text-cz-text">{title}</h1>
            {subtitle && <p className="truncate text-[12.5px] text-cz-text-2">{subtitle}</p>}
          </div>
        </div>
      )}
    </>
  )
}

// Desktop page body: the reference centres a 980px column and hangs a 260px
// rail off its right edge with a 15px gap. Screens pass their rail cards in.
export function FarmerDesktopBody({ children, rail }) {
  return (
    <div className="mx-auto flex w-full max-w-[1028px] items-start gap-[15px] px-6 py-5">
      <div className="min-w-0 flex-1">{children}</div>
      {rail && <div className="sticky top-[80px] w-[260px] shrink-0 space-y-[15px]">{rail}</div>}
    </div>
  )
}

export function FarmerRailCard({ title, children }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4">
      {title && <p className="mb-3 text-[12px] font-bold tracking-[0.06em] text-cz-text">{title}</p>}
      {children}
    </div>
  )
}
