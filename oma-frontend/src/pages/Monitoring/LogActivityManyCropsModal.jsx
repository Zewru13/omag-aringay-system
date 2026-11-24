import { useEffect, useMemo, useState } from 'react'
import { ClipboardList, Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { formatDate } from '../../utils/dateFormat.js'
import { todayISO } from '../../utils/localDate.js'
import fetchAllPages from '../Citizen/fetchAllPages.js'
import {
  MAX_CROPS, allHalfway, buildPayload, cropLabel, doneMessage, filterCrops, formProblem, growingCrops, logButtonLabel, offeredActivities,
  serverProblem, showsFertilizer, showsPest,
} from './bulkCropLog.js'

// "Log activity on many crops" (the farmer's My Crops page): one activity done on many crops on the same day is logged once. Fill in the activity
// (the same boxes as a single crop's Log Activity), tick the crops it was done on, and it is saved on every one of them. The server checks each
// crop exactly like its own Log Activity window and saves all or none: if one crop cannot take it (for example it was planted after that date), the
// message names the crop and nothing is saved, so it can be unticked and the rest saved.
const GROWING_STATUSES = 'Planted,Near Harvest'
const BOX = 'h-5 w-5 shrink-0 cursor-pointer rounded border-slate-300 accent-[#1B4D2E] focus:ring-[#1B4D2E]/30'
const listOf = (data) => (Array.isArray(data) ? data : data?.results || [])

export default function LogActivityManyCropsModal({ onClose, onDone }) {
  const { showToast } = useToast()
  const today = todayISO()
  // What is typed is a draft: still here when the window is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm('crop-log-many')
  const [activity, setActivity] = useDraftField(draft, 'activity', '')
  const [activityOther, setActivityOther] = useDraftField(draft, 'activityOther', '')
  const [date, setDate] = useDraftField(draft, 'date', today)
  const [plantCondition, setPlantCondition] = useDraftField(draft, 'plantCondition', '')
  const [notes, setNotes] = useDraftField(draft, 'notes', '')
  const [fertilizer, setFertilizer] = useDraftField(draft, 'fertilizer', '')
  const [fertilizerOther, setFertilizerOther] = useDraftField(draft, 'fertilizerOther', '')
  const [quantity, setQuantity] = useDraftField(draft, 'quantity', '')
  const [unit, setUnit] = useDraftField(draft, 'unit', 'kg')
  const [pestName, setPestName] = useDraftField(draft, 'pestName', '')
  const [severity, setSeverity] = useDraftField(draft, 'severity', '')
  const [picked, setPicked] = useDraftField(draft, 'picked', {})   // { [cropId]: true }

  const [crops, setCrops] = useState(null)          // null while loading, false when it failed
  const [activityNames, setActivityNames] = useState([])
  const [fertilizerNames, setFertilizerNames] = useState([])
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [refused, setRefused] = useState(() => new Set())   // the crops the server named in its last refusal
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    let alive = true
    fetchAllPages('/production/monitoring/', { status: GROWING_STATUSES })
      .then((rows) => alive && setCrops(growingCrops(rows)))
      .catch(() => alive && setCrops(false))
    api.get('/production/activity-types/')
      .then((r) => alive && setActivityNames(listOf(r.data).map((t) => t.name)))
      .catch(() => alive && setActivityNames([]))
    api.get('/production/input-types/')
      .then((r) => alive && setFertilizerNames(listOf(r.data).filter((t) => t.input_type === 'Fertilizer' && t.is_active).map((t) => t.name)))
      .catch(() => alive && setFertilizerNames([]))
    return () => { alive = false }
  }, [])

  const available = useMemo(() => (Array.isArray(crops) ? crops : []), [crops])
  const shown = useMemo(() => filterCrops(available, search), [available, search])
  // Only crops that still exist on the list stay ticked (a crop harvested meanwhile drops out).
  const availableIds = useMemo(() => new Set(available.map((c) => c.id)), [available])
  const ids = Object.keys(picked).map(Number).filter((id) => availableIds.has(id))
  // Pre-Harvest Inspection and Harvesting only when every ticked crop is past half way through its season.
  const halfway = allHalfway(available.filter((c) => picked[c.id]), today)
  const allShownTicked = shown.length > 0 && shown.every((c) => picked[c.id])

  const toggle = (id) => setPicked((p) => { const next = { ...p }; if (next[id]) delete next[id]; else next[id] = true; return next })
  const toggleShown = () => setPicked((p) => {
    const next = { ...p }
    if (allShownTicked) shown.forEach((c) => { delete next[c.id] })
    else shown.forEach((c) => { next[c.id] = true })
    return next
  })

  const form = { activity, activityOther, date, plantCondition, notes, fertilizer, fertilizerOther, quantity, unit, pestName, severity }
  const submit = async (e) => {
    e.preventDefault()
    setError(''); setRefused(new Set())
    const problem = formProblem(form, ids, today, halfway)
    if (problem) { setError(problem); return }
    setIsSubmitting(true)
    try {
      const r = await api.post('/production/monitoring/bulk-logs/', buildPayload(form, ids))
      showToast(doneMessage(r.data?.logged ?? ids.length), 'success')
      draft.clear()
      onDone()
    } catch (err) {
      const { message, ids: named } = serverProblem(err.response?.data)
      setError(message)
      setRefused(new Set(named))
    } finally {
      setIsSubmitting(false)
    }
  }

  const failed = crops === false
  return (
    <ModalShell
      title="Log Activity on Many Crops"
      subtitle="Done the same thing on several crops? Log it once and tick the crops."
      icon={ClipboardList}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="log-many-form" isLoading={isSubmitting} disabled={ids.length === 0}>{logButtonLabel(ids.length)}</Button>
        </>
      )}
    >
      <form id="log-many-form" onSubmit={submit} className="space-y-3">
        <DraftBanner draft={draft} />

        <FormSection title="Activity">
          <FormRows label="Activity">
            <FormRow>
              <FormCell label="Activity" required wide>
                <ComboboxWithOther
                  options={offeredActivities(activityNames, halfway)}
                  value={activity}
                  otherValue={activityOther}
                  onChange={setActivity}
                  onOtherChange={setActivityOther}
                  placeholder="Select Activity"
                />
              </FormCell>
            </FormRow>
            <FormRow>
              <FormCell label="Date" required>
                <input type="date" className={baseInputClasses} aria-label="Date" value={date} max={today} onChange={(e) => setDate(e.target.value)} />
              </FormCell>
              <FormCell label="Plant Condition">
                <select className={baseInputClasses} aria-label="Plant Condition" value={plantCondition} onChange={(e) => setPlantCondition(e.target.value)}>
                  <option value="">Select condition</option>
                  <option value="Good">Good</option>
                  <option value="Fair">Fair</option>
                  <option value="Poor">Poor</option>
                </select>
              </FormCell>
            </FormRow>
            {showsFertilizer(activity) && (
              <FormRow>
                <FormCell label="Type of Fertilizer">
                  <ComboboxWithOther options={fertilizerNames} value={fertilizer} otherValue={fertilizerOther}
                    onChange={setFertilizer} onOtherChange={setFertilizerOther} placeholder="Select Fertilizer" />
                </FormCell>
                <FormCell label="Quantity Applied (each crop)">
                  <div className="flex items-center gap-2">
                    <DecimalInput decimals={2} value={quantity} aria-label="Quantity Applied" onChange={setQuantity} placeholder="e.g. 50" className={`${baseInputClasses} w-28! shrink-0`} />
                    <select className={`${baseInputClasses} w-28! shrink-0`} aria-label="Unit" value={unit} onChange={(e) => setUnit(e.target.value)}>
                      <option value="kg">kg</option>
                      <option value="bags">bags</option>
                      <option value="sacks">sacks</option>
                      <option value="liters">liters</option>
                      <option value="pieces">pieces</option>
                    </select>
                  </div>
                </FormCell>
              </FormRow>
            )}
            {showsPest(activity) && (
              <FormRow>
                <FormCell label="Pest / Disease Name">
                  <input type="text" className={baseInputClasses} aria-label="Pest / Disease Name" value={pestName} onChange={(e) => setPestName(e.target.value)}
                    placeholder="e.g. Brown Planthopper" />
                </FormCell>
                <FormCell label="Severity" required hint={<p className="mt-1 text-[11px] text-[#7A8E7A]">The same for every crop ticked. Each crop has its own area, so the area is not asked here.</p>}>
                  <select className={baseInputClasses} aria-label="Severity" value={severity} onChange={(e) => setSeverity(e.target.value)}>
                    <option value="">Select</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                  </select>
                </FormCell>
              </FormRow>
            )}
            <FormRow>
              <FormCell label="Notes" wide>
                <textarea rows={2} className={`${baseInputClasses} h-auto resize-none py-2`} aria-label="Notes" placeholder="Notes (optional)" value={notes} onChange={(e) => setNotes(e.target.value)} />
              </FormCell>
            </FormRow>
          </FormRows>
        </FormSection>

        <FormSection title={`Crops (${ids.length} ticked)`}>
          <div className="space-y-2 p-3">
            {crops === null && <p className="px-1 py-6 text-center text-[13px] text-[#7A8E7A]">Loading your crops…</p>}
            {failed && <p role="alert" className="px-1 py-6 text-center text-[13px] text-rose-600">Your crops could not be loaded. Close this window and try again.</p>}
            {Array.isArray(crops) && available.length === 0 && (
              <p className="px-1 py-6 text-center text-[13px] text-[#7A8E7A]">No crop is growing right now, so there is nothing to log on.</p>
            )}
            {available.length > 0 && (
              <>
                <div className="flex items-center rounded-xl border border-slate-300 bg-white px-3">
                  <Search size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
                  <input type="search" aria-label="Search crops" placeholder="Search crop, variety or place…" value={search} onChange={(e) => setSearch(e.target.value)}
                    className="h-[40px] w-full border-0 bg-transparent px-2 text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] focus:outline-none" />
                </div>
                <label className="flex min-h-[44px] cursor-pointer items-center gap-3 rounded-lg bg-[#F0F4F0] px-3 text-[13px] font-semibold text-[#1A2B1A]">
                  <input type="checkbox" className={BOX} checked={allShownTicked} onChange={toggleShown} aria-label={search.trim() ? 'Tick every crop found' : 'Tick every crop'} />
                  {search.trim() ? `Tick every crop found (${shown.length})` : `Tick every crop (${shown.length})`}
                </label>
                {shown.length === 0 && <p className="px-1 py-4 text-center text-[13px] text-[#7A8E7A]">No crop matches that search.</p>}
                <ul className="max-h-80 space-y-1 overflow-y-auto" aria-label="Crops">
                  {shown.map((c) => (
                    <li key={c.id}>
                      <label className={`flex min-h-[48px] cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 ${refused.has(c.id) ? 'border-rose-400 bg-rose-50' : picked[c.id] ? 'border-[#1B4D2E]/40 bg-[#F6FAF7]' : 'border-[#E2E8E2] bg-white'}`}>
                        <input type="checkbox" className={`${BOX} mt-0.5`} checked={Boolean(picked[c.id])} onChange={() => toggle(c.id)} aria-label={`Tick ${cropLabel(c)}`} />
                        <span className="min-w-0">
                          <span className="block break-words text-[14px] font-semibold text-[#1A2B1A]">{cropLabel(c)}</span>
                          <span className="block break-words text-[12.5px] text-[#4A5E4A]">
                            {[c.farm_location_barangay, c.area_planted_ha != null ? `${Number(c.area_planted_ha).toFixed(2)} ha` : '', c.date_planted ? `Planted ${formatDate(c.date_planted)}` : ''].filter(Boolean).join(' · ')}
                          </span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
                {ids.length > MAX_CROPS && <p className="px-1 text-[12px] text-amber-700">At most {MAX_CROPS} crops can be logged at a time.</p>}
              </>
            )}
          </div>
        </FormSection>

        {error && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700">{error}</p>}
      </form>
    </ModalShell>
  )
}
