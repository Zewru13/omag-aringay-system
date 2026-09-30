import { useCallback, useEffect, useState } from 'react'
import { Clock, UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'
import { OrgListSkeleton, OrgShell } from './OrgDashboardParts.jsx'
import { ORG_SURFACE, useOrgIntro } from './orgStyles.js'
import ConfirmOnBehalfModal from './ConfirmOnBehalfModal.jsx'

// Accountless-beneficiary on-behalf-of confirmation (Piece 2) — a NEW,
// DISTINCT screen from OrgReportHistoryScreen.jsx on purpose. That screen
// deliberately scopes to recorded_by=self and is display-only (see its own
// docstring); this one is sourced from a different, eligibility-gated
// endpoint (MyOrgAccountlessConfirmablesView / its fisherfolk mirror) that
// already excludes anyone with a working account. That exclusion is
// trusted completely here — there is no client-side re-filtering, and no
// "this person has an account" row/state to render, because the backend
// simply never returns such a row. The eligibility distinction is
// structural, not visual.
const PILL = 'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.05em]'

export default function OrgAccountlessConfirmablesScreen({ domain, orgName, onBack, tabBar, active, onNav }) {
  const [rows, setRows] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [modalRecord, setModalRecord] = useState(null)

  const load = useCallback(() => {
    setIsLoading(true)
    setHasError(false)
    return api.get(domain.accountlessConfirmablesUrl)
      .then((r) => setRows(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => setHasError(true))
      .finally(() => setIsLoading(false))
  }, [domain])

  useEffect(() => { load() }, [load])

  const L = labels.orgConfirmables
  const theme = domain.dashboardTheme
  const intro = useOrgIntro(!isLoading)

  return (
    <OrgShell theme={theme} chipLabel={orgName} active={active} onNav={(key) => (key === 'home' ? onBack() : onNav(key))} tabBar={tabBar} wide>
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h1 className="text-[22px] font-bold text-cz-text">{L.title}</h1>
          <p className="mt-0.5 max-w-lg text-[13px] text-cz-text-2">{L.subtitle}</p>
        </div>
        <p className="text-[13px] text-cz-text-2">{L.countLine(rows.length)}</p>
      </div>

      {isLoading && (
        <>
          <OrgListSkeleton />
          <p className="sr-only">{L.loading}</p>
        </>
      )}

      {!isLoading && hasError && (
        <p className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4 text-[13px] text-cz-danger-body">
          {L.loadFailed}
        </p>
      )}

      {!isLoading && !hasError && rows.length === 0 && (
        <p className="rounded-[14px] bg-white p-6 text-center text-[13px] italic text-cz-text-muted shadow-[var(--shadow-xs)]">
          {L.empty}
        </p>
      )}

      {!isLoading && !hasError && rows.length > 0 && (
        <div className="space-y-3">
          {rows.map((row, idx) => {
            const name = domain.confirmableName(row)
            const isPending = row.latest_request_status === 'PENDING'
            const wasRejected = row.latest_request_status === 'REJECTED'
            return (
              <article
                key={row.id}
                style={intro && idx < 6 ? { '--i': idx } : undefined}
                className={`${ORG_SURFACE} p-4${intro && idx < 6 ? ' org-rise' : ''}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="truncate text-[16px] font-bold leading-[1.3] text-cz-text">{name}</h3>
                    <p className="mt-1 text-[13px] text-cz-text-2">
                      {row.assistance_type || labels.common.unknown}
                      {row.quantity ? ` · ${row.quantity}` : ''} · {labels.common.formatDate(row.date_given)}
                    </p>
                  </div>
                  {isPending ? (
                    <span className={`${PILL} border-[#854D0E]/30 bg-cz-badge-yellow text-[#854D0E]`}>
                      <Clock size={11} aria-hidden="true" /> {L.pendingBadge}
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setModalRecord(row)}
                      className={`press-scale flex shrink-0 items-center gap-1.5 rounded-[8px] px-3 py-2 text-[12.5px] font-semibold text-white transition-opacity hover:opacity-90 ${theme.solidBtn}`}
                    >
                      <UserCheck size={14} aria-hidden="true" />
                      {L.confirmButton}
                    </button>
                  )}
                </div>
                {wasRejected && row.latest_request_reason && (
                  <p className="mt-2 border-t border-cz-border pt-2 text-[12px] italic leading-[1.4] text-cz-text-2">
                    {L.rejectedReason(row.latest_request_reason)}
                  </p>
                )}
              </article>
            )
          })}
        </div>
      )}

      {modalRecord && (
        <ConfirmOnBehalfModal
          domain={domain}
          record={modalRecord}
          onClose={() => setModalRecord(null)}
          onSuccess={load}
        />
      )}
    </OrgShell>
  )
}
