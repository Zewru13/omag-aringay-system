import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const ACTIVITY_TYPES = [
  'Fertilizer Application',
  'Pesticide Application',
  'Irrigation',
  'Weeding',
  'Thinning',
  'Field Inspection',
  'Harvesting',
  'Other',
]

function AddActivityLogModal({ monitoringId, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    activity_type: 'Field Inspection',
    date_of_activity: '',
    notes: '',
  })

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date_of_activity) { showToast('Date of activity is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post(`/production/monitoring/${monitoringId}/logs/`, form)
      showToast('Activity log added.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save log.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Add Activity Log" onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Activity Type" required>
            <select
              className={baseInputClasses}
              value={form.activity_type}
              onChange={(e) => set('activity_type', e.target.value)}
            >
              {ACTIVITY_TYPES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </FormField>
          <FormField label="Date of Activity" required hint="When the activity was actually performed in the field.">
            <input
              type="date"
              max={new Date().toISOString().split('T')[0]}
              className={baseInputClasses}
              value={form.date_of_activity}
              onChange={(e) => set('date_of_activity', e.target.value)}
            />
          </FormField>
        </div>
        <FormField label="Date Logged" hint="Automatically recorded when you save.">
          <input
            type="text"
            disabled
            className={`${baseInputClasses} bg-slate-100 text-slate-400 cursor-not-allowed`}
            value={new Date().toLocaleDateString()}
            readOnly
          />
        </FormField>
        <FormField label="Notes">
          <textarea
            className={baseInputClasses}
            rows={3}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save Log</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddActivityLogModal
