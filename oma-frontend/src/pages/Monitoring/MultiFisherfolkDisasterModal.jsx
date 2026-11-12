import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import { FISHERFOLK_DISASTER_TYPES, saveErrorMessage } from './fisheriesDisasterConstants.js'
import { photoProblem } from './userPhotos.js'
import FisherfolkDisasterPanel from './FisherfolkDisasterPanel.jsx'
import FisherfolkMultiSelect from './FisherfolkMultiSelect.jsx'
import FisheriesDisasterTargetsTable from './FisheriesDisasterTargetsTable.jsx'
import { todayLocal } from './fisheriesStockLosses.js'
import {
  prepareStocks, pruneSelection, rowsOf, rowsProblem, selectRows, selectedPeople, selectionStats, stockLossesOf, summaryLine,
} from './disasterPonds.js'
import { MAX_FISHERFOLK, buildGroups, eventProblem, multiPayload, removePerson, togglePerson } from './multiFisherfolkDisaster.js'

// Log Disaster (Admin > Disaster > Fisheries Disaster) for the ponds and cages of one or SEVERAL fisherfolk in a single submission, like the crop
// Log Disaster over many parcels. Fill in the event once (date, type, description), then tick the ponds and cages that were hit in the table of every
// active pond and cage (search, filter by fisherfolk or barangay; GET /fisheries/disaster-reports/targets/) and give each the fingerlings lost, or
// tick Total loss. Every fisherfolk with something ticked gets a part of their own below it: the equipment damaged, the volume lost and their own
// photos (FisherfolkDisasterPanel). A fisherfolk whose damage is to a pond, cage or equipment only, not to a stock, is added by name in the
// section between. POST /fisheries/disaster-reports/multi/ saves one disaster log per fisherfolk, all or nothing, each with its own photos, recovery
// and notifications. onSaved(logs) receives the saved logs (the rows the Fisheries Disaster table lists).

const NOTHING_CHOSEN = 'Tick at least one pond or cage, or add a fisherfolk with damage that is not linked to a stock.'

