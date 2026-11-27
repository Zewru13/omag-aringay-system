import { useEffect, useMemo, useRef, useState } from 'react'
import { ClipboardList, HeartPulse, Search, Utensils } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { todayISO } from '../../utils/localDate.js'
import {
  activeCycles, buildFeedingPayload, buildHealthPayload, cycleTickState, doneMessage, feedTotal, feedingProblem, fillAll, filterCycles, healthProblem,
  pickedUnits, saveLabel, serverProblem, toggleCycleUnits, unitName,
} from './bulkCycleLog.js'
import {
  FEED_TYPE_CHOICES, HEALTH_OBSERVATION_OPTIONS, HEALTH_RECOMMENDED_TREATMENT, HEALTH_TREATMENT_OPTIONS, LOG_ACTIVITY_OPTIONS, OTHER_FEED_OPTIONS, isForceObservation,
} from './cycleLogForms.js'
import { MEMBER_CYCLES_URL, WHO_APPEARS, asMemberCycles, nothingToLogText } from './memberLogging.js'

// "Log on many cycles" (the fisherfolk's Cycles page; the office does not have it): the same feeding, or the same observation, made
// on the ponds and cages of several production cycles is logged once. Choose Feeding Log or Health Log, fill in the details once, tick the cycles
// (Feeding: then the kg of each pond and cage, with a fill-all box) or the ponds and cages (Health: with the count of dead fish for each one
// when the observation is Fish Mortality), then save. The server saves all or none: if something cannot be saved (a pond that already has a Health
// Log in its cycle, for example) the message names the cycle and pond and the row turns red, so it can be unticked and the rest saved.
// With `forMembers` it is the fisherfolk cooperative's window: the cycles of its members who have no activated account, each named.
const BOX = 'h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-[#1B4D2E] focus:ring-[#1B4D2E]/30'
const ICONS = { feeding: Utensils, health: HeartPulse }
const listOf = (data) => (Array.isArray(data) ? data : data?.results || [])

function CycleBox({ state, label, onToggle }) {
  const ref = useRef(null)
  useEffect(() => { if (ref.current) ref.current.indeterminate = state === 'some' }, [state])
  return <input ref={ref} type="checkbox" className={BOX} checked={state === 'all'} onChange={onToggle} aria-label={label} />
}

