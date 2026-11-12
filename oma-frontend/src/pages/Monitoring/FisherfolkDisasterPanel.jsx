import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { ChevronDown, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import { AQUACULTURE_EQUIPMENT_GROUPS, equipmentPayload } from './fisheriesDisasterConstants.js'
import { DamagePhotosField, EquipmentChecklist } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'
import { fetchAllStocks } from './disasterReportDocument.js'
import { FingerlingsLostTable, StockPicker } from './FisherfolkStockDisasterModal.jsx'
import { HARVESTED, effectiveLost, rowError, rowKey } from './fisheriesStockLosses.js'
import { affectedSummary, personLine } from './multiFisherfolkDisaster.js'

// One selected fisherfolk's own part of the multi Log Disaster form, as one row of its table: who they are, a line on what was hit, THEIR OWN
// photo documentation (uploads, previews, remove) and a button to remove them; below the row, their details: the stocks and ponds/cages with the
// fingerlings lost (or "not linked to a stock"), the equipment damaged and the volume lost. The details are the same part as the single Log Disaster
// form (FisherfolkStockDisasterModal.jsx, whose stock picker and loss table it uses), for one fisherfolk of several. The event itself (date, type,
// description) is filled in once by the modal that holds the rows, which asks each row to check itself and to hand over its entry and photos:
//   ref.validate(date) -> '' or the message to show     ref.entry() -> { mode, stockLosses, volume, equipment }     ref.photos() -> [{ file }]     ref.clearDraft()
// The photo list lives in the row (useDamagePhotos), so the photos are this fisherfolk's alone and are dropped, previews released, when they are
// removed from the selection. What is typed is a draft per fisherfolk, so leaving the page and coming back keeps it.

const LINKED = 'stocks'
const NOT_LINKED = 'unlinked'

const FisherfolkDisasterPanel = forwardRef(function FisherfolkDisasterPanel({ person, onRemove, showErrors: submitted }, ref) {
  const draft = useDraftForm(`fisheries-multi-disaster:ff:${person.id}`)
  const [open, setOpen] = useState(true)
  const photosState = useDamagePhotos()
  const [stocks, setStocks] = useState(null)          // every eligible stock of this fisherfolk; null while loading
  const [blocked, setBlocked] = useState('')           // why nothing can be logged for them (no pond or cage on record, or the check failed)
  const [mode, setMode] = useDraftField(draft, 'mode', LINKED)
  const [selectedIds, setSelectedIds] = useDraftField(draft, 'selectedIds', [])
  // stockId -> {state: 'loading' | 'ok' | 'error', units}: each selected stock's own ponds/cages (those of a restored draft load again).
  const [unitsByStock, setUnitsByStock] = useState(() => Object.fromEntries(selectedIds.map((id) => [id, { state: 'loading', units: [] }])))
  const [losses, setLosses] = useDraftField(draft, 'losses', {})        // rowKey -> {lost, total}
  const [touched, setTouched] = useState(new Set())
  const [form, setForm] = useDraftField(draft, 'form', { volume_lost_kg: '', equipment_damaged: [], equipment_damaged_other: '' })
  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  // Their active stocks and whether a disaster can be logged for them at all (the rule the single form applies to a fisherfolk).
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [loaded, eligibility] = await Promise.all([
          fetchAllStocks({ fisherfolk: person.id, status: 'Stocked,Near Harvest' }),
          api.get('/monitoring/fisherfolk-disasters/eligibility/', { params: { fisherfolk: person.id } }),
        ])
        if (cancelled) return
        if (!eligibility.data.can_log_disaster) setBlocked(eligibility.data.message || 'No pond, cage or stock is on record.')
        setStocks(loaded)
      } catch {
        if (!cancelled) { setBlocked('Could not check the ponds, cages and stocks. Remove and add this fisherfolk again to retry.'); setStocks([]) }
      }
    })()
    return () => { cancelled = true }
  }, [person.id])

  const loadUnits = (id) => {
    api.get(`/fisheries/stocking/${id}/production-units/`)
      .then((r) => setUnitsByStock((prev) => (prev[id] ? { ...prev, [id]: { state: 'ok', units: r.data.units || [] } } : prev)))
      .catch(() => setUnitsByStock((prev) => (prev[id] ? { ...prev, [id]: { state: 'error', units: [] } } : prev)))
  }
  useEffect(() => { selectedIds.forEach(loadUnits) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStock = (id) => {
    if (selectedIds.includes(id)) {
      setSelectedIds((ids) => ids.filter((x) => x !== id))
      setUnitsByStock((prev) => { const n = { ...prev }; delete n[id]; return n })
      setLosses((prev) => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${id}:`))))
    } else {
      setSelectedIds((ids) => (ids.includes(id) ? ids : [...ids, id]))
      setUnitsByStock((prev) => ({ ...prev, [id]: { state: 'loading', units: [] } }))
      loadUnits(id)
    }
  }

  const allStocks = stocks || []
  const selected = selectedIds.map((id) => allStocks.find((s) => s.id === id)).filter(Boolean)
  const groups = useMemo(() => selected.map((stock) => {
    const info = unitsByStock[stock.id] || { state: 'loading', units: [] }
    let rows = []
    let skipped = []
    if (info.state === 'ok') {
      const openUnits = info.units.filter((u) => !HARVESTED.has(u.status))
      skipped = info.units.filter((u) => HARVESTED.has(u.status)).map((u) => u.label)
      rows = info.units.length
        ? openUnits.map((u) => ({ key: rowKey(stock.id, u.id), unitId: u.id, unitLabel: u.label, stocked: u.fingerling_count ?? null }))
        : [{ key: rowKey(stock.id, null), unitId: null, unitLabel: 'Whole stock', stocked: stock.number_of_fingerlings ?? null }]
    }
    const total = rows.reduce((sum, r) => {
      const s = effectiveLost(r, losses[r.key])
      return /^\d+$/.test(s) ? sum + Number(s) : sum
    }, 0)
    return { stock, state: info.state, rows, skipped, total }
  }), [selected, unitsByStock, losses])

  const changeLoss = (key, patch) => {
    setLosses((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    setTouched((prev) => new Set(prev).add(key))
  }
  const showRowErrors = (key) => submitted || touched.has(key)

  const toggleEquipment = (option) => setForm((prev) => {
    const next = prev.equipment_damaged.includes(option) ? prev.equipment_damaged.filter((item) => item !== option) : [...prev.equipment_damaged, option]
    return { ...prev, equipment_damaged: next, equipment_damaged_other: next.includes('Other') ? prev.equipment_damaged_other : '' }
  })

  // The disaster cannot predate the stocking of any stock it affected.
  const latestStocked = mode === LINKED ? selected.map((s) => s.date_stocked).filter(Boolean).sort().pop() || null : null

  useImperativeHandle(ref, () => ({
    validate(date) {
      const say = (text) => `${person.full_name}: ${text}`
      if (blocked) return say(blocked)
      if (stocks === null) return say('Still loading the stocks.')
      if (mode === LINKED) {
        if (!selected.length) return say('Select at least one affected stock, or choose “Not linked to a stock”.')
        if (latestStocked && date && date < latestStocked) return say(`Date of occurrence cannot be before a selected stock's stocking date (${fmtLong(latestStocked)}).`)
        if (groups.some((g) => g.state === 'loading')) return say('Still loading the ponds/cages of a selected stock.')
        if (groups.some((g) => g.state === 'error')) return say('The ponds/cages of a selected stock could not be loaded.')
        if (groups.some((g) => g.rows.length === 0)) return say('A selected stock has no pond/cage left to record (all harvested).')
        if (groups.some((g) => g.rows.some((r) => rowError(r, losses[r.key])))) return say('Fix the highlighted Fingerlings Lost entries.')
      }
      if (form.volume_lost_kg !== '' && parseFloat(form.volume_lost_kg) < 0) return say('Volume lost cannot be negative.')
      if (form.equipment_damaged.includes('Other') && !form.equipment_damaged_other.trim()) return say('Specify Equipment Damaged.')
      return ''
    },
    // Every selected stock/pond is sent (blank = not recorded); the server recomputes the totals.
    entry() {
      const stockLosses = mode === LINKED ? groups.flatMap((g) => g.rows.map((r) => {
        const v = losses[r.key] || {}
        const lost = effectiveLost(r, v)
        return { stocking_record: g.stock.id, production_unit: r.unitId, fingerlings_lost: lost === '' ? null : Number(lost), is_total_loss: Boolean(v.total) }
      })) : []
      return {
        mode, stockLosses, volume: form.volume_lost_kg,
        equipment: equipmentPayload(form.equipment_damaged, form.equipment_damaged_other),
      }
    },
    photos: () => photosState.photos,
    clearDraft() { draft.clear() },
  }))

  const radioCls = (on) => `flex h-full min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${on ? 'border-green-400 bg-[#f0f7f0]' : 'border-slate-200 hover:bg-slate-50'}`
  const name = `ff-${person.id}`
  const summary = affectedSummary({ mode, stocks: selected.length, units: groups.reduce((sum, g) => sum + g.rows.length, 0), lost: groups.reduce((sum, g) => sum + g.total, 0) })

  return (
    <div className="space-y-3" data-testid="fisherfolk-panel" data-fisherfolk-id={person.id}>
      <FormSection title={person.full_name}>
        <FormRows label={person.full_name}>
          <FormRow>
            <FormCell label="Summary" wide>
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 py-1 text-[12.5px] text-[#4A5E4A]">
                  <span className="block text-[11.5px] text-[#7A8E7A]">{personLine(person)}</span>
                  {blocked
                    ? <span className="rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">Cannot be logged</span>
                    : stocks === null ? 'Loading stocks…' : summary}
                </div>
                <div className="flex flex-none gap-1">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}
                    aria-label={`${open ? 'Hide' : 'Show'} the details of ${person.full_name}`}>
                    <ChevronDown size={16} className={`transition-transform ${open ? '' : '-rotate-90'}`} />
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={onRemove} aria-label={`Remove ${person.full_name}`}>
                    <X size={14} />
                  </Button>
                </div>
              </div>
            </FormCell>
          </FormRow>

          {open && blocked && (
            <FormRow>
              <FormCell label="Cannot be logged" wide>
                <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700" role="alert">{blocked} Remove this fisherfolk to log the others.</p>
              </FormCell>
            </FormRow>
          )}

          {open && !blocked && (
            <>
              <FormRow>
                <FormCell label="Affected Stock" wide>
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label={`Affected stock of ${person.full_name}`}>
                    <label className={radioCls(mode === LINKED)}>
                      <input type="radio" name={`link-${name}`} className="mt-0.5 shrink-0" checked={mode === LINKED} onChange={() => setMode(LINKED)} />
                      <span>
                        <span className="block font-medium text-slate-800">One or more stocks</span>
                        <span className="block text-xs text-slate-500">Choose the affected stocks below</span>
                      </span>
                    </label>
                    <label className={radioCls(mode === NOT_LINKED)}>
                      <input type="radio" name={`link-${name}`} className="mt-0.5 shrink-0" checked={mode === NOT_LINKED}
                        onChange={() => { setMode(NOT_LINKED); setSelectedIds([]); setUnitsByStock({}); setLosses({}) }} />
                      <span>
                        <span className="block font-medium text-slate-800">Not linked to a stock</span>
                        <span className="block text-xs text-slate-500">(pond, cage or equipment damage only)</span>
                      </span>
                    </label>
                  </div>
                  <div className="mt-2">
                    {stocks === null ? <p className="text-xs text-slate-500">Loading stocks…</p>
                      : allStocks.length === 0 ? <p className="text-xs text-slate-500">No active stocks to choose from — choose “Not linked to a stock”.</p>
                        : <StockPicker stocks={allStocks} selectedIds={selectedIds} onToggle={toggleStock} disabled={mode === NOT_LINKED} />}
                  </div>
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Equipment Damaged" wide>
                  <EquipmentChecklist
                    groups={AQUACULTURE_EQUIPMENT_GROUPS}
                    selected={form.equipment_damaged}
                    onToggle={toggleEquipment}
                    otherValue={form.equipment_damaged_other}
                    onOtherChange={(v) => set('equipment_damaged_other', v)}
                    inputClassName={baseInputClasses}
                  />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Volume Lost (kg)" wide>
                  <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.volume_lost_kg}
                    aria-label={`Volume lost (kg) for ${person.full_name}`}
                    onChange={(e) => set('volume_lost_kg', e.target.value)} placeholder="e.g. 150" />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Photo Documentation" wide>
                  <DamagePhotosField photosState={photosState} compact title="" hint="" testId={`fisherfolk-photos-${person.id}`}
                    ownerLabel={person.full_name} altPrefix={`Damage photo of ${person.full_name}`}
                    cameraSubtitle={`Photo of the damage for ${person.full_name}.`} />
                </FormCell>
              </FormRow>
            </>
          )}
        </FormRows>
      </FormSection>

      {open && !blocked && mode === LINKED && groups.length > 0 && (
        <FingerlingsLostTable groups={groups} values={losses} onChange={changeLoss} showErrors={showRowErrors} />
      )}
    </div>
  )
})

export default FisherfolkDisasterPanel
