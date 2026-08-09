import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ClipboardList, FileText, Home, Info, UserPlus, Users, UserCog, UserSearch,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import MyOrgReportingSection from './MyOrgReportingSection.jsx'
import OrgReportAssistanceScreen from './OrgReportAssistanceScreen.jsx'
import OrgReportHistoryScreen from './OrgReportHistoryScreen.jsx'
import OrgAddMemberScreen from './OrgAddMemberScreen.jsx'
import OrgAssignOfficerScreen from './OrgAssignOfficerScreen.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import OrgInfoScreen from './OrgInfoScreen.jsx'
import OrgRemoveMemberDialog from './OrgRemoveMemberDialog.jsx'
import {
  OrgActionRow, OrgAlertBanner, OrgAppBar, OrgHeroCard, OrgMemberCard,
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
  const [removeTarget, setRemoveTarget] = useState(null)

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

  const tabBar = (active) => (
    <CitizenTabBar
      theme={theme}
      active={active}
      items={[
        { key: 'home', icon: Home, label: labels.tabBar.home, onClick: () => setView('home') },
        { key: 'members', icon: Users, label: labels.orgHome.membersHeading, onClick: () => setView('members') },
        { key: 'assistance', icon: ClipboardList, label: labels.orgHome.distribute, onClick: () => setView('assistance') },
      ]}
    />
  )

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
        members={members}
        officerByPosition={officerByPosition}
        onBack={() => setView('home')}
        onSuccess={() => { refresh(); setView('home') }}
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
        tabBar={tabBar('assistance')}
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
      />
    )
  }

  // Per-member reporting (search one member, report/edit a single record).
  // The reference has no screen for it, but it is real capability from
  // Batch 12 and is NOT dropped — it keeps its own entry point below the
  // reference's own rows.
  if (view === 'perMember') {
    return (
      <OrgScreen
        title={labels.orgReporting.reportForMemberTitle}
        chipLabel={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar(null)}
        wide
      >
        <MyOrgReportingSection domain={domain} orgId={orgId} orgName={record?.label} />
      </OrgScreen>
    )
  }

  if (view === 'members') {
    return (
      <OrgScreen
        title={labels.orgHome.membersHeading}
        chipLabel={record?.label}
        onBack={() => setView('home')}
        tabBar={tabBar('members')}
        wide
      >
        <OrgSectionLabel>{labels.orgHome.membersCount(members.length)}</OrgSectionLabel>
        <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {members.map((m, i) => {
            const personId = domain.rowPersonId(m)
            const position = positionOfPerson(personId)
            return (
              <li
                key={m.id}
                className={`flex items-center gap-3 px-4 py-3 ${
                  i === members.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
                }`}
              >
                <OrgAvatar name={domain.rowName(m)} id={personId} size={38} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-cz-text">{domain.rowName(m)}</p>
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
                  onClick={() => setRemoveTarget(m)}
                  className="shrink-0 rounded-[8px] px-2 py-2 text-[12px] font-medium text-cz-danger-accent transition-colors hover:bg-cz-danger-bg"
                >
                  {labels.orgRemoveMember.confirm}
                </button>
              </li>
            )
          })}
        </ul>
        {removeTarget && (
          <OrgRemoveMemberDialog
            domain={domain}
            orgId={orgId}
            row={removeTarget}
            heldPosition={positionOfPerson(domain.rowPersonId(removeTarget))}
            onClose={() => setRemoveTarget(null)}
            onSuccess={() => { setRemoveTarget(null); refresh() }}
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
      </section>

      {/* "Iba pa" rows — History, and the Organization Info entry point the
          profile self-editing backend needs a home for. */}
      <div className="space-y-2.5">
        <OrgActionRow
          icon={FileText} tone="slate" showChevron
          title={labels.orgHome.reportingHistory} subtitle={labels.orgHome.reportingHistorySub}
          onClick={() => setView('history')}
        />
        <OrgActionRow
          icon={UserSearch} tone="slate" showChevron
          title={labels.orgHome.perMemberRow} subtitle={labels.orgHome.perMemberRowSub}
          onClick={() => setView('perMember')}
        />
        <OrgActionRow
          icon={Info} tone="slate" showChevron
          title={labels.orgHome.orgInfoRow} subtitle={labels.orgHome.orgInfoRowSub}
          onClick={() => setView('orgInfo')}
        />
      </div>
    </div>
  )

  const memberGrid = (
    <section>
      <OrgSectionLabel>{labels.orgHome.membersCount(isLoading ? 0 : members.length)}</OrgSectionLabel>
      {isLoading ? (
        <p className="text-[13px] italic text-cz-text-2">{labels.orgHome.membersLoading}</p>
      ) : members.length === 0 ? (
        <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
          {labels.orgHome.membersEmpty}
        </p>
      ) : (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
          {members.map((m) => {
            const personId = domain.rowPersonId(m)
            return (
              <OrgMemberCard
                key={m.id}
                name={domain.rowName(m)}
                barangay={domain.rowBarangay(m)}
                role={positionOfPerson(personId)}
                personId={personId}
              />
            )
          })}
        </div>
      )}
    </section>
  )

  return (
    <div className="min-h-screen w-full bg-cz-org-panel">
      <OrgAppBar title={labels.orgHome.dashboardTitle} chipLabel={record?.label} />
      <main className="mx-auto w-full max-w-[1240px] px-4 pb-[calc(72px+env(safe-area-inset-bottom))] pt-4 sm:px-6 sm:pb-10">
        {/* Mobile/tablet: one column, hero → alert → actions → roster →
            history, then members. Desktop (1024px+): two columns, exactly as
            image10/image11 draw them. */}
        <div className="lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-6">
          {leftColumn}
          <div className="mt-6 lg:mt-0">{memberGrid}</div>
        </div>
      </main>
      {tabBar('home')}
    </div>
  )
}
