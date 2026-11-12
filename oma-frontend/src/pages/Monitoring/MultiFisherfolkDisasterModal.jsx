import { useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { FISHERFOLK_DISASTER_TYPES, saveErrorMessage } from './fisheriesDisasterConstants.js'
import { photoProblem } from './userPhotos.js'
import FisherfolkDisasterPanel from './FisherfolkDisasterPanel.jsx'
import FisherfolkMultiSelect from './FisherfolkMultiSelect.jsx'
import { todayLocal } from './fisheriesStockLosses.js'
import { MAX_FISHERFOLK, buildGroups, eventProblem, multiPayload, removePerson, togglePerson } from './multiFisherfolkDisaster.js'

// Log Disaster (Admin > Disaster > Fisheries Disaster) for one or SEVERAL fisherfolk in a single submission. Choose the fisherfolk in the
// multi-select (search by name or registration number; each can be removed again), fill in the event once (date, type, description), then
// give each fisherfolk their own part: the stocks and ponds/cages hit with the fingerlings lost, the equipment damaged and the volume lost
// (FisherfolkDisasterPanel). POST /fisheries/disaster-reports/multi/ saves one disaster log per fisherfolk, all or nothing, each with its own
// photos, recovery and notifications. onSaved(logs) receives the saved logs (the rows the Fisheries Disaster table lists).

export default function MultiFisherfolkDisasterModal({ onClose, onSaved }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // What is typed is a draft: still here when the page is opened again (see hooks/useDraftForm.js). Each panel keeps its own.
  const draft = useDraftForm('fisheries-multi-disaster')
  const [people, setPeople] = useDraftField(draft, 'people', [])
  const [form, setForm] = useDraftField(draft, 'form', {
    date_of_occurrence: todayLocal(), disaster_type: 'Typhoon', disaster_type_other_specify: '', estimated_damage: '',
  })
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const panels = useRef({})   // fisherfolk id -> the row's handle (validate / entry / photos / clearDraft)

  // Removing a fisherfolk (by their chip, by choosing them again, or by their panel) throws away what was typed for them. This is done here, not
  // inside the state update, because it changes the panel's own state.
  const removeChosen = (id) => { panels.current[id]?.clearDraft(); setPeople(removePerson(people, id)) }
  const togglePersonChoice = (person) => (people.some((p) => p.id === person.id) ? removeChosen(person.id) : setPeople(togglePerson(people, person)))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setSubmitted(true)
    const problem = eventProblem({ date: form.date_of_occurrence, type: form.disaster_type, typeOther: form.disaster_type_other_specify, people }, todayLocal())
    if (problem) { showToast(problem, 'error'); return }
    for (const person of people) {
      const own = panels.current[person.id]?.validate(form.date_of_occurrence)
      if (own) { showToast(own, 'error'); return }
    }
    setIsSubmitting(true)
    try {
      const entries = people.map((person) => ({ person, ...panels.current[person.id].entry() }))
      const fields = {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify.trim() : '',
        date_of_occurrence: form.date_of_occurrence,
        estimated_damage: form.estimated_damage.trim(),
      }
      // Every fisherfolk's photos are their own: asked of their row, sent as photos_<fisherfolk id>, saved on their log only.
      const photosByUser = Object.fromEntries(people.map((person) => [person.id, panels.current[person.id].photos()]))
      const r = await api.post('/fisheries/disaster-reports/multi/', multiPayload({ fields, groups: buildGroups(entries), photosByUser }))
      showToast(people.length === 1 ? `Disaster logged for ${people[0].full_name}.` : `Disaster logged for ${people.length} fisherfolk.`, 'success')
      Object.values(panels.current).forEach((panel) => panel?.clearDraft())
      draft.clear()
      onSaved(Array.isArray(r.data) ? r.data : [])
    } catch (err) {
      // Never a false success; the form keeps everything entered so the Admin can fix it and retry.
      showToast(photoProblem(err?.response?.data, (id) => people.find((p) => String(p.id) === id)?.full_name) || saveErrorMessage(err), 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell
      title="Log Disaster"
      subtitle={people.length > 1 ? `Fisheries disaster · ${people.length} fisherfolk` : 'Fisheries disaster'}
      icon={AlertTriangle}
      iconBg="bg-rose-100"
      iconColor="text-rose-600"
      onClose={onClose}
      maxWidth="max-w-5xl"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="multi-fisherfolk-disaster-form" isLoading={isSubmitting} disabled={isSubmitting || people.length === 0}>
          {people.length > 1 ? `Log Disaster for ${people.length} Fisherfolk` : 'Log Disaster'}
        </Button>
      </>}
    >
      <form id="multi-fisherfolk-disaster-form" onSubmit={handleSubmit} className="space-y-3" noValidate>
        <DraftBanner draft={draft} />

        <FormSection title="Fisherfolk">
          <FormRows label="Fisherfolk">
            <FormRow>
              <FormCell label="Fisherfolk" required wide>
                <FisherfolkMultiSelect selected={people} max={MAX_FISHERFOLK}
                  onToggle={togglePersonChoice} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>

        {/* The event: filled in once, the same for every fisherfolk. */}
        <FormSection title="The Disaster">
          <FormRows label="The disaster">
            <FormRow>
              <FormCell label="Date of Occurrence" required>
                <input type="date" className={baseInputClasses} required value={form.date_of_occurrence} max={todayLocal()}
                  onChange={(e) => set('date_of_occurrence', e.target.value)} />
              </FormCell>
              <FormCell label="Disaster Type" required>
                <select className={baseInputClasses} value={form.disaster_type} onChange={(e) => set('disaster_type', e.target.value)}>
                  {FISHERFOLK_DISASTER_TYPES.map((d) => <option key={d}>{d}</option>)}
                </select>
              </FormCell>
            </FormRow>
            {form.disaster_type === 'Other' && (
              <FormRow>
                <FormCell label="Specify Disaster Type" required wide>
                  <input className={baseInputClasses} value={form.disaster_type_other_specify} maxLength={150} required
                    onChange={(e) => set('disaster_type_other_specify', e.target.value)} placeholder="Specify disaster type" />
                </FormCell>
              </FormRow>
            )}
            <FormRow>
              <FormCell label="Description of Damage" wide>
                <textarea rows={3} className={`${baseInputClasses} min-h-[5rem] resize-none`}
                  value={form.estimated_damage} onChange={(e) => set('estimated_damage', e.target.value)}
                  placeholder="Describe the damage to the stock, pond/cage and equipment" />
              </FormCell>
            </FormRow>
          </FormRows>
          <p className="border-t border-[#F0F4F0] px-3 py-2 text-[11.5px] text-[#7A8E7A]">The date, type and description are saved on every fisherfolk's own disaster log. Photos, stocks and equipment are entered per fisherfolk, below.</p>
        </FormSection>

        {/* Each fisherfolk's own part: their stocks and losses, equipment, volume lost and their own photos. */}
        {people.length > 0 && (
          <div className="space-y-3" aria-label="Each fisherfolk">
            <p className="text-[11.5px] text-[#7A8E7A]">Photos are optional (up to 10 per fisherfolk, JPG, PNG or WEBP, 5 MB each) and are saved only on that fisherfolk's log. Removing a fisherfolk removes their photos.</p>
            {people.map((person) => (
              <FisherfolkDisasterPanel
                key={person.id}
                ref={(handle) => { if (handle) panels.current[person.id] = handle; else delete panels.current[person.id] }}
                person={person}
                showErrors={submitted}
                onRemove={() => removeChosen(person.id)}
              />
            ))}
          </div>
        )}
      </form>
    </ModalShell>
  )
}