export default function MultiFisherfolkDisasterModal({ onClose, onSaved }) {
  const { showToast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  // What is typed is a draft: still here when the page is opened again (see hooks/useDraftForm.js). Each part keeps its own.
  const draft = useDraftForm('fisheries-multi-disaster')
  const [form, setForm] = useDraftField(draft, 'form', {
    date_of_occurrence: todayLocal(), disaster_type: 'Typhoon', disaster_type_other_specify: '', estimated_damage: '',
  })
  const [selection, setSelection] = useDraftField(draft, 'selection', {})   // ticked ponds/cages: row key -> { lost, total }
  const [others, setOthers] = useDraftField(draft, 'others', [])            // fisherfolk whose damage is not linked to a stock
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const panels = useRef({})   // fisherfolk id -> the part's handle (validate / entry / photos / clearDraft)

  const [targets, setTargets] = useState(null)   // the prepared stocks; null while loading, false when it failed
  const [reload, setReload] = useState(0)
  useEffect(() => {
    let alive = true
    api.get('/fisheries/disaster-reports/targets/')
      .then((r) => {
        if (!alive) return
        const stocks = prepareStocks(r.data?.stocks)
        setTargets(stocks)
        setSelection((current) => pruneSelection(current, stocks))   // a restored draft may name ponds that were harvested since
      })
      .catch(() => alive && setTargets(false))
    return () => { alive = false }
  }, [reload]) // eslint-disable-line react-hooks/exhaustive-deps

  const stocks = useMemo(() => targets || [], [targets])
  const linked = useMemo(() => selectedPeople(selection, stocks), [selection, stocks])
  // A fisherfolk with ponds ticked is reported through those; the list of "not linked to a stock" is for the others.
  const unlinked = useMemo(() => others.filter((p) => !linked.some((l) => l.id === p.id)), [others, linked])
  const people = useMemo(() => [...linked, ...unlinked], [linked, unlinked])
  const stats = selectionStats(selection, stocks)

  // Removing a fisherfolk throws away what was typed for them. This is done here, not inside the state update, because it changes the part's own state.
  const removeLinked = (id) => {
    panels.current[id]?.clearDraft()
    setSelection(selectRows(selection, rowsOf(stocks.filter((s) => s.fisherfolk_id === id)), false))
  }
  const removeUnlinked = (id) => { panels.current[id]?.clearDraft(); setOthers(removePerson(others, id)) }
  const toggleOther = (person) => {
    if (linked.some((l) => l.id === person.id)) { showToast(`${person.full_name} has ponds or cages ticked above: their report covers them.`, 'error'); return }
    if (others.some((p) => p.id === person.id)) removeUnlinked(person.id)
    else setOthers(togglePerson(others, person))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setSubmitted(true)
    if (targets === null) { showToast('Still loading the ponds and cages.', 'error'); return }
    if (!people.length) { showToast(NOTHING_CHOSEN, 'error'); return }
    const problem = eventProblem({ date: form.date_of_occurrence, type: form.disaster_type, typeOther: form.disaster_type_other_specify, people }, todayLocal())
    if (problem) { showToast(problem, 'error'); return }
    const rows = rowsProblem(selection, stocks)
    if (rows) { showToast(rows, 'error'); return }
    for (const person of linked) {
      // The disaster cannot predate the stocking of anything it affected.
      if (person.latestStocked && form.date_of_occurrence < person.latestStocked) {
        showToast(`${person.full_name}: Date of occurrence cannot be before a ticked stock's stocking date (${fmtLong(person.latestStocked)}).`, 'error')
        return
      }
    }
    for (const person of people) {
      const own = panels.current[person.id]?.validate()
      if (own) { showToast(own, 'error'); return }
    }
    setIsSubmitting(true)
    try {
      const entries = people.map((person) => {
        const own = panels.current[person.id].entry()
        return { person, ...own, stockLosses: own.mode === 'stocks' ? stockLossesOf(person.id, selection, stocks) : [] }
      })
      const fields = {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify.trim() : '',
        date_of_occurrence: form.date_of_occurrence,
        estimated_damage: form.estimated_damage.trim(),
      }
      // Every fisherfolk's photos are their own: asked of their part, sent as photos_<fisherfolk id>, saved on their log only.
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

  const summary = (person) => (person.stocks !== undefined
    ? [`${person.units} ${person.units === 1 ? 'pond/cage' : 'ponds/cages'} of ${person.stocks} ${person.stocks === 1 ? 'stock' : 'stocks'}`,
      person.total ? `${person.total} total loss` : '', person.lost ? `${person.lost.toLocaleString()} ${person.lost === 1 ? 'fingerling' : 'fingerlings'} lost` : ''].filter(Boolean).join(' · ')
    : 'Not linked to a stock (pond, cage or equipment damage only)')

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
          <p className="border-t border-[#F0F4F0] px-3 py-2 text-[11.5px] text-[#7A8E7A]">The date, type and description are saved on every fisherfolk's own disaster log. Photos, equipment and volume lost are entered per fisherfolk, below the ponds and cages.</p>
        </FormSection>

        {/* The ponds and cages that were hit, across every fisherfolk. */}
        <div className="space-y-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Affected ponds and cages</h3>
          <p className="text-[12.5px] text-[#4A5E4A]" role="status">{summaryLine(stats)}{stats.total ? ` · ${stats.total} total loss` : ''}</p>
          {targets === null && <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-10 text-center text-[13px] text-[#7A8E7A]">Loading the ponds and cages…</p>}
          {targets === false && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[13px] text-rose-700">
              <span className="flex-1">The ponds and cages could not be loaded.</span>
              <Button type="button" variant="outline" onClick={() => { setTargets(null); setReload((n) => n + 1) }}>Try again</Button>
            </div>
          )}
          {targets && <FisheriesDisasterTargetsTable stocks={stocks} selection={selection} onChange={setSelection} showErrors={submitted} />}
        </div>

        {/* A fisherfolk whose damage is not to a stock (a pond, cage or equipment only). */}
        <FormSection title="Damage not linked to a stock">
          <FormRows label="Damage not linked to a stock">
            <FormRow>
              <FormCell label="Fisherfolk" wide hint={<p className="mt-1 text-[11.5px] text-[#7A8E7A]">Optional. For a fisherfolk whose pond, cage or equipment was damaged but no stock was lost. They need a pond or cage on record.</p>}>
                <FisherfolkMultiSelect selected={unlinked} max={MAX_FISHERFOLK} onToggle={toggleOther} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>

        {/* Each fisherfolk's own part: their equipment, volume lost and their own photos. */}
        {people.length > 0 && (
          <div className="space-y-3" aria-label="Each fisherfolk">
            <p className="text-[11.5px] text-[#7A8E7A]">Photos are optional (up to 10 per fisherfolk, JPG, PNG or WEBP, 5 MB each) and are saved only on that fisherfolk's log. Removing a fisherfolk removes their photos, and un-ticks their ponds and cages.</p>
            {people.map((person) => {
              const isLinked = person.stocks !== undefined
              return (
                <FisherfolkDisasterPanel
                  key={person.id}
                  ref={(handle) => { if (handle) panels.current[person.id] = handle; else delete panels.current[person.id] }}
                  person={person}
                  mode={isLinked ? 'stocks' : 'unlinked'}
                  summary={summary(person)}
                  onRemove={() => (isLinked ? removeLinked(person.id) : removeUnlinked(person.id))}
                />
              )
            })}
          </div>
        )}
      </form>
    </ModalShell>
  )
}
