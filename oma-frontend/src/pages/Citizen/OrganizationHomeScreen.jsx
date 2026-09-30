import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronRight, ClipboardList, History, Home, Package, UserCheck, UserCog, UserPlus, Users as UsersIcon } from 'lucide-react'
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
import {
  OrgActionTile, OrgAlertBanner, OrgPageHeader, OrgShell, OrgStatCard,
} from './OrgDashboardParts.jsx'
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
  // Preserved for OrgHelpScreen.jsx, which still uses the OLD
  // OrgScreen/OrgNavRail shell (out of scope) — that shell's
  // hamburger toggle needs real state here, not a no-op, or their existing
  // collapse behavior would silently stop working when reached from the
  // rebuilt Home. OrgInfoScreen.jsx moved onto the new OrgShell (2026-09-07,
  // matching Home's white sidebar + green header per direct user request)
  // and no longer needs this — it manages its own collapse via OrgShell's
  // internal useSidebarCollapsed, same as every other rebuilt screen.
  const [railCollapsed, setRailCollapsed] = useState(false)

  const refresh = useCallback(() => setReloadKey((k) => k + 1), [])

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
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        active={null}
        onNav={goHomeOrNav}
        railCollapsed={railCollapsed}
        onToggleRail={() => setRailCollapsed((v) => !v)}
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
  // Trial (2026-09-20, one page only — see conversation): plain title +
  // subtitle, reusing OrgPageHeader exactly as every org sub-screen already
  // does, in place of the bordered white identity card (name + type-badge
  // pill + MapPin/Hash icon rows) that was here before. Org type moved from
  // a colored pill into the subtitle as plain text — same existing label
  // (labels.orgHome.typeBadgeFarmers/Fisherfolk) the pill used to show,
  // just reused as text instead of a badge now. domain.key (already a
  // clean farmers_org/fisherfolk_org discriminator — see orgDomainConfig.js)
  // stands in for the recordType prop removed in the trial, rather than
  // bringing that prop back just to re-derive the same thing.
  const orgTypeLabel = domain.key === 'farmers_org'
    ? labels.orgHome.typeBadgeFarmers
    : labels.orgHome.typeBadgeFisherfolk
  const identityCard = (
    <OrgPageHeader
      title={record?.label || labels.common.unknown}
      subtitle={
        `${orgTypeLabel} · ${labels.orgHome.addressLine(record?.barangay || labels.common.unknown)}`
        + (record?.registration_number ? ` · ${record.registration_number}` : '')
      }
    />
  )

  const statCards = (
    <div className="mt-4 grid grid-cols-2 gap-3">
      <OrgStatCard
        theme={theme}
        value={members.length}
        label={labels.orgHome.statMembers}
        sub={labels.orgHome.viewMembers}
        isLoading={isLoading}
        onClick={() => setView('members')}
      />
      <OrgStatCard
        theme={theme}
        value={`${filledPositions.length}/${domain.officerPositions.length}`}
        label={labels.orgHome.statPositions}
        sub={vacantPositions.length > 0 ? labels.orgHome.vacantCount(vacantPositions.length) : undefined}
        isLoading={isLoading}
        tone={vacantPositions.length > 0 ? 'warn' : undefined}
      />
    </div>
  )

  const actionsSection = (
    <section className="mt-4">
      <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-text-2">{labels.orgHome.actionsHeading}</p>
      <div className="grid grid-cols-2 gap-2.5">
        <OrgActionTile theme={theme} icon={UserPlus} title={labels.orgHome.addMember} onClick={() => setView('addMember')} />
        <OrgActionTile theme={theme} icon={UserCog} title={labels.orgHome.assignOfficer} onClick={() => setView('assignOfficer')} />
        <OrgActionTile theme={theme} icon={Package} title={labels.orgHome.distribute} onClick={() => setView('assistance')} />
        <OrgActionTile theme={theme} icon={UserCheck} title={labels.orgHome.confirmOnBehalf} onClick={() => setView('confirmables')} />
      </div>
    </section>
  )

  const rosterCard = (
    <section className="mt-4 overflow-hidden rounded-[14px] border-[0.5px] border-cz-border bg-white">
      <div className="flex items-center gap-2 border-b-[0.5px] border-cz-border px-4 py-3">
        <UsersIcon size={16} className="text-cz-text-2" aria-hidden="true" />
        <p className="text-[14px] font-semibold text-cz-text">{labels.orgHome.officerRosterCardTitle}</p>
      </div>
      <ul>
        {domain.officerPositions.map((position, i) => {
          const o = officerByPosition[position]
          return (
            <li
              key={position}
              className={`flex items-center justify-between gap-3 px-4 py-3 ${i === domain.officerPositions.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
            >
              <p className="text-[13px] text-cz-text-2">{position}</p>
              {o ? (
                <p className="truncate text-[14px] font-semibold text-cz-text">{o.full_name}</p>
              ) : (
                <span className="inline-block rounded-full bg-cz-tile-amber-bg px-2 py-0.5 text-[10px] font-bold tracking-[0.02em] text-cz-tile-amber-fg">{labels.orgHome.vacant}</span>
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
        className={`flex w-full items-center gap-2 border-t-[0.5px] border-cz-border px-4 py-3 text-left text-[13px] font-medium transition-colors hover:bg-cz-page ${theme.accentText}`}
      >
        <History size={15} aria-hidden="true" />
        <span className="flex-1">{labels.orgHome.officerHistory}</span>
        <ChevronRight size={16} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
      </button>
    </section>
  )

  // Mobile-only in-content shortcut (image14/16) — a plain link to the
  // History screen that sits between the action tiles and the officer
  // roster. The reference never draws this on desktop; the sidebar's own
  // "Kasaysayan" item already covers that width.
  const historyLink = (
    <button
      type="button"
      onClick={() => setView('history')}
      className={`mt-4 flex items-center gap-2 text-[13px] font-medium ${theme.accentText} lg:hidden`}
    >
      <History size={15} aria-hidden="true" />
      {labels.orgHome.historyLinkLabel}
    </button>
  )

  return (
    <OrgShell theme={theme} chipLabel={record?.label} active="home" onNav={goHomeOrNav} tabBar={tabBar('home')} wide>
      <div className="lg:grid lg:grid-cols-[1fr_360px] lg:items-start lg:gap-5">
        <div className="min-w-0 lg:sticky lg:top-20">
          {identityCard}
          {statCards}
          {hasError && (
            <div className="mt-4 rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
              <p className="text-[13px] text-cz-danger-body">{labels.orgHome.loadFailed}</p>
              <button type="button" onClick={refresh} className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-danger-accent">
                <span className="text-[14px] font-medium text-cz-danger-body">{labels.orgHome.retry}</span>
              </button>
            </div>
          )}
          {!isLoading && !hasError && vacantPositions.length > 0 && (
            <div className="mt-4"><OrgAlertBanner positions={vacantPositions.join(', ')} /></div>
          )}
          {actionsSection}
          {historyLink}
          <div className="lg:hidden">{rosterCard}</div>
        </div>
        <div className="hidden lg:sticky lg:top-20 lg:block">{rosterCard}</div>
      </div>
    </OrgShell>
  )
}
