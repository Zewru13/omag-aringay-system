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

// CONTRAST NOTE: `greeting` and `meta` deliberately use the -100 step, not
// -300, because the -300 step falls under the 4.5:1 AA floor for the 12-13px
// text these two roles carry. Measured against the current header tokens:
//
//   crop  #C0DD97 on #1C5737 = 5.69:1   (-300 #97C459 would be 4.20:1)
//   fish  #B0E6FF on #1C4B6A = 6.89:1   (-300 #75B3E6 would be 4.13:1)
//
// Both clear AA. If the header tokens are ever darkened again, re-measure
// before moving these back to -300.
export const CROP_THEME = {
  header: 'bg-cz-crop-header',
  brand: 'text-cz-crop-100',
  greeting: 'text-cz-crop-100',
  name: 'text-cz-crop-pale',
  meta: 'text-cz-crop-100',
  iconBtn: 'text-cz-crop-100',
  circleBg: 'bg-cz-crop-pale',
  circleIcon: 'text-cz-crop-deep',
  track: 'bg-cz-track',
  fill: 'bg-cz-crop-fill',
  accentText: 'text-cz-crop-deep',
  solidBtn: 'bg-cz-crop-header text-cz-crop-pale',
  tileSelectedBorder: 'border-cz-crop-deep',
  tileSelectedBg: 'bg-cz-crop-pale',
  tileSelectedText: 'text-cz-crop-deeper',
  // Batch: the small status dot inside the organization type pill
  // ("Fisherfolk Organization"), per the reference hero card.
  dot: 'bg-cz-crop-100',
  // Field & Tide: added so the Organization screens (OrgAppBar/
  // OrgHeroCard) can take this domain's colour instead of a hardcoded
  // navy — a Farmers Organization is Field green, same as Farmer.
  border: 'border-cz-crop-deep',
  focusBorder: 'focus:border-cz-crop-deep',
  focusWithinBorder: 'focus-within:border-cz-crop-deep',
  heroGradient: 'bg-gradient-to-b from-cz-crop-header to-cz-crop-deeper',
  mutedOn: 'text-cz-crop-100',
}

export const FISH_THEME = {
  header: 'bg-cz-fish-header',
  brand: 'text-cz-fish-100',
  greeting: 'text-cz-fish-100',
  name: 'text-cz-fish-pale',
  meta: 'text-cz-fish-100',
  iconBtn: 'text-cz-fish-100',
  circleBg: 'bg-cz-fish-pale',
  circleIcon: 'text-cz-fish-deep',
  track: 'bg-cz-track',
  // Was a hardcoded arbitrary-hex gradient predating the Field & Tide
  // ramp — now the same two token stops the header/hero use, so a
  // progress fill never drifts out of sync with the rest of the domain.
  fill: 'bg-gradient-to-r from-cz-fish-header to-cz-fish-fill',
  accentText: 'text-cz-fish-deep',
  solidBtn: 'bg-cz-fish-header text-cz-fish-pale',
  tileSelectedBorder: 'border-cz-fish-deep',
  tileSelectedBg: 'bg-cz-fish-pale',
  tileSelectedText: 'text-cz-fish-deep',
  dot: 'bg-cz-fish-100',
  border: 'border-cz-fish-deep',
  focusBorder: 'focus:border-cz-fish-deep',
  focusWithinBorder: 'focus-within:border-cz-fish-deep',
  heroGradient: 'bg-gradient-to-b from-cz-fish-header to-cz-fish-deeper',
  mutedOn: 'text-cz-fish-100',
}

// ─── Screen shell ───────────────────────────────────────────────────────
// FLUID at every width. The container is always `w-full`; a max-width only
// engages once there is genuinely more room than the content wants:
//
//   < 640px   full viewport width — the container measures exactly the
//             viewport, so a real phone is filled edge to edge
//   640-1023  centred, capped at 720px
//   >= 1024   centred, capped at 1100px
//   >= 1440   still 1100px — deliberately does not keep growing
//
// This replaces the previous max-w-[340px]/sm:max-w-[380px] phone column,
// which left dead space on tablets and, worse, failed to fill a 390px or
// 414px phone — the exact devices this portal is used on.
//
// HORIZONTAL PADDING lives on the header and body children (px-4 sm:px-6),
// not on this container. That is deliberate: the domain-tinted header is a
// full-bleed colour bar, and padding here would inset it and leave page
// background running down both sides of it. Because the padding sits
// inside, the container's own measured width still equals the viewport
// below 640px, which is what the layout rule requires.
export const CITIZEN_GUTTER = 'px-4 sm:px-6'

export function CitizenScreen({ children, hasTabBar = false }) {
  // EVERY citizen screen gets this identical container — home screens and
  // sub-views alike. That uniformity is the point: if Profile capped at
  // 720px while Home ran to 1100px, the tinted header bar would change
  // width as you navigated and the two would read as different apps. What
  // differs between them is what goes INSIDE (the home screens add the
  // Quick Links region via CitizenHomeBody), never the container.
  //
  // `hasTabBar` only adds bottom padding, and only below 640px — the bar
  // itself is position:fixed, so without this the last card would sit
  // underneath it. Above 640px the bar is not rendered at all and the
  // padding collapses to zero, which is what keeps the breakpoint
  // transition free of dead space at the bottom of the page.
  return (
    <div className="min-h-screen w-full bg-cz-page">
      <div
        className={`mx-auto w-full bg-cz-page sm:max-w-[720px] lg:max-w-[1100px] ${
          hasTabBar ? 'pb-[calc(60px+env(safe-area-inset-bottom))] sm:pb-0' : ''
        }`}
      >
        {children}
      </div>
    </div>
  )
}

// ─── Mobile tab bar (< 640px only) ──────────────────────────────────────
// Adopted from the UI basis, which shows a persistent 3-item bar. It is
// deliberately MOBILE-ONLY (`sm:hidden`): from 640px up this portal keeps
// the SecondaryRows / Quick Links sidebar model it already had, so the bar
// is not a replacement for that navigation, only a small-screen addition.
//
// The basis draws the bar inside a phone frame with no guidance above phone
// width; rendering it at every width would have meant either a stranded bar
// across a 1100px desktop layout or abandoning the fluid container rule.
// This keeps both.
export function CitizenTabBar({ theme, active, items }) {
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
              className="flex min-h-[56px] flex-1 flex-col items-center justify-center gap-[3px] px-1 py-1.5 transition-colors"
            >
              <Icon
                size={20}
                className={isActive ? theme.accentText : 'text-cz-text-muted'}
                aria-hidden="true"
              />
              {/* Weight, not colour alone, carries the active state — the
                  same icon+text+weight rule the rest of these screens use. */}
              <span
                className={`text-[11px] ${
                  isActive ? `font-semibold ${theme.accentText}` : 'text-cz-text-muted'
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

// ─── Home header ────────────────────────────────────────────────────────

export function CitizenHomeHeader({ theme, name, metaLine, onLogout }) {
  return (
    <header className={`${theme.header} ${CITIZEN_GUTTER} pt-4 pb-[18px] lg:py-[18px]`}>
      <div className="mb-[14px] flex items-start justify-between lg:mb-0">
        <span className={`text-[12px] tracking-[0.04em] ${theme.brand}`}>
          {labels.header.appName}
        </span>
        <button
          type="button"
          onClick={onLogout}
          aria-label={labels.header.logOut}
          className={`-m-[13px] flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${theme.iconBtn} transition-colors hover:bg-white/10 lg:hidden`}
        >
          <LogOut size={18} aria-hidden="true" />
        </button>
      </div>

      {/* >=1024px: greeting+name left, identity right. Below that this is a
          plain stack and the two blocks simply follow each other, which is
          exactly the pre-existing mobile order. */}
      <div className="lg:flex lg:items-end lg:justify-between lg:gap-6">
        <div className="min-w-0">
          <p className={`mb-[2px] text-[13px] ${theme.greeting}`}>{labels.farmerHome.headerGreeting}</p>
          <h1 className={`text-[21px] font-medium leading-[1.3] ${theme.name}`}>{name}</h1>
        </div>
        <div className="flex items-end gap-3">
          <p className={`mt-1 text-[12px] lg:mt-0 lg:text-right ${theme.meta}`}>{metaLine}</p>
          <button
            type="button"
            onClick={onLogout}
            aria-label={labels.header.logOut}
            className={`hidden shrink-0 items-center justify-center rounded-lg ${theme.iconBtn} transition-colors hover:bg-white/10 lg:-mb-1 lg:flex lg:h-11 lg:w-11`}
          >
            <LogOut size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
    </header>
  )
}

// ─── Desktop two-region home body ───────────────────────────────────────
// Below 1024px: one fluid column, children in source order, no sidebar.
// At >=1024px it becomes main + aside.

export function CitizenHomeBody({ children, aside }) {
  return (
    <div className={`${CITIZEN_GUTTER} pt-4 pb-1.5 lg:flex lg:gap-5 lg:py-5`}>
      <div className="min-w-0 lg:flex-[1.4]">{children}</div>
      {aside && (
        <aside className="hidden lg:block lg:flex-1 lg:border-l-[0.5px] lg:border-cz-border lg:pl-5">
          {aside}
        </aside>
      )}
    </div>
  )
}

// The crop/pond collection. One column on mobile (unchanged), exactly two
// from 1024px up — and deliberately capped there. It is not allowed to grow
// to 3 or 4 on very wide screens: these cards carry a name, a meta line, a
// progress bar and two actions, and at 4-up on a 2560px display each card
// becomes a narrow strip where the meta line wraps and the action buttons
// stop being comfortably tappable. Two keeps the card proportions close to
// what they are on mobile, which is where they were designed.
export function CitizenCardGrid({ children }) {
  // Two-up from 640px, not just 1024px: at tablet width a single column of
  // full-width cards wastes most of the row. grid-cols-2 is
  // repeat(2, minmax(0,1fr)) — fr units, so the columns divide whatever
  // width the container has rather than measuring any fixed size. minmax's
  // 0 floor is what lets long crop/pond names truncate instead of forcing
  // the column wider than its share.
  return <div className="sm:grid sm:grid-cols-2 sm:items-start sm:gap-[10px]">{children}</div>
}

// Quick Links sidebar heading (desktop only — the mobile equivalent is the
// SecondaryRows divider, which needs no label).
export function QuickLinksHeading({ children }) {
  return <h2 className="mb-1 text-[13px] font-medium text-cz-text-2">{children}</h2>
}

// ─── Sub-view header (back arrow + title) ───────────────────────────────

export function CitizenSubHeader({ theme, title, subtitle, onBack }) {
  return (
    <header className={`${theme.header} ${CITIZEN_GUTTER} flex items-center gap-[10px] py-[14px]`}>
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
  return <div className={`${CITIZEN_GUTTER} pt-4 pb-1.5 ${className}`}>{children}</div>
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
  // UI-basis pass: when `onCardClick` is supplied the whole card becomes the
  // tap target with a trailing chevron, instead of carrying a separate
  // action button. `cardActionLabel` is what the card ANNOUNCES it does —
  // it is not rendered as visible text, so the affordance stays implicit
  // visually (as the basis draws it) while remaining explicit to a screen
  // reader. The `actionLabel`/`onAction` button API below is untouched, so
  // callers that still want an explicit button (the fisherfolk feeding
  // hero) keep working exactly as before.
  onCardClick,
  cardActionLabel,
  children,
  footer,
}) {
  const t = TONES[tone]

  const body = (
    <>
      <div className="mb-1.5 flex items-center gap-1.5">
        {BadgeIcon && <BadgeIcon size={16} className={`shrink-0 ${t.accent}`} aria-hidden="true" />}
        <span className={`text-[12px] font-medium ${t.accent}`}>{badgeText}</span>
      </div>
      {title && <p className={`text-[17px] font-medium leading-[1.35] ${t.title}`}>{title}</p>}
      {context && <p className={`mt-[3px] text-[13px] ${t.body}`}>{context}</p>}
    </>
  )

  if (onCardClick) {
    return (
      <button
        type="button"
        onClick={onCardClick}
        aria-label={cardActionLabel ? `${title} — ${cardActionLabel}` : title}
        className={`mb-[10px] flex w-full items-center gap-3 rounded-[12px] border-[0.5px] p-[14px] text-left transition-opacity hover:opacity-90 ${t.card}`}
      >
        <span className="min-w-0 flex-1">{body}</span>
        <ChevronRight size={18} className={`shrink-0 ${t.accent}`} aria-hidden="true" />
      </button>
    )
  }

  return (
    <div className={`mb-[10px] rounded-[12px] border-[0.5px] p-[14px] ${t.card}`}>
      {body}
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

// `hideChevron` is for the desktop Quick Links sidebar: there the row is the
// end of the line rather than a step into a deeper screen, so the affordance
// the chevron promises isn't there to promise.
export function SecondaryRow({ icon: Icon, label, onClick, isLast = false, hideChevron = false }) {
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
      {!hideChevron && <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />}
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
