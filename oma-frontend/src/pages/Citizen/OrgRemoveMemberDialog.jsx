import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'

// Batch 2: mandatory confirmation before DELETE. Removal is not reversible
// from this screen, and when the member holds an officer position the
// backend also clears that position — silently, as a side effect. The
// confirmation names the position explicitly in that case, so the
// consequence is stated before it happens rather than discovered after.
//
// The position is passed in (`heldPosition`) rather than re-derived here:
// the dashboard already holds the officer list, and re-fetching it just to
// render a dialog would let the two views disagree.
export default function OrgRemoveMemberDialog({
  domain, orgId, row, heldPosition, onClose, onSuccess,
}) {
  const { showToast } = useToast()
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const name = domain.rowName(row)

  const handleRemove = async () => {
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.delete(domain.removeMemberUrl(orgId, row))
      showToast(labels.orgRemoveMember.success(name), 'success')
      onSuccess()
    } catch (err) {
      const data = err?.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setErrorMessage(first || data?.detail || labels.orgRemoveMember.failed)
    } finally {
      setIsBusy(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
        <div className="flex gap-2">
          <AlertTriangle size={18} className="mt-px shrink-0 text-cz-danger-accent" aria-hidden="true" />
          <div>
            <h2 className="text-[17px] font-medium text-cz-text">{labels.orgRemoveMember.title}</h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-cz-text-2">
              {labels.orgRemoveMember.body(name)}
            </p>
            {heldPosition && (
              <p className="mt-2 rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg px-3 py-2 text-[13px] leading-[1.55] text-cz-warn-body">
                {labels.orgRemoveMember.officerWarning(heldPosition)}
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
          onClick={handleRemove}
          className="mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[8px] bg-cz-danger-accent transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <span className="text-[15px] font-medium text-cz-danger-on">{labels.orgRemoveMember.confirm}</span>
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
