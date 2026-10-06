import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

// An organization confirms receipt for a member whose own account cannot do it. This does not confirm the
// assistance by itself: it files a confirmation request that OMAg staff review (the backend creates a pending
// request), with an optional proof photo. Shared by the crop and fisheries assistance pages in organization mode.
export default function ConfirmOnBehalfDialog({ url, memberName, assistanceLabel, onClose, onDone }) {
  const { showToast } = useToast()
  const [photo, setPhoto] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      let payload = null
      if (photo) {
        payload = new FormData()
        payload.append('photo', photo)
      }
      await api.post(url, payload)
      showToast('Confirmation sent to OMAg for review.', 'success')
      onDone()
    } catch (err) {
      const data = err?.response?.data
      const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setError(first || data?.detail || 'Failed to send the confirmation.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Confirm for Member"
      subtitle={`${assistanceLabel} · ${memberName}`}
      icon={UserCheck}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="confirm-on-behalf-form" isLoading={isSubmitting}>Send Confirmation</Button>
        </>
      }
    >
      <form id="confirm-on-behalf-form" onSubmit={handleSubmit} className="space-y-4">
        <p className="text-[13px] leading-relaxed text-[#4A5E4A]">
          Use this when {memberName} has no working account to confirm for themselves. It sends a confirmation
          request to OMAg staff, who review it before the assistance is marked as received.
        </p>
        <FormField label="Proof Photo (optional)">
          <input type="file" accept="image/jpeg,image/png,image/webp" className={baseInputClasses}
            onChange={(e) => setPhoto(e.target.files?.[0] || null)} />
        </FormField>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}
