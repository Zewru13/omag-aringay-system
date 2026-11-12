import { useEffect, useState } from 'react'
import { Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { LogCell, LogHead, LogRow, LogTable, LogTh } from '../Monitoring/LogFormTable.jsx'
import { fmtKg, harvestRowState, pickedUnits, unitKgTotal, validateUnitKg } from './harvestUnitKg.js'

const todayISO = () => new Date().toISOString().slice(0, 10)

// DRF's default validation-error shape is {field: [message, ...]}, not
// {detail: message} — a plain `.detail` fallback (the pattern used
// elsewhere in this file) silently swallows every field-level rejection
// (future date, harvest before stocking, missing early/late reason) behind
// a generic "Failed" toast, with no way for the user to know which fired.
function extractErrorMessage(err, fallback) {
  const data = err?.response?.data
  if (data?.detail) return data.detail
  if (data && typeof data === 'object') {
    const firstKey = Object.keys(data)[0]
    const firstVal = data[firstKey]
    if (firstKey && firstVal) {
      const msg = Array.isArray(firstVal) ? firstVal[0] : firstVal
      return msg
    }
  }
  return fallback
}

function fmtDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v + 'T00:00:00'))
}

// ── Record Harvest (normal harvest and the Health Log's force harvest): the whole body as tables ─────────────────────────────────────────────
// Same layout for every account (fisherfolk, Admin, Focal Person): the harvest details in one table and the ponds/cages in another, one row each
// with a tick box, its estimated harvest and its own Actual Harvest (kg); the footer adds the actual harvests up. Normal harvest: tick the ponds/cages
// being harvested. Health-related forced harvest: the affected ponds/cages are always ticked (all of them are harvested, nothing else), with the health
// issue shown beside each. The upcoming-typhoon Force Harvest is a separate workflow (FisheriesRecords/ForceHarvestModal.jsx) and not part of this.
// Purely presentation - the state, validation and payload stay in RecordStockingHarvestModal.

const days = (n) => `${n} day${n !== 1 ? 's' : ''}`

function EstimateNote({ record, enteredKg }) {
  if (record.estimated_harvest_kg == null) return null
  const estimate = parseFloat(record.estimated_harvest_kg)
  return (
    <div className={`mt-2 rounded-xl border px-3 py-2 text-xs ${
      !(enteredKg > 0)
        ? 'border-slate-200 bg-slate-50 text-slate-600'
        : enteredKg >= estimate
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-amber-200 bg-amber-50 text-amber-700'
    }`}>
      <p>
        Estimated harvest: <span className="font-medium">{fmtKg(record.estimated_harvest_kg)} kg</span>
      </p>
      {enteredKg > 0 && (
        <p className="mt-1 font-medium">
          {(() => {
            const diff = enteredKg - estimate
            const pct = estimate != 0 ? Math.abs((diff / estimate) * 100) : 0
            if (Math.abs(diff) < 0.01) return '✓ Right at the estimated harvest.'
            return diff > 0
              ? `${diff.toFixed(2)} kg above estimate (${pct.toFixed(0)}% more).`
              : `${Math.abs(diff).toFixed(2)} kg below estimate (${pct.toFixed(0)}% less).`
          })()}
        </p>
      )}
    </div>
  )
}

