import { AlertTriangle, ChevronRight } from 'lucide-react'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'

// Batch: presentational pieces of the Organization dashboard, extracted so
// the screen file stays readable and so the same pieces can be reused by the
// Organization Info screen.
//
// Every measurement here is taken from the approved reference images
// (image1/image2 mobile, image10/image11 desktop): 12px card radius, 16px
// card padding, 14px row padding, 40px member avatars, 34px roster avatars,
// 11px uppercase section labels at 0.06em tracking.

// ── App bar ───────────────────────────────────────────────────────────────
// #0B3D52 navy, sampled from the reference. This is the ONE surface family
// where the organisation screens leave the crop-green / fish-teal domain
// convention: an organisation reads as an organisation, not as a large
// farmer. Scoped strictly to cz-org-* tokens — the domain tokens themselves
// are untouched, so Farmer and Fisherfolk citizen screens are unaffected.
// Everything else about the bar — the icon tile, the small-caps app name
// over a bold page title, the right-aligned user chip on desktop — is
// exactly as drawn.
export function OrgAppBar({ title, chipLabel, onBack }) {
  return (
    <header className="w-full bg-cz-org-bar">
      <div className="mx-auto flex w-full max-w-[1240px] items-center gap-3 px-4 py-3 sm:px-6 sm:py-4">
        {onBack ? (
          <button
            type="button"
            onClick={onBack}
            aria-label={labels.orgHome.backToDashboard}
            className="-ml-2 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white transition-colors hover:bg-white/10"
          >
            <ChevronRight size={20} className="rotate-180" aria-hidden="true" />
          </button>
        ) : (
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
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-cz-org-on-muted">
            {labels.orgHome.appName}
          </p>
          <h1 className="truncate text-[17px] font-semibold text-white sm:text-[18px]">{title}</h1>
        </div>
        {chipLabel && (
          <span className="hidden items-center gap-2 rounded-full bg-white/15 py-1.5 pl-2 pr-3.5 sm:flex">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/20" aria-hidden="true">
              <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                <circle cx="12" cy="8" r="3.2" />
                <path d="M5 20c0-3.6 3.1-5.6 7-5.6s7 2 7 5.6" strokeLinecap="round" />
              </svg>
            </span>
            <span className="max-w-[160px] truncate text-[13px] font-medium text-white">{chipLabel}</span>
          </span>
        )}
      </div>
    </header>
  )
}

// ── Org hero card ─────────────────────────────────────────────────────────
// Dark card: type pill, org name in a large serif-ish bold, address line,
// hairline divider, then the two stats. Both numbers are REAL — member count
// from the member list's length, positions from the officer list measured
// against the domain's actual position set (seven, not the mockup's five).
export function OrgHeroCard({ theme, typeLabel, name, addressLine, memberCount, filled, total, isLoading }) {
  return (
    <section className="rounded-[14px] bg-gradient-to-b from-cz-org-hero-from to-cz-org-hero-to p-5 text-white">
      <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[12px] font-medium">
        <span className={`h-1.5 w-1.5 rounded-full ${theme.dot}`} aria-hidden="true" />
        {typeLabel}
      </span>
      <h2 className="mt-3 text-[22px] font-bold leading-[1.2] sm:text-[26px]">{name}</h2>
      <p className="mt-1 text-[13px] text-cz-org-on-muted">{addressLine}</p>
      <div className="my-4 h-px bg-white/15" />
      <div className="flex items-end justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cz-org-on-muted">
            {labels.orgHome.statMembers}
          </p>
          <p className="mt-0.5 text-[30px] font-bold leading-none tabular-nums">
            {isLoading ? '—' : memberCount}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-cz-org-on-muted">
            {labels.orgHome.statPositions}
          </p>
          <p className="mt-0.5 text-[30px] font-bold leading-none tabular-nums">
            {isLoading ? '—' : filled}
            <span className="text-[18px] font-semibold text-cz-org-on-muted">/{total}</span>
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
export function OrgScreen({ title, chipLabel, onBack, tabBar, children, wide = false }) {
  return (
    <div className="min-h-screen w-full bg-cz-org-panel">
      <OrgAppBar title={title} chipLabel={chipLabel} onBack={onBack} />
      <main
        className={`mx-auto w-full ${wide ? 'max-w-[1240px]' : 'max-w-[720px]'} px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-10`}
      >
        {children}
      </main>
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
      className="flex w-full items-center gap-3.5 rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-3.5 text-left shadow-[0_1px_2px_rgba(16,24,40,0.04)] transition-colors hover:bg-cz-org-panel"
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
