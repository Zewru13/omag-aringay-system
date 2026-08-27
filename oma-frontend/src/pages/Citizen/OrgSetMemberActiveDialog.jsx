import { useState } from 'react'
import { AlertTriangle, UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'

// Toggle-not-delete batch: replaces the old mandatory-confirmation DELETE
// dialog. Deactivating a member is still confirmed (it clears an officer
// position as a side effect, same as before — the warning still names the
// position explicitly), but it is no longer destructive: the member's
// record and history stay intact, and reactivating is the same action in
// reverse, with its own lighter confirmation (no officer warning possible,
// since deactivating already cleared any position).
//
// `heldPosition` is only relevant when deactivating — passed in rather
// than re-derived, same reasoning as before: the dashboard already holds
// the officer list, re-fetching it here would let the two views disagree.
export default function OrgSetMemberActiveDialog({
  domain, orgId, row, heldPosition, targetActive, onClose, onSuccess,
}) {
  const { showToast } = useToast()
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const name = domain.rowName(row)
  const L = labels.orgMemberActive

  const handleConfirm = async () => {
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.patch(domain.setMemberActiveUrl(orgId, row), { is_active: targetActive })
      showToast(targetActive ? L.reactivateSuccess(name) : L.deactivateSuccess(name), 'success')
      onSuccess()
    } catch (err) {
      const data = err?.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setErrorMessage(first || data?.detail || (targetActive ? L.reactivateFailed : L.deactivateFailed))
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="modal-content w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
        <div className="flex gap-2">
          {targetActive ? (
            <UserCheck size={18} className="mt-px shrink-0 text-cz-tile-blue-fg" aria-hidden="true" />
          ) : (
            <AlertTriangle size={18} className="mt-px shrink-0 text-cz-warn-accent" aria-hidden="true" />
          )}
          <div>
            <h2 className="text-[17px] font-medium text-cz-text">
              {targetActive ? L.reactivateTitle : L.deactivateTitle}
            </h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-cz-text-2">
              {targetActive ? L.reactivateBody(name) : L.deactivateBody(name)}
            </p>
            {!targetActive && heldPosition && (
              <p className="mt-2 rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg px-3 py-2 text-[13px] leading-[1.55] text-cz-warn-body">
                {L.officerWarning(heldPosition)}
              </p>
            )}
          </div>
        </div>

        {errorMessage && (
          <p className="mt-3 rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        <button
          type="button"
          disabled={isBusy}
          onClick={handleConfirm}
          className={`mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[8px] transition-opacity hover:opacity-90 disabled:opacity-50 press-scale ${
            targetActive ? domain.theme.solidBtn : 'bg-cz-danger-accent'
          }`}
        >
          <span className={`text-[15px] font-medium ${targetActive ? '' : 'text-cz-danger-on'}`}>
            {targetActive ? L.reactivateConfirm : L.deactivateConfirm}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong"
        >
          <span className="text-[14px] text-cz-text-2">{labels.common.cancel}</span>
        </button>
      </div>
    </div>
  )
}
