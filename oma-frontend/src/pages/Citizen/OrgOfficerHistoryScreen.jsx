import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'
import { OrgListSkeleton, OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'
import { ORG_SURFACE, useOrgIntro } from './orgStyles.js'

// Read-only: every past + present officer per position, mirroring the
// staff-side Officer History modal on OrganizationDetailPage. Same
// ?history=1 endpoint the roster already uses for current-only reads.
// Reached from the "Kasaysayan ng mga Opisyal" row under the officer roster
// on the Organization home.
//
// Laid out wide and horizontal: a term history is a table (who, which
// position, when, how it ended), so from 640px up it is a real table across
// the full content width, one officer per row. Below that a table would
// squeeze into unreadable columns, so it falls back to one stacked card per
// officer.
const STATUS = {
  current: 'bg-cz-badge-green text-[#15803D]',
  early: 'bg-cz-badge-pink text-[#BE185D]',
  done: 'bg-cz-tile-slate-bg text-cz-tile-slate-fg',
}

function statusOf(o) {
  const H = labels.orgOfficerHistory
  if (o.is_active) return { cls: STATUS.current, text: H.statusCurrent }
  if (o.early_exit_reason) return { cls: STATUS.early, text: H.statusEndedEarly }
  return { cls: STATUS.done, text: H.statusCompleted }
}

function StatusBadge({ officer }) {
  const { cls, text } = statusOf(officer)
  return (
    <span className={`inline-block shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] ${cls}`}>
      {text}
    </span>
  )
}

export default function OrgOfficerHistoryScreen({ domain, orgId, orgName, onBack, tabBar, active, onNav }) {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const intro = useOrgIntro(!isLoading)
  const H = labels.orgOfficerHistory
  const fmt = labels.common.formatDate

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setHasError(false)
    api.get(`${domain.officersUrl(orgId)}?history=1`)
      .then((r) => { if (!cancelled) setRows(Array.isArray(r.data) ? r.data : (r.data?.results || [])) })
      .catch(() => { if (!cancelled) setHasError(true) })
      .finally(() => { if (!cancelled) setIsLoading(false) })
    return () => { cancelled = true }
  }, [domain, orgId])

  const th = 'px-5 py-3 text-left text-[12px] font-semibold text-cz-text-2'
  const td = 'px-5 py-3.5 align-top text-[13.5px] text-cz-text-2'

  return (
    <OrgShell
      theme={domain.dashboardTheme}
      chipLabel={orgName}
      active={active}
      onNav={(key) => (key === 'home' ? onBack() : onNav(key))}
      tabBar={tabBar}
      wide
    >
      <OrgPageHeader title={H.title} subtitle={labels.orgHome.officerHistorySub} onBack={onBack} />

      {isLoading && (
        <>
          <OrgListSkeleton />
          <p className="sr-only">{labels.common.loading}</p>
        </>
      )}

      {!isLoading && hasError && (
        <p className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4 text-[13px] text-cz-danger-body">
          {labels.orgHome.loadFailed}
        </p>
      )}

      {!isLoading && !hasError && rows.length === 0 && (
        <p className="rounded-[14px] bg-white p-6 text-center text-[13px] italic text-cz-text-muted shadow-[var(--shadow-xs)]">
          {H.empty}
        </p>
      )}

      {!isLoading && !hasError && rows.length > 0 && (
        <>
          {/* Table, 640px and up */}
          <div className={`hidden sm:block ${ORG_SURFACE}`}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead>
                  <tr className="border-b-[0.5px] border-cz-border bg-cz-page/60">
                    <th scope="col" className={th}>{H.cols.officer}</th>
                    <th scope="col" className={th}>{H.cols.position}</th>
                    <th scope="col" className={th}>{H.cols.start}</th>
                    <th scope="col" className={th}>{H.cols.end}</th>
                    <th scope="col" className={th}>{H.cols.status}</th>
                    <th scope="col" className={th}>{H.cols.reason}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} className="border-b-[0.5px] border-cz-border transition-colors last:border-b-0 hover:bg-cz-page/60">
                      <td className={`${td} font-semibold text-cz-text`}>{o.full_name}</td>
                      <td className={td}>{o.position}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{fmt(o.term_start_date)}</td>
                      <td className={`${td} whitespace-nowrap tabular-nums`}>{fmt(o.term_end_date)}</td>
                      <td className={td}><StatusBadge officer={o} /></td>
                      <td className={`${td} max-w-[280px]`}>
                        {o.early_exit_reason || <span className="text-cz-text-muted">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Stacked cards below 640px */}
          <ul className={`sm:hidden ${ORG_SURFACE}`}>
            {rows.map((o, i) => (
              <li
                key={o.id}
                style={intro && i < 8 ? { '--i': i } : undefined}
                className={`px-4 py-3 ${i === rows.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}${intro && i < 8 ? ' org-rise' : ''}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[15px] font-semibold text-cz-text">{o.full_name}</p>
                  <StatusBadge officer={o} />
                </div>
                <p className="mt-0.5 text-[13px] text-cz-text-2">{o.position}</p>
                <p className="mt-1 text-[12px] text-cz-text-muted">{fmt(o.term_start_date)} – {fmt(o.term_end_date)}</p>
                {o.early_exit_reason && (
                  <p className="mt-1.5 rounded-[8px] bg-cz-page px-2.5 py-1.5 text-[12px] text-cz-text-2">
                    {o.early_exit_reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </OrgShell>
  )
}
