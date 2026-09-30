import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRight, ChevronRight, ClipboardList, History, Home, Package, UserCheck, UserCog, UserPlus, Users as UsersIcon } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import OrgHelpScreen from './OrgHelpScreen.jsx'
import OrgReportAssistanceScreen from './OrgReportAssistanceScreen.jsx'
import OrgReportHistoryScreen from './OrgReportHistoryScreen.jsx'
import OrgAccountlessConfirmablesScreen from './OrgAccountlessConfirmablesScreen.jsx'
import OrgAddMemberScreen from './OrgAddMemberScreen.jsx'
import OrgAssignOfficerScreen from './OrgAssignOfficerScreen.jsx'
import OrgOfficerHistoryScreen from './OrgOfficerHistoryScreen.jsx'
import OrgMembersScreen from './OrgMembersScreen.jsx'
import OrgInfoScreen from './OrgInfoScreen.jsx'
import { OrgShell } from './OrgDashboardParts.jsx'
import { labels } from './labels.js'
import { CitizenTabBar } from './citizenUI.jsx'

// Organization Reference rebuild — Home matches image1 (desktop) / image14
// +16 (mobile, top + scrolled): plain white identity card, Kasapi/Posisyon
// as two separate white stat cards (not merged into a colored hero), three
// square "Mabilis na Aksyon" tiles, then the full officer roster in its own
// card. One component, two layouts — the reference shows the same content
// reflowing (roster to a right column at >=1024px), not two different
// pages.
//
// Numbers are real, never the mockup's literals: KASAPI is the member
// list's length and POSISYON is the officer list measured against the
// domain's actual position set — seven, where the mockup draws five.

