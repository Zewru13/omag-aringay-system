import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import FisherfolkFormSections from '../Fisherfolk/FisherfolkFormSections.jsx'
import { changeFisherfolk, firstFisherfolkProblem, fisherfolkFormFrom, fisherfolkPayload, fisherfolkProblems } from '../Fisherfolk/fisherfolkForm.js'

// Edit Fisherfolk: the Register Fisherfolk form (FisherfolkFormSections.jsx), filled in with the record. Every field of the register form
// can be corrected here; only the organization is shown without a box, because membership is kept on the organization pages.
function EditFisherfolkModal({ fisherfolk, onClose, onSuccess }) {
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`edit-fisherfolk:${fisherfolk.id}`)
  const [form, setForm] = useDraftField(draft, 'form', () => fisherfolkFormFrom(fisherfolk))
  const [prefixNote, setPrefixNote] = useState('')
  const [tried, setTried] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const change = (field, value) => {
    const next = changeFisherfolk(form, field, value)
    setForm(next.form)
    if (field === 'gender' || field === 'prefix') setPrefixNote(next.prefixNote)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setFieldErrors({})
    setTried(true)
    const problem = firstFisherfolkProblem(form)
    if (problem) { setError(problem); return }

    setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/fisherfolk/${fisherfolk.id}/`, fisherfolkPayload(form, { isEdit: true }))
      showToast('Fisherfolk profile updated successfully.', 'success')
      draft.clear()
      onSuccess()
      onClose()
    } catch (err) {
      const data = err.response?.data
      if (data && typeof data === 'object' && !data.detail) {
        const byField = {}
        Object.entries(data).forEach(([k, v]) => { if (k !== 'non_field_errors') byField[k] = Array.isArray(v) ? v[0] : v })
        setFieldErrors(byField)
        setError(data.non_field_errors?.[0] || 'Please correct the errors below.')
      } else {
        setError(data?.detail || 'Unable to update profile. Please check the form and try again.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Fisherfolk"
      subtitle={`Correct the details of ${fisherfolk.full_name || 'this fisherfolk'}`}
      icon={Fish}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={(
        <>
          <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" form="edit-fisherfolk-form" variant="primary">Save Changes</Button>
        </>
      )}
    >
      <form id="edit-fisherfolk-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <FisherfolkFormSections form={form} onChange={change} problems={fisherfolkProblems(form)} serverErrors={fieldErrors} prefixNote={prefixNote}
          tried={tried} organizationNames={fisherfolk.organization_names || []} isEdit idPrefix="edit_" />
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <p className="text-[13px] font-medium text-red-700">{error}</p>
            {Object.keys(fieldErrors).length > 0 && (
              <ul className="mt-1 space-y-0.5">
                {Object.entries(fieldErrors).map(([k, v]) => (
                  <li key={k} className="text-[12px] text-red-600">
                    <span className="font-medium capitalize">{k.replace(/_/g, ' ')}:</span> {v}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </form>
    </ModalShell>
  )
}

export default EditFisherfolkModal
