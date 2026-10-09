import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'
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

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
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

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || '—'}</p>
    </div>
  )
}

function CycleInfoTab({ cycle, onRefresh }) {
  const { showToast } = useToast()
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    status: cycle.status,
    actual_harvest_date: cycle.actual_harvest_date || '',
    harvest_volume_kg: cycle.harvest_volume_kg || '',
    area_cage_harvested: cycle.area_cage_harvested || '',
    notes: cycle.notes || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await api.patch(`/monitoring/aquaculture-cycles/${cycle.id}/`, {
        ...form,
        harvest_volume_kg: form.harvest_volume_kg ? parseFloat(form.harvest_volume_kg) : null,
        actual_harvest_date: form.actual_harvest_date || null,
        area_cage_harvested: form.area_cage_harvested || '',
      })
      showToast('Cycle updated.', 'success')
      setEditMode(false)
      onRefresh()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  if (editMode) {
    return (
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Status</label>
            <select className={baseInputClasses} value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
              {['Active','Harvested','Failed','Abandoned'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Actual Harvest Date</label>
            <input type="date" className={baseInputClasses} value={form.actual_harvest_date} onChange={e => setForm(f => ({...f, actual_harvest_date: e.target.value}))} />
          </div>
          <div>
            <label className={labelCls}>Harvest Volume (kg)</label>
            <input type="number" step="0.01" className={baseInputClasses} value={form.harvest_volume_kg} onChange={e => setForm(f => ({...f, harvest_volume_kg: e.target.value}))} />
          </div>
          <div>
            <label className={labelCls}>Area / Cage Harvested</label>
            <input className={baseInputClasses} value={form.area_cage_harvested} onChange={e => setForm(f => ({...f, area_cage_harvested: e.target.value}))} placeholder="e.g. Pond 1 & 2, Cage A" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea className={baseInputClasses} rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
          <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>Edit</Button>
      </div>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <InfoField label="Fisherfolk" value={cycle.fisherfolk_name} />
        <InfoField label="Organization" value={cycle.organization_name} />
        <InfoField label="Cycle Name" value={cycle.cycle_name} />
        <div>
          <p className="text-xs font-medium text-slate-400">Status</p>
          <div className="mt-0.5">
            <StatusPill tone={CYCLE_STATUS_TONES[cycle.status] || 'slate'}>{cycle.status}</StatusPill>
          </div>
        </div>
        <InfoField label="Species" value={cycle.species_display || cycle.species_farmed} />
        <InfoField label="Culture System" value={cycle.culture_system} />
        <InfoField label="Pond Location" value={cycle.pond_location || null} />
        <InfoField label="Area" value={cycle.area_sqm ? `${cycle.area_sqm} sqm` : null} />
        <InfoField label="Stocking Date" value={formatDate(cycle.stocking_date)} />
        <InfoField label="Stocking Count" value={cycle.stocking_count ? `${Number(cycle.stocking_count).toLocaleString()} pcs` : null} />
        <InfoField label="Target Harvest" value={formatDate(cycle.target_harvest_date)} />
        <InfoField label="Actual Harvest" value={formatDate(cycle.actual_harvest_date)} />
        <InfoField label="Harvest Volume" value={cycle.harvest_volume_kg ? `${Number(cycle.harvest_volume_kg).toLocaleString()} kg` : null} />
        <InfoField label="Area/Cage Harvested" value={cycle.area_cage_harvested || null} />
        <div className="sm:col-span-3">
          <InfoField label="Notes" value={cycle.notes} />
        </div>
      </div>

      {cycle.units?.length > 0 && (() => {
        const label = cycle.units[0].unit_type === 'cage' ? 'Cage' : 'Pond'
        const fmt = (n) => Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })
        const totalArea = cycle.units.reduce((s, u) => s + Number(u.size_sqm), 0)
        const totalActual = cycle.units.reduce((s, u) => s + Number(u.fingerling_count), 0)
        return (
          <div className="rounded-xl border border-slate-100 p-4">
            <p className="mb-2 text-sm font-semibold text-slate-700">Production Units</p>
            <ul className="divide-y divide-slate-100">
              {cycle.units.map(u => {
                const hasDims = u.length_m != null && u.width_m != null
                return (
                  <li key={u.id} className="py-2 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-slate-800">{label} {u.unit_number}</span>
                      <span className="text-slate-600">
                        {hasDims ? `${fmt(u.length_m)}m × ${fmt(u.width_m)}m · ` : ''}{fmt(u.size_sqm)} sq.m.
                      </span>
                    </div>
                    <div className="mt-0.5 text-xs text-slate-500">
                      <span>Actual Fingerlings: {fmt(u.fingerling_count)}</span>
                    </div>
                  </li>
                )
              })}
            </ul>
            <div className="mt-2 space-y-0.5 border-t border-slate-100 pt-2 text-sm font-semibold text-slate-800">
              <div className="flex justify-between"><span>Total Area</span><span>{fmt(totalArea)} sq.m.</span></div>
              <div className="flex justify-between"><span>Total Actual Fingerlings</span><span>{fmt(totalActual)}</span></div>
              <div className="flex justify-between">
                <span>Estimated Harvest Biomass</span>
                <span>{cycle.estimated_harvest_kg != null ? `${Number(cycle.estimated_harvest_kg).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kg` : 'Not available'}</span>
              </div>
            </div>
          </div>
        )
      })()}    </div>
  )
}
function FeedingLogTab({ cycleId, units = [], cycle }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const EMPTY_FEEDING_FORM = { feeding_date: '', feed_type: '', feed_type_other: '', feed_custom: '', quantity_kg: '', notes: '' }
  const [form, setForm] = useState(EMPTY_FEEDING_FORM)
  // false = the Feed Type shown is the system's suggestion; true = the user picked one (never overwritten).
  const [feedTouched, setFeedTouched] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  // The cycle's own ponds/cages (its Production Units). When it has any, feed is entered per unit
  // and the total is calculated; cycles without units keep the single Quantity (kg) field.
  const unitLabel = (u) => `${u.unit_type === 'cage' ? 'Cage' : 'Pond'} ${u.unit_number}`
  const hasUnits = units.length > 0
  const [unitQty, setUnitQty] = useState({})
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

  useEffect(() => { fetch() }, [cycleId])

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
      fetch()
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

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          {/* Table 1 - feed per production unit; the total is always the sum of the unit quantities. */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="feeding-units-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <th className="px-3 py-2">Pond/Cage</th>
                  <th className="px-3 py-2 text-right">Feed Quantity (kg)</th>
                </tr>
              </thead>
              <tbody>
                {hasUnits ? units.map(u => (
                  <tr key={u.id} className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">{unitLabel(u)}</td>
                    <td className="px-3 py-1.5">
                      <DecimalInput
                        decimals={2} className={`${baseInputClasses} text-right`} aria-label={`${unitLabel(u)} feed quantity (kg)`}
                        value={unitQty[u.id] ?? ''} onChange={v => setUnitQty(q => ({ ...q, [u.id]: v }))}
                      />
                    </td>
                  </tr>
                )) : (
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-1.5 font-medium text-slate-800">Whole cycle <span className="text-red-500">*</span></td>
                    <td className="px-3 py-1.5">
                      <DecimalInput decimals={2} className={`${baseInputClasses} text-right`} required aria-label="Feed quantity (kg)"
                        value={form.quantity_kg} onChange={v => setForm(f => ({ ...f, quantity_kg: v }))} />
                    </td>
                  </tr>
                )}
              </tbody>
              {hasUnits && (
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50 font-semibold text-slate-800">
                    <td className="px-3 py-2">TOTAL</td>
                    <td className="px-3 py-2 text-right" data-testid="feed-total">{unitsTotal.toFixed(2)} kg</td>
                  </tr>
                </tfoot>
              )}
            </table>
          </div>

          {/* Table 2 - the details of this feeding. */}
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white" data-testid="feeding-detail-table">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
                  <th className="w-[38%] px-3 py-2">Feeding Detail</th>
                  <th className="px-3 py-2">Value</th>
                </tr>
              </thead>
              <tbody className="align-top">
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs font-medium text-slate-700">Date <span className="text-red-500">*</span></td>
                  <td className="px-3 py-1.5">
                    <input type="date" className={baseInputClasses} required value={form.feeding_date} onChange={e => setForm(f => ({ ...f, feeding_date: e.target.value }))} />
                  </td>
                </tr>
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs font-medium text-slate-700">Suggested Feed Type <span className="text-red-500">*</span></td>
                  <td className="px-3 py-1.5">
                    <select
                      className={baseInputClasses} required value={feedType} data-testid="feed-type-select"
                      onChange={e => { setFeedTouched(true); setForm(f => ({ ...f, feed_type: e.target.value, feed_type_other: '', feed_custom: '' })) }}
                    >
                      <option value="" disabled>Select Feed Type</option>
                      {feedTypeChoices.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                    {suggestion ? (
                      <p className="mt-1 text-xs text-slate-500" data-testid="feed-suggestion-note">
                        Suggested: <span className="font-medium">{suggestion.value}</span>. {suggestion.note} You can change it based on your farm practice, fish size and available feed.
                        {showUseSuggested && (
                          <> <button type="button" className="font-medium text-[#1E4620] underline" data-testid="use-suggested-feed"
                            onClick={() => { setFeedTouched(false); setForm(f => ({ ...f, feed_type: '', feed_type_other: '', feed_custom: '' })) }}>Use Suggested Feed</button></>
                        )}
                      </p>
                    ) : (
                      <p className="mt-1 text-xs text-slate-500">No suggestion is available for this cycle - choose the feed used.</p>
                    )}
                  </td>
                </tr>
                {feedType === 'Others' && (
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs font-medium text-slate-700">Other Feed Type <span className="text-red-500">*</span></td>
                    <td className="px-3 py-1.5">
                      <select className={baseInputClasses} required value={form.feed_type_other}
                        onChange={e => setForm(f => ({ ...f, feed_type_other: e.target.value, feed_custom: '' }))}>
                        <option value="" disabled>Select Other Feed Type</option>
                        {OTHER_FEED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <p className="mt-1 text-xs text-slate-500">Alternative/supplemental feed examples - not suitable for every species or system.</p>
                    </td>
                  </tr>
                )}
                {feedType === 'Others' && form.feed_type_other === 'Custom Feed' && (
                  <tr className="border-t border-slate-100">
                    <td className="px-3 py-2 text-xs font-medium text-slate-700">Custom Feed Name <span className="text-red-500">*</span></td>
                    <td className="px-3 py-1.5">
                      <input className={baseInputClasses} required maxLength={100} value={form.feed_custom}
                        onChange={e => setForm(f => ({ ...f, feed_custom: e.target.value }))} placeholder="Enter feed name" />
                    </td>
                  </tr>
                )}
                <tr className="border-t border-slate-100">
                  <td className="px-3 py-2 text-xs font-medium text-slate-700">Notes</td>
                  <td className="px-3 py-1.5">
                    <input className={baseInputClasses} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Optional" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
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

function HealthLogTab({ cycleId, units = [], onChanged }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  // The cycle's own ponds/cages (its existing Production Units) - the affected one must be chosen
  // when the cycle has any. Nothing is typed: options come straight from the units.
  const hasUnits = units.length > 0
  const unitName = (u) => `${u.unit_type === 'cage' ? 'Cage' : 'Pond'} ${u.unit_number}`
  const EMPTY_HEALTH_FORM = {
    production_units: [],       // ids of the affected ponds/cages (multi-select)
    unit_mortality: {},         // {unitId: count}, used when several units are selected with Fish Mortality
    log_date: '',
    observation: '',
    observation_other: '',
    mortality_count: '0',
    treatment_applied: '',
    treatment_applied_other: '',
    notes: '',
  }
  const [form, setForm] = useState(EMPTY_HEALTH_FORM)
  const [isSaving, setIsSaving] = useState(false)
  // Cycles with ponds/cages: every selected unit has its OWN observation, mortality count and treatment
  // ({unitId: entry}); nothing typed for one unit applies to another. Errors are per unit too.
  const EMPTY_UNIT_ENTRY = { observation: '', observation_other: '', mortality_count: '', treatment_applied: '' }
  const [unitEntries, setUnitEntries] = useState({})
  const [unitErrors, setUnitErrors] = useState({})
  const entryFor = (id) => unitEntries[id] || EMPTY_UNIT_ENTRY
  const setEntry = (id, patch) => {
    setUnitEntries(prev => ({ ...prev, [id]: { ...(prev[id] || EMPTY_UNIT_ENTRY), ...patch } }))
    setUnitErrors(prev => ({ ...prev, [id]: '' }))
  }
  // Same rule as the backend (monitoring.models.health_requires_force_harvest) - display only.
  const isForceObservation = (obs) => obs === 'Fish Mortality' || HEALTH_DISEASE_OBSERVATIONS.includes(obs)
  const chooseUnitObservation = (id, obs) => {
    const current = entryFor(id)
    setEntry(id, {
      observation: obs,
      // The real number of dead fish is always typed - never pre-filled or calculated.
      mortality_count: obs === 'Fish Mortality' ? (Number(current.mortality_count) > 0 ? current.mortality_count : '') : '',
      treatment_applied: isForceObservation(obs) ? '' : (HEALTH_RECOMMENDED_TREATMENT[obs] || ''),
    })
  }
  const validateUnitEntry = (e) => {
    if (!e.observation) return 'Observation is required.'
    if (e.observation === 'Other' && !e.observation_other.trim()) return 'Specify the observation.'
    if (e.observation === 'Fish Mortality' && !(Number(e.mortality_count) > 0)) return 'Mortality Count is required for Fish Mortality.'
    if (!isForceObservation(e.observation) && !e.treatment_applied) return 'Treatment is required for this observation.'
    return ''
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
  const forceHarvest = form.observation === 'Fish Mortality' || HEALTH_DISEASE_OBSERVATIONS.includes(form.observation)

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
        onChanged?.()   // the Force Harvest state of the Fisheries Monitoring row may have changed
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
      onChanged?.()   // the Force Harvest state of the Fisheries Monitoring row may have changed
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

      {/* Force Harvest is per pond/cage: only a unit with its own mortality/disease log is marked. */}
      {hasUnits && (
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
        <form onSubmit={handleAdd} className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={baseInputClasses} required value={form.log_date} onChange={e => setForm(f => ({...f, log_date: e.target.value}))} />
            </div>
            {hasUnits && (
              <div className="sm:col-span-2" data-testid="affected-units">
                <label className={labelCls}>Affected Pond/Cage *</label>
                {availableUnits.length === 0 ? (
                  <p className="text-xs italic text-slate-500">Every pond/cage in this cycle already has a Health Log.</p>
                ) : (
                  <div className="flex flex-wrap gap-2" role="group" aria-label="Affected Pond/Cage">
                    {availableUnits.map(u => {
                      const on = form.production_units.includes(u.id)
                      return (
                        <button
                          key={u.id} type="button" aria-pressed={on} onClick={() => toggleUnit(u.id)}
                          className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${on ? 'border-[#1E4620] bg-[#1E4620] text-white' : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'}`}
                        >
                          {unitName(u)}
                        </button>
                      )
                    })}
                  </div>
                )}
                {availableUnits.length > 0 && availableUnits.length < units.length && (
                  <p className="mt-1 text-[11px] text-slate-500">Ponds/cages that already have a Health Log are not listed.</p>
                )}
              </div>
            )}
            {hasUnits && selectedUnits.length > 0 && (
              // Compact table: one row per selected pond/cage with its OWN Observation. Mortality Count
              // (Fish Mortality) and Treatment (non-Force-Harvest observations) appear under it only when needed.
              <div className="sm:col-span-2 overflow-hidden rounded-lg border border-orange-200 bg-white" data-testid="unit-health-entries">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-orange-100/60 text-left text-xs font-semibold text-slate-700">
                      <th className="w-[30%] px-3 py-2">Pond/Cage</th>
                      <th className="px-3 py-2">Observation <span className="text-red-500">*</span></th>
                    </tr>
                  </thead>
                  <tbody className="align-top">
                    {selectedUnits.map(u => {
                      const e = entryFor(u.id)
                      const force = isForceObservation(e.observation)
                      const err = unitErrors[u.id]
                      return (
                        <tr key={u.id} data-testid={`unit-health-${u.id}`} className={`border-t border-orange-100 ${err ? 'bg-rose-50/60' : ''}`}>
                          <td className="px-3 py-2">
                            <span className="font-semibold text-slate-800">{unitName(u)}</span>
                            {force && (
                              <span className="mt-1 block w-fit" style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#ffebee', color: '#c62828', fontWeight: 600 }}>
                                ⚠ Force Harvest
                              </span>
                            )}
                          </td>
                          <td className="space-y-1.5 px-3 py-1.5">
                            <ComboboxWithOther
                              options={HEALTH_OBSERVATION_OPTIONS.filter(o => o !== 'Other')}
                              value={e.observation}
                              otherValue={e.observation_other}
                              onChange={(obs) => chooseUnitObservation(u.id, obs)}
                              onOtherChange={(v) => setEntry(u.id, { observation_other: v })}
                              placeholder="Select Observation"
                              required
                            />
                            {e.observation === 'Fish Mortality' && (
                              <input
                                type="number" min="1" required className={baseInputClasses}
                                aria-label={`${unitName(u)} mortality count`} placeholder="Mortality Count *"
                                value={e.mortality_count}
                                onChange={ev => setEntry(u.id, { mortality_count: ev.target.value })}
                              />
                            )}
                            {e.observation && !force && (
                              <select
                                className={baseInputClasses} required aria-label={`${unitName(u)} treatment`}
                                value={e.treatment_applied}
                                onChange={ev => setEntry(u.id, { treatment_applied: ev.target.value })}
                              >
                                <option value="">Select Treatment *</option>
                                {HEALTH_TREATMENT_OPTIONS.map(option => (
                                  <option key={option} value={option}>{option}</option>
                                ))}
                              </select>
                            )}
                            {err && <p className="text-xs text-rose-600" role="alert">{err}</p>}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {/* Cycles without ponds/cages (Fishpen, older cycles): the single shared form, as before. */}
            {!hasUnits && (<>
            <div>
              <label className={labelCls}>Observation *</label>
              <ComboboxWithOther
                options={HEALTH_OBSERVATION_OPTIONS.filter(o => o !== 'Other')}
                value={form.observation}
                otherValue={form.observation_other}
                onChange={(selectedObservation) => {
                  const isMortality = selectedObservation === 'Fish Mortality'
                  const noTreatment = isMortality || HEALTH_DISEASE_OBSERVATIONS.includes(selectedObservation)
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
            </div>
            {form.observation === 'Fish Mortality' && (
              <div>
                <label className={labelCls}>Mortality Count *</label>
                <input
                  type="number"
                  min="1"
                  className={baseInputClasses}
                  required
                  value={form.mortality_count}
                  onChange={e => setForm(f => ({ ...f, mortality_count: e.target.value }))}
                />
              </div>
            )}
            {form.observation && !forceHarvest && (
              <div>
                <label className={labelCls}>Treatment *</label>
                <select
                  className={baseInputClasses}
                  value={form.treatment_applied}
                  required
                  onChange={e => setForm(f => ({ ...f, treatment_applied: e.target.value }))}
                >
                  <option value="">Select Treatment</option>
                  {HEALTH_TREATMENT_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}
            </>)}
          </div>
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
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
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

const HEALTH_OBSERVATION_OPTIONS = [
  'Fish Mortality',
  'Bacterial Infection',
  'Fungal Infection',
  'Fin Rot',
  'Gill Disease',
  'White Spot (Ich)',
  'Parasites',
  'Poor Water Quality',
  'Low Dissolved Oxygen',
  'Weak Swimming',
  'Feeding Issue',
  'Injury',
  'Predator Attack',
  'Other',
]

// The disease entries of HEALTH_OBSERVATION_OPTIONS. Mirrors monitoring.models.HEALTH_DISEASE_OBSERVATIONS,
// which is the authoritative rule; this only drives the live banner.
const HEALTH_DISEASE_OBSERVATIONS = [
  'Bacterial Infection',
  'Fungal Infection',
  'Fin Rot',
  'Gill Disease',
  'White Spot (Ich)',
  'Parasites',
]

const HEALTH_RECOMMENDED_TREATMENT = {
  'Fish Mortality': 'Remove dead fish and disinfect pond',
  'Bacterial Infection': 'Oxytetracycline',
  'Fungal Infection': 'Salt Bath',
  'Fin Rot': 'Oxytetracycline',
  'Gill Disease': 'Improve water quality',
  'White Spot (Ich)': 'Salt Treatment',
  Parasites: 'Formalin Bath',
  'Poor Water Quality': 'Water Exchange',
  'Low Dissolved Oxygen': 'Increase Aeration',
  'Weak Swimming': 'Improve water quality, increase aeration, and closely observe affected fish.',
  'Feeding Issue': 'Adjust Feeding Schedule',
  Injury: 'Isolate Injured Fish',
  'Predator Attack': 'Install Protective Netting',
  Other: 'Manual Input',
}

const HEALTH_TREATMENT_OPTIONS = [
  'Oxytetracycline',
  'Salt Bath',
  'Improve water quality',
  'Salt Treatment',
  'Formalin Bath',
  'Water Exchange',
  'Increase Aeration',
  'Improve water quality, increase aeration, and closely observe affected fish.',
  'Adjust Feeding Schedule',
  'Isolate Injured Fish',
  'Install Protective Netting',
  'Manual Input',
]

/* const INPUT_TYPE_OPTIONS = [
  'Feed',
  'Fingerlings',
  'Fertilizer',
  'Lime',
  'Salt',
  'Probiotics',
  'Vitamins',
  'Water Treatment',
  'Medicine',
  'Disinfectant',
  'Fuel',
  'Electricity',
  'Equipment',
  'Labor',
  'Packaging Materials',
  'Ice',
  'Other',
]

const INPUT_ITEM_OPTIONS_BY_TYPE = {
  Feed: [
    'Commercial Pellets',
    'Floating Pellets',
    'Sinking Pellets',
    'Starter Feed',
    'Grower Feed',
    'Finisher Feed',
    'Rice Bran (Darak)',
    'Corn Bran',
    'Copra Meal',
    'Azolla',
    'Duckweed',
    'Homemade Feed',
    'Mixed Feed',
    'Other',
  ],
  Fingerlings: [
    'Tilapia Fingerlings',
    'Bangus Fry',
    'Catfish Fingerlings',
    'Carp Fingerlings',
    'Shrimp Post Larvae',
    'Mud Crab Juveniles',
    'Oyster Spat',
    'Mussel Seed',
    'Other',
  ],
  Fertilizer: ['Organic Fertilizer', 'Chicken Manure', 'Urea', 'Complete Fertilizer', 'Other'],
  Lime: ['Agricultural Lime', 'Hydrated Lime', 'Dolomite Lime', 'Other'],
  Salt: ['Rock Salt', 'Iodized Salt', 'Marine Salt', 'Other'],
  Probiotics: ['Pond Probiotics', 'Water Probiotics', 'Other'],
  Vitamins: ['Vitamin C', 'Multivitamins', 'Growth Enhancer', 'Other'],
  'Water Treatment': ['Zeolite', 'Water Conditioner', 'Chlorine', 'Other'],
  Medicine: ['Oxytetracycline', 'Amoxicillin', 'Antifungal Treatment', 'Antiparasitic Treatment', 'Other'],
  Disinfectant: ['Iodine', 'Bleaching Powder', 'Chlorine', 'Other'],
  Fuel: ['Diesel', 'Gasoline', 'Other'],
  Electricity: ['Electric Bill', 'Generator Power', 'Other'],
  Equipment: ['Aerator', 'Water Pump', 'Nets', 'Buckets', 'Hoses', 'Paddle', 'Other'],
  Labor: ['Pond Preparation', 'Feeding', 'Harvesting', 'Maintenance', 'Other'],
  'Packaging Materials': ['Plastic Bags', 'Styrofoam Box', 'Carton Box', 'Ice Box', 'Other'],
  Ice: ['Crushed Ice', 'Ice Block', 'Other'],
  Other: [],
}

const INPUT_UNIT_OPTIONS = [
  'kg',
  'g',
  'L',
  'mL',
  'sacks',
  'bags',
  'packs',
  'bottles',
  'boxes',
  'pieces',
  'sets',
  'rolls',
  'trays',
  'units',
  'gallons',
  'liters',
  'hours',
  'days',
  'Other',
]

const SUPPLIER_OPTIONS = [
  'BFAR',
  'LGU Aringay',
  'Department of Agriculture (DA)',
  'Provincial Government of La Union',
  'Local Agricultural Supply Store',
  'Local Feed Store',
  'Aquaculture Supply Store',
  'Fisheries Cooperative',
  'Fisherfolk Organization',
  'Private Supplier',
  'Local Hatchery',
  'Commercial Hatchery',
  'Feed Distributor',
  'Veterinary Supply Store',
  'Online Supplier',
  'Self-Produced',
  'Other',
]

function InputsTab({ cycleId }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    input_type: '',
    input_type_other: '',
    item_name: '',
    item_name_other: '',
    quantity: '',
    unit: '',
    unit_other: '',
    date_acquired: '',
    cost: '',
    supplier: '',
    supplier_other: '',
    remarks: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const fetch = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycleId}/inputs/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [cycleId])

  const handleAdd = async (e) => {
    e.preventDefault()

    if (!form.input_type) {
      showToast('Input Type is required.', 'error')
      return
    }
    if (form.input_type === 'Other' && !form.input_type_other.trim()) {
      showToast('Specify Input Type is required.', 'error')
      return
    }

    if (!form.item_name) {
      showToast('Item Name is required.', 'error')
      return
    }
    if (form.item_name === 'Other' && !form.item_name_other.trim()) {
      showToast('Specify Item Name is required.', 'error')
      return
    }

    if (!form.quantity || Number(form.quantity) <= 0) {
      showToast('Quantity must be greater than 0.', 'error')
      return
    }

    if (!form.unit) {
      showToast('Unit is required.', 'error')
      return
    }
    if (form.unit === 'Other' && !form.unit_other.trim()) {
      showToast('Specify Unit is required.', 'error')
      return
    }

    if (!form.date_acquired) {
      showToast('Date Acquired is required.', 'error')
      return
    }

    if (form.supplier === 'Other' && !form.supplier_other.trim()) {
      showToast('Specify Supplier is required.', 'error')
      return
    }

    if (form.cost !== '' && Number(form.cost) < 0) {
      showToast('Cost must not be negative.', 'error')
      return
    }

    const normalizedInputType = form.input_type === 'Other' ? form.input_type_other.trim() : form.input_type
    const normalizedItemName = form.item_name === 'Other' ? form.item_name_other.trim() : form.item_name
    const normalizedUnit = form.unit === 'Other' ? form.unit_other.trim() : form.unit
    const normalizedSupplier = form.supplier === 'Other' ? form.supplier_other.trim() : form.supplier

    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/inputs/`, {
        input_type: normalizedInputType,
        item_name: normalizedItemName,
        quantity: parseFloat(form.quantity),
        unit: normalizedUnit,
        date_acquired: form.date_acquired,
        cost: form.cost !== '' ? parseFloat(form.cost) : null,
        supplier: normalizedSupplier,
        remarks: form.remarks,
      })
      showToast('Input log added.', 'success')
      setShowForm(false)
      setForm({
        input_type: '',
        input_type_other: '',
        item_name: '',
        item_name_other: '',
        quantity: '',
        unit: '',
        unit_other: '',
        date_acquired: '',
        cost: '',
        supplier: '',
        supplier_other: '',
        remarks: '',
      })
      fetch()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return
    try {
      await api.delete(`/monitoring/aquaculture-inputs/${id}/`)
      showToast('Deleted.', 'success')
      fetch()
    } catch { showToast('Failed.', 'error') }
  }

  const totalCost = logs.reduce((s, l) => s + (parseFloat(l.cost_php) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} input{logs.length !== 1 ? 's' : ''}
          {totalCost > 0 && ` · Total cost: ₱${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </span>
        <Button size="sm" icon={Plus} onClick={() => setShowForm(v => !v)}>Log Input</Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-teal-100 bg-teal-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Input Type *</label>
              <ComboboxWithOther
                options={INPUT_TYPE_OPTIONS}
                value={form.input_type}
                otherValue={form.input_type_other}
                onChange={(v) => setForm(f => ({
                  ...f,
                  input_type: v,
                  input_type_other: v === 'Other' ? f.input_type_other : '',
                  item_name: '',
                  item_name_other: '',
                }))}
                onOtherChange={(v) => setForm(f => ({ ...f, input_type_other: v }))}
                placeholder="Select Input Type"
                required
                inputClassName={baseInputClasses}
              />
            </div>
            <div>
              <label className={labelCls}>Item Name *</label>
              <ComboboxWithOther
                options={INPUT_ITEM_OPTIONS_BY_TYPE[form.input_type] || []}
                value={form.item_name}
                otherValue={form.item_name_other}
                onChange={(v) => setForm(f => ({
                  ...f,
                  item_name: v,
                  item_name_other: v === 'Other' ? f.item_name_other : '',
                }))}
                onOtherChange={(v) => setForm(f => ({ ...f, item_name_other: v }))}
                placeholder={form.input_type ? 'Select Item Name' : 'Select Input Type first'}
                disabled={!form.input_type}
                required
                inputClassName={baseInputClasses}
              />
            </div>
            <div>
              <label className={labelCls}>Quantity *</label>
              <DecimalInput decimals={2} className={baseInputClasses} required value={form.quantity} onChange={v => setForm(f => ({...f, quantity: v}))} />
            </div>
            <div>
              <label className={labelCls}>Unit *</label>
              <ComboboxWithOther
                options={INPUT_UNIT_OPTIONS}
                value={form.unit}
                otherValue={form.unit_other}
                onChange={(v) => setForm(f => ({
                  ...f,
                  unit: v,
                  unit_other: v === 'Other' ? f.unit_other : '',
                }))}
                onOtherChange={(v) => setForm(f => ({ ...f, unit_other: v }))}
                placeholder="Select Unit"
                required
                inputClassName={baseInputClasses}
              />
            </div>
            <div>
              <label className={labelCls}>Date Acquired *</label>
              <input type="date" className={baseInputClasses} required value={form.date_acquired} onChange={e => setForm(f => ({...f, date_acquired: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Cost (₱)</label>
              <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.cost} onChange={e => setForm(f => ({...f, cost: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Supplier</label>
              <ComboboxWithOther
                options={SUPPLIER_OPTIONS}
                value={form.supplier}
                otherValue={form.supplier_other}
                onChange={(v) => setForm(f => ({
                  ...f,
                  supplier: v,
                  supplier_other: v === 'Other' ? f.supplier_other : '',
                }))}
                onOtherChange={(v) => setForm(f => ({ ...f, supplier_other: v }))}
                placeholder="Select Supplier (Optional)"
                inputClassName={baseInputClasses}
              />
            </div>
            <div>
              <label className={labelCls}>Remarks</label>
              <input className={baseInputClasses} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-400">No input logs recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {logs.map(l => (
            <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{l.item_name}</span>
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#e0f2f1', color: '#00695c', fontWeight: 600 }}>{l.input_type}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {l.quantity} {l.unit}
                  {(l.cost ?? l.cost_php) != null && (l.cost ?? l.cost_php) !== '' && ` · ₱${Number(l.cost ?? l.cost_php).toLocaleString()}`}
                  {` · ${formatDate(l.date_acquired)}`}
                  {(l.supplier || l.source) && ` · ${l.supplier || l.source}`}
                </p>
                {(l.remarks || l.notes) && <p className="text-xs text-slate-400">{l.remarks || l.notes}</p>}
              </div>
              <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => handleDelete(l.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SPECIES_SOLD_OPTIONS = [
  'Tilapia',
  'Bangus',
  'Catfish',
  'Carp',
  'Shrimp',
  'Prawn',
  'Mud Crab',
  'Oyster',
  'Mussel',
  'Seaweed',
  'Other',
]

function EconomicsTab({ cycle, onRefresh }) {
  const { showToast } = useToast()
  const [inputLogs, setInputLogs] = useState([])
  const [isLoadingInputs, setIsLoadingInputs] = useState(true)
  const [isSavingSales, setIsSavingSales] = useState(false)
  const [salesForm, setSalesForm] = useState({
    harvest_date: cycle.actual_harvest_date || '',
    species_sold: cycle.species_farmed || '',
    species_sold_other: '',
    quantity_sold_kg: cycle.harvest_volume_kg ? String(cycle.harvest_volume_kg) : '',
    price_per_kg: cycle.price_per_kg ? String(cycle.price_per_kg) : '',
  })

  useEffect(() => {
    setSalesForm({
      harvest_date: cycle.actual_harvest_date || '',
      species_sold: cycle.species_farmed || '',
      species_sold_other: '',
      quantity_sold_kg: cycle.harvest_volume_kg ? String(cycle.harvest_volume_kg) : '',
      price_per_kg: cycle.price_per_kg ? String(cycle.price_per_kg) : '',
    })
  }, [cycle])

  const fetchInputs = async () => {
    setIsLoadingInputs(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycle.id}/inputs/`)
      setInputLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setInputLogs([])
    } finally {
      setIsLoadingInputs(false)
    }
  }

  useEffect(() => { fetchInputs() }, [cycle.id])

  const quantity = parseFloat(salesForm.quantity_sold_kg)
  const price = parseFloat(salesForm.price_per_kg)
  const totalRevenueComputed = Number.isFinite(quantity) && Number.isFinite(price)
    ? quantity * price
    : 0

  const addCost = (a, b) => a + b
  const getLogCost = (l) => {
    const raw = l.cost ?? l.cost_php
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }

  const costByCategory = inputLogs.reduce((acc, log) => {
    const type = (log.input_type || '').toLowerCase()
    const cost = getLogCost(log)

    if (type.includes('feed')) acc.feed += cost
    else if (type.includes('fingerling')) acc.fingerlings += cost
    else if (type.includes('medicine') || type.includes('medic')) acc.medicine += cost
    else if (type.includes('fertilizer') || type.includes('lime')) acc.fertilizer_lime += cost
    else if (type.includes('labor')) acc.labor += cost
    else if (type.includes('equipment')) acc.equipment += cost
    else acc.other += cost

    return acc
  }, {
    feed: 0,
    fingerlings: 0,
    medicine: 0,
    fertilizer_lime: 0,
    labor: 0,
    equipment: 0,
    other: 0,
  })

  const totalCost = Object.values(costByCategory).reduce(addCost, 0)
  const totalRevenue = totalRevenueComputed > 0
    ? totalRevenueComputed
    : (cycle.revenue_php != null ? Number(cycle.revenue_php) : 0)
  const netIncome = totalRevenue - totalCost
  const roi = totalCost > 0 ? (netIncome / totalCost) * 100 : null

  const costRows = [
    ['Feed cost', costByCategory.feed],
    ['Fingerlings cost', costByCategory.fingerlings],
    ['Medicine cost', costByCategory.medicine],
    ['Fertilizer/Lime cost', costByCategory.fertilizer_lime],
    ['Labor cost', costByCategory.labor],
    ['Equipment cost', costByCategory.equipment],
    ['Other input costs', costByCategory.other],
  ]

  const salesRows = (salesForm.harvest_date && salesForm.quantity_sold_kg && salesForm.price_per_kg)
    ? [{
        harvest_date: salesForm.harvest_date,
        species_sold: salesForm.species_sold || cycle.species_farmed || '—',
        quantity_sold_kg: Number(salesForm.quantity_sold_kg),
        price_per_kg: Number(salesForm.price_per_kg),
        total_revenue: totalRevenueComputed,
      }]
    : (cycle.actual_harvest_date && cycle.harvest_volume_kg && cycle.price_per_kg)
      ? [{
          harvest_date: cycle.actual_harvest_date,
          species_sold: cycle.species_farmed || '—',
          quantity_sold_kg: Number(cycle.harvest_volume_kg),
          price_per_kg: Number(cycle.price_per_kg),
          total_revenue: Number(cycle.revenue_php || (Number(cycle.harvest_volume_kg) * Number(cycle.price_per_kg))),
        }]
      : []

  const handleSaveSales = async (e) => {
    e.preventDefault()

    if (!salesForm.harvest_date) {
      showToast('Harvest Date is required.', 'error')
      return
    }

    if (!salesForm.species_sold) {
      showToast('Species Sold is required.', 'error')
      return
    }

    if (salesForm.species_sold === 'Other' && !salesForm.species_sold_other.trim()) {
      showToast('Specify Species Sold is required.', 'error')
      return
    }

    if (!salesForm.quantity_sold_kg || Number(salesForm.quantity_sold_kg) <= 0) {
      showToast('Quantity Sold must be greater than 0.', 'error')
      return
    }

    if (!salesForm.price_per_kg || Number(salesForm.price_per_kg) <= 0) {
      showToast('Price per kg must be greater than 0.', 'error')
      return
    }

    const normalizedSpeciesSold = salesForm.species_sold === 'Other'
      ? salesForm.species_sold_other.trim()
      : salesForm.species_sold

    setIsSavingSales(true)
    try {
      await api.patch(`/monitoring/aquaculture-cycles/${cycle.id}/`, {
        actual_harvest_date: salesForm.harvest_date,
        species_sold: normalizedSpeciesSold,
        harvest_volume_kg: parseFloat(salesForm.quantity_sold_kg),
        price_per_kg: parseFloat(salesForm.price_per_kg),
        revenue_php: totalRevenueComputed,
      })
      showToast('Economics sales data saved.', 'success')
      onRefresh()
    } catch {
      showToast('Failed to save economics data.', 'error')
    } finally {
      setIsSavingSales(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSaveSales} className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-emerald-800">Revenue / Sales</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Harvest Date *</label>
            <input
              type="date"
              className={baseInputClasses}
              required
              value={salesForm.harvest_date}
              onChange={e => setSalesForm(f => ({ ...f, harvest_date: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Species Sold *</label>
            <select
              className={baseInputClasses}
              required
              value={salesForm.species_sold}
              onChange={e => {
                const value = e.target.value
                setSalesForm(f => ({
                  ...f,
                  species_sold: value,
                  species_sold_other: value === 'Other' ? f.species_sold_other : '',
                }))
              }}
            >
              <option value="">Select Species Sold</option>
              {SPECIES_SOLD_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            {salesForm.species_sold === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`}
                required
                value={salesForm.species_sold_other}
                onChange={e => setSalesForm(f => ({ ...f, species_sold_other: e.target.value }))}
                placeholder="Specify Species Sold"
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Quantity Sold (kg) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className={baseInputClasses}
              required
              value={salesForm.quantity_sold_kg}
              onChange={e => setSalesForm(f => ({ ...f, quantity_sold_kg: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Price per kg (₱) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className={baseInputClasses}
              required
              value={salesForm.price_per_kg}
              onChange={e => setSalesForm(f => ({ ...f, price_per_kg: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Total Revenue (auto-computed)</label>
            <input
              className={baseInputClasses}
              value={totalRevenueComputed > 0 ? `₱${totalRevenueComputed.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
              readOnly
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" isLoading={isSavingSales}>Save Sales</Button>
        </div>
      </form>

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Total Revenue</p>
          <p className="text-xl font-bold text-[#1E4620]">
            {totalRevenue > 0 ? `₱${Number(totalRevenue).toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Total Cost</p>
          <p className="text-xl font-bold text-slate-800">
            {totalCost > 0 ? `₱${Number(totalCost).toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Net Income</p>
          <p className={`text-xl font-bold ${totalRevenue > 0 || totalCost > 0 ? (netIncome >= 0 ? 'text-[#1E4620]' : 'text-rose-600') : 'text-slate-400'}`}>
            {totalRevenue > 0 || totalCost > 0 ? `₱${Number(netIncome).toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">ROI %</p>
          <p className={`text-xl font-bold ${roi != null ? (roi >= 0 ? 'text-[#1E4620]' : 'text-rose-600') : 'text-slate-400'}`}>
            {roi != null ? `${roi.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">Cost Breakdown</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Cost Item</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {costRows.map(([label, val]) => (
              <tr key={label}>
                <td className="px-4 py-2 text-slate-700">{label}</td>
                <td className="px-4 py-2 text-right text-slate-700">₱{Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-4 py-2 font-semibold text-slate-800">Total</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-800">₱{Number(totalCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">Sales Table</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Harvest Date</th>
              <th className="px-4 py-2 text-left">Species</th>
              <th className="px-4 py-2 text-right">Quantity Sold</th>
              <th className="px-4 py-2 text-right">Price per kg</th>
              <th className="px-4 py-2 text-right">Total Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {salesRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-sm italic text-slate-400">No sales records yet.</td>
              </tr>
            ) : (
              salesRows.map((row, idx) => (
                <tr key={`${row.harvest_date}-${idx}`}>
                  <td className="px-4 py-2 text-slate-700">{formatDate(row.harvest_date)}</td>
                  <td className="px-4 py-2 text-slate-700">{row.species_sold}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{Number(row.quantity_sold_kg).toLocaleString()} kg</td>
                  <td className="px-4 py-2 text-right text-slate-700">₱{Number(row.price_per_kg).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">₱{Number(row.total_revenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isLoadingInputs && <LoadingSpinner />}
    </div>
  )
} */

function AquacultureCycleDetailModal({ cycle, onClose, onRefresh, onHealthChanged }) {
  const [innerTab, setInnerTab] = useState('info')

  const INNER_TABS = [
    { label: 'Cycle Info', value: 'info' },
    { label: 'Feeding Log', value: 'feeding' },
    { label: 'Health Log', value: 'health' },
  ]

  return (
    <ModalShell title={`Cycle: ${cycle.cycle_name}`} onClose={onClose} maxWidth="max-w-3xl">
      <InnerTabs tabs={INNER_TABS} active={innerTab} onChange={setInnerTab} />

      {innerTab === 'info' && (
        <CycleInfoTab
          key={[cycle.status, cycle.actual_harvest_date, cycle.harvest_volume_kg, cycle.area_cage_harvested, cycle.notes].join('|')}
          cycle={cycle}
          onRefresh={onRefresh}
        />
      )}
      {innerTab === 'feeding' && <FeedingLogTab cycleId={cycle.id} units={cycle.units || []} cycle={cycle} />}
      {innerTab === 'health' && <HealthLogTab cycleId={cycle.id} units={cycle.units || []} onChanged={onHealthChanged} />}
    </ModalShell>
  )
}

export default AquacultureCycleDetailModal
