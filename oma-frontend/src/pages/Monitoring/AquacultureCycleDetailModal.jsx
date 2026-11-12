import { useEffect, useState } from 'react'
import { Fish, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import CycleDayBanner from '../../components/UI/CycleDayBanner.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PcicCheck from '../../components/UI/PcicCheck.jsx'
import PcicFormButton from '../../components/UI/PcicFormButton.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { DetailTable, FormSection } from '../../components/UI/FormTable.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { cycleProgress } from '../../utils/cycleActivity.js'
import { formatDate } from '../../utils/dateFormat.js'
import { todayISO as localToday } from '../../utils/localDate.js'
import { ownershipRows } from '../../utils/ownership.js'
import { pcicDocumentsFrom } from '../../utils/pcicDocuments.js'
import { resolveMediaUrl } from '../../utils/mediaUrl.js'
import { ForcedHarvestedStatus } from '../FisheriesRecords/ForcedHarvestDetails.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { LogCell, LogHead, LogRow, LogTable, LogTh } from './LogFormTable.jsx'
import {
  HEALTH_OBSERVATION_OPTIONS, HEALTH_RECOMMENDED_TREATMENT, HEALTH_TREATMENT_OPTIONS, isForceObservation, unitEntryNeeds, unitLabel, validateUnitEntry,
} from './cycleLogForms.js'

const CYCLE_STATUS_TONES = { Active: 'green', Harvested: 'blue', Failed: 'rose', Abandoned: 'slate' }
// Feed Type choices for the Feeding Log. The backend stores feed_type as plain free text (no choices), so the
// submitted value is always a plain string: one of these names, or a custom name typed by the user.
const FEED_TYPE_CHOICES = [
  'Starter/Fingerling Feed',
  'Grower Feed',
  'Production Feed',
  'Finisher Feed',
  'Natural Pond Food',
  'Others',
]
// "Others" -> second dropdown. These are alternative/supplemental feed examples documented for particular
// aquaculture systems/species - not feeds that suit every species. "Custom Feed" asks for a typed name.
const OTHER_FEED_OPTIONS = [
  'Rice Bran',
  'Cooked Broken Rice',
  'Trash Fish',
  'Chopped/Blanched Chicken Entrails + Rice Bran',
  'Stale Bread/Bakery Waste',
  'Corn Bran',
  'Natural Pond Food/Algae',
  'Plant/Leaf Meal',
  'Custom Feed',
]

// SUGGESTED Feed Type (never required - the user can always pick something else).
//  - Hito / Asian catfish (SEAFDEC): formulated crumble for the first 2 months, formulated pellets from the
//    3rd month until harvest. Only that documented distinction is used; months are counted as 30 days.
//  - Every other species: no species-specific schedule is available here, so a GENERAL suggestion is derived
//    from how far along the culture period is (stocking date -> target harvest date, else the species'
//    configured culture duration), split into four equal parts. It is not a validated feeding requirement.
// Feed QUANTITY is never calculated - it stays user-entered.
const GENERIC_FEED_STAGES = ['Starter/Fingerling Feed', 'Grower Feed', 'Production Feed', 'Finisher Feed']
const HITO_CRUMBLE_DAYS = 60

function daysBetweenISO(a, b) {
  const [ay, am, ad] = a.split('-').map(Number)
  const [by, bm, bd] = b.split('-').map(Number)
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000)
}

function todayISOLocal() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function suggestFeedType({ speciesName, stockingDate, targetDate, durationDays, feedingDate }) {
  if (!stockingDate || !feedingDate) return null
  const elapsed = daysBetweenISO(stockingDate, feedingDate)
  if (elapsed < 0) return null
  if (String(speciesName || '').trim().toLowerCase() === 'hito') {
    return elapsed < HITO_CRUMBLE_DAYS
      ? { value: 'Formulated Crumble', note: 'Hito / Asian catfish (SEAFDEC): formulated feed in crumble form during the first 2 months.' }
      : { value: 'Formulated Pellet', note: 'Hito / Asian catfish (SEAFDEC): formulated pellets from the 3rd month until harvest.' }
  }
  let total = null
  if (targetDate) { const t = daysBetweenISO(stockingDate, targetDate); if (t > 0) total = t }
  if (!total && Number(durationDays) > 0) total = Number(durationDays)
  if (!total) return null
  const index = Math.min(GENERIC_FEED_STAGES.length - 1, Math.floor((elapsed / total) * GENERIC_FEED_STAGES.length))
  return {
    value: GENERIC_FEED_STAGES[index],
    note: `General suggestion from culture progress (day ${elapsed} of about ${total}) - not a species-specific or validated feeding requirement.`,
  }
}

function InnerTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-0 border-b border-slate-100 mb-4">
      {tabs.map(t => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`flex-1 whitespace-nowrap px-2 py-2.5 text-sm font-medium border-b-2 transition-colors md:flex-none md:px-4 md:py-2 ${
            active === t.value
              ? 'border-[#1E4620] text-[#1E4620]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

// The cycle's saved details, read-only: the information grid and the production units (with each pond/cage's PCIC insurance). One component for Cycle Details
// (Cycle Info tab) and for View Details on Aquaculture Monitoring, so both always show the same fields and values. `hideStatus`: View
// Details shows the stocking's own status (the one in the table) instead of the cycle's Active / Harvested.
export function CycleInfoSummary({ cycle, hideStatus = false }) {
  // The emergency Force Harvests saved for this cycle (read from the database): unit id -> harvest id, for the Forced Harvested status.
  const [forcedByUnit, setForcedByUnit] = useState({})
  useEffect(() => {
    let alive = true
    api.get('/fisheries/force-harvest/', { params: { production_cycle: cycle.id } })
      .then(r => {
        if (!alive) return
        const map = {}
        ;(r.data.harvests || []).forEach(h => h.units.forEach(u => { map[u.id] = h.id }))
        setForcedByUnit(map)
      })
      .catch(() => {})
    return () => { alive = false }
  }, [cycle.id, cycle.status])

  const fields = [
    { label: 'Fisherfolk', value: cycle.fisherfolk_name },
    { label: 'Organization', value: cycle.organization_name },
    { label: 'Cycle Name', value: cycle.cycle_name },
    { label: 'Status', value: <StatusPill tone={CYCLE_STATUS_TONES[cycle.status] || 'slate'}>{cycle.status}</StatusPill>, hidden: hideStatus },
    { label: 'Species', value: cycle.species_display || cycle.species_farmed },
    { label: 'Culture System', value: cycle.culture_system },
    { label: 'Pond Location', value: cycle.pond_location },
    { label: 'Fingerling Source', value: cycle.fingerling_source },
    ...ownershipRows(cycle).map(([label, value]) => ({ label, value })),
    { label: 'Area', value: cycle.area_sqm ? `${cycle.area_sqm} sqm` : null },
    { label: 'Stocking Date', value: formatDate(cycle.stocking_date) },
    { label: 'Stocking Count', value: cycle.stocking_count ? `${Number(cycle.stocking_count).toLocaleString()} pcs` : null },
    { label: 'Target Harvest', value: formatDate(cycle.target_harvest_date) },
    { label: 'Actual Harvest', value: formatDate(cycle.actual_harvest_date) },
    { label: 'Harvest Volume', value: cycle.harvest_volume_kg ? `${Number(cycle.harvest_volume_kg).toLocaleString()} kg` : null },
    { label: 'Area/Cage Harvested', value: cycle.area_cage_harvested },
    { label: 'Notes', value: cycle.notes, wide: true },
  ]
  const units = cycle.units || []
  const noun = units[0]?.unit_type === 'cage' ? 'Cage' : 'Pond'
  const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
  const totals = [
    { label: 'Total Area', value: `${fmt(units.reduce((s, u) => s + Number(u.size_sqm), 0))} sq.m.` },
    { label: 'Total Actual Fingerlings', value: fmt(units.reduce((s, u) => s + Number(u.fingerling_count), 0)) },
    { label: 'Estimated Harvest Biomass', value: cycle.estimated_harvest_kg != null ? `${Number(cycle.estimated_harvest_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : 'Not available' },
  ]

  return (
    <div className="space-y-3">
      <DetailTable title="Cycle Details" fields={fields} />

      {units.length > 0 && (
        <>
          <FormSection title="Production Units">
            <EntryTable bare label="Production units" testId="units-table">
              <EntryHead>
                <EntryTh>{noun}</EntryTh>
                <EntryTh>Size</EntryTh>
                <EntryTh>Fingerlings</EntryTh>
                <EntryTh>PCIC Insured</EntryTh>
              </EntryHead>
              <tbody>
                {units.map(u => {
                  const hasDims = u.length_m != null && u.width_m != null
                  const forms = pcicDocumentsFrom({ photos: u.pcic_form_photos, url: u.pcic_form_photo }, resolveMediaUrl)
                  return (
                    <EntryRow key={u.id}>
                      <EntryCell label={noun} className="font-medium text-[#1A2B1A]">
                        <span className="flex items-center gap-2">
                          {noun} {u.unit_number}
                          {forcedByUnit[u.id] && <ForcedHarvestedStatus harvestId={forcedByUnit[u.id]} />}
                        </span>
                      </EntryCell>
                      <EntryCell label="Size">
                        {hasDims ? `${fmt(u.length_m)}m × ${fmt(u.width_m)}m · ` : ''}{fmt(u.size_sqm)} sq.m.
                      </EntryCell>
                      <EntryCell label="Fingerlings">{fmt(u.fingerling_count)}</EntryCell>
                      <EntryCell label="PCIC Insured">
                        <span className="inline-flex items-center gap-2">
                          <PcicCheck insured={u.has_pcic_insurance} />
                          {u.has_pcic_insurance && (forms.length
                            ? <PcicFormButton documents={forms} className="text-xs">View form</PcicFormButton>
                            : <span className="text-xs text-slate-400">No form on file</span>)}
                        </span>
                      </EntryCell>
                    </EntryRow>
                  )
                })}
              </tbody>
            </EntryTable>
          </FormSection>
          <DetailTable title="Production Totals" columns={1} fields={totals} />
        </>
      )}
    </div>
  )
}

// Cycle Info is read-only: a cycle is edited in Edit Production Cycle (the row menu of Aquaculture Monitoring), which holds the status, harvest
// summary, ownership and each pond / cage's PCIC insurance too.
function CycleInfoTab({ cycle }) {
  return <CycleInfoSummary cycle={cycle} />
}
// formOnly: the Log Activity window - just the form (open at once, today's date), no history list; onSaved() after a save, onCancel() on Cancel.
export function FeedingLogTab({ cycleId, units = [], cycle, formOnly = false, onSaved, onCancel }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  // What is typed in the form is a draft: still here when the cycle is opened again (see hooks/useDraftForm.js); it opens the form.
  const draft = useDraftForm(`feeding-log:${cycleId}`)
  const [showForm, setShowForm] = useState(draft.restored || formOnly)
  const EMPTY_FEEDING_FORM = { feeding_date: formOnly ? todayISOLocal() : '', feed_type: '', feed_type_other: '', feed_custom: '', quantity_kg: '', notes: '' }
  const [form, setForm] = useDraftField(draft, 'form', EMPTY_FEEDING_FORM)
  // false = the Feed Type shown is the system's suggestion; true = the user picked one (never overwritten).
  const [feedTouched, setFeedTouched] = useDraftField(draft, 'feedTouched', false)
  const [isSaving, setIsSaving] = useState(false)
  // The cycle's own ponds/cages (its Production Units). When it has any, feed is entered per unit
  // and the total is calculated; cycles without units keep the single Quantity (kg) field.
  const hasUnits = units.length > 0
  const [unitQty, setUnitQty] = useDraftField(draft, 'unitQty', {})
  const unitValue = (u) => { const n = parseFloat(unitQty[u.id]); return n > 0 ? n : 0 }
  const unitsTotal = units.reduce((s, u) => s + unitValue(u), 0)

  // The cycle only carries the species NAME, so the species list (as used by Start Production Cycle) is
  // matched by name to get its configured culture duration. No match -> no duration and no invented value.
  const [speciesList, setSpeciesList] = useState([])
  useEffect(() => {
    api.get('/fisheries/species/?aquaculture_only=true')
      .then(r => setSpeciesList(Array.isArray(r.data) ? r.data : (r.data.results || [])))
      .catch(() => setSpeciesList([]))
  }, [])
  const speciesName = cycle?.species_farmed || ''
  const matchedSpecies = speciesList.find(s => (s.species_name || '').trim().toLowerCase() === speciesName.trim().toLowerCase())
  const suggestion = suggestFeedType({
    speciesName,
    stockingDate: cycle?.stocking_date,
    targetDate: cycle?.target_harvest_date,
    durationDays: matchedSpecies?.culture_duration_days,
    feedingDate: form.feeding_date || todayISOLocal(),
  })
  // Suggestion until the user chooses; after that their choice is kept.
  const feedType = feedTouched ? form.feed_type : (suggestion?.value || '')
  const feedTypeChoices = suggestion && !FEED_TYPE_CHOICES.includes(suggestion.value) ? [suggestion.value, ...FEED_TYPE_CHOICES] : FEED_TYPE_CHOICES
  const showUseSuggested = Boolean(suggestion) && feedTouched && form.feed_type !== suggestion.value

  const fetch = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycleId}/feeding/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  useEffect(() => { if (!formOnly) fetch() }, [cycleId])

  const handleAdd = async (e) => {
    e.preventDefault()

    // The submitted feed_type is always a plain string: the chosen feed, the "Other" option, or the custom name.
    let normalizedFeedType = feedType
    if (!feedType) { showToast('Feed Type is required.', 'error'); return }
    if (feedType === 'Others') {
      if (!form.feed_type_other) { showToast('Select the Other Feed Type.', 'error'); return }
      if (form.feed_type_other === 'Custom Feed') {
        if (!form.feed_custom.trim()) { showToast('Custom Feed Name is required.', 'error'); return }
        normalizedFeedType = form.feed_custom.trim()
      } else {
        normalizedFeedType = form.feed_type_other
      }
    }

    if (hasUnits) {
      // Feed is entered per pond/cage; each quantity must be >= 0 and at least one must be above 0.
      // The backend recomputes the total from these rows (a client-supplied total is ignored).
      const bad = units.find(u => unitQty[u.id] !== undefined && unitQty[u.id] !== '' && !(parseFloat(unitQty[u.id]) >= 0))
      if (bad) { showToast(`${unitLabel(bad)}: feed quantity cannot be negative.`, 'error'); return }
      if (!(unitsTotal > 0)) { showToast('Enter a feed quantity for at least one pond/cage.', 'error'); return }
    } else if (!(parseFloat(form.quantity_kg) >= 0.01)) {
      // A lone "." or "0" passes the field's `required`, so the minimum is checked here.
      showToast('Feed quantity must be at least 0.01 kg.', 'error'); return
    }

    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/feeding/`, {
        feeding_date: form.feeding_date,
        feed_type: normalizedFeedType,
        ...(hasUnits
          ? { unit_quantities: units.map(u => ({ production_unit: u.id, quantity_kg: unitValue(u) })) }
          : { quantity_kg: form.quantity_kg }),
        notes: form.notes,
      })
      showToast('Feeding log added.', 'success')
      setShowForm(false)
      setForm(EMPTY_FEEDING_FORM)
      setFeedTouched(false)
      setUnitQty({})
      if (formOnly) onSaved?.()
      else fetch()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }
  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return
    try {
      await api.delete(`/monitoring/aquaculture-cycles/feeding/${id}/`)
      showToast('Deleted.', 'success')
      fetch()
    } catch { showToast('Failed.', 'error') }
  }

  const totalFeed = logs.reduce((s, l) => s + (parseFloat(l.quantity_kg) || 0), 0)

  return (
    <div className="space-y-3">
      {!formOnly && (
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} log{logs.length !== 1 ? 's' : ''}
          {totalFeed > 0 && ` · Total: ${totalFeed.toFixed(2)} kg`}
        </span>
        <Button
          size="sm" icon={Plus}
          onClick={() => {
            // Opening the form starts on today's LOCAL date; it stays editable for earlier feedings.
            if (!showForm) setForm(f => ({ ...f, feeding_date: todayISOLocal() }))
            setShowForm(v => !v)
          }}
        >
          Log Feeding
        </Button>
      </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 sm:p-4" data-testid="feeding-form">
          <DraftBanner draft={draft} />
          {/* 1 - the details of this feeding: one row, one labelled column per field. */}
          <LogTable label="Feeding details" testId="feeding-detail-table">
            <LogHead>
              <LogTh required>Date</LogTh>
              <LogTh required>Feed Type</LogTh>
              {feedType === 'Others' && <LogTh required>Other Feed Type</LogTh>}
              {feedType === 'Others' && form.feed_type_other === 'Custom Feed' && <LogTh required>Custom Feed Name</LogTh>}
              <LogTh>Notes</LogTh>
            </LogHead>
            <tbody>
              <LogRow>
                <LogCell label="Date *" className="md:w-[12rem] md:min-w-[12rem]">
                  <input type="date" className={baseInputClasses} required value={form.feeding_date} aria-label="Date" onChange={e => setForm(f => ({ ...f, feeding_date: e.target.value }))} />
                </LogCell>
                <LogCell label="Feed Type *">
                  <select
                    className={baseInputClasses} required value={feedType} data-testid="feed-type-select" aria-label="Feed Type"
                    onChange={e => { setFeedTouched(true); setForm(f => ({ ...f, feed_type: e.target.value, feed_type_other: '', feed_custom: '' })) }}
                  >
                    <option value="" disabled>Select Feed Type</option>
                    {feedTypeChoices.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                </LogCell>
                {feedType === 'Others' && (
                  <LogCell label="Other Feed Type *">
                    <select className={baseInputClasses} required value={form.feed_type_other} aria-label="Other Feed Type"
                      onChange={e => setForm(f => ({ ...f, feed_type_other: e.target.value, feed_custom: '' }))}>
                      <option value="" disabled>Select Other Feed Type</option>
                      {OTHER_FEED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  </LogCell>
                )}
                {feedType === 'Others' && form.feed_type_other === 'Custom Feed' && (
                  <LogCell label="Custom Feed Name *">
                    <input className={baseInputClasses} required maxLength={100} value={form.feed_custom} aria-label="Custom Feed Name"
                      onChange={e => setForm(f => ({ ...f, feed_custom: e.target.value }))} placeholder="Enter feed name" />
                  </LogCell>
                )}
                <LogCell label="Notes">
                  <input className={baseInputClasses} value={form.notes} aria-label="Notes" onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                </LogCell>
              </LogRow>
            </tbody>
          </LogTable>
          {suggestion ? (
            <p className="px-1 text-xs text-[#4A5E4A]" data-testid="feed-suggestion-note">
              Suggested feed type: <span className="font-medium">{suggestion.value}</span>. {suggestion.note} You can change it based on your farm practice, fish size and available feed.
              {showUseSuggested && (
                <> <button type="button" className="font-medium text-[#1E4620] underline" data-testid="use-suggested-feed"
                  onClick={() => { setFeedTouched(false); setForm(f => ({ ...f, feed_type: '', feed_type_other: '', feed_custom: '' })) }}>Use Suggested Feed</button></>
              )}
            </p>
          ) : (
            <p className="px-1 text-xs text-[#4A5E4A]">No suggestion is available for this cycle - choose the feed used.</p>
          )}
          {feedType === 'Others' && (
            <p className="px-1 text-xs text-[#4A5E4A]">Other feeds are alternative/supplemental examples - not suitable for every species or system.</p>
          )}

          {/* 2 - feed per production unit (one row each); the total is always the sum of the unit quantities. */}
          <LogTable label="Feed per pond or cage" testId="feeding-units-table">
            <LogHead>
              <LogTh>Pond/Cage</LogTh>
              <LogTh required className="md:text-right">Feed Quantity (kg)</LogTh>
            </LogHead>
            <tbody>
              {hasUnits ? units.map(u => (
                <LogRow key={u.id}>
                  <LogCell label="Pond/Cage" className="font-medium text-[#1A2B1A] md:w-[40%]">{unitLabel(u)}</LogCell>
                  <LogCell label="Feed Quantity (kg)">
                    <DecimalInput
                      decimals={2} className={`${baseInputClasses} md:text-right`} aria-label={`${unitLabel(u)} feed quantity (kg)`}
                      value={unitQty[u.id] ?? ''} onChange={v => setUnitQty(q => ({ ...q, [u.id]: v }))}
                    />
                  </LogCell>
                </LogRow>
              )) : (
                <LogRow>
                  <LogCell label="Pond/Cage" className="font-medium text-[#1A2B1A] md:w-[40%]">Whole cycle</LogCell>
                  <LogCell label="Feed Quantity (kg) *">
                    <DecimalInput decimals={2} className={`${baseInputClasses} md:text-right`} required aria-label="Feed quantity (kg)"
                      value={form.quantity_kg} onChange={v => setForm(f => ({ ...f, quantity_kg: v }))} />
                  </LogCell>
                </LogRow>
              )}
            </tbody>
            {hasUnits && (
              <tfoot>
                <tr className="border-t-2 border-[#E2E8E2] bg-[#EBF5EE] font-semibold text-[#1B4D2E] max-md:flex max-md:justify-between max-md:px-3 max-md:py-2">
                  <td className="px-3 py-2 max-md:p-0">TOTAL</td>
                  <td className="px-3 py-2 text-right max-md:p-0" data-testid="feed-total">{unitsTotal.toFixed(2)} kg</td>
                </tr>
              </tfoot>
            )}
          </LogTable>

          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => (formOnly ? onCancel?.() : setShowForm(false))}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {formOnly ? null : isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-400">No feeding logs.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {logs.map(l => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5" data-testid="feeding-log-item">
              <div className="min-w-0 break-words">
                <span className="text-sm font-medium text-slate-800">{l.feed_type}</span>
                <span className="ml-2 text-sm text-slate-600">{l.quantity_kg} kg</span>
                <span className="ml-2 text-xs text-slate-400">{formatDate(l.feeding_date)}</span>
                {l.notes && <span className="ml-2 text-xs text-slate-400">— {l.notes}</span>}
                {l.unit_quantities?.length > 0 && (
                  <p className="mt-0.5 text-xs text-slate-500">
                    {l.unit_quantities.map(q => `${q.unit_label}: ${Number(q.quantity_kg).toFixed(2)} kg`).join(' · ')}
                  </p>
                )}
              </div>
              <button type="button" aria-label="Delete feeding log" className="-m-2 shrink-0 p-2 text-slate-400 hover:text-rose-500" onClick={() => handleDelete(l.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

// formOnly: the Log Activity window - just the form (open at once, today's date), no history list; onSaved() after a save, onCancel() on Cancel.
export function HealthLogTab({ cycleId, units = [], onChanged, formOnly = false, onSaved, onCancel }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  // What is typed in the form is a draft: still here when the cycle is opened again (see hooks/useDraftForm.js); it opens the form.
  const draft = useDraftForm(`health-log:${cycleId}`)
  const [showForm, setShowForm] = useState(draft.restored || formOnly)
  // The cycle's own ponds/cages (its existing Production Units) - the affected one must be chosen
  // when the cycle has any. Nothing is typed: options come straight from the units.
  const hasUnits = units.length > 0
  const unitName = unitLabel
  const EMPTY_HEALTH_FORM = {
    production_units: [],       // ids of the affected ponds/cages (multi-select)
    unit_mortality: {},         // {unitId: count}, used when several units are selected with Fish Mortality
    log_date: formOnly ? todayISOLocal() : '',
    observation: '',
    observation_other: '',
    mortality_count: '0',
    treatment_applied: '',
    treatment_applied_other: '',
    notes: '',
  }
  const [form, setForm] = useDraftField(draft, 'form', EMPTY_HEALTH_FORM)
  const [isSaving, setIsSaving] = useState(false)
  // Cycles with ponds/cages: every selected unit has its OWN observation, mortality count and treatment
  // ({unitId: entry}); nothing typed for one unit applies to another. Errors are per unit too.
  const EMPTY_UNIT_ENTRY = { observation: '', observation_other: '', mortality_count: '', treatment_applied: '' }
  const [unitEntries, setUnitEntries] = useDraftField(draft, 'unitEntries', {})
  const [unitErrors, setUnitErrors] = useState({})
  const entryFor = (id) => unitEntries[id] || EMPTY_UNIT_ENTRY
  const setEntry = (id, patch) => {
    setUnitEntries(prev => ({ ...prev, [id]: { ...(prev[id] || EMPTY_UNIT_ENTRY), ...patch } }))
    setUnitErrors(prev => ({ ...prev, [id]: '' }))
  }
  const chooseUnitObservation = (id, obs) => {
    const current = entryFor(id)
    setEntry(id, {
      observation: obs,
      // The real number of dead fish is always typed - never pre-filled or calculated.
      mortality_count: obs === 'Fish Mortality' ? (Number(current.mortality_count) > 0 ? current.mortality_count : '') : '',
      treatment_applied: isForceObservation(obs) ? '' : (HEALTH_RECOMMENDED_TREATMENT[obs] || ''),
    })
  }
  const resetForm = () => { setForm(EMPTY_HEALTH_FORM); setUnitEntries({}); setUnitErrors({}) }

  const fetch = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycleId}/health/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [cycleId])

  // Force Harvest is a status decided from the observation (and enforced again by the backend).
  // It is display-only here: nothing is sent for it and no harvest is created by saving the log.
  const forceHarvest = isForceObservation(form.observation)

  // Ponds/cages that already have a Health Log in THIS cycle are not offered again (the backend enforces
  // it too). Deleting that log brings the unit back on the next fetch. Logs without a unit block nothing.
  const reportedIds = new Set(logs.filter(l => l.production_unit != null).map(l => l.production_unit))
  const availableUnits = units.filter(u => !reportedIds.has(u.id))
  const selectedUnits = availableUnits.filter(u => form.production_units.includes(u.id))
  const forceSelectedUnits = selectedUnits.filter(u => isForceObservation(entryFor(u.id).observation))
  const toggleUnit = (id) => setForm(f => ({
    ...f,
    production_units: f.production_units.includes(id) ? f.production_units.filter(x => x !== id) : [...f.production_units, id],
  }))

  const handleAdd = async (e) => {
    e.preventDefault()

    if (hasUnits && selectedUnits.length === 0) {
      showToast('Please select the affected pond/cage.', 'error')
      return
    }

    if (hasUnits) {
      // One log per selected unit, each with its own observation/values (all-or-nothing on the backend).
      const errs = Object.fromEntries(selectedUnits.map(u => [u.id, validateUnitEntry(entryFor(u.id))]))
      setUnitErrors(errs)
      if (Object.values(errs).some(Boolean)) {
        showToast('Complete the health information for every selected pond/cage.', 'error')
        return
      }
      setIsSaving(true)
      try {
        await api.post(`/monitoring/aquaculture-cycles/${cycleId}/health/`, {
          log_date: form.log_date,
          notes: form.notes,
          unit_logs: selectedUnits.map(u => {
            const e = entryFor(u.id)
            return {
              production_unit: u.id,
              observation: e.observation === 'Other' ? e.observation_other.trim() : e.observation,
              mortality_count: e.observation === 'Fish Mortality' ? (parseInt(e.mortality_count) || 0) : 0,
              treatment_applied: isForceObservation(e.observation) ? '' : e.treatment_applied,
            }
          }),
        })
        showToast(selectedUnits.length > 1 ? `Health log added for ${selectedUnits.length} ponds/cages.` : 'Health log added.', 'success')
        setShowForm(false)
        resetForm()
        fetch()
        onChanged?.()
        onSaved?.()   // the Force Harvest state of the Fisheries Monitoring row may have changed
      } catch (err) {
        const d = err?.response?.data?.unit_logs
        if (Array.isArray(d) && d.length === selectedUnits.length && d.some(x => x && typeof x === 'object')) {
          // errors[i] belongs to the i-th submitted unit: show each message on that unit's own card.
          setUnitErrors(Object.fromEntries(selectedUnits.map((u, i) => [u.id, Object.values(d[i] || {}).flat().join(' ')])))
          showToast('Some ponds/cages could not be saved. Check the highlighted entries.', 'error')
        } else {
          showToast([].concat(d || []).join(' ') || 'Failed to save.', 'error')
        }
        if (err?.response?.status === 400) fetch()   // a stale selection: reload the logs so the options refresh
      } finally { setIsSaving(false) }
      return
    }

    if (!form.observation) {
      showToast('Observation is required.', 'error')
      return
    }

    if (form.observation === 'Other' && !form.observation_other.trim()) {
      showToast('Specify Observation is required.', 'error')
      return
    }

    const isMortality = form.observation === 'Fish Mortality'
    // One unit: the single Mortality Count field. Several units: each unit has its own count.
    const perUnitMortality = isMortality && hasUnits && selectedUnits.length > 1
    if (isMortality && !perUnitMortality && (!form.mortality_count || Number(form.mortality_count) <= 0)) {
      showToast('Mortality Count is required for Fish Mortality.', 'error')
      return
    }
    if (perUnitMortality) {
      const missing = selectedUnits.find(u => !(Number(form.unit_mortality[u.id]) > 0))
      if (missing) { showToast(`Mortality Count is required for ${unitName(missing)}.`, 'error'); return }
    }

    // Fish Mortality and diseases have no Treatment field (Force Harvest applies instead).
    if (!forceHarvest && !form.treatment_applied) {
      showToast('Treatment is required for the selected observation.', 'error')
      return
    }

    const normalizedObservation = form.observation === 'Other'
      ? form.observation_other.trim()
      : form.observation

    const normalizedTreatmentApplied = forceHarvest ? '' : form.treatment_applied

    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/health/`, {
        // One unit-specific log per selected unit is created by the backend, all-or-nothing.
        ...(hasUnits ? { production_units: selectedUnits.map(u => u.id) } : {}),
        ...(perUnitMortality
          ? { unit_mortality: Object.fromEntries(selectedUnits.map(u => [u.id, parseInt(form.unit_mortality[u.id]) || 0])) }
          : {}),
        log_date: form.log_date,
        observation: normalizedObservation,
        mortality_count: isMortality && !perUnitMortality ? (parseInt(form.mortality_count) || 0) : 0,
        treatment_applied: normalizedTreatmentApplied,
        notes: form.notes,
      })
      showToast(selectedUnits.length > 1 ? `Health log added for ${selectedUnits.length} ponds/cages.` : 'Health log added.', 'success')
      setShowForm(false)
      resetForm()
      fetch()
      onChanged?.()
      onSaved?.()   // the Force Harvest state of the Fisheries Monitoring row may have changed
    } catch (err) {
      const d = err?.response?.data
      const msg = d && typeof d === 'object' ? [].concat(d.production_units || d.production_unit || []).join(' ') : ''
      showToast(msg || 'Failed to save.', 'error')
      if (err?.response?.status === 400) fetch()   // a stale selection: reload the logs so the options refresh
    }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return
    try {
      await api.delete(`/monitoring/aquaculture-cycles/health/${id}/`)
      showToast('Deleted.', 'success')
      fetch()
      onChanged?.()
    } catch { showToast('Failed.', 'error') }
  }

  const totalMortality = logs.reduce((s, l) => s + (l.mortality_count || 0), 0)

  return (
    <div className="space-y-3">
      {!formOnly && (
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} log{logs.length !== 1 ? 's' : ''}
          {totalMortality > 0 && <span style={{ color: '#c62828' }}> · {totalMortality} total mortality</span>}
        </span>
        <Button
          size="sm" icon={Plus}
          onClick={() => {
            // Opening the form starts on today's LOCAL date; it stays editable for earlier health events.
            if (!showForm) setForm(f => ({ ...f, log_date: todayISOLocal() }))
            setShowForm(v => !v)
          }}
        >
          Log Health
        </Button>
      </div>
      )}

      {/* Force Harvest is per pond/cage: only a unit with its own mortality/disease log is marked. */}
      {hasUnits && !formOnly && (
        <div className="flex flex-wrap gap-1.5" data-testid="unit-status">
          {units.map(u => {
            const force = logs.some(l => l.production_unit === u.id && l.force_harvest)
            return (
              <span
                key={u.id}
                data-force={force ? 'true' : 'false'}
                style={{ fontSize: 11, padding: '2px 8px', borderRadius: 10, fontWeight: 600, background: force ? '#ffebee' : '#f1f5f1', color: force ? '#c62828' : '#4A5E4A' }}
              >
                {unitName(u)}: {force ? '⚠ Force Harvest' : 'Normal'}
              </span>
            )
          })}
        </div>
      )}

      {showForm && (
        <form onSubmit={handleAdd} className="space-y-3 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 sm:p-4" data-testid="health-form">
          <DraftBanner draft={draft} />
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <label htmlFor="health-log-date" className="text-xs font-semibold text-[#1B4D2E]">Date <span className="text-red-500">*</span></label>
            <input id="health-log-date" type="date" className={`${baseInputClasses} w-full sm:w-48`} required value={form.log_date} onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))} />
          </div>

          {hasUnits ? (
            availableUnits.length === 0 ? (
              <p className="rounded-lg border border-[#E2E8E2] bg-white px-3 py-2 text-xs italic text-[#4A5E4A]" data-testid="affected-units">
                Every pond/cage in this cycle already has a Health Log.
              </p>
            ) : (
              <div data-testid="affected-units" className="space-y-1.5">
                {/* One row per pond/cage: tick the affected ones, then each has its OWN Observation. Mortality Count (Fish Mortality) and
                    Treatment (non-Force-Harvest observations) are needed only when the row's observation asks for them. */}
                <LogTable label="Health log per pond or cage" testId="unit-health-entries">
                  <LogHead>
                    <LogTh className="w-10">
                      <input
                        type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" aria-label="Select every pond/cage"
                        checked={availableUnits.length > 0 && selectedUnits.length === availableUnits.length}
                        onChange={() => setForm(f => ({ ...f, production_units: selectedUnits.length === availableUnits.length ? [] : availableUnits.map(u => u.id) }))}
                      />
                    </LogTh>
                    <LogTh required>Affected Pond/Cage</LogTh>
                    <LogTh required>Observation</LogTh>
                    <LogTh required>Mortality Count</LogTh>
                    <LogTh required>Treatment</LogTh>
                  </LogHead>
                  <tbody>
                    {availableUnits.map(u => {
                      const on = form.production_units.includes(u.id)
                      const e = entryFor(u.id)
                      const needs = unitEntryNeeds(e)
                      const err = unitErrors[u.id]
                      return (
                        <LogRow key={u.id} data-testid={`unit-health-${u.id}`} tone={err ? 'bg-rose-50/60' : on ? 'bg-[#F5F8F5]' : ''}>
                          <LogCell label="Affected" className="md:w-10">
                            <input
                              type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" aria-label={`Affected: ${unitName(u)}`}
                              checked={on} onChange={() => toggleUnit(u.id)}
                            />
                          </LogCell>
                          <LogCell label="Pond/Cage *" className="md:w-[16%]">
                            <span className="font-semibold text-slate-800">{unitName(u)}</span>
                            {on && needs.force && (
                              <span className="mt-1 block w-fit" style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#ffebee', color: '#c62828', fontWeight: 600 }}>
                                ⚠ Force Harvest
                              </span>
                            )}
                          </LogCell>
                          <LogCell label="Observation *" className={`md:w-[30%] ${on ? '' : 'max-md:hidden'}`}>
                            {on ? (
                              <div className="space-y-1">
                                <ComboboxWithOther
                                  options={HEALTH_OBSERVATION_OPTIONS.filter(o => o !== 'Other')}
                                  value={e.observation}
                                  otherValue={e.observation_other}
                                  onChange={(obs) => chooseUnitObservation(u.id, obs)}
                                  onOtherChange={(v) => setEntry(u.id, { observation_other: v })}
                                  placeholder="Select Observation"
                                  required
                                />
                                {err && <p className="text-xs text-rose-600" role="alert">{err}</p>}
                              </div>
                            ) : <span className="text-xs text-[#7A8E7A]">Tick the pond/cage to log it</span>}
                          </LogCell>
                          <LogCell label="Mortality Count *" className={on && needs.mortality ? '' : 'max-md:hidden'}>
                            {on && needs.mortality ? (
                              <input
                                type="number" min="1" required className={baseInputClasses}
                                aria-label={`${unitName(u)} mortality count`} placeholder="Mortality Count"
                                value={e.mortality_count}
                                onChange={ev => setEntry(u.id, { mortality_count: ev.target.value })}
                              />
                            ) : <span className="text-[#C8D5C8]">—</span>}
                          </LogCell>
                          <LogCell label="Treatment *" className={on && (needs.treatment || needs.force) ? '' : 'max-md:hidden'}>
                            {on && needs.treatment ? (
                              <select
                                className={baseInputClasses} required aria-label={`${unitName(u)} treatment`}
                                value={e.treatment_applied}
                                onChange={ev => setEntry(u.id, { treatment_applied: ev.target.value })}
                              >
                                <option value="">Select Treatment</option>
                                {HEALTH_TREATMENT_OPTIONS.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            ) : on && needs.force ? <span className="text-xs text-rose-700">Force Harvest applies instead</span> : <span className="text-[#C8D5C8]">—</span>}
                          </LogCell>
                        </LogRow>
                      )
                    })}
                  </tbody>
                </LogTable>
                {availableUnits.length < units.length && (
                  <p className="px-1 text-[11px] text-[#4A5E4A]">Ponds/cages that already have a Health Log are not listed.</p>
                )}
              </div>
            )
          ) : (
            // Cycles without ponds/cages (Fishpen, older cycles): the single shared row, as before.
            <LogTable label="Health log of the cycle" testId="cycle-health-entry">
              <LogHead>
                <LogTh>Pond/Cage</LogTh>
                <LogTh required>Observation</LogTh>
                <LogTh required>Mortality Count</LogTh>
                <LogTh required>Treatment</LogTh>
              </LogHead>
              <tbody>
                <LogRow>
                  <LogCell label="Pond/Cage" className="font-semibold text-slate-800 md:w-[16%]">Whole cycle</LogCell>
                  <LogCell label="Observation *" className="md:w-[30%]">
                    <ComboboxWithOther
                      options={HEALTH_OBSERVATION_OPTIONS.filter(o => o !== 'Other')}
                      value={form.observation}
                      otherValue={form.observation_other}
                      onChange={(selectedObservation) => {
                        const isMortality = selectedObservation === 'Fish Mortality'
                        const noTreatment = isForceObservation(selectedObservation)
                        const recommended = noTreatment ? '' : (HEALTH_RECOMMENDED_TREATMENT[selectedObservation] || '')
                        setForm(f => ({
                          ...f,
                          observation: selectedObservation,
                          // The user must type the real number of dead fish - it is never pre-filled or calculated.
                          mortality_count: isMortality ? (f.mortality_count && Number(f.mortality_count) > 0 ? f.mortality_count : '') : '0',
                          treatment_applied: recommended,
                          treatment_applied_other: '',
                        }))
                      }}
                      onOtherChange={(v) => setForm(f => ({ ...f, observation_other: v }))}
                      placeholder="Select Observation"
                      required
                    />
                  </LogCell>
                  <LogCell label="Mortality Count *" className={form.observation === 'Fish Mortality' ? '' : 'max-md:hidden'}>
                    {form.observation === 'Fish Mortality' ? (
                      <input
                        type="number" min="1" className={baseInputClasses} required aria-label="Mortality Count"
                        value={form.mortality_count}
                        onChange={e => setForm(f => ({ ...f, mortality_count: e.target.value }))}
                      />
                    ) : <span className="text-[#C8D5C8]">—</span>}
                  </LogCell>
                  <LogCell label="Treatment *" className={form.observation && !forceHarvest ? '' : 'max-md:hidden'}>
                    {form.observation && !forceHarvest ? (
                      <select
                        className={baseInputClasses} value={form.treatment_applied} required aria-label="Treatment"
                        onChange={e => setForm(f => ({ ...f, treatment_applied: e.target.value }))}
                      >
                        <option value="">Select Treatment</option>
                        {HEALTH_TREATMENT_OPTIONS.map(option => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    ) : form.observation && forceHarvest ? <span className="text-xs text-rose-700">Force Harvest applies instead</span> : <span className="text-[#C8D5C8]">—</span>}
                  </LogCell>
                </LogRow>
              </tbody>
            </LogTable>
          )}

          {(hasUnits ? forceSelectedUnits.length > 0 : forceHarvest) && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2" data-testid="force-harvest-banner">
              <p className="text-sm font-semibold text-rose-700">⚠ Force Harvest: Yes <span className="font-normal">(default)</span></p>
              {hasUnits && (
                // Only the units whose OWN observation is mortality/disease.
                <p className="mt-0.5 text-xs font-semibold text-rose-700" data-testid="force-harvest-unit">
                  Applies to {forceSelectedUnits.map(unitName).join(', ')} only.
                </p>
              )}
              <p className="mt-0.5 text-xs text-rose-700/90">
                Force harvest is required/recommended for mortality or disease observations. Saving this log does not record a harvest — use Record Harvest to enter the actual harvested quantity.
              </p>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" size="sm" variant="ghost" onClick={() => (formOnly ? onCancel?.() : setShowForm(false))}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {formOnly ? null : isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-400">No health logs.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {logs.map(l => (
            <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-3" data-testid="health-log-item">
              <div className="min-w-0 break-words">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  {l.unit_label && <span className="text-sm font-semibold text-slate-800">{l.unit_label}</span>}
                  <span className="text-sm font-medium text-slate-800">{l.observation}</span>
                  {l.mortality_count > 0 && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#ffebee', color: '#c62828', fontWeight: 600 }}>
                      {l.mortality_count} dead
                    </span>
                  )}
                  {l.vet_consulted && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#e3f2fd', color: '#1565c0', fontWeight: 600 }}>Vet</span>}
                  {l.force_harvest && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#ffebee', color: '#c62828', fontWeight: 600 }}>⚠ Force Harvest</span>}
                </div>
                <p className="text-xs text-slate-500">{formatDate(l.log_date)}{l.treatment_applied && ` · ${l.treatment_applied}`}</p>
              </div>
              <button type="button" aria-label="Delete health log" className="-m-2 shrink-0 p-2 text-slate-400 hover:text-rose-500" onClick={() => handleDelete(l.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function AquacultureCycleDetailModal({ cycle, onClose, onHealthChanged }) {
  const [innerTab, setInnerTab] = useState('info')

  const INNER_TABS = [
    { label: 'Cycle Info', value: 'info' },
    { label: 'Feeding Log', value: 'feeding' },
    { label: 'Health Log', value: 'health' },
  ]

  return (
    <ModalShell title={`Cycle: ${cycle.cycle_name}`} onClose={onClose} maxWidth="max-w-3xl">
      {/* How many days the pond has been in culture, visible on every tab (and above the logging forms). */}
      {cycle.status === 'Active' && (
        <div className="mb-3">
          <CycleDayBanner progress={cycleProgress(cycle.stocking_date, cycle.target_harvest_date, localToday())} icon={Fish} />
        </div>
      )}
      <InnerTabs tabs={INNER_TABS} active={innerTab} onChange={setInnerTab} />

      {innerTab === 'info' && <CycleInfoTab cycle={cycle} />}
      {innerTab === 'feeding' && <FeedingLogTab cycleId={cycle.id} units={cycle.units || []} cycle={cycle} />}
      {innerTab === 'health' && <HealthLogTab cycleId={cycle.id} units={cycle.units || []} onChanged={onHealthChanged} />}
    </ModalShell>
  )
}

export default AquacultureCycleDetailModal
