import { useState } from 'react'
import { ClipboardCheck } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { localToday } from '../../utils/inputGuards.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Record (or edit) a farm visit on a farmer's profile (one window for both, as a table form). Staff only; the visit date cannot be in the future, the next
// visit is a plan and cannot come before the visit (the backend enforces the same).
const DATE_BOX = `${baseInputClasses} min-w-0 max-w-full`

export default function RecordFarmVisitModal({ farmerId, visit = null, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(visit)
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`farm-visit:${farmerId}:${visit?.id ?? 'new'}`)
  const [form, setForm] = useDraftField(draft, 'form', {
    visit_date: visit?.visit_date || localToday(),
    next_visit_date: visit?.next_visit_date || '',
    purpose: visit?.purpose || '',
    notes: visit?.notes || '',
  })
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const validate = () => {
    const next = {}
    if (!form.visit_date) next.visit_date = 'Visit date is required.'
    if (!form.purpose.trim()) next.purpose = 'Purpose is required.'
    if (form.visit_date && form.next_visit_date && form.next_visit_date < form.visit_date) {
      next.next_visit_date = 'The next visit cannot be before the visit date.'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    if (!validate()) return
    setIsSubmitting(true)
    const payload = {
      visit_date: form.visit_date,
      next_visit_date: form.next_visit_date || null,
      purpose: form.purpose.trim(),
      notes: form.notes.trim(),
    }
    try {
      if (isEdit) await api.patch(`/monitoring/farm-visits/${visit.id}/`, payload)
      else await api.post('/monitoring/farm-visits/', { ...payload, farmer: farmerId })
      showToast(isEdit ? 'Farm visit updated.' : 'Farm visit recorded.', 'success')
      draft.clear()
      onSaved()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        const fieldErrors = {}
        for (const key of ['visit_date', 'next_visit_date', 'purpose', 'notes']) {
          if (data[key]) fieldErrors[key] = Array.isArray(data[key]) ? data[key][0] : data[key]
        }
        setErrors(fieldErrors)
        if (Object.keys(fieldErrors).length === 0) setFormError(data.detail || 'Could not save the farm visit.')
      } else {
        setFormError('Could not save the farm visit.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Farm Visit' : 'Record Farm Visit'}
      subtitle="What happened on this farm visit, and when the next one is planned."
      icon={ClipboardCheck}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="farm-visit-form" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : 'Record Visit'}</Button>
        </>
      )}
    >
      <form id="farm-visit-form" onSubmit={handleSubmit} className="space-y-3" noValidate>
        <DraftBanner draft={draft} />
        <FormSection title="Farm Visit">
          <FormRows label="Farm visit">
            <FormRow>
              <FormCell label="Visit Date" required error={errors.visit_date}>
                <input type="date" className={DATE_BOX} value={form.visit_date} max={localToday()} aria-label="Visit Date"
                  onChange={(e) => set('visit_date', e.target.value)} />
              </FormCell>
              <FormCell label="Next Visit" error={errors.next_visit_date}>
                <input type="date" className={DATE_BOX} value={form.next_visit_date} min={form.visit_date || undefined} aria-label="Next Visit"
                  onChange={(e) => set('next_visit_date', e.target.value)} />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="Purpose" required wide error={errors.purpose}>
                <input type="text" className={baseInputClasses} value={form.purpose} maxLength={200} aria-label="Purpose"
                  placeholder="e.g. Check on the rice crop" onChange={(e) => set('purpose', e.target.value)} />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="Remarks" wide error={errors.notes}>
                <textarea rows={3} className={`${baseInputClasses} h-auto py-2`} value={form.notes} aria-label="Remarks"
                  placeholder="What was found, advice given…" onChange={(e) => set('notes', e.target.value)} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>

        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700" role="alert">{formError}</p>
        )}
      </form>
    </ModalShell>
  )
}
