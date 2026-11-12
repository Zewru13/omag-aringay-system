import { useState } from 'react'
import { CheckCircle2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { formatDate } from '../../utils/dateFormat.js'
import { extractErrorMessage, followUpFor } from './assistanceFollowUp.js'

// The two windows that follow up an assistance record once a recipient says they did not receive it, the same for crop and fisheries
// (`domain` picks the endpoints and the recipient name; see assistanceFollowUp.js).

const errorBox = (error) => error && (
  <p className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>
)

// Staff: NOT_RECEIVED -> RESOLVED needs a note of what was done.
export function MarkResolvedModal({ domain = 'crop', record, onClose, onResolved }) {
  const config = followUpFor(domain)
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(config.draftKey('resolve', record.id))
  const [notes, setNotes] = useDraftField(draft, 'notes', '')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!notes.trim()) { setError('Follow-up notes are required.'); return }
    setError(''); setIsSubmitting(true)
    try {
      await api.post(config.resolveUrl(record.id), { follow_up_notes: notes.trim() })
      showToast('Case marked resolved.', 'success')
      draft.clear()
      onResolved()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to mark this case resolved.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Mark Resolved"
      subtitle={config.recipientName(record)}
      icon={CheckCircle2}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="mark-resolved-form" isLoading={isSubmitting}>Mark Resolved</Button>
        </>
      )}
    >
      <form id="mark-resolved-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <DetailTable
          title="Not Received"
          fields={[
            { label: config.recipientLabel, value: config.recipientName(record) },
            { label: 'Assistance', value: record.assistance_type },
            { label: 'Date Given', value: formatDate(record.date_given) },
            { label: 'Reason Given', value: record.non_receipt_reason, wide: true },
          ]}
        />
        <FormSection title="Follow-up">
          <FormRows label="Follow-up">
            <FormRow>
              <FormCell label="Follow-up Notes" required wide>
                <textarea
                  rows={3}
                  className={`${baseInputClasses} h-auto py-2`}
                  aria-label="Follow-up Notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="What was done to resolve this — e.g. redelivered, coordinated with organization…"
                />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
        {errorBox(error)}
      </form>
    </ModalShell>
  )
}

// A recipient (farmer or fisherfolk account) says they did not receive it; a reason is required, as on the endpoint.
export function ReportNotReceivedModal({ domain = 'crop', record, onClose, onDone }) {
  const config = followUpFor(domain)
  const { showToast } = useToast()
  const draft = useDraftForm(config.draftKey('not-received', record.id))
  const [reason, setReason] = useDraftField(draft, 'reason', '')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!reason.trim()) { showToast('A reason is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post(config.reportUrl(record.id), { non_receipt_reason: reason.trim() })
      showToast('Reported as not received.', 'success')
      draft.clear()
      onDone()
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to report.'), 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell
      title="Report Not Received"
      subtitle={`${record.assistance_type || 'Assistance'} · ${formatDate(record.date_given)}`}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="report-not-received-form" isLoading={isSubmitting}>Submit</Button>
        </>
      )}
    >
      <form id="report-not-received-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <DetailTable
          title="Assistance"
          fields={[
            { label: 'Assistance', value: record.assistance_type },
            { label: 'Date Given', value: formatDate(record.date_given) },
          ]}
        />
        <FormSection title="Report">
          <FormRows label="Report">
            <FormRow>
              <FormCell label="Reason" required wide>
                <textarea
                  rows={3}
                  className={`${baseInputClasses} h-auto resize-none py-2`}
                  aria-label="Reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Why was this assistance not received?"
                />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>
      </form>
    </ModalShell>
  )
}
