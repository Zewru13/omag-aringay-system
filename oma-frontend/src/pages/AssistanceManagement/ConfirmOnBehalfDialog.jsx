import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import usePhotoList from '../../hooks/usePhotoList.js'
import { useToast } from '../../context/ToastContext.jsx'

// The organization vouches for the member, so it must show proof: at least this many photos (the server enforces it too).
const MIN_PROOF_PHOTOS = 2

// An organization confirms receipt for a member whose own account cannot do it. This does not confirm the
// assistance by itself: it files a confirmation request that OMAg staff review (the backend creates a pending
// request) with at least 2 proof photos. If staff rejected an earlier request, their note is shown so the
// organization knows what to fix. Shared by the crop and fisheries assistance pages in organization mode.
export default function ConfirmOnBehalfDialog({ url, memberName, assistanceLabel, previousRejection = '', onClose, onDone }) {
  const { showToast } = useToast()
  const photosState = usePhotoList()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const count = photosState.photos.length
  const enough = count >= MIN_PROOF_PHOTOS

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!enough) { setError(`Add at least ${MIN_PROOF_PHOTOS} photos as proof.`); return }
    setError('')
    setIsSubmitting(true)
    try {
      const payload = new FormData()
      photosState.photos.forEach(p => payload.append('photos', p.file))
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
          <Button type="submit" form="confirm-on-behalf-form" isLoading={isSubmitting} disabled={!enough}>Send Confirmation</Button>
        </>
      }
    >
      <form id="confirm-on-behalf-form" onSubmit={handleSubmit} className="space-y-4">
        {previousRejection && (
          <div role="note" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2.5 text-[13px] text-rose-800">
            <p className="font-semibold">OMAg rejected your last confirmation</p>
            <p className="mt-0.5 break-words">{previousRejection}</p>
            <p className="mt-1 text-rose-700">Add new proof photos and send it again.</p>
          </div>
        )}
        <p className="text-[13px] leading-relaxed text-[#4A5E4A]">
          Use this when {memberName} has no working account to confirm for themselves. It sends a confirmation
          request to OMAg staff, who review it before the assistance is marked as received.
        </p>
        <PhotoListField photosState={photosState} title="Proof Photos (required)" hint={`Add at least ${MIN_PROOF_PHOTOS} clear photos, up to 10.`} altPrefix="Proof photo" />
        <p className={`text-xs font-medium ${enough ? 'text-emerald-700' : 'text-amber-700'}`} aria-live="polite">
          {enough ? `${count} photos added.` : `${count} of ${MIN_PROOF_PHOTOS} required photos added.`}
        </p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}
