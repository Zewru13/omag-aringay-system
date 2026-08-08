import { useState } from 'react'
import { Check, ChevronRight } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'
import {
  CITIZEN_GUTTER, CitizenBody, CitizenEmptyState, CitizenScreen, CitizenSubHeader,
} from './citizenUI.jsx'

// Batch 2: pick a position, then pick one of THIS organization's current
// members to hold it.
//
// The member list here is already scoped to current members — it is the
// dashboard's own member-list response, passed down. That is a convenience,
// NOT the enforcement: the server's "this farmer/fisherfolk is not a member
// of this organization" validation is what actually protects the rule, and
// it is untouched by this batch. If the two ever disagree the server wins,
// and its error surfaces in `errorMessage` below.
export default function OrgAssignOfficerScreen({
  domain, orgId, members, officerByPosition, onBack, onSuccess,
}) {
  const { showToast } = useToast()
  const theme = domain.theme
  const [position, setPosition] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const assign = async (row) => {
    const personId = domain.rowPersonId(row)
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.post(domain.officersUrl(orgId), domain.assignOfficerBody(position, personId))
      showToast(labels.orgAssignOfficer.success(domain.rowName(row), position), 'success')
      onSuccess()
    } catch (err) {
      const data = err?.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setErrorMessage(first || data?.detail || labels.orgAssignOfficer.failed)
    } finally {
      setIsBusy(false)
    }
  }

  // ── Step 2: choose the member ──
  if (position) {
    const current = officerByPosition[position]
    return (
      <CitizenScreen>
        <CitizenSubHeader
          theme={theme}
          title={position}
          subtitle={current ? labels.orgAssignOfficer.currentHolder(current.full_name) : undefined}
          onBack={() => { setPosition(null); setErrorMessage('') }}
        />
        <CitizenBody>
          <p className="text-[13px] text-cz-text-2">{labels.orgAssignOfficer.pickMember}</p>
          {current && (
            <p className="rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg px-3 py-2 text-[13px] text-cz-warn-body">
              {labels.orgAssignOfficer.willReplace(current.full_name)}
            </p>
          )}
          {errorMessage && (
            <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
              {errorMessage}
            </p>
          )}
          {members.length === 0 ? (
            <CitizenEmptyState
              icon={Check}
              iconClass={theme.accentText}
              title={labels.orgAssignOfficer.noMembers}
            />
          ) : (
            <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
              {members.map((m, i) => (
                <li key={m.id} className={i === members.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}>
                  <button
                    type="button"
                    disabled={isBusy}
                    onClick={() => assign(m)}
                    className="flex w-full items-center gap-3 px-[14px] py-[11px] text-left transition-colors hover:bg-cz-page disabled:opacity-50"
                  >
                    <OrgAvatar name={domain.rowName(m)} id={domain.rowPersonId(m)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[14px] font-medium text-cz-text">{domain.rowName(m)}</p>
                      <p className="truncate text-[12px] text-cz-text-2">
                        {domain.rowBarangay(m) || labels.common.unknown}
                      </p>
                    </div>
                    <ChevronRight size={16} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </CitizenBody>
      </CitizenScreen>
    )
  }

  // ── Step 1: choose the position ──
  return (
    <CitizenScreen>
      <CitizenSubHeader theme={theme} title={labels.orgAssignOfficer.title} onBack={onBack} />
      <div className={`${CITIZEN_GUTTER} mt-3`}>
        <p className="text-[13px] text-cz-text-2">{labels.orgAssignOfficer.pickPosition}</p>
      </div>
      <CitizenBody>
        <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
          {domain.officerPositions.map((p, i) => {
            const o = officerByPosition[p]
            return (
              <li key={p} className={i === domain.officerPositions.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}>
                <button
                  type="button"
                  onClick={() => setPosition(p)}
                  className="flex w-full items-center gap-3 px-[14px] py-[11px] text-left transition-colors hover:bg-cz-page"
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
                    <p className="text-[14px] font-medium text-cz-text">{p}</p>
                    {o ? (
                      <p className="truncate text-[12px] text-cz-text-2">{o.full_name}</p>
                    ) : (
                      <span className="mt-[2px] inline-block rounded-full bg-cz-warn-bg px-2 py-[2px] text-[10px] font-medium text-cz-warn-accent">
                        {labels.orgHome.vacant}
                      </span>
                    )}
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
                </button>
              </li>
            )
          })}
        </ul>
      </CitizenBody>
    </CitizenScreen>
  )
}
