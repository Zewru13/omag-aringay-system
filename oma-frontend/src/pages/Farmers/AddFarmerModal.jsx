import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import FarmerFormSections from './FarmerFormSections.jsx'
import { EMPTY_FARMER, changeFarmer, farmerPayload, farmerProblems, firstFarmerProblem } from './farmerForm.js'
import MachineryEditor from './MachineryEditor.jsx'
import { machineryPayload, machineryProblem } from './parcelRows.js'

// Register Farmer. The farmer form itself (FarmerFormSections.jsx) is the one Edit Farmer draws too; this window adds the machinery the farmer has,
// the step on to the farm parcels, the draft, the warning about a possible duplicate and the saving.
function AddFarmerModal({ onClose, onSuccess }) {
  // What is typed is a draft: it is still here when the window is opened again (see hooks/useDraftState.js).
  const [work, setWork, draft] = useDraftState('register-farmer', () => ({ form: EMPTY_FARMER, machinery: [] }))
  const { form, machinery } = work   // machinery: what the farmer has, saved with the farmer
  const setForm = (next) => setWork((w) => ({ ...w, form: typeof next === 'function' ? next(w.form) : next }))
  const setMachinery = (next) => setWork((w) => ({ ...w, machinery: typeof next === 'function' ? next(w.machinery) : next }))
  const [organizations, setOrganizations] = useState([])
  const [prefixNote, setPrefixNote] = useState('')
  const [tried, setTried] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const navigate = useNavigate()
  const [duplicates, setDuplicates] = useState([])
  const [dupChecking, setDupChecking] = useState(false)
  const dupTimer = useRef(null)

  useEffect(() => {
    api.get('/organizations/farmers/')
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
        const r = await api.get('/farmers/check-duplicate/', { params: { first_name: firstName.trim(), last_name: lastName.trim(), birth_date: birthdate } })
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
    const next = changeFarmer(form, field, value)
    setForm(next.form)
    if (field === 'gender' || field === 'prefix') setPrefixNote(next.prefixNote)
  }

  // `thenParcels`: after the farmer is saved, go on to the Add Farm Parcels table for this farmer.
  const handleSubmit = async (event, thenParcels = false) => {
    event.preventDefault()
    setFormError('')
    setFieldErrors({})
    setTried(true)
    const problem = firstFarmerProblem(form)
    if (problem) { setFormError(problem); return }
    for (let i = 0; i < machinery.length; i += 1) {
      const machineProblem = machineryProblem(machinery[i])
      if (machineProblem) { setFormError(`Machinery ${i + 1}: ${machineProblem}.`); return }
    }

    setIsSubmitting(true)
    try {
      const { data: created } = await api.post('/farmers/', { ...farmerPayload(form), machinery: machinery.map(machineryPayload) })
      draft.clear()
      onSuccess()
      onClose()
      // Still in Registration > Farmers: the parcels page belongs to this farmer and returns to the profile.
      if (thenParcels && created?.id) navigate(`/farmers/${created.id}/add-parcels`)
    } catch (error) {
      const data = error.response?.data
      const fallback = 'Unable to register farmer. Please check the form and try again.'
      if (Array.isArray(data?.machinery)) {
        const at = data.machinery.findIndex((line) => line && Object.keys(line).length > 0)
        const first = Object.values(data.machinery[at] || {})[0]
        setFormError(`Machinery ${at + 1}: ${Array.isArray(first) ? first[0] : first || 'check this line'}`)
      } else if (data && typeof data === 'object' && !data.detail) {
        const byField = {}
        Object.entries(data).forEach(([k, v]) => { if (k !== 'non_field_errors') byField[k] = Array.isArray(v) ? v[0] : v })
        setFieldErrors(byField)
        setFormError(data.non_field_errors?.[0] || byField.rsbsa_number || (Object.keys(byField).length ? 'Please correct the errors below.' : fallback))
      } else {
        setFormError(data?.detail || fallback)
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Register Farmer"
      subtitle="Fill in the farmer's details below"
      icon={UserPlus}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={(
        <>
          <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" form="add-farmer-form" variant="primary">Save Farmer</Button>
        </>
      )}
    >
      <form id="add-farmer-form" onSubmit={handleSubmit} className="space-y-3">
        <DraftBanner draft={draft} />
        <FarmerFormSections form={form} onChange={change} problems={farmerProblems(form)} serverErrors={fieldErrors} prefixNote={prefixNote} tried={tried}
          organizations={organizations} />

        <FormSection title="Agricultural Machinery">
          <div className="space-y-2 p-3">
            <p className="text-[12px] text-[#7A8E7A]">Optional. The machinery the farmer has or uses, whoever owns it. It can also be added later on the farmer&apos;s profile.</p>
            <MachineryEditor machinery={machinery} onChange={setMachinery} />
          </div>
        </FormSection>

        <FormSection title="Farm Parcels and Crops">
          <div className="space-y-2 p-3">
            <p className="text-[12px] text-[#7A8E7A]">Optional. Save the farmer and add their farm parcels, with the crops planted on each, in a table. When you save the parcels you come back to the farmer&apos;s profile.</p>
            <Button type="button" variant="outline" isLoading={isSubmitting} disabled={isSubmitting} onClick={(e) => handleSubmit(e, true)}>
              Save Farmer &amp; Add Farm Parcels
            </Button>
          </div>
        </FormSection>

        {dupChecking && <p className="text-[12px] italic text-[#7A8E7A]">Checking for duplicate entries…</p>}
        {!dupChecking && shownDuplicates.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-3">
            <div className="mb-2 flex items-center gap-2">
              <AlertTriangle size={15} className="flex-shrink-0 text-amber-600" />
              <p className="text-[13px] font-semibold text-amber-800">Possible duplicate{shownDuplicates.length > 1 ? 's' : ''} found. You may still save.</p>
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

export default AddFarmerModal
