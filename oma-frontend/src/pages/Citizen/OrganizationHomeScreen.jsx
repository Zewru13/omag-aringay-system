import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList, FileText, Gift, History, Home, Info, Power, UserPlus, UserCog,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import CitizenReportAssistanceModal from './CitizenReportAssistanceModal.jsx'
import MyOrgReportingSection from './MyOrgReportingSection.jsx'
import OrgHelpScreen from './OrgHelpScreen.jsx'
import OrgReportAssistanceScreen from './OrgReportAssistanceScreen.jsx'
import OrgReportHistoryScreen from './OrgReportHistoryScreen.jsx'
import OrgAddMemberScreen from './OrgAddMemberScreen.jsx'
import OrgAssignOfficerScreen from './OrgAssignOfficerScreen.jsx'
import OrgOfficerHistoryScreen from './OrgOfficerHistoryScreen.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import OrgInfoScreen from './OrgInfoScreen.jsx'
import OrgSetMemberActiveDialog from './OrgSetMemberActiveDialog.jsx'
import {
  OrgActionRow, OrgAlertBanner, OrgHeroCard,
  OrgOfficerRoster, OrgScreen, OrgSectionLabel,
} from './OrgDashboardParts.jsx'
import { labels } from './labels.js'
import { CitizenTabBar } from './citizenUI.jsx'

// Batch: the Organization dashboard rebuilt against the approved reference
// images — image2 (top of scroll) and image1 (scrolled) for mobile,
// image10/image11 for desktop.
//
// ONE component, two layouts. The reference shows the same content
// reflowing, not two different pages: below 1024px everything stacks in the
// order image2/image1 draw it; at 1024px+ the left column carries hero →
// alert → actions → roster → history and the right column carries the member
// grid, exactly as image10/image11 show. The right column deliberately ends
// where the members end (image11 leaves that space empty).
//
// Numbers are real, never the mockup's literals: KASAPI is the member list's
// length and POSISYON is the officer list measured against the domain's
// actual position set — seven, where the mockup draws five.

