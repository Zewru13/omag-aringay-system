import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Search, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { FormLabel, baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import {
  AQUACULTURE_EQUIPMENT_GROUPS, FISHERFOLK_DISASTER_TYPES, equipmentPayload, saveErrorMessage,
} from './fisheriesDisasterConstants.js'
import { DamagePhotosField, EquipmentChecklist } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'

// Log Disaster - the ONE Fisheries disaster form, for a fisherfolk's own stocks and for Admin/Evaluator logging
// on behalf of a chosen fisherfolk (Admin > Disaster > Fisheries Disaster). Either:
//   - linked: one or more of the fisherfolk's active stocks, with the fingerlings lost and Total Loss per stock
//     and pond/cage -> POST /fisheries/disaster-reports/stocks/ (one report; the backend checks every stock
//     and pond belongs to this fisherfolk, recomputes totals and saves everything in one transaction), or
//   - not linked to a stock (pond, cage or equipment damage only) -> the existing
//     POST /monitoring/fisherfolk-disasters/, with no fingerling losses.
// A fisherfolk's log is submitted to Admin by that same save. onSaved(log) receives the saved log.
//
// Props: stocks = every eligible stock of the fisherfolk (null while loading); fisherfolk = {id, full_name}
// (required for staff; a fisherfolk account is always its own record on the backend).

const NOT_LINKED = 'unlinked'
const LINKED = 'stocks'

const todayLocal = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const stockOptionLabel = (s) => [
  s.species_name || 'Stock',
  s.production_cycle_name,
  s.production_cycle_no && `Cycle ${s.production_cycle_no}`,
].filter(Boolean).join(' · ')

const stockOptionDetail = (s) => [
  s.culture_phase,
  s.date_stocked && `stocked ${fmtLong(s.date_stocked)}`,
  s.pond_location_barangay,
  s.number_of_units && `${s.number_of_units} ${(s.culture_type || 'unit').toLowerCase()}${s.number_of_units === 1 ? '' : 's'}`,
].filter(Boolean).join(' · ')

const rowKey = (stockId, unitId) => `${stockId}:${unitId ?? 'all'}`
const HARVESTED = new Set(['harvested', 'force_harvested', 'cycle_harvested'])

// Total Loss on a row with a known stocked count: the count is that full stocked count (filled in, read-only).
const autoFilled = (row, value) => Boolean(value?.total) && row.stocked != null

// The row's Fingerlings Lost as counted in totals and sent: the stocked count while auto-filled.
const effectiveLost = (row, value) => (autoFilled(row, value) ? String(row.stocked) : String(value?.lost ?? '').trim())

// '' = not recorded. Otherwise a whole number of 0 or more, at most the stocked count when known.
function rowError(row, value) {
  if (autoFilled(row, value)) return ''
  const s = String(value?.lost ?? '').trim()
  if (!s) return value?.total ? 'Enter the fingerlings lost (no stocked count is recorded for this one).' : ''
  if (!/^\d+$/.test(s)) return 'Whole number of 0 or more.'
  if (row.stocked != null && Number(s) > row.stocked) return `Cannot exceed ${row.stocked.toLocaleString()} stocked.`
  return ''
}

// `disabled`: shown but not usable (the report is not linked to a stock); choosing "One or more stocks" enables it again.
function StockPicker({ stocks, selectedIds, onToggle, disabled = false }) {
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const shown = stocks.filter(s => !q || `${stockOptionLabel(s)} ${stockOptionDetail(s)}`.toLowerCase().includes(q))
  return (
    <div className={`space-y-2 ${disabled ? 'opacity-60' : ''}`} data-testid="stock-picker" aria-disabled={disabled}>
      {selectedIds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected stocks">
          {selectedIds.map(id => {
            const s = stocks.find(x => x.id === id)
            return s && (
              <li key={id} className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-[#f0f7f0] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#1E4620]">
                {stockOptionLabel(s)}
                <button type="button" onClick={() => onToggle(id)} className="rounded-full p-0.5 hover:bg-green-200" aria-label={`Remove ${stockOptionLabel(s)}`}>
                  <X size={12} />
                </button>
              </li>
            )
          })}
        </ul>
      )}
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" className={`${baseInputClasses} pl-8 ${disabled ? 'cursor-not-allowed bg-slate-100' : ''}`} value={query} onChange={e => setQuery(e.target.value)} disabled={disabled}
          placeholder={disabled ? 'Select “One or more stocks” first' : `Search ${stocks.length} stock${stocks.length === 1 ? '' : 's'} by species, cycle or location`} aria-label="Search stocks" />
      </div>
      <ul className="max-h-56 min-h-[8rem] overflow-y-auto rounded-lg border border-slate-200" role="listbox" aria-multiselectable="true" aria-label="Affected stocks" aria-disabled={disabled}>
        {shown.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No stock matches “{query}”.</li>}
        {shown.map(s => {
          const checked = selectedIds.includes(s.id)
          return (
            <li key={s.id} role="option" aria-selected={checked} className="border-b border-slate-100 last:border-b-0">
              <label className={`flex min-h-[44px] items-start gap-2.5 px-3 py-2 ${disabled ? 'cursor-not-allowed' : `cursor-pointer ${checked ? '' : 'hover:bg-slate-50'}`} ${checked ? 'bg-[#f0f7f0]' : ''}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E4620]" checked={checked} disabled={disabled} onChange={() => onToggle(s.id)} />
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-slate-800">{stockOptionLabel(s)}</span>
                  <span className="block text-xs text-slate-500">{stockOptionDetail(s)}</span>
                </span>
              </label>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

// A row's Fingerlings Lost input. With Total Loss ticked and a known stocked count it shows that full count,
// read-only; the value typed before stays untouched underneath and comes back when Total Loss is unticked.
function LostInput({ row, value, name, err, onChange, className = '', placeholder = '0' }) {
  const auto = autoFilled(row, value)
  return (
    <div className={className}>
      <input type="number" inputMode="numeric" min="0" step="1" max={row.stocked ?? undefined}
        className={`${baseInputClasses} w-full ${auto ? 'cursor-not-allowed bg-slate-100 text-slate-600' : ''} ${err ? 'border-rose-400' : ''}`}
        aria-label={`Fingerlings lost for ${name}`} aria-invalid={Boolean(err)} readOnly={auto} aria-readonly={auto}
        value={auto ? row.stocked : (value.lost ?? '')}
        onChange={e => { if (!auto) onChange(row.key, { lost: e.target.value }) }} placeholder={placeholder} />
      {auto && <p className="mt-1 text-[11px] text-slate-500">All {row.stocked.toLocaleString()} stocked (Total Loss)</p>}
      {value.total && row.stocked == null && !err && <p className="mt-1 text-[11px] text-slate-500">No stocked count recorded — enter the number lost.</p>}
      {err && <p className="mt-1 text-xs text-rose-600" role="alert">{err}</p>}
    </div>
  )
}

// One table: a row per selected stock and pond/cage (or one "Whole stock" row for a stock without them).
function FingerlingsLostTable({ groups, values, onChange, showErrors }) {
  const fmt = (n) => Number(n).toLocaleString()
  const overall = groups.reduce((sum, g) => sum + g.total, 0)
  return (
    <section className="space-y-2" data-testid="fingerlings-lost">
      <div>
        <h3 className="text-sm font-semibold text-slate-800">Fingerlings Lost per Stock and Production Unit</h3>
        <p className="text-xs text-slate-500">Leave blank if not counted. Tick Total Loss when a pond/cage was completely destroyed: its Fingerlings Lost becomes the full stocked count automatically. A stock ends as Total Loss only when all of its remaining ponds/cages are.</p>
      </div>

      {/* Desktop / tablet: a table (scrolls sideways inside the modal if needed). */}
      <div className="hidden overflow-x-auto rounded-lg border border-slate-200 sm:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 text-left text-xs font-semibold text-slate-600">
              <th className="px-2.5 py-1.5">Stock</th>
              <th className="px-2.5 py-1.5">Production Unit</th>
              <th className="px-2.5 py-1.5 text-right">Stocked</th>
              <th className="px-2.5 py-1.5">Fingerlings Lost</th>
              <th className="px-2.5 py-1.5 text-center">Total Loss</th>
            </tr>
          </thead>
          {groups.map(g => (
            <tbody key={g.stock.id} className="border-t-2 border-slate-200 align-top">
              {g.state === 'loading' && <tr><td colSpan={5} className="px-2.5 py-2 text-xs text-slate-500">{stockOptionLabel(g.stock)} — loading ponds/cages…</td></tr>}
              {g.state === 'error' && <tr><td colSpan={5} className="px-2.5 py-2 text-xs text-rose-600">{stockOptionLabel(g.stock)} — the ponds/cages could not be loaded. Remove and re-select the stock to retry.</td></tr>}
              {g.rows.map((r, i) => {
                const v = values[r.key] || {}
                const err = showErrors(r.key) ? rowError(r, v) : ''
                const name = `${stockOptionLabel(g.stock)}, ${r.unitLabel}`
                return (
                  <tr key={r.key} className="border-t border-slate-100" data-testid="loss-row">
                    <td className="px-2.5 py-2 text-xs font-semibold text-slate-800">{i === 0 ? stockOptionLabel(g.stock) : ''}</td>
                    <td className="px-2.5 py-2 font-medium text-slate-800">{r.unitLabel}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">{r.stocked != null ? fmt(r.stocked) : '—'}</td>
                    <td className="px-2.5 py-1.5">
                      <LostInput row={r} value={v} name={name} err={err} onChange={onChange} className="w-32" />
                    </td>
                    <td className="px-2.5 py-2 text-center">
                      <input type="checkbox" className="h-4 w-4 rounded border-rose-300 text-rose-600"
                        aria-label={`Total loss — ${name} completely destroyed`}
                        checked={Boolean(v.total)} onChange={e => onChange(r.key, { total: e.target.checked })} />
                    </td>
                  </tr>
                )
              })}
              {g.skipped.length > 0 && <tr><td colSpan={5} className="px-2.5 pb-2 text-[11px] text-slate-400">Already harvested, not listed: {g.skipped.join(', ')}</td></tr>}
              {g.rows.length > 0 && (
                <tr className="bg-slate-50 text-xs font-semibold text-slate-700" data-testid="stock-total">
                  <td className="px-2.5 py-1.5" colSpan={3}>Total — {stockOptionLabel(g.stock)}</td>
                  <td className="px-2.5 py-1.5" colSpan={2}>{fmt(g.total)} fingerlings</td>
                </tr>
              )}
            </tbody>
          ))}
          <tfoot>
            <tr className="border-t-2 border-slate-300 bg-slate-100 text-xs font-bold text-slate-800" data-testid="overall-total">
              <td className="px-2.5 py-1.5" colSpan={3}>TOTAL FINGERLINGS LOST</td>
              <td className="px-2.5 py-1.5" colSpan={2}>{fmt(overall)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {/* Phones: one card per stock, one block per pond/cage. */}
      <div className="space-y-3 sm:hidden">
        {groups.map(g => (
          <div key={g.stock.id} className="rounded-lg border border-slate-200 p-3">
            <p className="text-sm font-semibold text-slate-800">{stockOptionLabel(g.stock)}</p>
            {g.state === 'loading' && <p className="text-xs text-slate-500">Loading ponds/cages…</p>}
            {g.state === 'error' && <p className="text-xs text-rose-600">The ponds/cages could not be loaded. Remove and re-select the stock to retry.</p>}
            {g.rows.map(r => {
              const v = values[r.key] || {}
              const err = showErrors(r.key) ? rowError(r, v) : ''
              const name = `${stockOptionLabel(g.stock)}, ${r.unitLabel}`
              return (
                <div key={r.key} className="mt-2 border-t border-slate-100 pt-2">
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="font-medium text-slate-800">{r.unitLabel}</span>
                    <span className="text-xs text-slate-500">Stocked: {r.stocked != null ? fmt(r.stocked) : '—'}</span>
                  </div>
                  <div className="mt-1 flex items-start gap-3">
                    <LostInput row={r} value={v} name={name} err={err} onChange={onChange} className="flex-1" placeholder="Fingerlings lost" />
                    <label className="flex min-h-[44px] items-center gap-1.5 text-xs font-medium text-rose-700">
                      <input type="checkbox" className="h-4 w-4 rounded border-rose-300 text-rose-600" aria-label={`Total loss — ${name} completely destroyed`}
                        checked={Boolean(v.total)} onChange={e => onChange(r.key, { total: e.target.checked })} />
                      Total loss
                    </label>
                  </div>
                </div>
              )
            })}
            {g.skipped.length > 0 && <p className="mt-2 text-[11px] text-slate-400">Already harvested, not listed: {g.skipped.join(', ')}</p>}
            {g.rows.length > 0 && <p className="mt-2 border-t border-slate-100 pt-2 text-xs font-semibold text-slate-700">Total: {fmt(g.total)} fingerlings</p>}
          </div>
        ))}
        <p className="rounded-lg bg-slate-100 px-3 py-2 text-xs font-bold text-slate-800">Total fingerlings lost: {fmt(overall)}</p>
      </div>
    </section>
  )
}

export default function FisherfolkStockDisasterModal({ stocks, fisherfolk = null, initialStockIds = [], onClose, onSaved, inline = false }) {
  const { showToast } = useToast()
  const { isFisherfolk } = useAuth()
  const damagePhotos = useDamagePhotos()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mode, setMode] = useState(LINKED)
  const [selectedIds, setSelectedIds] = useState(initialStockIds)
  // stockId -> {state: 'loading' | 'ok' | 'error', units}: each selected stock's own ponds/cages.
  const [unitsByStock, setUnitsByStock] = useState(() => Object.fromEntries(initialStockIds.map(id => [id, { state: 'loading', units: [] }])))
  const [losses, setLosses] = useState({})               // rowKey -> {lost, total}
  const [touched, setTouched] = useState(new Set())
  const [submitted, setSubmitted] = useState(false)
  const [form, setForm] = useState({
    date_of_occurrence: todayLocal(),
    disaster_type: 'Typhoon',
    disaster_type_other_specify: '',
    volume_lost_kg: '',
    equipment_damaged: [],
    equipment_damaged_other: '',
    estimated_damage: '',
  })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))
  const allStocks = stocks || []
  const selected = selectedIds.map(id => allStocks.find(s => s.id === id)).filter(Boolean)

  // A selected stock's own production units (with their stocked fingerlings), once per selection. A reply
  // for a stock deselected meanwhile is ignored.
  const loadUnits = (id) => {
    api.get(`/fisheries/stocking/${id}/production-units/`)
      .then(r => setUnitsByStock(prev => (prev[id] ? { ...prev, [id]: { state: 'ok', units: r.data.units || [] } } : prev)))
      .catch(() => setUnitsByStock(prev => (prev[id] ? { ...prev, [id]: { state: 'error', units: [] } } : prev)))
  }
  useEffect(() => { initialStockIds.forEach(loadUnits) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleStock = (id) => {
    if (selectedIds.includes(id)) {
      // Deselected: its rows and entered values are cleared, so nothing stale can be submitted.
      setSelectedIds(ids => ids.filter(x => x !== id))
      setUnitsByStock(prev => { const n = { ...prev }; delete n[id]; return n })
      setLosses(prev => Object.fromEntries(Object.entries(prev).filter(([k]) => !k.startsWith(`${id}:`))))
    } else {
      // Values of the stocks that stay selected are kept; the new stock is added once (never twice).
      setSelectedIds(ids => (ids.includes(id) ? ids : [...ids, id]))
      setUnitsByStock(prev => ({ ...prev, [id]: { state: 'loading', units: [] } }))
      loadUnits(id)
    }
  }

  const groups = useMemo(() => selected.map(stock => {
    const info = unitsByStock[stock.id] || { state: 'loading', units: [] }
    let rows = []
    let skipped = []
    if (info.state === 'ok') {
      const open = info.units.filter(u => !HARVESTED.has(u.status))
      skipped = info.units.filter(u => HARVESTED.has(u.status)).map(u => u.label)
      rows = info.units.length
        ? open.map(u => ({ key: rowKey(stock.id, u.id), unitId: u.id, unitLabel: u.label, stocked: u.fingerling_count ?? null }))
        : [{ key: rowKey(stock.id, null), unitId: null, unitLabel: 'Whole stock', stocked: stock.number_of_fingerlings ?? null }]
    }
    const total = rows.reduce((sum, r) => {
      const s = effectiveLost(r, losses[r.key])   // a Total Loss row counts its full stocked count at once
      return /^\d+$/.test(s) ? sum + Number(s) : sum
    }, 0)
    return { stock, state: info.state, rows, skipped, total }
  }), [selected, unitsByStock, losses])

  const changeLoss = (key, patch) => {
    setLosses(prev => ({ ...prev, [key]: { ...prev[key], ...patch } }))
    setTouched(prev => new Set(prev).add(key))
  }
  const showErrors = (key) => submitted || touched.has(key)

  const toggleEquipment = (option) => setForm((prev) => {
    const next = prev.equipment_damaged.includes(option)
      ? prev.equipment_damaged.filter(item => item !== option)
      : [...prev.equipment_damaged, option]
    return { ...prev, equipment_damaged: next, equipment_damaged_other: next.includes('Other') ? prev.equipment_damaged_other : '' }
  })

  // The disaster cannot predate the stocking of any stock it affected.
  const latestStocked = mode === LINKED ? selected.map(s => s.date_stocked).filter(Boolean).sort().pop() || null : null

  const validate = () => {
    const today = todayLocal()
    if (!isFisherfolk && !fisherfolk?.id) return 'Select a fisherfolk.'
    if (!form.date_of_occurrence) return 'Date of occurrence is required.'
    if (form.date_of_occurrence > today) return 'Date of occurrence cannot be in the future.'
    if (form.disaster_type === 'Other' && !form.disaster_type_other_specify.trim()) return 'Please specify the disaster type.'
    if (mode === LINKED) {
      if (!selected.length) return 'Select at least one affected stock, or choose “Not linked to a stock”.'
      if (latestStocked && form.date_of_occurrence < latestStocked) return `Date of occurrence cannot be before a selected stock's stocking date (${fmtLong(latestStocked)}).`
      if (groups.some(g => g.state === 'loading')) return 'Still loading the ponds/cages of a selected stock.'
      if (groups.some(g => g.state === 'error')) return 'The ponds/cages of a selected stock could not be loaded.'
      if (groups.some(g => g.rows.length === 0)) return 'A selected stock has no pond/cage left to record (all harvested).'
      if (groups.some(g => g.rows.some(r => rowError(r, losses[r.key])))) return 'Fix the highlighted Fingerlings Lost entries.'
    }
    if (form.volume_lost_kg !== '' && parseFloat(form.volume_lost_kg) < 0) return 'Volume lost cannot be negative.'
    if (form.equipment_damaged.includes('Other') && !form.equipment_damaged_other.trim()) return 'Specify Equipment Damaged.'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    setSubmitted(true)
    const problem = validate()
    if (problem) { showToast(problem, 'error'); return }
    setIsSubmitting(true)
    try {
      const fields = {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify.trim() : '',
        date_of_occurrence: form.date_of_occurrence,
        volume_lost_kg: form.volume_lost_kg === '' ? null : parseFloat(form.volume_lost_kg),
        equipment_damaged: equipmentPayload(form.equipment_damaged, form.equipment_damaged_other),
        estimated_damage: form.estimated_damage.trim(),
        ...(fisherfolk?.id ? { fisherfolk: fisherfolk.id } : {}),
      }
      // Every selected stock/pond is sent (blank = not recorded); totals are recomputed by the backend.
      const stockLosses = mode === LINKED ? groups.flatMap(g => g.rows.map(r => {
        const v = losses[r.key] || {}
        const lost = effectiveLost(r, v)
        return { stocking_record: g.stock.id, production_unit: r.unitId, fingerlings_lost: lost === '' ? null : Number(lost), is_total_loss: Boolean(v.total) }
      })) : null
      const url = mode === LINKED ? '/fisheries/disaster-reports/stocks/' : '/monitoring/fisherfolk-disasters/'
      let payload = stockLosses ? { ...fields, stock_losses: stockLosses } : fields
      if (damagePhotos.photos.length) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        if (stockLosses) payload.append('stock_losses', JSON.stringify(stockLosses))
        // Every damage photo as its own `photos` file - the backend stores each one separately.
        damagePhotos.photos.forEach(p => payload.append('photos', p.file, p.file.name))
      }
      const r = await api.post(url, payload)
      showToast(isFisherfolk ? 'Disaster logged and submitted to Admin successfully.'
        : `Disaster logged for ${fisherfolk?.full_name || 'the fisherfolk'}.`, 'success')
      onSaved(r.data)
    } catch (err) {
      // Never a false success; the form keeps everything entered so the user can fix it and retry.
      showToast(saveErrorMessage(err), 'error')
    } finally { setIsSubmitting(false) }
  }

  const radioCls = (on) => `flex h-full min-h-[44px] cursor-pointer items-start gap-2 rounded-lg border px-3 py-2 text-sm ${on ? 'border-green-400 bg-[#f0f7f0]' : 'border-slate-200 hover:bg-slate-50'}`

  return (
    <ModalShell
      title="Log Disaster"
      subtitle={!isFisherfolk && fisherfolk ? fisherfolk.full_name : 'Fisheries disaster'}
      icon={AlertTriangle}
      iconBg="bg-rose-100"
      iconColor="text-rose-600"
      onClose={onClose}
      maxWidth="max-w-5xl"
      inline={inline}
      footer={<>
        {!inline && <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>}
        <Button type="submit" form="ff-stock-disaster-form" isLoading={isSubmitting} disabled={isSubmitting || stocks === null}>Log Disaster</Button>
      </>}
    >
      <form id="ff-stock-disaster-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {/* Row 1: the affected stock on the left, the equipment damaged beside it. From lg up the equipment list is
            laid out inside the right cell (absolute) so it is exactly as tall as the stock side, with no gap under it. */}
        <div className="grid gap-4 lg:grid-cols-2">
          <FormField label="Affected Stock" required>
            <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Affected stock">
              <label className={radioCls(mode === LINKED)}>
                <input type="radio" name="disaster-link" className="mt-0.5 shrink-0" checked={mode === LINKED} onChange={() => setMode(LINKED)} />
                <span>
                  <span className="block font-medium text-slate-800">One or more stocks</span>
                  <span className="block text-xs text-slate-500">Choose the affected stocks below</span>
                </span>
              </label>
              <label className={radioCls(mode === NOT_LINKED)}>
                <input type="radio" name="disaster-link" className="mt-0.5 shrink-0" checked={mode === NOT_LINKED}
                  onChange={() => { setMode(NOT_LINKED); setSelectedIds([]); setUnitsByStock({}); setLosses({}) }} />
                <span>
                  <span className="block font-medium text-slate-800">Not linked to a stock</span>
                  <span className="block text-xs text-slate-500">(pond, cage or equipment damage only)</span>
                </span>
              </label>
            </div>
            {/* Always shown; greyed out and unusable while the report is not linked to a stock. */}
            <div className="mt-2">
              {stocks === null ? <p className="text-xs text-slate-500">Loading stocks…</p>
                : allStocks.length === 0 ? <p className="text-xs text-slate-500">No active stocks to choose from — choose “Not linked to a stock”.</p>
                  : <StockPicker stocks={allStocks} selectedIds={selectedIds} onToggle={toggleStock} disabled={mode === NOT_LINKED} />}
            </div>
          </FormField>
          <div className="lg:relative">
            <div className="flex flex-col lg:absolute lg:inset-0">
              <FormLabel>Equipment Damaged</FormLabel>
              <EquipmentChecklist
                fill
                groups={AQUACULTURE_EQUIPMENT_GROUPS}
                selected={form.equipment_damaged}
                onToggle={toggleEquipment}
                otherValue={form.equipment_damaged_other}
                onOtherChange={(v) => set('equipment_damaged_other', v)}
                inputClassName={baseInputClasses}
              />
            </div>
          </div>
        </div>

        {mode === LINKED && groups.length > 0 && (
          <FingerlingsLostTable groups={groups} values={losses} onChange={changeLoss} showErrors={showErrors} />
        )}

        {/* Row 2: when, what and how much on the left; the description fills the right column to the same height. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-4">
            <FormField label="Date of Occurrence" required>
              <input type="date" className={baseInputClasses} required value={form.date_of_occurrence}
                max={todayLocal()} min={latestStocked || undefined}
                onChange={e => set('date_of_occurrence', e.target.value)} />
            </FormField>
            <FormField label="Disaster Type" required>
              <select className={baseInputClasses} value={form.disaster_type} onChange={e => set('disaster_type', e.target.value)}>
                {FISHERFOLK_DISASTER_TYPES.map(d => <option key={d}>{d}</option>)}
              </select>
              {form.disaster_type === 'Other' && (
                <input className={`${baseInputClasses} mt-2`} value={form.disaster_type_other_specify}
                  onChange={e => set('disaster_type_other_specify', e.target.value)}
                  placeholder="Specify disaster type" maxLength={150} required />
              )}
            </FormField>
            <FormField label="Volume Lost (kg)">
              <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.volume_lost_kg}
                onChange={e => set('volume_lost_kg', e.target.value)} placeholder="e.g. 150" />
            </FormField>
          </div>
          <div className="flex flex-col">
            <FormLabel>Description of Damage</FormLabel>
            <textarea rows={6} className="min-h-[9rem] w-full flex-1 resize-none rounded-lg border border-[#E2E8E2] bg-white px-3 py-2 text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] transition-colors focus:border-[#1B4D2E] focus:outline-none focus:ring-2 focus:ring-[#1B4D2E]/10"
              value={form.estimated_damage}
              onChange={e => set('estimated_damage', e.target.value)}
              placeholder="Describe the damage to the stock, pond/cage and equipment" />
          </div>
        </div>

        <DamagePhotosField photosState={damagePhotos} />
      </form>
    </ModalShell>
  )
}
