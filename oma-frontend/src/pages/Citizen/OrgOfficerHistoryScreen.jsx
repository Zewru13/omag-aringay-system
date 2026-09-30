import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'

// Read-only: every past + present officer per position, mirroring the
// staff-side Officer History modal on OrganizationDetailPage. Same
// ?history=1 endpoint the roster already uses for current-only reads.
// Reached from the "Kasaysayan ng mga Opisyal" row under the officer roster
// on the Organization home. Mounts through the same OrgShell + OrgPageHeader
// as every other rebuilt Organization screen.
export default function OrgOfficerHistoryScreen({ domain, orgId, orgName, onBack, tabBar, active, onNav }) {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)

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

  return (
    <OrgShell
      theme={domain.dashboardTheme}
      chipLabel={orgName}
      active={active}
      onNav={(key) => (key === 'home' ? onBack() : onNav(key))}
      tabBar={tabBar}
      wide={false}
    >
      <OrgPageHeader title={labels.orgOfficerHistory.title} subtitle={labels.orgHome.officerHistorySub} onBack={onBack} />

      {isLoading && (
        <p className="text-[13px] text-cz-text-muted">{labels.common.loading}</p>
      )}

      {!isLoading && hasError && (
        <p className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4 text-[13px] text-cz-danger-body">
          {labels.orgHome.loadFailed}
        </p>
      )}

      {!isLoading && !hasError && rows.length === 0 && (
        <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
          {labels.orgOfficerHistory.empty}
        </p>
      )}

      {!isLoading && !hasError && rows.length > 0 && (
        <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {rows.map((o, i) => (
            <li
              key={o.id}
              className={`px-4 py-3 ${i === rows.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[15px] font-semibold text-cz-text">{o.full_name}</p>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em] ${
                    o.is_active
                      ? 'bg-cz-badge-green text-[#15803D]'
                      : o.early_exit_reason
                        ? 'bg-cz-badge-pink text-[#BE185D]'
                        : 'bg-cz-tile-slate-bg text-cz-tile-slate-fg'
                  }`}
                >
                  {o.is_active
                    ? labels.orgOfficerHistory.statusCurrent
                    : o.early_exit_reason
                      ? labels.orgOfficerHistory.statusEndedEarly
                      : labels.orgOfficerHistory.statusCompleted}
                </span>
              </div>
              <p className="mt-0.5 text-[13px] text-cz-text-2">{o.position}</p>
              <p className="mt-1 text-[12px] text-cz-text-muted">
                {labels.common.formatDate(o.term_start_date)} – {labels.common.formatDate(o.term_end_date)}
              </p>
              {o.early_exit_reason && (
                <p className="mt-1.5 rounded-[8px] bg-cz-org-panel px-2.5 py-1.5 text-[12px] text-cz-text-2">
                  {o.early_exit_reason}
                </p>
              )}
            </li>
          ))}
        </ul>
      )}
    </OrgShell>
  )
}
