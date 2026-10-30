import { useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CheckCircle2, ChevronDown, Download, Printer } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { FISHERFOLK_DISASTER_TYPES, saveErrorMessage } from './fisheriesDisasterConstants.js'
import { DamagePhotosField } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'
import { FISHERIES_LOG, downloadLog, fetchAllStocks, printLog } from './disasterReportDocument.js'
import { buildGroups, eventProblem, pickedSummary, rowProblem, rowsFor } from './multiFisherfolkDisaster.js'

// Log Disaster (Fisheries Disaster page, staff): a full-page form for ONE disaster event over the ponds and cages of MANY fisherfolk. It takes the
// place of the disaster list inside the page (the sidebar and the top bar stay). Fill the event once (type, date, description, photos), then tick
// the stocks it hit in the list of every active stock, grouped by fisherfolk: search or filter by barangay behind the Filters button. A ticked stock
// opens its own ponds and cages, each with the fingerlings lost and a Total Loss box. It saves one disaster log per fisherfolk in one go
// (POST /fisheries/disaster-reports/event/), all or nothing, then lists the logs it made, each with View / Print / Download.

const CHECK = 'h-4 w-4 flex-none accent-[#1B4D2E]'
const TOTAL_CHECK = 'h-4 w-4 flex-none rounded border-rose-300 text-rose-600 accent-rose-600 focus:ring-rose-500'
const LABEL = 'mb-1 block text-[12px] font-medium text-[#4A5E4A]'

const stockLabel = (s) => [s.species_name || 'Stock', s.production_cycle_name, s.production_cycle_no && `Cycle ${s.production_cycle_no}`].filter(Boolean).join(' · ')

function PondRow({ row, value, onChange, showErrors }) {
  const total = Boolean(value?.total)
  const auto = total && row.stocked != null
  const problem = showErrors ? rowProblem(row, value) : ''
  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-[#F0F4F0] px-3 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 basis-40 text-[13px] text-[#1A2B1A]">
        {row.unitLabel}
        <span className="ml-2 text-[11.5px] text-[#7A8E7A]">{row.stocked != null ? `${row.stocked.toLocaleString()} stocked` : 'stocked count not recorded'}</span>
      </span>
      <div className="flex items-center gap-2">
        <label className="text-[11.5px] font-medium text-[#4A5E4A]" htmlFor={`lost-${row.key}`}>Fingerlings lost</label>
        <input id={`lost-${row.key}`} type="number" inputMode="numeric" min="0" step="1" max={row.stocked ?? undefined}
          className={`${baseInputClasses} w-28 ${problem ? 'border-rose-400' : ''} ${auto ? 'bg-slate-100' : ''}`}
          value={auto ? row.stocked : (value?.lost ?? '')} readOnly={auto} placeholder="0"
          onChange={(e) => onChange({ ...value, lost: e.target.value })} />
      </div>
      <label className="flex min-h-[36px] items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-2.5 text-[12px] font-medium text-rose-800">
        <input type="checkbox" className={TOTAL_CHECK} checked={total} onChange={(e) => onChange({ ...value, total: e.target.checked })} />
        Total loss
      </label>
      {problem && <p className="basis-full text-[11.5px] text-rose-600" role="alert">{problem}</p>}
    </li>
  )
}

