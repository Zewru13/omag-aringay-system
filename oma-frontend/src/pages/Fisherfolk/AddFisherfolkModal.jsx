import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import FisherfolkFormSections from './FisherfolkFormSections.jsx'
import { EMPTY_FISHERFOLK, changeFisherfolk, firstFisherfolkProblem, fisherfolkPayload, fisherfolkProblems } from './fisherfolkForm.js'

// Register Fisherfolk. The form itself (FisherfolkFormSections.jsx) is the one Edit Fisherfolk draws too; this window adds the draft, the
// warning about a possible duplicate and the saving.
function AddFisherfolkModal({ onClose, onSuccess }) {
  // What is typed is a draft: it is still here when the window is opened again (see hooks/useDraftState.js).
  const [form, setForm, draft] = useDraftState('register-fisherfolk', () => EMPTY_FISHERFOLK)
  const [organizations, setOrganizations] = useState([])
  const [prefixNote, setPrefixNote] = useState('')
  const [tried, setTried] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [duplicates, setDuplicates] = useState([])
  const [dupChecking, setDupChecking] = useState(false)
  const dupTimer = useRef(null)

  useEffect(() => {
    api.get('/organizations/fisherfolk/')
      .then((r) => setOrganizations(r.data.results || r.data))
      .catch(() => setOrganizations([]))
  }, [])

  const { first_name: firstName, last_name: lastName, birthdate } = form
  useEffect(() => {
    clearTimeout(dupTimer.current)
    if (!firstName.trim() || !lastName.trim() || !birthdate) return undefined
    dupTimer.current = setTimeout(async () => {
      setDupChecking(true)
      try {
        const r = await api.get('/fisheries/fisherfolk/check-duplicate/', {
          params: { first_name: firstName.trim(), last_name: lastName.trim(), birth_date: birthdate },
        })
        setDuplicates(r.data?.duplicates || [])
      } catch {
        setDuplicates([])
      } finally {
        setDupChecking(false)
      }
    }, 500)
    return () => clearTimeout(dupTimer.current)
  }, [firstName, lastName, birthdate])
  // A possible duplicate is only about a complete name and birthdate; an incomplete one shows none.
  const shownDuplicates = firstName.trim() && lastName.trim() && birthdate ? duplicates : []

  const change = (field, value) => {
    const next = changeFisherfolk(form, field, value)
    setForm(next.form)
    if (field === 'gender' || field === 'prefix') setPrefixNote(next.prefixNote)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    setFieldErrors({})
    setTried(true)
    const problem = firstFisherfolkProblem(form)
    if (problem) { setFormError(problem); return }

    setIsSubmitting(true)
    try {
      await api.post('/fisheries/fisherfolk/', fisherfolkPayload(form))
      draft.clear()
      onSuccess()
      onClose()
    } catch (error) {
      const data = error.response?.data
      const fallback = 'Unable to register fisherfolk. Please check the form and try again.'
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
      title="Register Fisherfolk"
      subtitle="Fill in the fisherfolk's details below"
      icon={Fish}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={(
        <>
          <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" form="add-fisherfolk-form" variant="primary">Save Fisherfolk</Button>
        </>
      )}
    >
      <form id="add-fisherfolk-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <FisherfolkFormSections form={form} onChange={change} problems={fisherfolkProblems(form)} serverErrors={fieldErrors} prefixNote={prefixNote}
          tried={tried} organizations={organizations} />

        {dupChecking && <p className="text-[12px] italic text-[#7A8E7A]">Checking for duplicate entries…</p>}
        {!dupChecking && shownDuplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 text-amber-600" />
              <p className="text-[13px] font-semibold text-amber-800">
                Possible duplicate{shownDuplicates.length > 1 ? 's' : ''} found. You may still save.
              </p>
            </div>
            <ul className="space-y-1">
              {shownDuplicates.map((d) => (
                <li key={d.id} className="text-[12px] text-amber-800">
                  <span className="font-medium">{d.full_name}</span>
                  {d.barangay ? `, ${d.barangay}` : ''}
                  {d.rsbsa_number ? ` (RSBSA: ${d.rsbsa_number})` : ''}
                </li>
              ))}
            </ul>
          </div>
        )}

        {formError && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3" role="alert">
            <p className="text-[13px] font-medium text-red-700">{formError}</p>
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

export default AddFisherfolkModal