export default function OrganizationHomeScreen({ record, domain }) {
  const theme = domain.dashboardTheme
  const orgId = record?.id

  const [view, setView] = useState('home')
  const [members, setMembers] = useState([])
  const [officers, setOfficers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

  // The entrance stagger is for the first time Home appears after signing in.
  // This component stays mounted while the user moves between views, so the
  // flag turns itself off after the first paint; coming back to Home later
  // gets only the shell's short page-in, not the whole sequence again.
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setIntro(false), 900)
    return () => clearTimeout(t)
  }, [])
  // The position ticks fill in once, when the numbers first arrive — not on
  // every trip back to Home.
  const [tickIntro, setTickIntro] = useState(true)
  useEffect(() => {
    if (isLoading) return undefined
    const t = setTimeout(() => setTickIntro(false), 900)
    return () => clearTimeout(t)
  }, [isLoading])
  const riseProps = (i, className = '') => ({
    className: `${className}${intro ? ' org-rise' : ''}`.trim(),
    style: intro ? { '--i': i } : undefined,
  })

  useEffect(() => {
    if (!orgId) return undefined
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    Promise.all([
      api.get(domain.membersUrl(orgId)),
      api.get(domain.officersUrl(orgId)),
    ])
      .then(([m, o]) => {
        if (cancelled) return
        setMembers(Array.isArray(m.data) ? m.data : (m.data?.results || []))
        setOfficers(Array.isArray(o.data) ? o.data : (o.data?.results || []))
      })
      .catch(() => { if (!cancelled) setHasError(true) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [orgId, domain, reloadKey])

  const { filledPositions, vacantPositions } = useMemo(() => {
    const held = new Set(officers.map((o) => o.position))
    return {
      filledPositions: domain.officerPositions.filter((p) => held.has(p)),
      vacantPositions: domain.officerPositions.filter((p) => !held.has(p)),
    }
  }, [officers, domain])

  const officerByPosition = useMemo(() => {
    const map = {}
    officers.forEach((o) => { map[o.position] = o })
    return map
  }, [officers])

  // Below 640px: bottom tab bar. At 640px+: sidebar (OrgShell renders it
  // when `onNav` is supplied) — both used to read the exact same 3
  // destinations; "Impormasyon" was dropped from the MOBILE bar only
  // (2026-09-07 direct request — replaced by OrgTopBar's mobile profile
  // icon), so the two nav surfaces now deliberately differ by one entry.
  const tabBar = (active) => (
    <CitizenTabBar
      theme={theme}
      active={active}
      items={[
        { key: 'home', icon: Home, label: labels.orgHome.homeNav, onClick: () => setView('home') },
        { key: 'history', icon: ClipboardList, label: labels.orgHome.historyNav, onClick: () => setView('history') },
      ]}
    />
  )
  const goHomeOrNav = (key) => setView(key)

  // ── Sub-views ────────────────────────────────────────────────────────
  if (view === 'addMember') {
    return (
      <OrgAddMemberScreen
        domain={domain}
        orgId={orgId}
        orgName={record?.label}
        existingMemberIds={members.map((m) => domain.rowPersonId(m))}
        onBack={() => setView('home')}
        onNav={goHomeOrNav}
        onSuccess={() => { refresh(); setView('home') }}
      />
    )
  }

  if (view === 'assignOfficer') {
    return (
      <OrgAssignOfficerScreen
        domain={domain}
        orgId={orgId}
        orgName={record?.label}
        // Inactive members can't hold a position (the backend rejects it
        // too — see OrganizationOfficerSerializer.validate_farmer /
        // FisherfolkOrganizationOfficerSerializer.validate). Filtered
        // here only, not in the `members` state itself: the Members
        // screen still needs the full list, active and inactive alike.
        members={members.filter((m) => domain.rowIsActive(m))}
        officerByPosition={officerByPosition}
        onBack={() => setView('home')}
        onNav={goHomeOrNav}
        onSuccess={() => { refresh(); setView('home') }}
      />
    )
  }

  if (view === 'officerHistory') {
    return (
      <OrgOfficerHistoryScreen
        domain={domain}
        orgId={orgId}
        orgName={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        active={null}
        onNav={goHomeOrNav}
      />
    )
  }

  if (view === 'orgInfo') {
    return (
      <OrgInfoScreen
        record={record}
        domain={domain}
        onBack={() => setView('home')}
        tabBar={tabBar('orgInfo')}
        onRecordChanged={refresh}
        active="orgInfo"
        onNav={goHomeOrNav}
      />
    )
  }

  if (view === 'assistance') {
    return (
      <OrgReportAssistanceScreen
        domain={domain}
        orgId={orgId}
        orgName={record?.label}
        members={members}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        onSuccess={refresh}
      />
    )
  }

  if (view === 'history') {
    return (
      <OrgReportHistoryScreen
        domain={domain}
        orgName={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar('history')}
        active="history"
        onNav={goHomeOrNav}
      />
    )
  }

  if (view === 'confirmables') {
    return (
      <OrgAccountlessConfirmablesScreen
        domain={domain}
        orgName={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        active={null}
        onNav={goHomeOrNav}
      />
    )
  }

  if (view === 'help') {
    return (
      <OrgHelpScreen
        domain={domain}
        orgName={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        active={null}
        onNav={goHomeOrNav}
      />
    )
  }

  if (view === 'members') {
    return (
      <OrgMembersScreen
        domain={domain}
        orgId={orgId}
        orgName={record?.label}
        members={members}
        officerByPosition={officerByPosition}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        onNav={goHomeOrNav}
        onRefresh={refresh}
      />
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────────
  // Editorial rather than a tile grid: a masthead, one status strip that
  // carries the two numbers that matter (members, and which of the seven
  // officer positions are held — as ticks, so a gap is visible at a glance),
  // one primary action for the job this account exists to do, and the
  // remaining actions as a described list. Surfaces are white on the same
  // warm parchment ground as the staff app, lifted by --shadow-xs rather than
  // hairline boxes.
  const orgTypeLabel = domain.key === 'farmers_org'
    ? labels.orgHome.typeBadgeFarmers
    : labels.orgHome.typeBadgeFisherfolk
  const total = domain.officerPositions.length
  const eyebrow = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-cz-text-2'
  const surface = 'overflow-hidden rounded-[14px] bg-white shadow-[var(--shadow-xs)]'

  const masthead = (
    <div {...riseProps(0)}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.08em] ${theme.accentText}`}>{orgTypeLabel}</p>
      <h1 className="mt-1 text-[26px] font-bold leading-[1.15] tracking-[-0.01em] text-cz-text">
        {record?.label || labels.common.unknown}
      </h1>
      <p className="mt-1.5 text-[13px] text-cz-text-2">
        {labels.orgHome.addressLine(record?.barangay || labels.common.unknown)}
        {record?.registration_number ? ` · ${record.registration_number}` : ''}
      </p>
    </div>
  )

  const statusStrip = (
    <section {...riseProps(1, `mt-5 ${surface}`)}>
      <button
        type="button"
        onClick={() => setView('members')}
        className="press-scale flex w-full items-center justify-between gap-3 px-5 py-4 text-left transition-colors hover:bg-cz-page/60"
      >
        <span>
          {isLoading ? (
            <span className="skeleton-shimmer block h-[32px] w-12 rounded-[6px]" aria-hidden="true" />
          ) : (
            <span className={`block text-[32px] font-bold leading-none tabular-nums ${theme.accentText}`}>{members.length}</span>
          )}
          <span className={`mt-1.5 block ${eyebrow}`}>{labels.orgHome.statMembers}</span>
        </span>
        <span className="flex items-center gap-1 text-[13px] font-medium text-cz-text-2">
          {labels.orgHome.viewMembersFull}
          <ChevronRight size={16} aria-hidden="true" />
        </span>
      </button>

      <div className="border-t-[0.5px] border-cz-border px-5 py-4">
        <div className="flex items-baseline justify-between">
          <p className={eyebrow}>{labels.orgHome.statPositions}</p>
          <p className="text-[13px] tabular-nums text-cz-text-2">
            <span className="text-[18px] font-bold text-cz-text">{isLoading ? '–' : filledPositions.length}</span>/{total}
          </p>
        </div>
        <div className="mt-3 flex gap-1.5" role="img" aria-label={labels.orgHome.positionsFilledAria(filledPositions.length, total)}>
          {domain.officerPositions.map((position, i) => {
            const held = filledPositions.includes(position)
            return (
              <span
                key={position}
                title={position}
                className={`h-2 flex-1 rounded-full ${isLoading ? 'skeleton-shimmer' : held ? `${theme.header}${tickIntro ? ' org-tick' : ''}` : 'bg-cz-track'}`}
                style={!isLoading && held && tickIntro ? { '--i': i } : undefined}
              />
            )
          })}
        </div>
        {!isLoading && !hasError && vacantPositions.length > 0 && (
          <div className="mt-3.5 flex items-center justify-between gap-3 border-t-[0.5px] border-dashed border-cz-border pt-3">
            <p className="min-w-0 text-[13px] leading-[1.4] text-cz-warn-body">
              <span className="font-semibold">{labels.orgHome.vacantCount(vacantPositions.length)}</span>
              {' — '}{vacantPositions.join(', ')}
            </p>
            <button
              type="button"
              onClick={() => setView('assignOfficer')}
              className={`press-scale shrink-0 rounded-[8px] px-3 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-cz-page ${theme.accentText}`}
            >
              {labels.orgHome.assignNow} <span aria-hidden="true">→</span>
            </button>
          </div>
        )}
      </div>
    </section>
  )

  const errorBlock = hasError && (
    <div className="mt-4 rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
      <p className="text-[13px] text-cz-danger-body">{labels.orgHome.loadFailed}</p>
      <button type="button" onClick={refresh} className="press-scale mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-danger-accent">
        <span className="text-[14px] font-medium text-cz-danger-body">{labels.orgHome.retry}</span>
      </button>
    </div>
  )

  const secondaryActions = [
    { icon: UserPlus, title: labels.orgHome.addMember, sub: labels.orgHome.addMemberSub, target: 'addMember' },
    { icon: UserCog, title: labels.orgHome.assignOfficer, sub: labels.orgHome.assignOfficerSub, target: 'assignOfficer' },
    { icon: UserCheck, title: labels.orgHome.confirmOnBehalf, sub: labels.orgHome.confirmOnBehalfSub, target: 'confirmables' },
  ]

  const actionsSection = (
    <section className="mt-6">
      <p {...riseProps(2, `mb-2 ${eyebrow}`)}>{labels.orgHome.actionsHeading}</p>
      <button
        type="button"
        onClick={() => setView('assistance')}
        {...riseProps(2, `press-scale flex w-full items-center gap-4 rounded-[14px] px-5 py-4 text-left text-white ${theme.header}`)}
      >
        <Package size={22} className="shrink-0" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[16px] font-semibold">{labels.orgHome.distribute}</span>
          <span className={`mt-0.5 block text-[12.5px] leading-[1.4] ${theme.mutedOn}`}>{labels.orgHome.distributeSub}</span>
        </span>
        <ArrowRight size={18} className="shrink-0" aria-hidden="true" />
      </button>
      <ul {...riseProps(3, `mt-3 ${surface}`)}>
        {secondaryActions.map(({ icon: Icon, title, sub, target }) => (
          <li key={target} className="border-t-[0.5px] border-cz-border first:border-t-0">
            <button
              type="button"
              onClick={() => setView(target)}
              className="press-scale flex w-full items-center gap-3.5 px-5 py-3.5 text-left transition-colors hover:bg-cz-page/60"
            >
              <Icon size={19} className={`shrink-0 ${theme.accentText}`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-[14.5px] font-semibold text-cz-text">{title}</span>
                <span className="mt-0.5 block text-[12.5px] leading-[1.4] text-cz-text-2">{sub}</span>
              </span>
              <ChevronRight size={17} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  )

  const rosterCard = (
    <section {...riseProps(4, `mt-4 lg:mt-0 ${surface}`)}>
      <div className="flex items-center gap-2 px-5 pb-2 pt-4">
        <UsersIcon size={16} className="text-cz-text-2" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-cz-text">{labels.orgHome.officerRosterCardTitle}</p>
      </div>
      <ul>
        {domain.officerPositions.map((position) => {
          const o = officerByPosition[position]
          return (
            <li key={position} className="flex items-center justify-between gap-3 border-t-[0.5px] border-cz-border px-5 py-3">
              <p className="text-[13px] text-cz-text-2">{position}</p>
              {o ? (
                <p className="truncate text-[14px] font-semibold text-cz-text">{o.full_name}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => setView('assignOfficer')}
                  className="press-scale rounded-full border border-dashed border-cz-alert-accent px-2.5 py-0.5 text-[11px] font-semibold text-cz-alert-title transition-colors hover:bg-cz-alert-bg"
                >
                  + {labels.orgHome.assignNow}
                </button>
              )}
            </li>
          )
        })}
      </ul>
      {/* Mirrors the staff detail page, where "Officer History" sits with the
          officer roster. One row inside the card so it reads as part of the
          roster at every width (the card renders once per breakpoint layout). */}
      <button
        type="button"
        onClick={() => setView('officerHistory')}
        className={`press-scale flex w-full items-center gap-2 border-t-[0.5px] border-cz-border px-5 py-3 text-left text-[13px] font-medium transition-colors hover:bg-cz-page/60 ${theme.accentText}`}
      >
        <History size={15} aria-hidden="true" />
        <span className="flex-1">{labels.orgHome.officerHistory}</span>
        <ChevronRight size={16} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
      </button>
    </section>
  )

  // Mobile-only in-content shortcut — a plain link to the History screen. The
  // reference never draws this on desktop; the sidebar's own "Kasaysayan"
  // item already covers that width.
  const historyLink = (
    <button
      type="button"
      onClick={() => setView('history')}
      className={`press-scale mt-4 flex items-center gap-2 text-[13px] font-medium ${theme.accentText} lg:hidden`}
    >
      <History size={15} aria-hidden="true" />
      {labels.orgHome.historyLinkLabel}
    </button>
  )

  return (
    <OrgShell theme={theme} chipLabel={record?.label} active="home" onNav={goHomeOrNav} tabBar={tabBar('home')} wide>
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-5">
        <div className="min-w-0 lg:sticky lg:top-20">
          {masthead}
          {statusStrip}
          {errorBlock}
          {actionsSection}
          {historyLink}
          <div className="lg:hidden">{rosterCard}</div>
        </div>
        <div className="hidden lg:sticky lg:top-20 lg:block">{rosterCard}</div>
      </div>
    </OrgShell>
  )
}
