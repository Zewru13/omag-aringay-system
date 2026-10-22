import { useState } from 'react'
import { UserCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import usePhotoList from '../../hooks/usePhotoList.js'
import { useToast } from '../../context/ToastContext.jsx'
import { PROOF_MIN, confirmProblem, namesPreview } from './orgConfirmSelection.js'
import ConfirmedReportModal from './ConfirmedReportModal.jsx'
import { buildAssistanceReportSpec } from './assistanceReport.js'

// An organization confirms that the assistance reached the members it picked (one or many) with ONE set of proof photos
// for all of them. The confirmation is final: the members become Confirmed straight away, OMAg staff are told but do
// not have to approve. Shared by the crop and fisheries assistance pages in organization mode.
//   url: the "confirm for members" endpoint. records: the picked assistance rows. nameOf(record): the member's name.
export default function ConfirmMembersDialog({ url, records, nameOf, onClose, onDone, domain = 'crop', organizationName = '' }) {
  const { showToast } = useToast()
  const photosState = usePhotoList()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [confirmedCount, setConfirmedCount] = useState(null)   // set once the confirmation went through: the report is offered next
  const count = photosState.photos.length
  const problem = confirmProblem(records.length, count)
  const names = records.map(nameOf)
  const assistance = [...new Set(records.map((r) => r.assistance_type).filter(Boolean))].join(', ') || 'Assistance'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (problem) { setError(problem); return }
    setError('')
    setIsSubmitting(true)
    try {
      const payload = new FormData()
      records.forEach((r) => payload.append('record_ids', String(r.id)))
      photosState.photos.forEach((p) => payload.append('photos', p.file))
      const r = await api.post(url, payload)
      const done = r.data?.confirmed ?? records.length
      showToast(`${done} member${done === 1 ? '' : 's'} confirmed.`, 'success')
      setConfirmedCount(done)
    } catch (err) {
      const data = err?.response?.data
      const messages = data && typeof data === 'object' ? Object.values(data).flat().filter((m) => typeof m === 'string') : []
      setError(messages.length ? messages.join(' ') : (data?.detail || 'Failed to send the confirmation.'))
    } finally {
      setIsSubmitting(false)
    }
  }

  if (confirmedCount !== null) {
    const spec = buildAssistanceReportSpec({ domain, records, confirmedOn: new Date().toISOString(), organizationName })
    return (
      <ConfirmedReportModal
        message={`${confirmedCount} member${confirmedCount === 1 ? '' : 's'} confirmed.`}
        spec={spec}
        onClose={onDone}
      />
    )
  }

  return (
    <ModalShell
      title={records.length === 1 ? 'Confirm for Member' : 'Confirm for Members'}
      subtitle={`${assistance} · ${records.length} member${records.length === 1 ? '' : 's'}`}
      icon={UserCheck}
      onClose={onClose}
      maxWidth="max-w-lg"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="confirm-members-form" isLoading={isSubmitting} disabled={Boolean(problem)}>
            Confirm {records.length === 1 ? 'Member' : `${records.length} Members`}
          </Button>
        </>
      }
    >
      <form id="confirm-members-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2.5">
          <p className="text-[12px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Confirming for</p>
          <p className="mt-0.5 break-words text-[13px] font-medium text-[#1A2B1A]">{namesPreview(names, 4)}</p>
        </div>
        <p className="text-[13px] leading-relaxed text-[#4A5E4A]">
          Use this when these members have no working account to confirm for themselves. The photos below are sent once and
          kept for all {records.length === 1 ? 'of this member’s record' : `${records.length} members`}. The confirmation is final:
          OMAg staff are notified but do not need to approve it.
        </p>
        <PhotoListField photosState={photosState} title="Proof Photos (required)" hint={`Add at least ${PROOF_MIN} clear photos, up to 10.`} altPrefix="Proof photo" />
        <p className={`text-xs font-medium ${count >= PROOF_MIN ? 'text-emerald-700' : 'text-amber-700'}`} aria-live="polite">
          {count >= PROOF_MIN ? `${count} photos added.` : `${count} of ${PROOF_MIN} required photos added.`}
        </p>
        {error && <p className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}
