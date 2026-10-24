import { useEffect, useMemo, useState } from 'react'
import { Zap } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import useIsPhone from '../../hooks/useIsPhone.js'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { FORCED_OTHER, FORCED_REASONS } from '../Monitoring/harvestReport.js'
import { parcelLabel } from './parcelRecords.js'
import { buildRequest, countLine, formProblem, makeRow, rowProblem, serverMessage, splitCrops } from './forcedHarvest.js'

// Force Harvest (Crop Records > a parcel's ⋮ menu): the crops on this parcel that are not ready yet (more than 7 days before their
// expected harvest date) are harvested together because of something coming, such as a typhoon. Fill the event once (harvested date and
// reason), tick the crops and type each one's area and yield. One forced harvest is saved per crop, all or nothing.

const listOf = (data) => (Array.isArray(data) ? data : data?.results || [])
const CELL = 'px-3 py-2.5 align-top'
const TH = 'whitespace-nowrap px-3 py-[10px] text-left text-[11px] font-semibold uppercase tracking-[0.06em]'

export default function ForceHarvestParcelModal({ parcel, onClose, onDone }) {
  const { showToast } = useToast()
  const isPhone = useIsPhone()
  const today = todayISO()
  const [records, setRecords] = useState(null)         // null while loading, false when it failed
  const [date, setDate] = useState(today)
  const [code, setCode] = useState('')
  const [detail, setDetail] = useState('')
  const [remarks, setRemarks] = useState('')
  const [picked, setPicked] = useState({})             // { [recordId]: row }
  const [showErrors, setShowErrors] = useState(false)
  const [showConfirm, setShowConfirm] = useState(false)
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const title = parcelLabel(parcel)

  useEffect(() => {
    let alive = true
    Promise.all(['Planted', 'Near Harvest'].map((status) => api.get('/production/monitoring/', { params: { farm_parcel: parcel.id, status } })))
      .then((responses) => alive && setRecords(responses.flatMap((r) => listOf(r.data))))
      .catch(() => alive && setRecords(false))
    return () => { alive = false }
  }, [parcel.id])

  const { offered, skipped } = useMemo(() => splitCrops(records || [], date), [records, date])
  const offeredIds = new Set(offered.map((o) => o.record.id))
  // A crop that stops being early when the date moves is taken off the selection.
  const rows = Object.values(picked).filter((r) => offeredIds.has(r.id))
  const allTicked = offered.length > 0 && offered.every((o) => picked[o.record.id])
  const problem = formProblem({ date, code, detail, rows }, today)

  const toggle = (record, on) => setPicked((p) => {
    const next = { ...p }
    if (on) next[record.id] = next[record.id] || makeRow(record)
    else delete next[record.id]
    return next
  })
  const toggleAll = (on) => setPicked(on ? Object.fromEntries(offered.map((o) => [o.record.id, picked[o.record.id] || makeRow(o.record)])) : {})
  const change = (id, patch) => setPicked((p) => (p[id] ? { ...p, [id]: { ...p[id], ...patch } } : p))

  const submitClick = () => {
    setShowErrors(true)
    setError('')
    if (problem) { setError(problem); return }
    if (rows.some(rowProblem)) { setError('Fix the marked crops first.'); return }
    setShowConfirm(true)
  }

  const confirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post('/production/forced-harvest/', buildRequest({ date, code, detail, remarks }, rows))
      showToast(`Forced harvest recorded on ${rows.length} crop${rows.length === 1 ? '' : 's'}.`, 'success')
      onDone()
    } catch (err) {
      setError(serverMessage(err.response?.data))
    } finally {
      setIsSubmitting(false)
    }
  }

  const rowError = (row) => (showErrors ? rowProblem(row) : '')
  const input = (row, field, extra = {}) => (
    <DecimalInput decimals={field === 'area' ? 4 : 2} className={`${baseInputClasses} ${rowError(row) && !String(row[field]).trim() ? 'border-rose-400' : ''}`}
      value={row[field]} onChange={(v) => change(row.id, { [field]: v })} {...extra} />
  )
  const unitSelect = (row) => (
    <select className={baseInputClasses} value={row.unit} onChange={(e) => change(row.id, { unit: e.target.value })} aria-label={`Unit for ${row.label}`}>
      {row.units.map((u) => <option key={u} value={u}>{u}</option>)}
    </select>
  )

  return (
    <>
      <ModalShell
        title="Force Harvest"
        subtitle={`${title} · ${parcel.farmer_name} · crops that are not ready yet, harvested because of something coming`}
        icon={Zap}
        iconBg="bg-rose-100"
        iconColor="text-rose-600"
        onClose={onClose}
        maxWidth="max-w-5xl"
        footer={(
          <>
            <p className="mr-auto self-center text-[12.5px] text-[#4A5E4A]" role="status">{countLine(rows.length)}</p>
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <button type="button" onClick={submitClick} disabled={isSubmitting || records === null}
              className="rounded-xl bg-rose-600 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-rose-700 disabled:opacity-60">
              {isSubmitting ? 'Saving…' : `Force Harvest${rows.length > 1 ? ` (${rows.length} crops)` : ''}`}
            </button>
          </>
        )}
      >
        <div className="space-y-4">
          {error && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{error}</p>}

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="force-date">Harvested date *</label>
              <input id="force-date" type="date" className={baseInputClasses} value={date} max={today} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="force-reason">Forced harvest due to early harvest: reason *</label>
              <select id="force-reason" className={`${baseInputClasses} ${showErrors && !code ? 'border-rose-400' : ''}`} value={code}
                onChange={(e) => { setCode(e.target.value); setError('') }}>
                <option value="">Choose a reason</option>
                {FORCED_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>
            </div>
            {code && (
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="force-detail">
                  {code === FORCED_OTHER ? 'Describe the reason *' : 'Details (optional)'}
                </label>
                <input id="force-detail" type="text" className={baseInputClasses} value={detail} maxLength={200} onChange={(e) => setDetail(e.target.value)}
                  placeholder={code === FORCED_OTHER ? 'What made you harvest early?' : 'e.g. signal no. 3 expected on Friday'} />
              </div>
            )}
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700" htmlFor="force-remarks">Remarks (optional)</label>
              <input id="force-remarks" type="text" className={baseInputClasses} value={remarks} onChange={(e) => setRemarks(e.target.value)} />
            </div>
          </div>

          {records === null ? <p className="text-sm text-slate-500">Loading the crops on this parcel…</p>
            : records === false ? <p className="text-sm text-rose-600">Could not load the crops on this parcel. Close this window and try again.</p>
            : offered.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[13px] text-amber-800">
                No crop on this parcel can be force harvested{date === today ? ' today' : ' on that date'}. A crop is offered when it is still growing and more than 7 days
                before its expected harvest date; a crop that is ready is recorded with Record Harvest in Crop Monitoring.
              </p>
            ) : isPhone ? (
              <ul className="space-y-2" aria-label="Crops that can be force harvested">
                {offered.map(({ record, daysEarly }) => {
                  const row = picked[record.id]
                  return (
                    <li key={record.id} className={`rounded-xl border p-3 ${row ? 'border-[#1B4D2E]/40 bg-[#F6FAF7]' : 'border-[#E2E8E2] bg-white'}`}>
                      <label className="flex cursor-pointer items-start gap-2.5">
                        <input type="checkbox" className="mt-0.5 h-4 w-4 flex-none accent-[#1B4D2E]" checked={Boolean(row)} onChange={(e) => toggle(record, e.target.checked)} />
                        <span className="min-w-0">
                          <span className="block break-words text-[13px] font-semibold text-[#1A2B1A]">{row?.label || record.crop_type_name}</span>
                          <span className="block text-[12px] text-[#7A8E7A]">Expected {record.expected_harvest_date} · {daysEarly} days early · {Number(record.area_planted_ha)} ha planted</span>
                        </span>
                      </label>
                      {row && (
                        <div className="mt-2 grid grid-cols-2 gap-2">
                          <div><span className="mb-0.5 block text-[11px] font-medium text-slate-600">Area harvested (ha)</span>{input(row, 'area')}</div>
                          <div><span className="mb-0.5 block text-[11px] font-medium text-slate-600">Unit</span>{unitSelect(row)}</div>
                          <div className="col-span-2"><span className="mb-0.5 block text-[11px] font-medium text-slate-600">Actual yield</span>{input(row, 'volume', { placeholder: 'e.g. 1500' })}</div>
                          {rowError(row) && <p className="col-span-2 text-xs text-rose-600">{rowError(row)}</p>}
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
                <table className="min-w-full text-sm" aria-label="Crops that can be force harvested">
                  <thead className="bg-[#1B4D2E] text-white">
                    <tr>
                      <th className="w-10 px-3 py-[10px]">
                        <input type="checkbox" className="h-4 w-4 accent-white" checked={allTicked} onChange={(e) => toggleAll(e.target.checked)} aria-label="Select all crops" />
                      </th>
                      <th className={TH}>Crop</th>
                      <th className={TH}>Planted</th>
                      <th className={TH}>Expected harvest</th>
                      <th className={TH}>Days early</th>
                      <th className={TH}>Area planted (ha)</th>
                      <th className={TH}>Area harvested (ha)</th>
                      <th className={TH}>Actual yield</th>
                      <th className={TH}>Unit</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offered.map(({ record, daysEarly }) => {
                      const row = picked[record.id]
                      return (
                        <tr key={record.id} className={`border-b border-[#F0F4F0] ${row ? 'bg-[#F6FAF7]' : ''}`}>
                          <td className={CELL}>
                            <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={Boolean(row)} onChange={(e) => toggle(record, e.target.checked)}
                              aria-label={`Select ${record.crop_type_name}`} />
                          </td>
                          <td className={`${CELL} text-[13px] font-medium text-[#1A2B1A]`}>
                            {record.crop_type_name}{record.variety_used && <span className="block text-[11.5px] font-normal text-[#7A8E7A]">{record.variety_used}</span>}
                            {row && rowError(row) && <span className="mt-1 block text-[11.5px] font-normal text-rose-600">{rowError(row)}</span>}
                          </td>
                          <td className={`${CELL} whitespace-nowrap text-[13px] text-[#4A5E4A]`}>{record.date_planted}</td>
                          <td className={`${CELL} whitespace-nowrap text-[13px] text-[#4A5E4A]`}>{record.expected_harvest_date}</td>
                          <td className={`${CELL} whitespace-nowrap text-[13px] font-medium text-rose-700`}>{daysEarly} days</td>
                          <td className={`${CELL} text-[13px] text-[#4A5E4A]`}>{Number(record.area_planted_ha)}</td>
                          <td className={`${CELL} w-36`}>{row ? input(row, 'area') : <span className="text-[#A8BCA8]">—</span>}</td>
                          <td className={`${CELL} w-36`}>{row ? input(row, 'volume', { placeholder: 'e.g. 1500' }) : <span className="text-[#A8BCA8]">—</span>}</td>
                          <td className={`${CELL} w-28`}>{row ? unitSelect(row) : <span className="text-[#A8BCA8]">—</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}

          {skipped.length > 0 && (
            <p className="text-[12.5px] text-[#7A8E7A]">
              Not offered: {skipped.map(({ record, why }) => `${record.crop_type_name} (${why})`).join(', ')}. Record these with Record Harvest in Crop Monitoring.
            </p>
          )}
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
          title="Confirm Forced Harvest"
          message={`Force harvest ${rows.length} crop${rows.length === 1 ? '' : 's'} on parcel ${title}? Each one is recorded as a forced harvest, and its production cycle ends.`}
          confirmLabel="Yes, Force Harvest"
          onConfirm={confirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
