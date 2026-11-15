import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PhotoListField from '../../components/UI/PhotoListField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import usePhotoList from '../../hooks/usePhotoList.js'
import { extractErrorMessage } from './assistanceFollowUp.js'
import { buildAssistanceReportSpec } from './assistanceReport.js'
import ConfirmedReportModal from './ConfirmedReportModal.jsx'

// Confirm Received: a farmer says the assistance reached them, with optional proof photos and a note. Used by the office's Crop
// Assistance page and by the farmer's own Assistance page and Home. Moved here unchanged from CropAssistancePage.jsx.

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

export default function ConfirmReceivedModal({ record, onClose, onDone }) {
  const { showToast } = useToast()
  const photosState = usePhotoList()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`crop-assistance-received:${record.id}`)
  const [note, setNote] = useDraftField(draft, 'note', '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)
    try {
      const body = new FormData()
      photosState.photos.forEach(p => body.append('confirmation_photos', p.file))
      if (note.trim()) body.append('confirmation_note', note.trim())
      await api.post(`/interventions/beneficiaries/${record.id}/confirm-received/`, body)
      showToast('Confirmed as received.', 'success')
      draft.clear()
      setDone(true)
    } catch (err) {
      const d = err?.response?.data
      const photoError = d?.confirmation_photos && [].concat(d.confirmation_photos).join(' ')
      showToast(photoError || extractErrorMessage(err, 'Failed to confirm.'), 'error')
    } finally { setIsSubmitting(false) }
  }
  if (done) {
    const spec = buildAssistanceReportSpec({ domain: 'crop', records: [record], confirmedOn: new Date().toISOString(), organizationName: record.attributed_organization_name || '' })
    return <ConfirmedReportModal message="Marked as received." spec={spec} onClose={onDone} />
  }
  return (
    <ModalShell title="Confirm Received" subtitle={`${record.assistance_type || 'Assistance'} · ${formatDate(record.date_given)}`} onClose={onClose} maxWidth="max-w-2xl"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="farmer-confirm-received" isLoading={isSubmitting}>Confirm</Button>
      </>}>
      <form id="farmer-confirm-received" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <DetailTable
          title="Assistance"
          fields={[
            { label: 'Assistance', value: record.assistance_type },
            { label: 'Date Given', value: formatDate(record.date_given) },
          ]}
        />
        <FormSection title="Proof of Receipt">
          <FormRows label="Proof of receipt">
            <FormRow>
              <FormCell label="Proof Photos" wide hint={<p className="mt-1 text-[11.5px] text-[#7A8E7A]">Optional. Up to 10 photos.</p>}>
                <PhotoListField photosState={photosState} title="" hint="" altPrefix="Proof photo" />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="Note" wide>
                <textarea rows={3} className={`${baseInputClasses} h-auto resize-none py-2`} aria-label="Note" value={note}
                  onChange={(e) => setNote(e.target.value)} placeholder="Anything the office should know about what you received" />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
      </form>
    </ModalShell>
  )
}