// The ponds/cages being harvested: tick box, name, (forced: health issue), estimated and actual harvest, and the total.
function HarvestUnitsTable({
  units, forced, unitWord, cycleLabel, selectedIds, onSelect, values, errors, onChange, estimates, unitMortality,
}) {
  const allSelected = units.length > 0 && units.every(u => selectedIds.includes(u.id))
  const picked = pickedUnits(units, selectedIds, forced)
  const total = unitKgTotal(picked, values)
  const toggle = (id) => onSelect(selectedIds.includes(id) ? selectedIds.filter(x => x !== id) : [...selectedIds, id])
  const estimateOf = (id) => {
    if (estimates === null) return '…'
    const kg = estimates !== 'error' ? estimates[id] : undefined
    return kg != null ? fmtKg(kg) : (forced ? 'Not available' : '—')
  }
  const unitLabel = forced ? 'Pond/Cage' : unitWord
  return (
    <FormSection title={forced ? 'Affected Ponds and Cages' : `${unitLabel}s to Harvest`}>
    <LogTable bare label={forced ? 'Ponds or cages to harvest' : `${unitLabel}s to harvest`} testId="unit-harvest-table-wrap">
      <LogHead>
        <LogTh className="w-9">
          {!forced && (
            <input type="checkbox" checked={allSelected} onChange={() => onSelect(allSelected ? [] : units.map(u => u.id))}
              aria-label={`Select all available ${unitWord.toLowerCase()}s`} data-testid="unit-select-all" className="h-4 w-4 accent-[#1B4D2E]" />
          )}
        </LogTh>
        <LogTh>{unitLabel}</LogTh>
        {forced && <LogTh>Health Issue</LogTh>}
        <LogTh className="md:text-right">Estimated Harvest (kg)</LogTh>
        <LogTh required className="md:text-right">Actual Harvest (kg)</LogTh>
      </LogHead>
      <tbody data-testid={forced ? 'force-units' : 'unit-harvest-table'}>
        {cycleLabel && (
          <tr className="max-md:block"><td colSpan={forced ? 5 : 4} className="bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-[#1B4D2E] max-md:block">{cycleLabel}</td></tr>
        )}
        {units.map(u => {
          const { checked, locked } = harvestRowState({ forced, ticked: selectedIds.includes(u.id) })
          const mortality = forced ? unitMortality(u.id) : null
          return (
            <LogRow key={u.id} tone={checked ? 'bg-emerald-50/40' : ''}>
              <LogCell label="Harvest" className="md:w-9">
                <input type="checkbox" checked={checked} disabled={locked} onChange={() => toggle(u.id)} className="h-4 w-4 accent-[#1B4D2E]"
                  aria-label={`Harvest ${u.label}`} data-testid={`unit-pick-${u.id}`} />
              </LogCell>
              <LogCell label={unitLabel} className="font-semibold text-slate-800">{u.label}</LogCell>
              {forced && (
                <LogCell label="Health Issue" className="text-[13px] text-slate-800">
                  {u.reasons.join(', ') || '—'}
                  {mortality > 0 && <span className="block text-xs text-rose-700">{mortality.toLocaleString()} dead</span>}
                </LogCell>
              )}
              <LogCell label="Estimated Harvest (kg)" className="text-slate-600 md:text-right"><span data-testid={`unit-estimate-${u.id}`}>{estimateOf(u.id)}</span></LogCell>
              <LogCell label="Actual Harvest (kg) *" className="md:min-w-[8rem]">
                <input type="number" step="0.01" min="0.01" inputMode="decimal" disabled={!checked}
                  data-testid={`unit-kg-${u.id}`}
                  aria-label={`Actual Harvest (kg) for ${u.label}`}
                  aria-invalid={Boolean(checked && errors[u.id])}
                  className={`${baseInputClasses} md:text-right ${checked && errors[u.id] ? 'border-rose-400' : ''} disabled:bg-slate-50 disabled:text-slate-400`}
                  value={values[u.id] ?? ''}
                  onChange={e => onChange(u.id, e.target.value)}
                  placeholder={checked ? 'e.g. 12.50' : '—'} />
                {checked && errors[u.id] && <p className="mt-1 text-left text-xs text-rose-600">{errors[u.id]}</p>}
              </LogCell>
            </LogRow>
          )
        })}
      </tbody>
      <tfoot>
        <tr className="border-t-2 border-[#E2E8E2] bg-[#EBF5EE] text-sm font-semibold text-[#1B4D2E] max-md:flex max-md:justify-between max-md:px-3 max-md:py-2" data-testid="unit-kg-total">
          <td className="px-3 py-2 max-md:p-0" colSpan={forced ? 4 : 3}>
            {forced ? `${picked.length} affected ${picked.length === 1 ? 'unit' : 'units'}` : `${picked.length} of ${units.length} ${unitWord.toLowerCase()}${units.length !== 1 ? 's' : ''} selected`} · Total Actual Harvest (kg)
          </td>
          <td className="whitespace-nowrap px-3 py-2 text-right max-md:p-0">{fmtKg(total)} kg</td>
        </tr>
      </tfoot>
    </LogTable>
    </FormSection>
  )
}

