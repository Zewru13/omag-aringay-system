import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'

// Accountless-beneficiary on-behalf-of confirmation (Piece 2). Deliberately
// small — the only real input is the optional photo; everything else
// (which record, which organization, who is submitting) is resolved by the
// backend from the URL and the caller's own token, same as
// core.profile_self_service.ProfileImageUploadView's "no id parameter by
// design" convention. Submitting creates a PENDING BeneficiaryConfirmationRequest
// for admin review, not an immediate confirm — see
// BeneficiaryConfirmOnBehalfView's own docstring.
//
// Photo field mirrors CitizenDisasterScreen.jsx's own optional-photo field
// exactly: same accept list, same "only build FormData if a file was
// actually chosen" submit shape, same server-side validate_uploaded_image
// contract (jpg/png/webp, 5 MB).
//
// Overlay follows the citizen-organization sheet pattern shared with
// OrgSetMemberActiveDialog / OrgInfoScreen: a bottom sheet below 640px, a
// centered 440px box from sm up — not the staff ModalShell.
export default function ConfirmOnBehalfModal({ domain, record, onClose, onSuccess }) {
  const [photo, setPhoto] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const L = labels.orgConfirmables
  const name = domain.confirmableName(record)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    setIsSubmitting(true)
    try {
      let payload = null
      if (photo) {
        payload = new FormData()
        payload.append('photo', photo)
      }
      await api.post(domain.confirmOnBehalfUrl(record.id), payload)
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setErrorMessage(firstError || data?.detail || L.submitFailed)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="modal-content w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
        <div className="flex gap-2">
          <UserCheck size={18} className="mt-px shrink-0 text-cz-tile-blue-fg" aria-hidden="true" />
          <div>
            <h2 className="text-[17px] font-medium text-cz-text">{L.modalTitle}</h2>
            <p className="mt-2 text-[13px] leading-[1.55] text-cz-text-2">{L.modalSubtitle(name)}</p>
          </div>
        </div>

        <form id="confirm-on-behalf-form" className="mt-4" onSubmit={handleSubmit}>
          <label htmlFor="confirm-on-behalf-photo" className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-text-2">
            {L.photoLabel}
          </label>
          <input
            id="confirm-on-behalf-photo"
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-[10px] text-[14px] text-cz-text file:mr-3 file:rounded-[6px] file:border-0 file:bg-cz-page file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
          <p className="mt-1 text-[12px] text-cz-text-muted">{L.photoHint}</p>

          {errorMessage && (
            <p className="mt-3 rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
              {errorMessage}
            </p>
          )}
        </form>

        <button
          type="submit"
          form="confirm-on-behalf-form"
          disabled={isSubmitting}
          className={`mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[8px] transition-opacity hover:opacity-90 disabled:opacity-50 press-scale ${domain.dashboardTheme.solidBtn}`}
        >
          <span className="text-[15px] font-medium">{L.submit}</span>
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onClose}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong"
        >
          <span className="text-[14px] text-cz-text-2">{labels.common.cancel}</span>
        </button>
      </div>
    </div>
  )
}
