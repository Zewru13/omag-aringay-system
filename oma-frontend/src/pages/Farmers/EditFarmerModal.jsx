import { useState } from 'react'
import { UserCog } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import FarmerFormSections from './FarmerFormSections.jsx'
import { changeFarmer, farmerFormFrom, farmerPayload, farmerProblems, firstFarmerProblem } from './farmerForm.js'

// Edit Farmer: the Register Farmer form (FarmerFormSections.jsx), filled in with the record. Every field of the register form can be corrected here,
// the email included; the RSBSA number and the organization memberships are shown, not edited (memberships are kept on the organization pages).
function EditFarmerModal({ farmer, onClose, onSuccess }) {
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`edit-farmer:${farmer.id}`)
  const [form, setForm] = useDraftField(draft, 'form', () => farmerFormFrom(farmer))
  const [original] = useState(() => farmerFormFrom(farmer))
  const [prefixNote, setPrefixNote] = useState('')
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const isDirty = Object.keys(original).some((key) => String(form[key] ?? '') !== String(original[key] ?? ''))

  const change = (field, value) => {
    const next = changeFarmer(form, field, value)
    setForm(next.form)
    if (field === 'gender' || field === 'prefix') setPrefixNote(next.prefixNote)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setFormError('')
    setFieldErrors({})
    const problem = firstFarmerProblem(form, new Date(), { isEdit: true })
    if (problem) { setFormError(problem); return }

    setIsSubmitting(true)
    try {
      await api.patch(`/farmers/${farmer.id}/`, farmerPayload(form, { isEdit: true }))
      showToast('Farmer profile updated successfully.', 'success')
      draft.clear()
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      const fallback = 'Unable to update farmer. Please check the form and try again.'
      if (data && typeof data === 'object' && !data.detail) {
        const byField = {}
        Object.entries(data).forEach(([k, v]) => { if (k !== 'non_field_errors') byField[k] = Array.isArray(v) ? v[0] : v })
        setFieldErrors(byField)
        setFormError(data.non_field_errors?.[0] || (Object.keys(byField).length ? 'Please correct the errors below.' : fallback))
      } else {
        setFormError(data?.detail || fallback)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Farmer"
      subtitle={`Correct the details of ${farmer.full_name || 'this farmer'}`}
      icon={UserCog}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={(
        <>
          <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button isLoading={isSubmitting} disabled={isSubmitting || !isDirty} type="submit" form="edit-farmer-form" variant="primary">Save Changes</Button>
        </>
      )}
    >
      <form id="edit-farmer-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <FarmerFormSections form={form} onChange={change} problems={farmerProblems(form, new Date(), { isEdit: true })} serverErrors={fieldErrors} prefixNote={prefixNote}
          farmerOrganizations={farmer.organizations || []} rsbsaNumber={farmer.rsbsa_number} isEdit idPrefix="edit_" />
        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <p className="text-[13px] font-medium text-red-700">{formError}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k} className="text-[12px] text-red-600"><span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span> {v}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </ModalShell>
  )
}

export default EditFarmerModal
