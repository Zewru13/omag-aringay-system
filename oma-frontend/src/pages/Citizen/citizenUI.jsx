import { ChevronRight, LogOut } from 'lucide-react'
import { labels } from './labels.js'

// Shared primitives for the citizen self-service screens, built to the
// exact visual specification for those screens (phone-shaped column,
// hairline 0.5px borders, 12px cards / 8px controls, cz-* palette).
//
// These deliberately do NOT reuse components/UI/{Button,FormField,
// ModalShell}: those implement the STAFF app's visual language (1px
// borders, different radii, warm-parchment neutrals, 38px control
// height) and changing them would re-skin every staff page. Where the
// two systems genuinely agree, the citizen screens still use the shared
// component; these exist only for the places the spec differs.
//
// Every interactive element here clears a 44px touch target, and status
// is always carried by icon + text + color together, never color alone.
//
// NOTE ON BUTTON TYPOGRAPHY: index.css sets `button { font: inherit }`
// OUTSIDE any cascade layer, and unlayered rules beat anything in
// @layer utilities regardless of specificity — so font-size/weight
// utilities put directly on a <button> are silently discarded and the
// button renders at the body's 14px/400. Every button label below is
// therefore wrapped in a <span> that carries the type styles. Fixing the
// global rule instead would restyle every staff screen, which is out of
// scope for a citizen-only re-skin.

// ─── Domain themes ──────────────────────────────────────────────────────
// One object per domain so the two home screens stay structurally
// identical and only their tint differs.

export const CROP_THEME = {
  header: 'bg-cz-crop-header',
  brand: 'text-cz-crop-100',
  greeting: 'text-cz-crop-300',
  name: 'text-cz-crop-pale',
  meta: 'text-cz-crop-300',
  iconBtn: 'text-cz-crop-100',
  circleBg: 'bg-cz-crop-pale',
  circleIcon: 'text-cz-crop-deep',
  track: 'bg-cz-crop-pale',
  fill: 'bg-cz-crop-fill',
  accentText: 'text-cz-crop-deep',
  solidBtn: 'bg-cz-crop-header text-cz-crop-pale',
  tileSelectedBorder: 'border-cz-crop-deep',
  tileSelectedBg: 'bg-cz-crop-pale',
  tileSelectedText: 'text-cz-crop-deeper',
}

export const FISH_THEME = {
  header: 'bg-cz-fish-header',
  brand: 'text-cz-fish-100',
  greeting: 'text-cz-fish-300',
  name: 'text-cz-fish-pale',
  meta: 'text-cz-fish-300',
  iconBtn: 'text-cz-fish-100',
  circleBg: 'bg-cz-fish-pale',
  circleIcon: 'text-cz-fish-deep',
  track: 'bg-cz-fish-pale',
  fill: 'bg-cz-fish-fill',
  accentText: 'text-cz-fish-deep',
  solidBtn: 'bg-cz-fish-header text-cz-fish-pale',
  tileSelectedBorder: 'border-cz-fish-deep',
  tileSelectedBg: 'bg-cz-fish-pale',
  tileSelectedText: 'text-cz-fish-deep',
}

// ─── Screen shell ───────────────────────────────────────────────────────
// Phone-shaped at EVERY breakpoint: the column never widens past 380px,
// it just centres itself in whatever viewport it gets.

export function CitizenScreen({ children }) {
  return (
    <div className="min-h-screen w-full bg-cz-page">
      <div className="mx-auto w-full max-w-[340px] bg-cz-page sm:max-w-[380px]">
        {children}
      </div>
    </div>
  )
}

// ─── Home header ────────────────────────────────────────────────────────

export function CitizenHomeHeader({ theme, name, metaLine, onLogout }) {
  return (
    <header className={`${theme.header} px-[18px] pt-4 pb-[18px]`}>
      <div className="mb-[14px] flex items-start justify-between">
        <span className={`text-[12px] tracking-[0.04em] ${theme.brand}`}>
          {labels.header.appName}
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label={labels.header.logOut}
          className={`-m-[13px] flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${theme.iconBtn} transition-colors hover:bg-white/10`}
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>
      <p className={`mb-[2px] text-[13px] ${theme.greeting}`}>{labels.farmerHome.headerGreeting}</p>
      <h1 className={`text-[21px] font-medium leading-[1.3] ${theme.name}`}>{name}</h1>
      <p className={`mt-1 text-[12px] ${theme.meta}`}>{metaLine}</p>
    </header>
  )
}

// ─── Sub-view header (back arrow + title) ───────────────────────────────

export function CitizenSubHeader({ theme, title, subtitle, onBack }) {
  return (
    <header className={`${theme.header} flex items-center gap-[10px] px-4 py-[14px]`}>
      <button
        type="button"
        onClick={onBack}
        aria-label={labels.farmerHome.secondary.backToHome}
        className={`-m-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${theme.iconBtn} transition-colors hover:bg-white/10`}
      >
        <ChevronRight size={20} className="rotate-180" aria-hidden="true" />
      </button>
      <div className="min-w-0 flex-1">
        <p className={`truncate text-[16px] font-medium ${theme.name}`}>{title}</p>
        {subtitle && <p className={`truncate text-[12px] ${theme.meta}`}>{subtitle}</p>}
      </div>
    </header>
  )
}