export default function OrganizationHomeScreen({ record, recordType, domain }) {
  const theme = domain.theme
  const isFisherfolk = recordType === 'FISHERFOLK_ORG'
  const orgId = record?.id

  const [view, setView] = useState('home')
  const [members, setMembers] = useState([])
  const [officers, setOfficers] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)
  const [activeTarget, setActiveTarget] = useState(null) // { row, targetActive }
  const [reportTarget, setReportTarget] = useState(null)
  // Persisted at this level, not inside OrgScreen, because every sub-view is
  // a fresh mount of a different component — a JS breakpoint would forget
  // the collapse state on every navigation otherwise.
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

  const positionOfPerson = useCallback(
    (personId) => {
      const hit = officers.find((o) => domain.officerPersonId(o) === personId)
      return hit ? hit.position : null
    },
    [officers, domain],
  )

  // Below 640px: bottom tab bar. At 640px+: left nav rail (OrgScreen renders
  // it when `onNav` is supplied) — both read the exact same 3 destinations
  // and the same `view` state, so they can never drift apart.
  const tabBar = (active) => (
    <CitizenTabBar
      theme={theme}
      active={active}
      items={[
        { key: 'home', icon: Home, label: labels.tabBar.home, onClick: () => setView('home') },
        { key: 'history', icon: FileText, label: labels.orgHome.reportingHistory, onClick: () => setView('history') },
        { key: 'orgInfo', icon: Info, label: labels.orgHome.orgInfoRow, onClick: () => setView('orgInfo') },
      ]}
    />
  )
  const railProps = {
    active: view,
    onNav: setView,
    railCollapsed,
    onToggleRail: () => setRailCollapsed((v) => !v),
  }

  // ── Sub-views ────────────────────────────────────────────────────────
  if (view === 'addMember') {
    return (
      <OrgAddMemberScreen
        domain={domain}
        orgId={orgId}
        orgName={record?.label}
        existingMemberIds={members.map((m) => domain.rowPersonId(m))}
        onBack={() => setView('home')}
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
        {...railProps}
      />
    )
  }

  if (view === 'orgInfo') {
    return (
      <OrgInfoScreen
        record={record}
        domain={domain}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        onRecordChanged={refresh}
        {...railProps}
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
      />
    )
  }

  if (view === 'history') {
    return (
      <OrgReportHistoryScreen
        domain={domain}
        orgName={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        {...railProps}
      />
    )
  }

  if (view === 'help') {
    return (
      <OrgHelpScreen
        domain={domain}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        {...railProps}
      />
    )
  }

  if (view === 'members') {
    return (
      <OrgScreen
        title={labels.orgHome.membersHeading}
        chipLabel={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        theme={theme}
        wide
        {...railProps}
      >
        {/* Individual "search one member, log/edit" flow — relocated here
            (unchanged internally) from a Home secondary row so Home can
            drop to its required single link. Its own history table and its
            own Distribute-to-Organization button are untouched; nothing
            about this component changed, only where it's mounted. */}
        <MyOrgReportingSection domain={domain} orgId={orgId} orgName={record?.label} />

        <div className="mt-6">
          <OrgSectionLabel>{labels.orgHome.membersCount(members.length)}</OrgSectionLabel>
          <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {members.map((m, i) => {
              const personId = domain.rowPersonId(m)
              const position = positionOfPerson(personId)
              const isActive = domain.rowIsActive(m)
              return (
                <li
                  key={m.id}
                  className={`stagger-item flex items-center gap-3 px-4 py-3 transition-opacity ${
                    i === members.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
                  } ${isActive ? '' : 'opacity-50'}`}
                  style={{ '--stagger-index': i }}
                >
                  <OrgAvatar name={domain.rowName(m)} id={personId} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[15px] font-semibold text-cz-text">
                      {domain.rowName(m)}
                      {!isActive && (
                        <span className="shrink-0 rounded-[5px] bg-cz-tile-slate-bg px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-tile-slate-fg">
                          {labels.orgMemberActive.inactiveBadge}
                        </span>
                      )}
                    </p>
                    <p className="truncate text-[13px] text-cz-text-2">
                      {domain.rowBarangay(m) ? `Brgy. ${domain.rowBarangay(m)}` : labels.common.unknown}
                    </p>
                  </div>
                  {position && (
                    <span className="shrink-0 rounded-[5px] bg-cz-role-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-role-fg">
                      {position}
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={() => setReportTarget(m)}
                    title={labels.orgHome.memberReportAction}
                    className="shrink-0 rounded-[8px] p-2 text-cz-text-2 transition-colors hover:bg-cz-org-panel"
                  >
                    <Gift size={16} aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTarget({ row: m, targetActive: !isActive })}
                    title={isActive ? labels.orgMemberActive.deactivateAction : labels.orgMemberActive.activateAction}
                    className={`shrink-0 rounded-[8px] p-2 transition-colors ${
                      isActive
                        ? 'text-cz-danger-accent hover:bg-cz-danger-bg'
                        : 'text-cz-tile-blue-fg hover:bg-cz-tile-blue-bg'
                    }`}
                  >
                    <Power size={16} aria-hidden="true" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>

        {activeTarget && (
          <OrgSetMemberActiveDialog
            domain={domain}
            orgId={orgId}
            row={activeTarget.row}
            targetActive={activeTarget.targetActive}
            heldPosition={positionOfPerson(domain.rowPersonId(activeTarget.row))}
            onClose={() => setActiveTarget(null)}
            onSuccess={() => { setActiveTarget(null); refresh() }}
          />
        )}
        {reportTarget && (
          <CitizenReportAssistanceModal
            domain={domain}
            member={reportTarget}
            entry={null}
            onClose={() => setReportTarget(null)}
            onSuccess={refresh}
          />
        )}
      </OrgScreen>
    )
  }

  // ── Dashboard ────────────────────────────────────────────────────────
  const leftColumn = (
    <div className="space-y-4">
      <OrgHeroCard
        theme={theme}
        typeLabel={isFisherfolk ? labels.orgHome.typeBadgeFisherfolk : labels.orgHome.typeBadgeFarmers}
        name={record?.label || labels.common.unknown}
        addressLine={labels.orgHome.addressLine(record?.barangay || labels.common.unknown)}
        memberCount={members.length}
        filled={filledPositions.length}
        total={domain.officerPositions.length}
        isLoading={isLoading}
        onMembersClick={() => setView('members')}
      />

      {hasError && (
        <div className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
          <p className="text-[13px] text-cz-danger-body">{labels.orgHome.loadFailed}</p>
          <button
            type="button"
            onClick={refresh}
            className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-danger-accent"
          >
            <span className="text-[14px] font-medium text-cz-danger-body">{labels.orgHome.retry}</span>
          </button>
        </div>
      )}

      {!isLoading && !hasError && vacantPositions.length > 0 && (
        <OrgAlertBanner positions={vacantPositions.join(', ')} />
      )}

      <section>
        <OrgSectionLabel>{labels.orgHome.actionsHeading}</OrgSectionLabel>
        <div className="space-y-2.5">
          <OrgActionRow
            icon={UserPlus} tone="blue"
            title={labels.orgHome.addMember} subtitle={labels.orgHome.addMemberSub}
            onClick={() => setView('addMember')}
          />
          <OrgActionRow
            icon={UserCog} tone="amber"
            title={labels.orgHome.assignOfficer} subtitle={labels.orgHome.assignOfficerSub}
            onClick={() => setView('assignOfficer')}
          />
          <OrgActionRow
            icon={ClipboardList} tone="green"
            title={labels.orgHome.distribute} subtitle={labels.orgHome.distributeSub}
            onClick={() => setView('assistance')}
          />
        </div>
      </section>

      <section>
        <OrgSectionLabel>{labels.orgHome.officerRosterHeading}</OrgSectionLabel>
        <OrgOfficerRoster
          positions={domain.officerPositions}
          officerByPosition={officerByPosition}
          officerPersonId={domain.officerPersonId}
        />
        <div className="mt-2.5">
          <OrgActionRow
            icon={History} tone="slate" showChevron
            title={labels.orgHome.officerHistory} subtitle={labels.orgHome.officerHistorySub}
            onClick={() => setView('officerHistory')}
          />
        </div>
      </section>

      {/* Exactly ONE secondary link, per spec — Members and Impormasyon are
          each their own real navigation destination now (member stat above,
          and the persistent Home/History/Impormasyon nav), so neither
          belongs here as a duplicate row. */}
      <div className="space-y-2.5">
        <OrgActionRow
          icon={FileText} tone="slate" showChevron
          title={labels.orgHome.reportingHistory} subtitle={labels.orgHome.reportingHistorySub}
          onClick={() => setView('history')}
        />
      </div>
    </div>
  )

  // Members no longer renders inline here — it's its own destination,
  // reached by the hero card's tappable member stat, so Home stays lean:
  // identity, both stats, vacancy banner, the 3 Quick Actions, the full
  // roster, and exactly one secondary link.
  return (
    <OrgScreen
      title={labels.orgHome.dashboardTitle} chipLabel={record?.label} theme={theme}
      tabBar={tabBar('home')} wide {...railProps}
    >
      <div className="mx-auto max-w-[640px]">{leftColumn}</div>
    </OrgScreen>
  )
}
