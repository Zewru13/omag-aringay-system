import { useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import FormField, { FormLabel, baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { FISHERFOLK_DISASTER_TYPES, saveErrorMessage } from './fisheriesDisasterConstants.js'
import { DamagePhotosField } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'
import FisherfolkDisasterPanel from './FisherfolkDisasterPanel.jsx'
import FisherfolkMultiSelect from './FisherfolkMultiSelect.jsx'
import { todayLocal } from './fisheriesStockLosses.js'
import { MAX_FISHERFOLK, buildGroups, eventProblem, multiPayload, removePerson, togglePerson } from './multiFisherfolkDisaster.js'

// Log Disaster (Admin > Disaster > Fisheries Disaster) for one or SEVERAL fisherfolk in a single submission. Choose the fisherfolk in the
// multi-select (search by name or registration number; each can be removed again), fill in the event once (date, type, description, photos), then
// give each fisherfolk their own part: the stocks and ponds/cages hit with the fingerlings lost, the equipment damaged and the volume lost
// (FisherfolkDisasterPanel). POST /fisheries/disaster-reports/multi/ saves one disaster log per fisherfolk, all or nothing, each with its own
// photos, recovery and notifications. onSaved(logs) receives the saved logs (the rows the Fisheries Disaster table lists).

export default function MultiFisherfolkDisasterModal({ onClose, onSaved }) {
  const { showToast } = useToast()
  const damagePhotos = useDamagePhotos()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // What is typed is a draft: still here when the page is opened again (see hooks/useDraftForm.js). Each panel keeps its own.
  const draft = useDraftForm('fisheries-multi-disaster')
  const [people, setPeople] = useDraftField(draft, 'people', [])
  const [form, setForm] = useDraftField(draft, 'form', {
    date_of_occurrence: todayLocal(), disaster_type: 'Typhoon', disaster_type_other_specify: '', estimated_damage: '',
  })
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const panels = useRef({})   // fisherfolk id -> the panel's handle (validate / entry / clearDraft)

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
      const r = await api.post('/fisheries/disaster-reports/multi/', multiPayload({ fields, groups: buildGroups(entries), photos: damagePhotos.photos }))
      showToast(people.length === 1 ? `Disaster logged for ${people[0].full_name}.` : `Disaster logged for ${people.length} fisherfolk.`, 'success')
      Object.values(panels.current).forEach((panel) => panel?.clearDraft())
      draft.clear()
      onSaved(Array.isArray(r.data) ? r.data : [])
    } catch (err) {
      // Never a false success; the form keeps everything entered so the Admin can fix it and retry.
      showToast(saveErrorMessage(err), 'error')
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
      <form id="multi-fisherfolk-disaster-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
        <DraftBanner draft={draft} />

        <FormField label="Fisherfolk" required>
          <FisherfolkMultiSelect selected={people} max={MAX_FISHERFOLK}
            onToggle={togglePersonChoice} />
        </FormField>

        {/* The event: filled in once, the same for every fisherfolk. */}
        <section className="space-y-4" aria-label="The disaster">
          <h3 className="text-sm font-semibold text-slate-800">The disaster</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-4">
              <FormField label="Date of Occurrence" required>
                <input type="date" className={baseInputClasses} required value={form.date_of_occurrence} max={todayLocal()}
                  onChange={(e) => set('date_of_occurrence', e.target.value)} />
              </FormField>
              <FormField label="Disaster Type" required>
                <select className={baseInputClasses} value={form.disaster_type} onChange={(e) => set('disaster_type', e.target.value)}>
                  {FISHERFOLK_DISASTER_TYPES.map((d) => <option key={d}>{d}</option>)}
                </select>
                {form.disaster_type === 'Other' && (
                  <input className={`${baseInputClasses} mt-2`} value={form.disaster_type_other_specify} maxLength={150} required
                    onChange={(e) => set('disaster_type_other_specify', e.target.value)} placeholder="Specify disaster type" />
                )}
              </FormField>
            </div>
            <div className="flex flex-col">
              <FormLabel>Description of Damage</FormLabel>
              <textarea rows={5} className="min-h-[8rem] w-full flex-1 resize-none rounded-lg border border-[#E2E8E2] bg-white px-3 py-2 text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] transition-colors focus:border-[#1B4D2E] focus:outline-none"
                value={form.estimated_damage} onChange={(e) => set('estimated_damage', e.target.value)}
                placeholder="Describe the damage to the stock, pond/cage and equipment" />
            </div>
          </div>
          <DamagePhotosField photosState={damagePhotos} />
          <p className="text-xs text-slate-500">The date, type, description and photos are saved on every fisherfolk's own disaster log.</p>
        </section>

        {/* Each fisherfolk's own part. */}
        {people.length > 0 && (
          <section className="space-y-3" aria-label="Each fisherfolk">
            <h3 className="text-sm font-semibold text-slate-800">Affected stocks, equipment and losses per fisherfolk</h3>
            {people.map((person) => (
              <FisherfolkDisasterPanel
                key={person.id}
                ref={(handle) => { if (handle) panels.current[person.id] = handle; else delete panels.current[person.id] }}
                person={person}
                showErrors={submitted}
                onRemove={() => removeChosen(person.id)}
              />
            ))}
          </section>
        )}
      </form>
    </ModalShell>
  )
}
