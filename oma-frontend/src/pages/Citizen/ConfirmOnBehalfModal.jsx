import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
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
    <ModalShell
      title={L.modalTitle}
      subtitle={L.modalSubtitle(name)}
      icon={UserCheck}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <form className="space-y-4" onSubmit={handleSubmit}>
        <FormField label={L.photoLabel}>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setPhoto(e.target.files?.[0] || null)}
            className="w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-[10px] text-[14px] text-cz-text file:mr-3 file:rounded-[6px] file:border-0 file:bg-cz-page file:px-3 file:py-1.5 file:text-[13px] file:font-medium"
          />
          <p className="mt-1 text-[12px] text-cz-text-muted">{L.photoHint}</p>
        </FormField>

        {errorMessage && (
          <p className="rounded-[8px] bg-cz-danger-bg px-3 py-2 text-[13px] font-medium text-cz-danger-body">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-3 border-t border-cz-border pt-4">
          <Button onClick={onClose} type="button" variant="ghost">{labels.common.cancel}</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">{L.submit}</Button>
        </div>
      </form>
    </ModalShell>
  )
}