// The harvest timing against the Harvest Date typed below (it defaults to today): an early harvest is still an Early Harvest.
function HarvestTiming({ expectedHarvestDate, daysFromNowToExpected, harvestVarianceDays, timingLabel, isEarly, isLate }) {
  if (!expectedHarvestDate) return null
  const timingDifference = harvestVarianceDays === null ? '—'
    : harvestVarianceDays === 0 ? '0 days'
    : `${days(Math.abs(harvestVarianceDays))} ${harvestVarianceDays < 0 ? 'earlier' : 'later'} than estimated`
  return (
    <div data-testid="harvest-timing">
      <DetailTable title="Harvest Timing" fields={[
        { label: 'Estimated Harvest Date', value: fmtDate(expectedHarvestDate) },
        { label: 'Days Until or Since Estimated Harvest', value: daysFromNowToExpected >= 0 ? `${days(daysFromNowToExpected)} from now` : `${days(Math.abs(daysFromNowToExpected))} ago` },
        { label: 'Harvest Timing', value: <span className={`font-semibold ${isEarly || isLate ? 'text-amber-700' : 'text-emerald-700'}`}>{timingLabel || '—'}</span> },
        { label: 'Timing Difference', value: timingDifference },
      ]} />
    </div>
  )
}

// The Harvest Date, the reason (forced: filled in from the Health Log; normal early/late harvest: a choice, and the typed reason for
// "Other") and the notes, as one section. `reason`: { label, required, content } or null; `reasonOther`: { content, error } or null.
function HarvestDetailRows({ harvestDate, onHarvestDate, reason, reasonOther, children }) {
  return (
    <div data-testid="harvest-details-table">
      <FormSection title="Harvest Details">
        <FormRows label="Harvest details">
          <FormRow>
            <FormCell label="Harvest Date" required wide={!reason}>
              <input type="date" className={`${baseInputClasses} w-full`} value={harvestDate} max={todayISO()} aria-label="Harvest Date" onChange={e => onHarvestDate(e.target.value)} />
            </FormCell>
            {reason && <FormCell label={reason.label} required={reason.required}>{reason.content}</FormCell>}
          </FormRow>
          {reasonOther && (
            <FormRow>
              <FormCell label="Other Reason" required wide error={reasonOther.error}>{reasonOther.content}</FormCell>
            </FormRow>
          )}
          {children}
        </FormRows>
      </FormSection>
    </div>
  )
}

function HarvestTables({
  forced, unitWord, units, cycleLabel, expectedHarvestDate, daysFromNowToExpected, harvestVarianceDays, timingLabel, isEarly, isLate,
  harvestDate, onHarvestDate, reason, reasonOther, notes, onNotes, selectedIds, onSelect, values, errors, onChange, estimates, unitMortality, footerNote,
}) {
  return (
    <div className="space-y-3">
      {forced && (
        <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2" data-testid="force-harvest-warning">
          <p className="text-sm font-bold text-rose-700">⚠ Force Harvest — affected production units</p>
          <p className="mt-0.5 text-xs text-rose-700">Fish mortality or disease was recorded in the Health Log. Only the affected production units below are harvested.</p>
        </div>
      )}

      <HarvestTiming expectedHarvestDate={expectedHarvestDate} daysFromNowToExpected={daysFromNowToExpected}
        harvestVarianceDays={harvestVarianceDays} timingLabel={timingLabel} isEarly={isEarly} isLate={isLate} />

      <HarvestDetailRows harvestDate={harvestDate} onHarvestDate={onHarvestDate} reason={reason} reasonOther={reasonOther}>
        <FormRow>
          <FormCell label="Notes" wide>
            <textarea rows={2} className={`${baseInputClasses} w-full resize-none`} value={notes} aria-label="Notes"
              onChange={e => onNotes(e.target.value)} placeholder="Optional" />
          </FormCell>
        </FormRow>
      </HarvestDetailRows>

      {units.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600" data-testid="no-units-available">
          No remaining {unitWord.toLowerCase()}s are available for harvest.
        </p>
      ) : (
        <HarvestUnitsTable
          units={units} forced={forced} unitWord={unitWord} cycleLabel={cycleLabel} selectedIds={selectedIds} onSelect={onSelect}
          values={values} errors={errors} onChange={onChange} estimates={estimates} unitMortality={unitMortality}
        />
      )}
      {footerNote}
    </div>
  )
}

