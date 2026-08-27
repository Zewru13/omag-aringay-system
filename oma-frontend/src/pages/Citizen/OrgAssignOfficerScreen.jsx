import { useState } from 'react'
import { ChevronRight } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'
import { OrgPrompt, OrgScreen } from './OrgDashboardParts.jsx'

// Batch 2 logic, rebuilt against reference image3. Pick a position, then pick
// one of THIS organization's current members to hold it.
//
// RESTYLE ONLY — the request, the endpoint, and the membership rule are
// byte-for-byte what Batch 1 shipped. The member list rendered here is already
// scoped to current members because it is the dashboard's own member-list
// response passed down, but that is a convenience, NOT the enforcement: the
// server's "this farmer/fisherfolk is not a member of this organization"
// validation is what actually protects the rule. If the two ever disagree the
// server wins and its message surfaces in `errorMessage` below.
export default function OrgAssignOfficerScreen({
  domain, orgId, orgName, members, officerByPosition, onBack, onSuccess,
}) {
  const { showToast } = useToast()
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

  const card = 'overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]'
  const row = 'flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-cz-org-panel'

  // ── Step 2: choose the member ────────────────────────────────────────
  if (position) {
    const current = officerByPosition[position]
    return (
      <OrgScreen
        title={position}
        chipLabel={orgName}
        onBack={() => { setPosition(null); setErrorMessage('') }}
        theme={domain.theme}
      >
        <OrgPrompt>{current ? null : labels.orgAssignOfficer.pickMember}</OrgPrompt>

        {current && (
          <p className="mb-3 rounded-[10px] border border-[#F5E0A3] bg-cz-alert-bg px-3.5 py-2.5 text-[13px] leading-[1.45] text-cz-alert-title">
            {labels.orgAssignOfficer.positionHeld(current.full_name)}
          </p>
        )}

        {errorMessage && (
          <p className="mb-3 rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        {current ? null : members.length === 0 ? (
          <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
            {labels.orgAssignOfficer.noMembers}
          </p>
        ) : (
          <ul className={card}>
            {members.map((m, i) => (
              <li
                key={m.id}
                className={i === members.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}
              >
                <button type="button" disabled={isBusy} onClick={() => assign(m)} className={`${row} disabled:opacity-50`}>
                  <OrgAvatar name={domain.rowName(m)} id={domain.rowPersonId(m)} size={38} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold text-cz-text">
                      {domain.rowName(m)}
                    </span>
                    <span className="mt-0.5 block truncate text-[13px] text-cz-text-2">
                      {domain.rowBarangay(m) ? `Brgy. ${domain.rowBarangay(m)}` : labels.common.unknown}
                    </span>
                  </span>
                  <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </OrgScreen>
    )
  }

  // ── Step 1: choose the position ──────────────────────────────────────
  // image3 exactly: one card, one row per position, the holder's name under
  // the position, and a dashed "+" plus an amber VACANT pill where nobody
  // holds it. The position set is the domain's real one (seven), not the
  // five the mockup happens to draw.
  return (
    <OrgScreen title={labels.orgAssignOfficer.title} chipLabel={orgName} onBack={onBack} theme={domain.theme}>
      <OrgPrompt>{labels.orgAssignOfficer.pickPosition}</OrgPrompt>
      <ul className={card}>
        {domain.officerPositions.map((p, i) => {
          const o = officerByPosition[p]
          return (
            <li
              key={p}
              className={i === domain.officerPositions.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}
            >
              <button type="button" onClick={() => setPosition(p)} className={row}>
                {o ? (
                  <OrgAvatar name={o.full_name} id={domain.officerPersonId(o)} size={38} />
                ) : (
                  <span
                    className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-dashed border-cz-alert-accent text-[17px] leading-none text-cz-alert-accent"
                    aria-hidden="true"
                  >
                    +
                  </span>
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-cz-text">{p}</span>
                  {o ? (
                    <span className="mt-0.5 block truncate text-[13px] text-cz-text-2">{o.full_name}</span>
                  ) : (
                    <span className="mt-1 inline-block rounded-full bg-cz-tile-amber-bg px-2.5 py-0.5 text-[11px] font-bold tracking-[0.02em] text-cz-tile-amber-fg">
                      {labels.orgHome.vacant}
                    </span>
                  )}
                </span>
                <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
              </button>
            </li>
          )
        })}
      </ul>
    </OrgScreen>
  )
}
