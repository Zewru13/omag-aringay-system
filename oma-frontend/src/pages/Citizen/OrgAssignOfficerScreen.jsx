import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'

// Organization Reference rebuild — Mag-assign ng Opisyal (image3/13): ONE
// form, Posisyon and Kasapi shown together as two dropdowns, not the old
// two-step wizard (pick position -> tap a member from a list). The
// "already holds this position" warning is real, backend-enforced
// behavior the reference's blank-state screenshot doesn't happen to show
// (no position is selected in it yet) — kept here, surfacing inline once a
// filled position is picked, rather than dropped to match the screenshot's
// simpler appearance.
export default function OrgAssignOfficerScreen({
  domain, orgId, orgName, members, officerByPosition, onBack, onNav, onSuccess,
}) {
  const { showToast } = useToast()
  const theme = domain.dashboardTheme
  const [position, setPosition] = useState('')
  const [personId, setPersonId] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const currentHolder = position ? officerByPosition[position] : null
  const fieldBox = `min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 text-[14px] text-cz-text outline-none ${theme.focusBorder}`
  const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-text-2'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!position || !personId) return
    const row = members.find((m) => String(domain.rowPersonId(m)) === String(personId))
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.post(domain.officersUrl(orgId), domain.assignOfficerBody(position, domain.rowPersonId(row)))
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

  return (
    <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={(key) => (key === 'home' ? onBack() : onNav(key))} wide={false}>
      <OrgPageHeader title={labels.orgAssignOfficer.title} subtitle={labels.orgAssignOfficer.pickPosition} onBack={onBack} />

      <form onSubmit={handleSubmit} className="max-w-lg space-y-4">
        <div>
          <label className={fieldLabel} htmlFor="assign-position">{labels.orgAssignOfficer.positionFieldLabel}</label>
          <select
            id="assign-position"
            className={fieldBox}
            value={position}
            onChange={(e) => { setPosition(e.target.value); setErrorMessage('') }}
          >
            <option value="">{labels.orgAssignOfficer.positionPlaceholder}</option>
            {domain.officerPositions.map((p) => <option key={p} value={p}>{p}</option>)}
          </select>
          {currentHolder && (
            <p className="mt-2 rounded-[10px] border border-[#F5E0A3] bg-cz-alert-bg px-3.5 py-2.5 text-[13px] leading-[1.45] text-cz-alert-title">
              {labels.orgAssignOfficer.positionHeld(currentHolder.full_name)}
            </p>
          )}
        </div>

        <div>
          <label className={fieldLabel} htmlFor="assign-member">{labels.orgAssignOfficer.memberFieldLabel}</label>
          {members.length === 0 ? (
            <p className="rounded-[12px] border-[0.5px] border-cz-border bg-white p-4 text-center text-[13px] italic text-cz-text-muted">
              {labels.orgAssignOfficer.noMembers}
            </p>
          ) : (
            <select
              id="assign-member"
              className={fieldBox}
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
            >
              <option value="">{labels.orgAssignOfficer.memberPlaceholder}</option>
              {members.map((m) => (
                <option key={m.id} value={domain.rowPersonId(m)}>
                  {domain.rowName(m)}{domain.rowBarangay(m) ? ` — Brgy. ${domain.rowBarangay(m)}` : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        {errorMessage && (
          <p className="rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        <div className="flex gap-3 pt-1">
          <button
            type="button"
            onClick={onBack}
            className="flex min-h-[46px] flex-1 items-center justify-center rounded-[10px] border-[0.5px] border-cz-border-strong text-[14px] font-semibold text-cz-text-2 transition-colors hover:bg-cz-page"
          >
            {labels.common.cancel}
          </button>
          <button
            type="submit"
            disabled={isBusy || !position || !personId}
            className={`flex min-h-[46px] flex-1 items-center justify-center rounded-[10px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`}
          >
            {labels.orgAssignOfficer.assignButton}
          </button>
        </div>
      </form>
    </OrgShell>
  )
}