export default function LogOnManyCyclesModal({ onClose, onDone, forMembers = false }) {
  const { showToast } = useToast()
  const today = todayISO()
  // What is typed is a draft: still here when the window is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(forMembers ? 'cycle-log-members' : 'cycle-log-many')
  const [kind, setKind] = useDraftField(draft, 'kind', 'feeding')
  const [feedForm, setFeedForm] = useDraftField(draft, 'feedForm', { date: today, feedType: '', feedOther: '', feedCustom: '', notes: '' })
  const [healthForm, setHealthForm] = useDraftField(draft, 'healthForm', { date: today, observation: '', observationOther: '', treatment: '', notes: '' })
  const [ticked, setTicked] = useDraftField(draft, 'ticked', {})     // feeding: { [cycleId]: true }
  const [qty, setQty] = useDraftField(draft, 'qty', {})              // feeding: { [unitId]: 'kg' }
  const [picked, setPicked] = useDraftField(draft, 'picked', {})     // health: { [unitId]: true }
  const [deaths, setDeaths] = useDraftField(draft, 'deaths', {})     // health: { [unitId]: 'count' }
  const [fillValue, setFillValue] = useState('')

  const [cycles, setCycles] = useState(null)         // null while loading, false when it failed
  const [memberCount, setMemberCount] = useState(0)   // for a cooperative: how many members it may log for
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [refused, setRefused] = useState({ cycles: new Set(), units: new Set() })
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    const rowsWanted = forMembers
      ? api.get(MEMBER_CYCLES_URL).then((r) => { if (alive) setMemberCount(r.data.member_count); return asMemberCycles(r.data.records) })
      : api.get('/monitoring/aquaculture-cycles/', { params: { status: 'Active' } }).then((r) => listOf(r.data))
    rowsWanted
      .then((rows) => alive && setCycles(activeCycles(rows)))
      .catch(() => alive && setCycles(false))
    return () => { alive = false }
  }, [forMembers])

  const available = useMemo(() => (Array.isArray(cycles) ? cycles : []), [cycles])
  const shown = useMemo(() => filterCycles(available, search), [available, search])
  const feeding = kind === 'feeding'
  const tickedCount = available.filter((c) => ticked[c.id]).length
  const pickedCount = pickedUnits(available, picked).length
  const count = feeding ? tickedCount : pickedCount
  const total = feedTotal(qty, available, ticked)

  const toggleCycle = (cycle) => setTicked((t) => { const next = { ...t }; if (next[cycle.id]) delete next[cycle.id]; else next[cycle.id] = true; return next })
  const toggleEveryShown = () => {
    if (feeding) {
      const all = shown.length > 0 && shown.every((c) => ticked[c.id])
      setTicked((t) => { const next = { ...t }; shown.forEach((c) => { if (all) delete next[c.id]; else next[c.id] = true }); return next })
    } else {
      const all = shown.length > 0 && shown.every((c) => cycleTickState(picked, c) === 'all')
      setPicked((p) => { let next = { ...p }; shown.forEach((c) => { if ((cycleTickState(next, c) === 'all') === all) next = toggleCycleUnits(next, c) }); return next })
    }
  }
  const everyShownTicked = shown.length > 0 && shown.every((c) => (feeding ? ticked[c.id] : cycleTickState(picked, c) === 'all'))

  const chooseObservation = (observation) => setHealthForm((f) => ({
    ...f, observation, observationOther: '', treatment: isForceObservation(observation) ? '' : (HEALTH_RECOMMENDED_TREATMENT[observation] || ''),
  }))

  const submit = async (e) => {
    e.preventDefault()
    setError(''); setRefused({ cycles: new Set(), units: new Set() })
    const problem = feeding ? feedingProblem(feedForm, available, ticked, qty) : healthProblem(healthForm, available, picked, deaths)
    if (problem) { setError(problem); return }
    setIsSubmitting(true)
    try {
      const url = feeding ? '/monitoring/aquaculture-cycles/bulk-feeding/' : '/monitoring/aquaculture-cycles/bulk-health/'
      const payload = feeding ? buildFeedingPayload(feedForm, available, ticked, qty) : buildHealthPayload(healthForm, available, picked, deaths)
      const r = await api.post(url, payload)
      showToast(doneMessage(kind, r.data?.logged ?? count), 'success')
      draft.clear()
      onDone()
    } catch (err) {
      const { message, cycleIds, unitIds } = serverProblem(err.response?.data)
      setError(message)
      setRefused({ cycles: new Set(cycleIds), units: new Set(unitIds) })
    } finally {
      setIsSubmitting(false)
    }
  }

  const failed = cycles === false
  const hForce = isForceObservation(healthForm.observation)
  return (
    <ModalShell
      title={forMembers ? 'Log for Members' : 'Log on Many Cycles'}
      subtitle={forMembers ? WHO_APPEARS : 'Did the same feeding or saw the same thing in several cycles? Log it once.'}
      icon={ClipboardList}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-many-cycles-form" isLoading={isSubmitting} disabled={count === 0}>{saveLabel(kind, count)}</Button>
        </>
      )}
    >
      <form id="log-many-cycles-form" onSubmit={submit} className="space-y-3">
        <DraftBanner draft={draft} />

        <div className="grid grid-cols-2 gap-2" role="group" aria-label="Which log">
          {LOG_ACTIVITY_OPTIONS.map((option) => {
            const Icon = ICONS[option.key]
            const on = kind === option.key
            return (
              <button key={option.key} type="button" aria-pressed={on} onClick={() => { setKind(option.key); setError(''); setRefused({ cycles: new Set(), units: new Set() }) }}
                className={`flex min-h-[48px] items-center justify-center gap-2 rounded-xl border px-3 text-[14px] font-semibold transition-colors ${on ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white' : 'border-[#C8D5C8] bg-white text-[#1B4D2E] hover:bg-[#F0F4F0]'}`}>
                <Icon size={16} aria-hidden="true" /> {option.label}
              </button>
            )
          })}
        </div>

        {feeding ? (
          <FormSection title="Feeding">
            <FormRows label="Feeding">
              <FormRow>
                <FormCell label="Date" required>
                  <input type="date" className={baseInputClasses} aria-label="Date" value={feedForm.date} max={today} onChange={(e) => setFeedForm((f) => ({ ...f, date: e.target.value }))} />
                </FormCell>
                <FormCell label="Feed Type" required>
                  <select className={baseInputClasses} aria-label="Feed Type" value={feedForm.feedType}
                    onChange={(e) => setFeedForm((f) => ({ ...f, feedType: e.target.value, feedOther: '', feedCustom: '' }))}>
                    <option value="" disabled>Select Feed Type</option>
                    {FEED_TYPE_CHOICES.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormCell>
              </FormRow>
              {feedForm.feedType === 'Others' && (
                <FormRow>
                  <FormCell label="Other Feed Type" required>
                    <select className={baseInputClasses} aria-label="Other Feed Type" value={feedForm.feedOther} onChange={(e) => setFeedForm((f) => ({ ...f, feedOther: e.target.value, feedCustom: '' }))}>
                      <option value="" disabled>Select Other Feed Type</option>
                      {OTHER_FEED_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </FormCell>
                  {feedForm.feedOther === 'Custom Feed' && (
                    <FormCell label="Custom Feed Name" required>
                      <input className={baseInputClasses} maxLength={100} aria-label="Custom Feed Name" value={feedForm.feedCustom} onChange={(e) => setFeedForm((f) => ({ ...f, feedCustom: e.target.value }))} placeholder="Enter feed name" />
                    </FormCell>
                  )}
                </FormRow>
              )}
              <FormRow>
                <FormCell label="Notes" wide>
                  <input className={baseInputClasses} aria-label="Notes" placeholder="Optional" value={feedForm.notes} onChange={(e) => setFeedForm((f) => ({ ...f, notes: e.target.value }))} />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Same kg for every pond" wide hint={<p className="mt-1 text-[11px] text-[#7A8E7A]">Fills the box of every pond and cage of the cycles you ticked. Each box can still be changed.</p>}>
                  <div className="flex items-center gap-2">
                    <DecimalInput decimals={2} value={fillValue} onChange={setFillValue} aria-label="Same kg for every pond" placeholder="e.g. 5" className={`${baseInputClasses} w-32! shrink-0`} />
                    <Button type="button" variant="outline" disabled={!fillValue || tickedCount === 0} onClick={() => setQty((q) => fillAll(q, available, ticked, fillValue))}>Fill</Button>
                  </div>
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>
        ) : (
          <FormSection title="Health">
            <FormRows label="Health">
              <FormRow>
                <FormCell label="Date" required>
                  <input type="date" className={baseInputClasses} aria-label="Date" value={healthForm.date} max={today} onChange={(e) => setHealthForm((f) => ({ ...f, date: e.target.value }))} />
                </FormCell>
                <FormCell label="Observation" required>
                  <select className={baseInputClasses} aria-label="Observation" value={healthForm.observation} onChange={(e) => chooseObservation(e.target.value)}>
                    <option value="" disabled>Select observation</option>
                    {HEALTH_OBSERVATION_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormCell>
              </FormRow>
              {healthForm.observation === 'Other' && (
                <FormRow>
                  <FormCell label="Describe the Observation" required wide>
                    <input className={baseInputClasses} aria-label="Describe the Observation" maxLength={190} value={healthForm.observationOther} onChange={(e) => setHealthForm((f) => ({ ...f, observationOther: e.target.value }))} />
                  </FormCell>
                </FormRow>
              )}
              {healthForm.observation && !hForce && (
                <FormRow>
                  <FormCell label="Treatment" required wide>
                    <select className={baseInputClasses} aria-label="Treatment" value={healthForm.treatment} onChange={(e) => setHealthForm((f) => ({ ...f, treatment: e.target.value }))}>
                      <option value="" disabled>Select treatment</option>
                      {HEALTH_TREATMENT_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </FormCell>
                </FormRow>
              )}
              {hForce && (
                <FormRow>
                  <FormCell label="Force Harvest" wide>
                    <p className="text-[12.5px] text-[#4A5E4A]">
                      {healthForm.observation === 'Fish Mortality' ? 'Type how many fish died in each pond or cage below. ' : ''}A pond or cage with this observation is marked for Force Harvest. Nothing is harvested by saving the log.
                    </p>
                  </FormCell>
                </FormRow>
              )}
              <FormRow>
                <FormCell label="Notes" wide>
                  <input className={baseInputClasses} aria-label="Notes" placeholder="Optional" value={healthForm.notes} onChange={(e) => setHealthForm((f) => ({ ...f, notes: e.target.value }))} />
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>
        )}

        <FormSection title={feeding ? `Cycles (${tickedCount} ticked)` : `Ponds and Cages (${pickedCount} ticked)`}>
          <div className="space-y-2 p-3">
            {cycles === null && <p className="px-1 py-6 text-center text-[13px] text-[#7A8E7A]">Loading the cycles…</p>}
            {failed && <p role="alert" className="px-1 py-6 text-center text-[13px] text-rose-600">The cycles could not be loaded. Close this window and try again.</p>}
            {Array.isArray(cycles) && available.length === 0 && (
              <p className="px-1 py-6 text-center text-[13px] text-[#7A8E7A]">
                {forMembers ? nothingToLogText(memberCount, 'an active cycle with ponds or cages') : 'You have no active cycle with ponds or cages, so there is nothing to log on.'}
              </p>
            )}
            {available.length > 0 && (
              <>
                <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3">
                  <Search size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
                  <input type="search" aria-label="Search cycles" placeholder={forMembers ? 'Search member, cycle or species…' : 'Search cycle or species…'} value={search} onChange={(e) => setSearch(e.target.value)}
                    className="h-[40px] w-full border-0 bg-transparent px-2 text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] focus:outline-none" />
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg bg-[#F0F4F0] px-3 text-[13px] font-semibold text-[#1A2B1A]">
                  <input type="checkbox" className={BOX} checked={everyShownTicked} onChange={toggleEveryShown} aria-label={feeding ? 'Tick every cycle' : 'Tick every pond and cage'} />
                  {feeding ? `Tick every cycle${search.trim() ? ' found' : ''} (${shown.length})` : `Tick every pond and cage${search.trim() ? ' found' : ''}`}
                </label>
                {shown.length === 0 && <p className="px-1 py-4 text-center text-[13px] text-[#7A8E7A]">No cycle matches that search.</p>}
                <ul className="max-h-[26rem] space-y-2 overflow-y-auto" aria-label="Cycles">
                  {shown.map((c) => {
                    const state = feeding ? (ticked[c.id] ? 'all' : 'none') : cycleTickState(picked, c)
                    return (
                      <li key={c.id} className={`overflow-hidden rounded-xl border ${refused.cycles.has(c.id) && !refused.units.size ? 'border-rose-400' : 'border-[#E2E8E2]'} bg-white`}>
                        <label className="flex min-h-[48px] cursor-pointer items-start gap-3 bg-[#F6FAF7] px-3 py-2">
                          <span className="mt-0.5"><CycleBox state={state} label={`Tick ${c.cycle_name}`} onToggle={() => (feeding ? toggleCycle(c) : setPicked((p) => toggleCycleUnits(p, c)))} /></span>
                          <span className="min-w-0">
                            <span className="block break-words text-[14px] font-semibold text-[#1A2B1A]">{c.cycle_name}</span>
                            <span className="block break-words text-[12.5px] text-[#4A5E4A]">{[c.species_farmed, c.culture_system, `${c.units.length} pond${c.units.length === 1 ? '' : 's'}/cage${c.units.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')}</span>
                          </span>
                        </label>
                        <ul className="divide-y divide-[#F0F4F0]">
                          {c.units.map((u) => {
                            const bad = refused.units.has(u.id)
                            return (
                              <li key={u.id} className={`flex flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 ${bad ? 'bg-rose-50' : ''}`}>
                                {feeding ? (
                                  <>
                                    <span className="w-24 shrink-0 text-[13px] font-medium text-[#1A2B1A]">{unitName(u)}</span>
                                    <div className="w-36">
                                      <DecimalInput decimals={2} disabled={!ticked[c.id]} value={qty[u.id] ?? ''} onChange={(v) => setQty((q) => ({ ...q, [u.id]: v }))}
                                        aria-label={`${c.cycle_name} ${unitName(u)} feed quantity (kg)`} placeholder="kg" className={`${baseInputClasses} md:text-right ${ticked[c.id] ? '' : 'opacity-50'}`} />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <label className="flex min-h-[40px] flex-1 cursor-pointer items-center gap-3 text-[13px] font-medium text-[#1A2B1A]">
                                      <input type="checkbox" className={BOX} checked={Boolean(picked[u.id])} aria-label={`Tick ${c.cycle_name} ${unitName(u)}`}
                                        onChange={() => setPicked((p) => { const next = { ...p }; if (next[u.id]) delete next[u.id]; else next[u.id] = true; return next })} />
                                      {unitName(u)}
                                    </label>
                                    {healthForm.observation === 'Fish Mortality' && picked[u.id] && (
                                      <input type="number" min="1" step="1" inputMode="numeric" className={`${baseInputClasses} w-36`} aria-label={`${c.cycle_name} ${unitName(u)} fish died`} placeholder="Fish died"
                                        value={deaths[u.id] ?? ''} onChange={(e) => setDeaths((d) => ({ ...d, [u.id]: e.target.value }))} />
                                    )}
                                  </>
                                )}
                              </li>
                            )
                          })}
                        </ul>
                      </li>
                    )
                  })}
                </ul>
                {feeding && <p className="px-1 text-right text-[13px] font-semibold text-[#1B4D2E]" data-testid="many-feed-total">Total: {total.toFixed(2)} kg</p>}
              </>
            )}
          </div>
        </FormSection>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}