// ─── Body wrapper + section heading ─────────────────────────────────────

export function CitizenBody({ children, className = '' }) {
  return <div className={`px-[14px] pt-4 pb-1.5 ${className}`}>{children}</div>
}

export function SectionHeading({ children }) {
  return <h2 className="mb-[10px] text-[13px] font-medium text-cz-text-2">{children}</h2>
}

// ─── Status card (overdue / due-today) ──────────────────────────────────
// `tone` drives the whole palette AND which icon/label the caller passes,
// so the state is never communicated by colour on its own.

const TONES = {
  danger: {
    card: 'bg-cz-danger-bg border-cz-danger-border',
    accent: 'text-cz-danger-accent',
    title: 'text-cz-danger-title',
    body: 'text-cz-danger-body',
    button: 'bg-cz-danger-accent text-cz-danger-on',
  },
  warning: {
    card: 'bg-cz-warn-bg border-cz-warn-border',
    accent: 'text-cz-warn-accent',
    title: 'text-cz-warn-title',
    body: 'text-cz-warn-body',
    button: 'border-[0.5px] border-cz-warn-accent text-cz-warn-body bg-transparent',
  },
  warningFilled: {
    card: 'bg-cz-warn-bg border-cz-warn-border',
    accent: 'text-cz-warn-accent',
    title: 'text-cz-warn-title',
    body: 'text-cz-warn-body',
    button: 'bg-cz-warn-accent text-cz-warn-on',
  },
}

export function StatusCard({
  tone = 'danger',
  badgeIcon: BadgeIcon,
  badgeText,
  title,
  context,
  actionIcon: ActionIcon,
  actionLabel,
  onAction,
  children,
  footer,
}) {
  const t = TONES[tone]
  return (
    <div className={`mb-[10px] rounded-[12px] border-[0.5px] p-[14px] ${t.card}`}>
      <div className="mb-1.5 flex items-center gap-1.5">
        {BadgeIcon && <BadgeIcon size={16} className={`shrink-0 ${t.accent}`} aria-hidden="true" />}
        <span className={`text-[12px] font-medium ${t.accent}`}>{badgeText}</span>
      </div>
      {title && <p className={`text-[17px] font-medium leading-[1.35] ${t.title}`}>{title}</p>}
      {context && <p className={`mt-[3px] text-[13px] ${t.body}`}>{context}</p>}
      {children}
      {actionLabel && (
        <button
          type="button"
          onClick={onAction}
          className={`mt-3 flex w-full items-center justify-center gap-1.5 rounded-[8px] px-3 py-[13px] transition-opacity hover:opacity-90 ${t.button}`}
        >
          {ActionIcon && <ActionIcon size={16} aria-hidden="true" />}
          <span className="text-[15px] font-medium">{actionLabel}</span>
        </button>
      )}
      {footer}
    </div>
  )
}

// ─── Progress bar ───────────────────────────────────────────────────────

export function ProgressTrack({ theme, pct, height = 8 }) {
  const clamped = Math.min(100, Math.max(0, pct))
  return (
    <div
      className={`w-full overflow-hidden ${theme.track}`}
      style={{ height, borderRadius: height / 2 }}
      role="presentation"
    >
      <div
        className={`h-full ${theme.fill}`}
        style={{ width: `${clamped}%`, borderRadius: height / 2 }}
      />
    </div>
  )
}

// Shared day-elapsed maths so both home screens compute progress the same
// way (and both degrade to null rather than rendering a broken bar).
export function cycleProgress(startDate, endDate) {
  if (!startDate || !endDate) return null
  const start = new Date(startDate + 'T00:00:00')
  const end = new Date(endDate + 'T00:00:00')
  const total = Math.round((end - start) / 86400000)
  if (!total || total <= 0) return null
  const elapsed = Math.round((new Date(new Date().toDateString()) - start) / 86400000)
  return { elapsed: Math.max(0, elapsed), total, pct: (elapsed / total) * 100 }
}

// ─── Secondary rows ─────────────────────────────────────────────────────

export function SecondaryRows({ children }) {
  return <div className="mt-4 border-t-[0.5px] border-cz-border">{children}</div>
}

export function SecondaryRow({ icon: Icon, label, onClick, isLast = false }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-0.5 py-[14px] text-left transition-colors hover:bg-black/[0.02] ${
        isLast ? '' : 'border-b-[0.5px] border-cz-border'
      }`}
    >
      <Icon size={20} className="shrink-0 text-cz-text-2" aria-hidden="true" />
      <span className="flex-1 text-[15px] text-cz-text">{label}</span>
      <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
    </button>
  )
}

// ─── Empty state ────────────────────────────────────────────────────────
// A centred block, deliberately NOT a bordered container — an empty box
// reads as "something failed to load" rather than "nothing to do".

export function CitizenEmptyState({ icon: Icon, iconClass, title, body }) {
  return (
    <div className="flex flex-col items-center px-4 py-7 text-center">
      <Icon size={32} className={`mb-3 ${iconClass}`} aria-hidden="true" />
      <p className="text-[16px] font-medium text-cz-text">{title}</p>
      <p className="mt-1 text-[13px] leading-[1.5] text-cz-text-2">{body}</p>
    </div>
  )
}
