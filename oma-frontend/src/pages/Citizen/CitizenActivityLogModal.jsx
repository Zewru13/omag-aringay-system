import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'

const todayISO = () => new Date().toISOString().split('T')[0]

// Batch 11: citizen-facing activity log form — create AND edit, for both the
// crop and fisheries domains, driven by `domain` (see citizenDomainConfig.js).
// Adapted from Monitoring/AddActivityLogModal.jsx's minimal field set rather
// than the full staff ViewLogsModal form (disaster-remedy linking, activity
// suggestions engine, etc. stay staff-only). Reuses the exact same
// useRecordLock hook/mechanism as the staff form — same acquire/heartbeat/
// release flow, same "someone else is logging this" block.
export default function CitizenActivityLogModal({ domain, recordId, log, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = Boolean(log)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    [domain.activityField]: log?.[domain.activityField] || domain.activityChoices[0],
    [domain.activityOtherField]: log?.[domain.activityOtherField] || '',
    date_of_activity: log?.date_of_activity || todayISO(),
    [domain.notesField]: log?.[domain.notesField] || '',
  })

  const recordLock = useRecordLock(domain.lockType, recordId, !isEdit)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date_of_activity) { showToast('Date of activity is required.', 'error'); return }
    if (form[domain.activityField] === 'Other' && !form[domain.activityOtherField].trim()) {
      showToast('Please specify the activity.', 'error')
      return
    }
    if (!isEdit && recordLock.lockedByOther) {
      showToast('Someone else is currently logging this record. Please wait.', 'error')
      return
    }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(domain.logDetailUrl(log.id), form)
        showToast('Activity log updated.', 'success')
      } else {
        await api.post(domain.logsUrl(recordId), form)
        showToast('Activity log added.', 'success')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object'
        ? Object.values(data).flat()[0]
        : null
      showToast(firstError || data?.detail || 'Failed to save log.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const blockedByOther = !isEdit && recordLock.lockedByOther

  return (
    <ModalShell title={isEdit ? 'Edit Activity Log' : 'Log Activity'} onClose={onClose}>
      {blockedByOther && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          🔒 <strong>{recordLock.lockedByOther.name}</strong> is currently logging this record. Please wait
          {recordLock.secondsRemaining ? ` (~${Math.ceil(recordLock.secondsRemaining / 60)} min)` : ''}.
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Activity" required>
            <ComboboxWithOther
              options={domain.activityChoices.filter((t) => t !== 'Other')}
              value={form[domain.activityField]}
              otherValue={form[domain.activityOtherField]}
              onChange={(v) => set(domain.activityField, v)}
              onOtherChange={(v) => set(domain.activityOtherField, v)}
              disabled={blockedByOther}
            />
          </FormField>
          <FormField label="Date of Activity" required hint="When the activity was actually performed.">
            <input
              type="date"
              max={todayISO()}
              className={baseInputClasses}
              value={form.date_of_activity}
              onChange={(e) => set('date_of_activity', e.target.value)}
              disabled={blockedByOther}
            />
          </FormField>
        </div>
        <FormField label={domain.key === 'crop' ? 'Notes' : 'Notes / Observations'}>
          <textarea
            className={baseInputClasses}
            rows={3}
            value={form[domain.notesField]}
            onChange={(e) => set(domain.notesField, e.target.value)}
            disabled={blockedByOther}
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={blockedByOther}>
            {isEdit ? 'Save Changes' : 'Save Log'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