function ResultPanel({ logs, onDone }) {
  const { showToast } = useToast()
  const [busy, setBusy] = useState('')
  const run = async (key, action, failure) => {
    setBusy(key)
    try { await action() } catch (err) { showToast(err?.message || failure, 'error') } finally { setBusy('') }
  }
  return (
    <section aria-label="Disaster reported" className="space-y-4" data-testid="fisheries-event-result">
      <header className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
        <CheckCircle2 size={22} className="flex-none text-emerald-700" aria-hidden="true" />
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="text-[16px] font-semibold text-emerald-900">Disaster reported</h2>
          <p className="text-[12.5px] text-emerald-800">{logs.length} disaster log{logs.length === 1 ? '' : 's'} saved, one for each fisherfolk.</p>
        </div>
        <Button type="button" onClick={onDone}>Done</Button>
      </header>
      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
        <table className="w-full min-w-[40rem] text-sm">
          <thead className="bg-[#F0F4F0] text-[#4A5E4A]">
            <tr>{['Reference No.', 'Fisherfolk', 'Affected stock / pond', 'Disaster', ''].map((h) => <th key={h} className="whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em]">{h}</th>)}</tr>
          </thead>
          <tbody>
            {logs.map((log) => (
              <tr key={log.id} className="border-t border-[#F0F4F0]">
                <td className="px-3 py-2.5 text-[13px] font-medium text-[#1A2B1A]">{log.report_number}</td>
                <td className="px-3 py-2.5 text-[13px] text-[#4A5E4A]">{log.fisherfolk_name}</td>
                <td className="px-3 py-2.5 text-[13px] text-[#4A5E4A]">{log.affected_stock || '—'}</td>
                <td className="px-3 py-2.5 text-[13px] text-[#4A5E4A]">{log.disaster_type_label || log.disaster_type}</td>
                <td className="px-3 py-2.5">
                  <div className="flex gap-2">
                    <Button type="button" size="sm" variant="outline" icon={Printer} disabled={Boolean(busy)} isLoading={busy === `p${log.id}`}
                      onClick={() => run(`p${log.id}`, () => printLog(FISHERIES_LOG, log.id), 'The disaster log could not be printed.')}>Print</Button>
                    <Button type="button" size="sm" variant="outline" icon={Download} disabled={Boolean(busy)} isLoading={busy === `d${log.id}`}
                      onClick={() => run(`d${log.id}`, () => downloadLog(FISHERIES_LOG, log.id, log.pdf_filename), 'The PDF could not be generated.')}>Download</Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

export default function LogFisheriesDisasterScreen({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const photosState = useDamagePhotos()
  const today = todayISO()
  const [form, setForm] = useState({ disaster_type: FISHERFOLK_DISASTER_TYPES[0], disaster_type_other_specify: '', date_of_occurrence: today, estimated_damage: '' })
  const set = (key, value) => setForm((f) => ({ ...f, [key]: value }))
  const [stocks, setStocks] = useState(null)             // every active stock of every fisherfolk; false when it could not be loaded
  const [search, setSearch] = useState('')
  const [barangay, setBarangay] = useState('')
  const debounced = useDebouncedValue(search, 250)
  const [picked, setPicked] = useState({})               // see multiFisherfolkDisaster.js
  const [open, setOpen] = useState(() => new Set())      // the fisherfolk rows that are opened
  const [showErrors, setShowErrors] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [saved, setSaved] = useState(null)               // the logs that were saved
  const pickedRef = useRef(picked)
  useEffect(() => { pickedRef.current = picked }, [picked])

  useEffect(() => {
    let alive = true
    fetchAllStocks({ status: 'Stocked,Near Harvest' }).then((list) => alive && setStocks(list)).catch(() => alive && setStocks(false))
    return () => { alive = false }
  }, [])

  const people = useMemo(() => {
    const q = debounced.trim().toLowerCase()
    const byPerson = new Map()
    ;(stocks || []).forEach((s) => {
      const hay = `${s.fisherfolk_name || ''} ${stockLabel(s)} ${s.pond_location_barangay || ''}`.toLowerCase()
      if (q && !hay.includes(q)) return
      if (barangay && (s.fisherfolk_barangay || s.pond_location_barangay || '').toLowerCase() !== barangay.toLowerCase()) return
      if (!byPerson.has(s.fisherfolk)) byPerson.set(s.fisherfolk, { id: s.fisherfolk, name: s.fisherfolk_name || 'Fisherfolk', barangay: s.fisherfolk_barangay || '', stocks: [] })
      byPerson.get(s.fisherfolk).stocks.push(s)
    })
    return [...byPerson.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [stocks, debounced, barangay])

  const toggleOpen = (id) => setOpen((prev) => { const next = new Set(prev); if (next.has(id)) next.delete(id); else next.add(id); return next })

  const toggleStock = (stock, on) => {
    if (!on) { setPicked((p) => { const next = { ...p }; delete next[stock.id]; return next }); return }
    setPicked((p) => ({ ...p, [stock.id]: { stock, info: { state: 'loading', units: [] }, values: {} } }))
    api.get(`/fisheries/stocking/${stock.id}/production-units/`)
      .then((r) => setPicked((p) => (p[stock.id] ? { ...p, [stock.id]: { ...p[stock.id], info: { state: 'ok', units: r.data.units || [] } } } : p)))
      .catch(() => setPicked((p) => (p[stock.id] ? { ...p, [stock.id]: { ...p[stock.id], info: { state: 'error', units: [] } } } : p)))
  }
  const setValue = (stockId, key, value) => setPicked((p) => ({ ...p, [stockId]: { ...p[stockId], values: { ...p[stockId].values, [key]: value } } }))

  const summary = pickedSummary(picked)
  const problem = eventProblem(form, picked, today)

  const save = async () => {
    setShowErrors(true)
    if (problem) { showToast(problem, 'error'); return }
    setIsSaving(true)
    try {
      const body = {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify.trim() : '',
        date_of_occurrence: form.date_of_occurrence,
        estimated_damage: form.estimated_damage.trim(),
      }
      const groups = buildGroups(picked)
      let payload = { ...body, fisherfolk_groups: groups }
      if (photosState.photos.length) {
        payload = new FormData()
        Object.entries(body).forEach(([k, v]) => payload.append(k, v))
        payload.append('fisherfolk_groups', JSON.stringify(groups))
        photosState.photos.forEach((p) => payload.append('photos', p.file, p.file.name))
      }
      const res = await api.post('/fisheries/disaster-reports/event/', payload)
      showToast(`Disaster logged for ${res.data.length} fisherfolk.`, 'success')
      setSaved(res.data)
      onSuccess?.()
    } catch (err) {
      showToast(saveErrorMessage(err, 'Failed to save the disaster.'), 'error')
    } finally {
      setIsSaving(false)
    }
  }

  if (saved) return <ResultPanel logs={saved} onDone={onClose} />

  return (
    <div className="space-y-5" data-testid="log-fisheries-disaster">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="outline" icon={ArrowLeft} onClick={onClose} disabled={isSaving}>Back</Button>
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold text-[#1A2B1A]"><AlertTriangle size={18} className="text-rose-600" aria-hidden="true" /> Log Fisheries Disaster</h2>
          <p className="text-[12.5px] text-[#7A8E7A]">One disaster on the ponds and cages of one or many fisherfolk. A log is saved for each fisherfolk.</p>
        </div>
      </div>

      <section className="space-y-4 rounded-xl border border-[#E2E8E2] bg-white p-4" aria-label="Disaster details">
        <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Disaster details</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className={LABEL} htmlFor="fd-type">Disaster type *</label>
            <select id="fd-type" className={baseInputClasses} value={form.disaster_type} onChange={(e) => set('disaster_type', e.target.value)}>
              {FISHERFOLK_DISASTER_TYPES.map((d) => <option key={d}>{d}</option>)}
            </select>
            {form.disaster_type === 'Other' && (
              <input className={`${baseInputClasses} mt-2`} value={form.disaster_type_other_specify} maxLength={150} placeholder="Specify disaster type"
                onChange={(e) => set('disaster_type_other_specify', e.target.value)} aria-label="Other disaster type" />
            )}
          </div>
          <div>
            <label className={LABEL} htmlFor="fd-date">Date of occurrence *</label>
            <input id="fd-date" type="date" className={baseInputClasses} value={form.date_of_occurrence} max={today} onChange={(e) => set('date_of_occurrence', e.target.value)} />
          </div>
        </div>
        <div>
          <label className={LABEL} htmlFor="fd-desc">Description of damage</label>
          <textarea id="fd-desc" rows={3} className={baseInputClasses} value={form.estimated_damage} onChange={(e) => set('estimated_damage', e.target.value)} />
        </div>
        <DamagePhotosField photosState={photosState} />
      </section>

      <section className="space-y-3" aria-label="Ponds and cages hit">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-[#4A5E4A]">Ponds and cages hit</h3>
          <p className="text-[12.5px] text-[#4A5E4A]" role="status">
            {summary.stocks ? `${summary.fisherfolk} fisherfolk · ${summary.stocks} stock${summary.stocks === 1 ? '' : 's'} · ${summary.rows} pond/cage line${summary.rows === 1 ? '' : 's'}` : 'Nothing chosen yet'}
          </p>
        </div>
        <FilterPanel className="" search={search} onSearchChange={setSearch} searchPlaceholder="Search fisherfolk, species or location…" activeCount={barangay ? 1 : 0}>
          <div className="w-48"><BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption /></div>
        </FilterPanel>

        {stocks === null && <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-8 text-center text-sm text-slate-500">Loading the stocks…</p>}
        {stocks === false && <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700" role="alert">The stocks could not be loaded. Go back and try again.</p>}
        {stocks && people.length === 0 && <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-8 text-center text-sm text-slate-500">No active stock matches.</p>}

        <ul className="divide-y divide-[#E2E8E2] overflow-hidden rounded-xl border border-[#E2E8E2] bg-white">
          {people.map((person) => {
            const isOpen = open.has(person.id)
            const ticked = person.stocks.filter((s) => picked[s.id]).length
            return (
              <li key={person.id}>
                <button type="button" onClick={() => toggleOpen(person.id)} aria-expanded={isOpen}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F7F5]">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-semibold text-[#1A2B1A]">{person.name}</span>
                    <span className="block truncate text-[12px] text-[#7A8E7A]">{[person.barangay, `${person.stocks.length} active stock${person.stocks.length === 1 ? '' : 's'}`, ticked ? `${ticked} chosen` : ''].filter(Boolean).join(' · ')}</span>
                  </span>
                  <ChevronDown size={18} className={`flex-none text-[#7A8E7A] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                </button>
                {isOpen && (
                  <ul className="border-t border-[#E2E8E2] bg-[#F9FAF9]">
                    {person.stocks.map((s) => {
                      const entry = picked[s.id]
                      const rows = entry ? rowsFor(s, entry.info) : []
                      return (
                        <li key={s.id} className="border-b border-[#E2E8E2] px-3 py-2 last:border-b-0">
                          <label className="flex cursor-pointer items-start gap-2.5 text-[13px] text-[#1A2B1A]">
                            <input type="checkbox" className={`${CHECK} mt-0.5`} checked={Boolean(entry)} onChange={(e) => toggleStock(s, e.target.checked)} />
                            <span className="min-w-0">
                              {stockLabel(s)}
                              <span className="ml-2 text-[11.5px] text-[#7A8E7A]">{[s.culture_type, s.pond_location_barangay].filter(Boolean).join(' · ')}</span>
                            </span>
                          </label>
                          {entry?.info.state === 'loading' && <p className="ml-7 mt-1 text-[12px] text-slate-500">Loading its ponds and cages…</p>}
                          {entry?.info.state === 'error' && <p className="ml-7 mt-1 text-[12px] text-rose-600" role="alert">Its ponds and cages could not be loaded. Untick it and tick it again.</p>}
                          {entry && rows.length > 0 && (
                            <ul className="ml-7 mt-1 rounded-lg border border-[#E2E8E2] bg-white">
                              {rows.map((row) => (
                                <PondRow key={row.key} row={row} value={entry.values[row.key]} showErrors={showErrors}
                                  onChange={(v) => setValue(s.id, row.key, v)} />
                              ))}
                            </ul>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <div className="sticky bottom-0 flex flex-wrap items-center justify-end gap-2 border-t border-[#E2E8E2] bg-white/95 px-1 py-3 backdrop-blur">
        {showErrors && problem && <p className="mr-auto text-[12.5px] text-rose-600" role="alert">{problem}</p>}
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>Cancel</Button>
        <Button type="button" isLoading={isSaving} disabled={isSaving || stocks === null} onClick={save}>Log Disaster</Button>
      </div>
    </div>
  )
}