// ── Record Harvest Modal ──────────────────────────────────────────────────────

export function RecordStockingHarvestModal({ record, onClose, onSuccess }) {
  const { showToast } = useToast()
  // Force Harvest is unit-aware: only the ponds/cages affected by fish mortality or disease (per the
  // cycle's Health Log) and not yet harvested are included. Unaffected units are never harvested.
  const harvestUnits = record.harvest_units || []
  const forceUnits = harvestUnits.filter(u => u.force_harvest && !u.harvested)
  const unitMode = forceUnits.length > 0
  const forceUnitNames = forceUnits.map(u => u.label).join(', ')
  // The reason comes from the Health Log condition(s) - never typed again.
  const forceReason = [...new Set(forceUnits.flatMap(u => u.reasons))].join('; ')
  // Normal harvest of a cycle with ponds/cages: pick from the units still available - not harvested
  // (normally or by Force Harvest) and not awaiting Force Harvest. Cycles without units (Fishpen,
  // older records) keep the free-text Area / Units field and the cycle-level harvest.
  const unitSelect = !unitMode && harvestUnits.length > 0
  // Both harvests of a cycle with ponds/cages (normal, and the Health Log's force harvest) use the one table layout.
  const tableMode = unitMode || unitSelect
  const availableUnits = harvestUnits.filter(u => !u.harvested && !u.force_harvest)
  const unitWord = (harvestUnits[0]?.label || 'Pond').split(' ')[0]
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`stocking-harvest:${record.id}`)
  const [selectedUnitIds, setSelectedUnitIds] = useDraftField(draft, 'selectedUnitIds', [])
  const selectedUnits = availableUnits.filter(u => selectedUnitIds.includes(u.id))
  // The backend closes the cycle only once every unit is harvested; this mirrors it for the UI text.
  const willBeFinal = !unitSelect || (availableUnits.length > 0 && selectedUnits.length === availableUnits.length)
  const [harvestDate,       setHarvestDate]       = useDraftField(draft, 'harvestDate', todayISO())
  const [quantityKg,        setQuantityKg]        = useDraftField(draft, 'quantityKg', '')
  const [areaOrUnits,       setAreaOrUnits]       = useDraftField(draft, 'areaOrUnits', unitMode ? forceUnitNames : '')
  const [notes,             setNotes]             = useDraftField(draft, 'notes', '')
  const [earlyLateReason,   setEarlyLateReason]   = useDraftField(draft, 'earlyLateReason', '')   // the chosen option
  const [earlyLateOther,    setEarlyLateOther]    = useDraftField(draft, 'earlyLateOther', '')   // "Other" -> the user's own reason
  const [reasonOtherError,  setReasonOtherError]  = useState('')
  const [showConfirm,       setShowConfirm]       = useState(false)
  const [isSubmitting,      setIsSubmitting]      = useState(false)
  const [quantityError,     setQuantityError]     = useState('')
  // Force Harvest: each affected pond/cage has its own Actual Harvest (kg) - {unitId: value / error}.
  const [unitKg,            setUnitKg]            = useDraftField(draft, 'unitKg', {})
  const [unitKgErrors,      setUnitKgErrors]      = useState({})
  const [resolvableDisasters, setResolvableDisasters] = useState([])
  const [dismissedDisasterIds, setDismissedDisasterIds] = useState(new Set())
  const [recoveringId,      setRecoveringId]      = useState(null)
  // Mortality per affected unit for the Force Harvest table, from the cycle's existing Health Log API
  // (the unit list and reasons themselves come from record.harvest_units). null = still loading.
  const [healthLogs, setHealthLogs] = useState(null)
  useEffect(() => {
    if (!unitMode || !record.production_cycle) { setHealthLogs([]); return }
    let cancelled = false
    api.get(`/monitoring/aquaculture-cycles/${record.production_cycle}/health/`)
      .then(r => { if (!cancelled) setHealthLogs(Array.isArray(r.data) ? r.data : (r.data.results || [])) })
      .catch(() => { if (!cancelled) setHealthLogs([]) })
    return () => { cancelled = true }
  }, [unitMode, record.production_cycle])
  const unitMortality = (unitId) => {
    if (healthLogs === null) return null
    const total = healthLogs
      .filter(l => l.force_harvest && l.production_unit === unitId)
      .reduce((s, l) => s + (Number(l.mortality_count) || 0), 0)
    return total > 0 ? total : 0
  }

  // Each pond/cage's own estimated harvest for the per-unit inputs (Force and normal harvest), from the
  // existing production-units endpoint: calculate_estimated_harvest_kg() on THAT unit's fingerling_count with
  // this record's survival rate / ABW - never the cycle total split or repeated. {unitId: kg | null}
  // (null = an input is missing), null while loading, 'error' if it could not be loaded.
  const hasUnits = harvestUnits.length > 0
  const [unitEstimates, setUnitEstimates] = useState(null)
  useEffect(() => {
    if (!hasUnits) return undefined
    let cancelled = false
    api.get(`/fisheries/stocking/${record.id}/production-units/`)
      .then(r => {
        if (!cancelled) setUnitEstimates(Object.fromEntries((r.data.units || []).map(u => [u.id, u.estimated_harvest_kg])))
      })
      .catch(() => { if (!cancelled) setUnitEstimates('error') })
    return () => { cancelled = true }
  }, [hasUnits, record.id])

  useEffect(() => {
    api.get(`/fisheries/stocking/${record.id}/suggestions/`)
      .then(r => {
        const ready = (r.data.disaster_response || []).filter(d => d.status !== 'Recovered' && d.can_recover !== false && d.all_rules_done)
        setResolvableDisasters(ready)
      })
      .catch(() => {})
  }, [record.id])

  const handleMarkRecovered = async (disasterId) => {
    setRecoveringId(disasterId)
    try {
      await api.post(`/fisheries/disasters/${disasterId}/resolve/`)
      showToast('Disaster marked as recovered.', 'success')
      setResolvableDisasters(prev => prev.filter(d => d.disaster_id !== disasterId))
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to mark disaster as recovered.', 'error')
    } finally {
      setRecoveringId(null)
    }
  }

  const visibleResolvableDisasters = resolvableDisasters.filter(d => !dismissedDisasterIds.has(d.disaster_id))

  const speciesName = record.species_name || 'this stock'

  const expectedHarvestDate = record.expected_harvest_date || null
  const daysFromNowToExpected = expectedHarvestDate
    ? Math.round((new Date(expectedHarvestDate + 'T00:00:00') - new Date(new Date().toDateString())) / 86400000)
    : null
  const harvestVarianceDays = (expectedHarvestDate && harvestDate)
    ? Math.round((new Date(harvestDate + 'T00:00:00') - new Date(expectedHarvestDate + 'T00:00:00')) / 86400000)
    : null
  // Harvest timing: Harvest Date vs Estimated Harvest Date, to the day - the same rule as the backend
  // (fisheries.models.harvest_timing), which is the real enforcement.
  const isEarly = harvestVarianceDays !== null && harvestVarianceDays < 0
  const isLate = harvestVarianceDays !== null && harvestVarianceDays > 0
  const isOnTime = harvestVarianceDays === 0
  const timingLabel = isEarly ? 'Early Harvest' : isLate ? 'Late Harvest' : isOnTime ? 'On-Time Harvest' : null
  // Normal harvest: any early or late harvest needs a reason; on time needs none. A Force Harvest's
  // reason comes from the Health Log automatically, so it is never asked for again.
  const showReason = !unitMode && (isEarly || isLate)
  const reasonRequired = showReason
  // early_late_reason is free text on the backend (CharField): the chosen option, or the typed "Other" reason.
  const EARLY_REASONS = [
    'Emergency harvest — disaster damage',
    'Disease or health issue',
    'High mortality risk',
    'Water quality problem',
    'Low dissolved oxygen',
    'Extreme weather / storm risk',
    'Predation',
    'Buyer demand',
    'Market opportunity',
    'Stock condition',
    'Operational/farm management decision',
    'Other',
  ]
  const LATE_REASONS = [
    'Fish have not reached target size',
    'Growth was slower than expected',
    'Insufficient fish growth',
    'Poor feeding response',
    'Feed shortage',
    'Water quality problems',
    'Disease recovery / health management',
    'Weather conditions',
    'Heavy rainfall / flooding',
    'Farm access or operational problems',
    'Labor or equipment constraints',
    'Market conditions',
    'Buyer delay',
    'Delayed harvesting schedule',
    'Stocking density / overcrowding management',
    'Other',
  ]
  const reasonOptions = isEarly ? EARLY_REASONS : LATE_REASONS
  // The chosen option only counts while it belongs to the current (early/late) list.
  const selectedReason = reasonOptions.includes(earlyLateReason) ? earlyLateReason : ''
  const reasonIsOther = selectedReason === 'Other'
  // What is saved: the user's own text for "Other" (never the word "Other"), else the chosen option.
  const finalReason = reasonIsOther ? earlyLateOther.trim() : selectedReason
  const chooseReason = (value) => {
    setEarlyLateReason(value)
    setEarlyLateOther('')        // switching options (to or from Other) always starts the custom text empty
    setReasonOtherError('')
  }

  const validateQuantity = (val) => {
    if (!val) return 'Actual harvest (kg) is required.'
    const n = parseFloat(val)
    if (isNaN(n) || n <= 0) return 'Actual harvest must be greater than 0.'
    return ''
  }
  const setOneUnitKg = (unitId, val) => {
    setUnitKg(prev => ({ ...prev, [unitId]: val }))
    setUnitKgErrors(prev => ({ ...prev, [unitId]: validateUnitKg(val) }))
  }
  // Per-unit Actual Harvest applies to Force Harvest (the affected units) AND to a normal harvest of
  // selected ponds/cages. Only a cycle without units keeps the single Actual Harvest input.
  const selectedTotalKg = unitKgTotal(selectedUnits, unitKg)
  // What the "estimated harvest" comparison measures: the selected units' total, or the single input.
  const enteredKg = unitSelect ? selectedTotalKg : parseFloat(quantityKg)
  // Marks every invalid row of `units`; true when all of them are valid.
  const checkUnitKg = (units, what) => {
    const errs = Object.fromEntries(units.map(u => [u.id, validateUnitKg(unitKg[u.id])]))
    setUnitKgErrors(errs)
    if (Object.values(errs).some(Boolean)) {
      showToast(`Enter a valid Actual Harvest (kg) for every ${what} production unit.`, 'error')
      return false
    }
    return true
  }

  // The early/late reason: the option list (a cell of the details table), and the typed reason for "Other" (a row of its own).
  const reasonControl = (
    <div data-testid="harvest-reason-block">
      <select className={baseInputClasses} value={selectedReason} onChange={e => chooseReason(e.target.value)} data-testid="harvest-reason" aria-label="Reason for harvest">
        <option value="">Select a reason</option>
        {reasonOptions.map(r => <option key={r} value={r}>{r}</option>)}
      </select>
    </div>
  )
  const reasonOtherField = showReason && reasonIsOther ? {
    error: reasonOtherError,
    content: (
      <input
        type="text" maxLength={255} className={`${baseInputClasses} ${reasonOtherError ? 'border-rose-400' : ''}`}
        value={earlyLateOther} onChange={e => { setEarlyLateOther(e.target.value); setReasonOtherError('') }}
        placeholder="Enter reason" data-testid="harvest-reason-other" aria-label="Other reason" aria-invalid={Boolean(reasonOtherError)}
      />
    ),
  } : null

  const handleSubmitClick = () => {
    if (!harvestDate) { showToast('Harvest date is required.', 'error'); return }
    if (unitSelect && selectedUnits.length === 0) {
      showToast(availableUnits.length ? `Select at least one ${unitWord.toLowerCase()} to harvest.` : `No ${unitWord.toLowerCase()}s remain available for harvest.`, 'error')
      return
    }
    if (unitMode) {
      if (checkUnitKg(forceUnits, 'affected')) setShowConfirm(true)
      return
    }
    if (unitSelect) {
      if (!checkUnitKg(selectedUnits, 'selected')) return
    } else {
      const qErr = validateQuantity(quantityKg)
      setQuantityError(qErr)
      if (qErr) return
    }
    if (showReason && reasonIsOther && !earlyLateOther.trim()) {
      setReasonOtherError('Please specify the reason.')
      showToast('Please specify the reason for the harvest.', 'error')
      return
    }
    if (reasonRequired && !finalReason) {
      showToast(`A reason is required — this harvest is ${Math.abs(harvestVarianceDays)} days ${isEarly ? 'early' : 'late'}.`, 'error')
      return
    }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      // Force Harvest and a normal harvest of selected units both send each unit's own kg
      // (unit_quantities); the backend stores one FisheriesHarvestUnit row per unit and sets the record
      // total to their sum - no combined quantity is sent. A cycle without units sends one quantity_kg.
      // avg_body_weight_kg is never sent (the column stays for older records and the citizen form).
      // With units the backend decides whether it is final (every unit harvested) and whether it is a Force Harvest.
      const perUnit = (units) => units.map(u => ({ production_unit: u.id, quantity_kg: String(unitKg[u.id]).trim() }))
      await api.post(`/fisheries/stocking/${record.id}/harvests/`, unitMode
        ? {
            harvest_date:            harvestDate,
            unit_quantities:         perUnit(forceUnits),
            area_or_units_harvested: areaOrUnits,
            early_late_reason:       forceReason,
            notes,
          }
        : unitSelect
          ? {
              harvest_date:            harvestDate,
              unit_quantities:         perUnit(selectedUnits),
              area_or_units_harvested: selectedUnits.map(u => u.label).join(', '),
              early_late_reason:       showReason ? finalReason : '',
              notes,
            }
          : {
              harvest_date:            harvestDate,
              quantity_kg:             parseFloat(quantityKg),
              area_or_units_harvested: areaOrUnits,
              is_final:                true,
              early_late_reason:       reasonRequired ? finalReason : '',
              notes,
            })
      draft.clear()
      showToast('Harvest recorded successfully!', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(extractErrorMessage(err, 'Failed to record harvest.'), 'error')
    } finally { setIsSubmitting(false) }
  }

  const footer = (
    <>
      <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      <Button type="button" onClick={handleSubmitClick} isLoading={isSubmitting}
        disabled={(reasonRequired && !finalReason) || (unitSelect && selectedUnits.length === 0)}>
        Record Harvest
      </Button>
    </>
  )

  return (
    <>
      <ModalShell
        title="Record Harvest"
        subtitle={`Record harvest details for ${speciesName}`}
        icon={Wheat}
        iconBg="bg-amber-100"
        iconColor="text-amber-600"
        onClose={onClose}
        maxWidth={tableMode ? 'max-w-3xl' : 'max-w-2xl'}
        footer={footer}
      >
        <div className="space-y-3">
          <DraftBanner draft={draft} />
          {record.force_harvest && !unitMode && (
            <div className="rounded-xl border border-rose-300 bg-rose-50 px-3 py-2.5" data-testid="force-harvest-warning">
              <p className="text-sm font-bold text-rose-700">⚠ FORCE HARVEST</p>
              <p className="mt-0.5 text-xs text-rose-700">
                Fish mortality or disease has been recorded for this production cycle. Please record the actual harvested quantity.
              </p>
            </div>
          )}
          {visibleResolvableDisasters.map(d => (
            <div key={d.disaster_id} className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="mb-2 text-xs text-emerald-800">
                This stock has an active <span className="font-semibold">{d.disaster_type}</span> with all recommended responses completed. Mark it recovered now?
              </p>
              <div className="flex gap-2">
                <Button type="button" size="sm" isLoading={recoveringId === d.disaster_id} onClick={() => handleMarkRecovered(d.disaster_id)}>
                  Mark Recovered
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => setDismissedDisasterIds(prev => new Set(prev).add(d.disaster_id))}>
                  Keep Active
                </Button>
              </div>
            </div>
          ))}

          {tableMode ? (
            <HarvestTables
              forced={unitMode} unitWord={unitWord}
              units={unitMode ? forceUnits : availableUnits}
              cycleLabel={unitMode && record.production_cycle_no ? `Production Cycle #${record.production_cycle_no}${record.production_cycle_name ? ` — ${record.production_cycle_name}` : ''}` : ''}
              expectedHarvestDate={expectedHarvestDate} daysFromNowToExpected={daysFromNowToExpected}
              harvestVarianceDays={harvestVarianceDays} timingLabel={timingLabel} isEarly={isEarly} isLate={isLate}
              harvestDate={harvestDate} onHarvestDate={setHarvestDate}
              reason={unitMode
                // A force harvest's reason comes from the Health Log: filled in, never asked again.
                ? { label: isLate ? 'Reason for Late Harvest' : isEarly ? 'Reason for Early Harvest' : 'Reason for Harvest', content: <span className="block py-1 text-[13px] font-medium text-slate-800" data-testid="force-reason">{forceReason}</span> }
                : showReason ? { label: `Reason for ${isEarly ? 'Early' : 'Late'} Harvest`, required: true, content: reasonControl } : null}
              reasonOther={reasonOtherField}
              notes={notes} onNotes={setNotes}
              selectedIds={selectedUnitIds} onSelect={setSelectedUnitIds}
              values={unitKg} errors={unitKgErrors} onChange={setOneUnitKg} estimates={unitEstimates} unitMortality={unitMortality}
              footerNote={unitSelect && record.estimated_harvest_kg != null ? <EstimateNote record={record} enteredKg={enteredKg} /> : null}
            />
          ) : (
            // A cycle without ponds or cages (a fishpen, an older record): one quantity for the whole cycle.
            <>
              <HarvestTiming expectedHarvestDate={expectedHarvestDate} daysFromNowToExpected={daysFromNowToExpected}
                harvestVarianceDays={harvestVarianceDays} timingLabel={timingLabel} isEarly={isEarly} isLate={isLate} />
              <HarvestDetailRows harvestDate={harvestDate} onHarvestDate={setHarvestDate} reasonOther={reasonOtherField}
                reason={showReason ? { label: `Reason for ${isEarly ? 'Early' : 'Late'} Harvest`, required: true, content: reasonControl } : null}>
                <FormRow>
                  <FormCell label="Actual Harvest (kg)" required wide error={quantityError}
                    hint={record.estimated_harvest_kg != null ? <EstimateNote record={record} enteredKg={enteredKg} /> : null}>
                    <input type="number" step="0.01"
                      className={`${baseInputClasses} ${quantityError ? 'border-rose-400' : ''}`}
                      value={quantityKg}
                      onChange={e => { setQuantityKg(e.target.value); setQuantityError(validateQuantity(e.target.value)) }}
                      placeholder="e.g. 500" />
                  </FormCell>
                </FormRow>
                <FormRow>
                  <FormCell label="Area / Units Harvested" wide>
                    <input type="text" className={baseInputClasses} value={areaOrUnits}
                      onChange={e => setAreaOrUnits(e.target.value)} placeholder="e.g. Pond 2, 3 cages" />
                  </FormCell>
                </FormRow>
                <FormRow>
                  <FormCell label="Notes" wide>
                    <textarea rows={2} className={`${baseInputClasses} resize-none`} value={notes}
                      onChange={e => setNotes(e.target.value)} placeholder="Any additional harvest notes or observations (optional)" />
                  </FormCell>
                </FormRow>
              </HarvestDetailRows>
            </>
          )}
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Harvest Record"
          message={unitMode
            ? `Record this force harvest for ${forceUnitNames} only? Unaffected ponds/cages are not harvested.`
            : unitSelect
              ? `Record the harvest of ${selectedUnits.map(u => u.label).join(', ')}? ${willBeFinal
                ? `This harvests the last remaining ${unitWord.toLowerCase()}(s) and will mark the cycle as Harvested.`
                : `The other ${unitWord.toLowerCase()}s stay Stocked.`}`
              : `Are you sure you want to record the harvest for ${speciesName}? This will mark the cycle as Harvested.`}
          confirmLabel="Yes, Record Harvest"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
