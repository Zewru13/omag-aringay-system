import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle, ClipboardList, Home, UserPlus, Users, UserCog,
} from 'lucide-react'
import api from '../../api/axiosInstance.js'
import MyOrgReportingSection from './MyOrgReportingSection.jsx'
import OrgAddMemberScreen from './OrgAddMemberScreen.jsx'
import OrgAssignOfficerScreen from './OrgAssignOfficerScreen.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import OrgRemoveMemberDialog from './OrgRemoveMemberDialog.jsx'
import { labels } from './labels.js'
import {
  CITIZEN_GUTTER, CitizenBody, CitizenEmptyState, CitizenHomeHeader, CitizenScreen,
  CitizenSubHeader, CitizenTabBar, SecondaryRow, SecondaryRows, SectionHeading,
} from './citizenUI.jsx'

// Batch 2: the real ORGANIZATION dashboard, replacing the two-tab
// (Overview | Report Assistance) placeholder that CitizenHomePage used to
// render for org accounts.
//
// Everything numeric here is derived from live responses — member count
// from the member list's length, filled/total positions from the officer
// list measured against domain.officerPositions. Nothing is hardcoded,
// which matters because the two organization types genuinely differ in
// how membership is stored (see orgDomainConfig).

export default function OrganizationHomeScreen({ record, recordType, domain, onLogout }) {
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

  // Vacancy is computed against the domain's REAL position set (seven, per
  // the backend's POSITION_CHOICES), not an assumed five.
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

  // Which member (if any) currently holds a position — drives the extra
  // sentence in the remove-member confirmation.
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

  // ── Full-screen sub-views ────────────────────────────────────────────
  if (view === 'addMember') {
    return (
      <OrgAddMemberScreen
        domain={domain}
        orgId={orgId}
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
        members={members}
        officerByPosition={officerByPosition}
        onBack={() => setView('home')}
        onSuccess={() => { refresh(); setView('home') }}
      />
    )
  }

  if (view === 'assistance') {
    return (
      <CitizenScreen hasTabBar>
        <CitizenSubHeader
          theme={theme}
          title={labels.orgHome.distribute}
          onBack={() => setView('home')}
        />
        <CitizenBody>
          <MyOrgReportingSection domain={domain} orgId={orgId} orgName={record?.label} />
        </CitizenBody>
        <div className="h-4" />
        {tabBar('assistance')}
      </CitizenScreen>
    )
  }

  if (view === 'members') {
    return (
      <CitizenScreen hasTabBar>
        <CitizenSubHeader
          theme={theme}
          title={labels.orgHome.membersHeading}
          subtitle={labels.orgHome.membersCount(members.length)}
          onBack={() => setView('home')}
        />
        <CitizenBody>
          {members.length === 0 ? (
            <CitizenEmptyState
              icon={Users}
              iconClass={theme.accentText}
              title={labels.orgHome.membersEmpty}
            />
          ) : (
            <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
              {members.map((m, i) => {
                const personId = domain.rowPersonId(m)
                const position = positionOfPerson(personId)
                return (
                  <li
                    key={m.id}
                    className={`flex items-center gap-3 px-[14px] py-[11px] ${
                      i === members.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
                    }`}
                  >
                    <OrgAvatar name={domain.rowName(m)} id={personId} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-cz-text">{domain.rowName(m)}</p>
                      <p className="truncate text-[12px] text-cz-text-2">
                        {domain.rowBarangay(m) || labels.common.unknown}
                      </p>
                    </div>
                    {position && (
                      <span className={`shrink-0 rounded-full px-2 py-[3px] text-[10px] font-medium ${theme.tileSelectedBg} ${theme.accentText}`}>
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
          )}
        </CitizenBody>
        <div className="h-4" />
        {tabBar('members')}
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
      </CitizenScreen>
    )
  }

  // ── Home ─────────────────────────────────────────────────────────────
  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader
        theme={theme}
        name={record?.label || labels.common.unknown}
        metaLine={labels.orgHome.addressLine(record?.barangay || labels.common.unknown)}
        onLogout={onLogout}
      />

      {/* Identity strip: type badge + the two live stats. */}
      <section className={`${CITIZEN_GUTTER} -mt-3`}>
        <div className="rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[14px]">
          <span className={`inline-block rounded-full px-2 py-[3px] text-[11px] font-medium ${theme.tileSelectedBg} ${theme.accentText}`}>
            {isFisherfolk ? labels.orgHome.typeBadgeFisherfolk : labels.orgHome.typeBadgeFarmers}
          </span>
          <div className="mt-3 flex gap-8">
            <div>
              <p className="text-[10px] font-medium tracking-[0.05em] text-cz-text-2">
                {labels.orgHome.statMembers.toUpperCase()}
              </p>
              <p className="mt-[2px] text-[22px] font-medium tabular-nums text-cz-text">
                {isLoading ? '—' : members.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-medium tracking-[0.05em] text-cz-text-2">
                {labels.orgHome.statPositions.toUpperCase()}
              </p>
              <p className="mt-[2px] text-[22px] font-medium tabular-nums text-cz-text">
                {isLoading
                  ? '—'
                  : labels.orgHome.positionsOf(filledPositions.length, domain.officerPositions.length)}
              </p>
            </div>
          </div>
        </div>
      </section>

      {hasError && (
        <div className={`${CITIZEN_GUTTER} mt-3`}>
          <div className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
            <p className="text-[13px] text-cz-danger-body">{labels.orgHome.loadFailed}</p>
            <button
              type="button"
              onClick={refresh}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-danger-accent px-3 py-[11px] text-cz-danger-body"
            >
              <span className="text-[14px] font-medium">{labels.orgHome.retry}</span>
            </button>
          </div>
        </div>
      )}

      {!isLoading && !hasError && vacantPositions.length > 0 && (
        <div className={`${CITIZEN_GUTTER} mt-3`}>
          <div className="flex gap-2 rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg p-3">
            <AlertTriangle size={16} className="mt-px shrink-0 text-cz-warn-accent" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-medium text-cz-warn-title">{labels.orgHome.vacancyTitle}</p>
              <p className="mt-[2px] text-[12px] leading-[1.5] text-cz-warn-body">
                {labels.orgHome.vacancyBody(vacantPositions.join(', '))}
              </p>
            </div>
          </div>
        </div>
      )}

      <section className={`${CITIZEN_GUTTER} mt-4`}>
        <SectionHeading>{labels.orgHome.actionsHeading}</SectionHeading>
        <SecondaryRows>
          <SecondaryRow
            icon={UserPlus}
            label={labels.orgHome.addMember}
            onClick={() => setView('addMember')}
          />
          <SecondaryRow
            icon={UserCog}
            label={labels.orgHome.assignOfficer}
            onClick={() => setView('assignOfficer')}
          />
          <SecondaryRow
            icon={ClipboardList}
            label={labels.orgHome.distribute}
            onClick={() => setView('assistance')}
            isLast
          />
        </SecondaryRows>
      </section>

      <section className={`${CITIZEN_GUTTER} mt-4`}>
        <SectionHeading>{labels.orgHome.officerRosterHeading}</SectionHeading>
        <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
          {domain.officerPositions.map((position, i) => {
            const o = officerByPosition[position]
            return (
              <li
                key={position}
                className={`flex items-center gap-3 px-[14px] py-[11px] ${
                  i === domain.officerPositions.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
                }`}
              >
                {o ? (
                  <OrgAvatar name={o.full_name} id={domain.officerPersonId(o)} size={34} />
                ) : (
                  <span
                    className="inline-flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full border border-dashed border-cz-warn-border text-cz-warn-accent"
                    aria-hidden="true"
                  >
                    +
                  </span>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-medium tracking-[0.05em] text-cz-text-2">
                    {position.toUpperCase()}
                  </p>
                  {o ? (
                    <p className="mt-[1px] truncate text-[14px] font-medium text-cz-text">{o.full_name}</p>
                  ) : (
                    <span className="mt-[2px] inline-block rounded-full bg-cz-warn-bg px-2 py-[2px] text-[10px] font-medium text-cz-warn-accent">
                      {labels.orgHome.vacant}
                    </span>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      </section>

      <section className={`${CITIZEN_GUTTER} mt-4`}>
        <SectionHeading>{labels.orgHome.membersCount(isLoading ? 0 : members.length)}</SectionHeading>
        {isLoading ? (
          <p className="text-[13px] italic text-cz-text-2">{labels.orgHome.membersLoading}</p>
        ) : members.length === 0 ? (
          <CitizenEmptyState
            icon={Users}
            iconClass={theme.accentText}
            title={labels.orgHome.membersEmpty}
          />
        ) : (
          <div className="grid grid-cols-2 gap-[10px]">
            {members.map((m) => {
              const personId = domain.rowPersonId(m)
              const position = positionOfPerson(personId)
              return (
                <div
                  key={m.id}
                  className="rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[14px]"
                >
                  <OrgAvatar name={domain.rowName(m)} id={personId} />
                  <p className="mt-[10px] truncate text-[14px] font-medium text-cz-text">
                    {domain.rowName(m)}
                  </p>
                  <p className="truncate text-[12px] text-cz-text-2">
                    {domain.rowBarangay(m) || labels.common.unknown}
                  </p>
                  {position && (
                    <span className={`mt-2 inline-block rounded-full px-2 py-[3px] text-[10px] font-medium ${theme.tileSelectedBg} ${theme.accentText}`}>
                      {position}
                    </span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      <section className={`${CITIZEN_GUTTER} mt-4`}>
        <SectionHeading>{labels.orgHome.secondaryHeading}</SectionHeading>
        <SecondaryRows>
          <SecondaryRow
            icon={ClipboardList}
            label={labels.orgHome.reportingHistory}
            onClick={() => setView('assistance')}
            isLast
          />
        </SecondaryRows>
      </section>

      <div className="h-4" />
      {tabBar('home')}
    </CitizenScreen>
  )
}
