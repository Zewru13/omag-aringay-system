import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import {
  buildPayload, errorMessage, estimateText, flattenCycles, fmtKg, groupByCycle, manilaToday, reviewRows, totalKg, validateForm,
} from './emergencyForceHarvest.js'
import { fmtLong } from './stockingHelpers.js'

// Force Harvest (Aquaculture Monitoring ⋮ menu): record an emergency harvest of several production cycles and ponds / cages of ONE
// fisherfolk in one go, for one of six fixed reasons. Separate from the Health Log Force Harvest, which is not touched.
//
// Everything is laid out as tables, in the page's own table style: the details (reason, date), the cycles and their ponds /
// cages (grouped by cycle: Selection, Species, Cycle Number, Production Unit, Estimated, Actual), the review, and the saved details.
// Nothing is prefilled: the actual quantity of every selected unit is typed. The server checks every rule again and saves the
// whole request or nothing; on an error the window stays open with everything typed so far.

const HEAD = 'bg-[#1B4D2E] text-white'
const TH = 'whitespace-nowrap px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.06em]'
const FRAME = 'overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white'

function FieldError({ children }) {
  return children ? <p className="mt-1 text-[12px] font-medium text-rose-600" role="alert">{children}</p> : null
}

export default function ForceHarvestModal({ stockingRecord, onClose, onRecorded }) {
  const [load, setLoad] = useState({ status: 'loading', data: null })
  const [step, setStep] = useState('form')
  const [reason, setReason] = useState('')
  const [date, setDate] = useState(() => manilaToday())          // the application's local date (Asia/Manila), editable
  const [selected, setSelected] = useState(() => new Set())
  const [actual, setActual] = useState({})
  const [showErrors, setShowErrors] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const submittingRef = useRef(false)

  useEffect(() => {
    let alive = true
    api.get('/fisheries/force-harvest/eligible/', { params: { stocking_record: stockingRecord.id } })
      .then((r) => { if (alive) setLoad({ status: 'ok', data: r.data }) })
      .catch((err) => { if (alive) setLoad({ status: 'error', data: null, message: errorMessage(err, 'Could not load the ponds and cages.') }) })
    return () => { alive = false }
  }, [stockingRecord.id])

  const data = load.data
  const today = data?.today || manilaToday()
  // The row's own cycle first, the fisherfolk's other cycles after it.
  const cycles = useMemo(() => {
    const list = data?.cycles || []
    return [...list].sort((a, b) => Number(b.stocking_record === stockingRecord.id) - Number(a.stocking_record === stockingRecord.id))
  }, [data, stockingRecord.id])
  const rows = useMemo(() => flattenCycles(cycles), [cycles])
  const groups = useMemo(() => groupByCycle(rows), [rows])

  const form = { reason, date, today, rows, selected, actual }
  const { ok, errors } = validateForm(form)
  const total = totalKg(rows, selected, actual)
  const review = reviewRows({ rows, selected, actual })
  const reasonText = data?.reasons?.find((r) => r.value === reason)?.label || ''

  const toggle = (key) => setSelected((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return next
  })
  const toggleCycle = (group) => setSelected((prev) => {
    const next = new Set(prev)
    const all = group.rows.every((r) => next.has(r.key))
    group.rows.forEach((r) => (all ? next.delete(r.key) : next.add(r.key)))
    return next
  })

  const goReview = () => {
    setShowErrors(true)
    if (ok) { setSubmitError(''); setStep('review') }
  }

  const submit = async () => {
    if (submittingRef.current) return            // a double click or a repeated request is ignored
    submittingRef.current = true
    setSubmitting(true); setSubmitError('')
    try {
      const response = await api.post('/fisheries/force-harvest/', buildPayload(form))
      onRecorded?.(response.data.harvests || [])
    } catch (err) {
      setSubmitError(errorMessage(err))          // nothing was saved; everything the user typed stays
    } finally {
      submittingRef.current = false
      setSubmitting(false)
    }
  }

  const footer = step === 'form' ? (
    <>
      <Button variant="secondary" type="button" onClick={onClose}>Cancel</Button>
      <Button type="button" onClick={goReview} disabled={load.status !== 'ok' || rows.length === 0}>Review Force Harvest</Button>
    </>
  ) : (
    <>
      <Button variant="secondary" type="button" onClick={() => setStep('form')} disabled={submitting}>Back</Button>
      <Button variant="secondary" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
      <Button type="button" onClick={submit} isLoading={submitting}>Record Force Harvest</Button>
    </>
  )

  return (
    <ModalShell
      title="Force Harvest"
      subtitle={step === 'form' ? 'Emergency harvest of ponds and cages' : 'Review before recording'}
      icon={Zap}
      iconBg="bg-red-50"
      iconColor="text-red-600"
      maxWidth="max-w-4xl"
      onClose={onClose}
      footer={footer}
    >
      <div className="space-y-4" data-testid="force-harvest-modal">
        {submitError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700" role="alert" data-testid="force-harvest-error">
            {submitError}
          </p>
        )}

        {load.status === 'loading' && <p className="py-8 text-center text-[13px] italic text-[#7A8E7A]" role="status">Loading ponds and cages…</p>}
        {load.status === 'error' && <p className="py-8 text-center text-[13px] text-rose-600" role="alert">{load.message}</p>}

        {load.status === 'ok' && step === 'form' && (
          <>
            <div className={FRAME}>
              <table className="min-w-full text-[13px]" data-testid="force-harvest-details-table">
                <thead className={HEAD}><tr><th className={TH}>Detail</th><th className={TH}>Entry</th></tr></thead>
                <tbody>
                  <tr className="border-t border-[#F0F4F0]">
                    <th scope="row" className="w-[38%] px-3 py-2.5 text-left font-medium text-[#4A5E4A]">Fisherfolk</th>
                    <td className="px-3 py-2.5 font-semibold text-[#1A2B1A]">{data.fisherfolk.name}</td>
                  </tr>
                  <tr className="border-t border-[#F0F4F0] align-top">
                    <th scope="row" className="px-3 py-2.5 text-left font-medium text-[#4A5E4A]">
                      <label htmlFor="force-harvest-reason">Reason for Force Harvest <span className="text-rose-600">*</span></label>
                    </th>
                    <td className="px-3 py-2">
                      <select
                        id="force-harvest-reason"
                        data-testid="force-harvest-reason"
                        className={`${baseInputClasses} w-full`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-invalid={showErrors && Boolean(errors.reason)}
                      >
                        <option value="">Select a reason</option>
                        {data.reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                      <FieldError>{showErrors && errors.reason}</FieldError>
                    </td>
                  </tr>
                  <tr className="border-t border-[#F0F4F0] align-top">
                    <th scope="row" className="px-3 py-2.5 text-left font-medium text-[#4A5E4A]">
                      <label htmlFor="force-harvest-date">Harvest Date <span className="text-rose-600">*</span></label>
                    </th>
                    <td className="px-3 py-2">
                      <input
                        id="force-harvest-date"
                        data-testid="force-harvest-date"
                        type="date"
                        className={`${baseInputClasses} w-full`}
                        value={date}
                        max={today}
                        onChange={(e) => setDate(e.target.value)}
                        aria-invalid={showErrors && Boolean(errors.date)}
                      />
                      <FieldError>{showErrors && errors.date}</FieldError>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className={FRAME}>
              <table className="min-w-[680px] w-full text-[13px]" data-testid="force-harvest-select-table">
                <thead className={HEAD}>
                  <tr>
                    <th className={TH}>Selection</th>
                    <th className={TH}>Species</th>
                    <th className={TH}>Cycle Number</th>
                    <th className={TH}>Production Unit</th>
                    <th className={`${TH} text-right`}>Estimated Harvest (kg)</th>
                    <th className={`${TH} text-right`}>Actual Harvest (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {groups.length === 0 && (
                    <tr>
                      <td colSpan={6} className="px-3 py-8 text-center text-[13px] text-[#7A8E7A]" data-testid="force-harvest-empty">
                        No ponds or cages are available for Force Harvest. Each cycle must be in stock or ongoing with a confirmed stocking date, and a pond or cage must not be harvested yet.
                      </td>
                    </tr>
                  )}
                  {groups.map((group) => (
                    <GroupRows
                      key={group.stockingRecord}
                      group={group}
                      selected={selected}
                      actual={actual}
                      errors={showErrors ? errors.kg : {}}
                      onToggle={toggle}
                      onToggleCycle={() => toggleCycle(group)}
                      onActual={(key, value) => setActual((prev) => ({ ...prev, [key]: value }))}
                    />
                  ))}
                </tbody>
                {groups.length > 0 && (
                  <tfoot>
                    <tr className="border-t border-[#E2E8E2] bg-[#F9FAF9] font-bold">
                      <td className="px-3 py-2.5" colSpan={5}>Total actual harvest (kg)</td>
                      <td className="px-3 py-2.5 text-right tabular-nums" data-testid="force-harvest-total">{fmtKg(total)}</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            <FieldError>{showErrors && errors.selection}</FieldError>
          </>
        )}

        {load.status === 'ok' && step === 'review' && (
          <>
            <div className={FRAME}>
              <table className="min-w-full text-[13px]" data-testid="force-harvest-review-details">
                <thead className={HEAD}><tr><th className={TH}>Detail</th><th className={TH}>Value</th></tr></thead>
                <tbody>
                  {[['Fisherfolk', data.fisherfolk.name], ['Reason for Force Harvest', reasonText], ['Harvest Date', fmtLong(date)]].map(([label, value]) => (
                    <tr key={label} className="border-t border-[#F0F4F0]">
                      <th scope="row" className="w-1/3 whitespace-nowrap px-3 py-2.5 text-left font-medium text-[#4A5E4A]">{label}</th>
                      <td className="px-3 py-2.5 font-semibold text-[#1A2B1A]">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={FRAME}>
              <table className="min-w-[620px] w-full text-[13px]" data-testid="force-harvest-review-table">
                <thead className={HEAD}>
                  <tr>
                    <th className={TH}>Species</th>
                    <th className={TH}>Cycle Number</th>
                    <th className={TH}>Production Unit</th>
                    <th className={`${TH} text-right`}>Estimated Harvest (kg)</th>
                    <th className={`${TH} text-right`}>Actual Harvest (kg)</th>
                  </tr>
                </thead>
                <tbody>
                  {review.map((r) => (
                    <tr key={r.key} className="border-t border-[#F0F4F0]" data-testid="force-harvest-review-row">
                      <td className="px-3 py-2">{r.species}</td>
                      <td className="px-3 py-2">{r.cycleLabel}</td>
                      <td className="px-3 py-2 font-semibold text-[#1A2B1A]">{r.unitLabel}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${r.estimate === 'Estimate unavailable' ? 'italic text-[#7A8E7A]' : ''}`}>{r.estimate}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{r.actual}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E2E8E2] bg-[#F9FAF9] font-bold">
                    <td className="px-3 py-2.5" colSpan={4}>Total actual harvest (kg)</td>
                    <td className="px-3 py-2.5 text-right tabular-nums" data-testid="force-harvest-review-total">{fmtKg(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </div>
    </ModalShell>
  )
}

// One production cycle in the selection table: a cycle row (select all of its ponds / cages) and one row per pond / cage.
function GroupRows({ group, selected, actual, errors, onToggle, onToggleCycle, onActual }) {
  const allSelected = group.rows.every((r) => selected.has(r.key))
  return (
    <>
      <tr className="border-t border-[#E2E8E2] bg-[#F5F8F5]">
        <td className="px-3 py-2">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1B4D2E]"
            checked={allSelected}
            onChange={onToggleCycle}
            aria-label={`Select every pond and cage of ${group.cycleLabel}`}
          />
        </td>
        <td className="px-3 py-2 text-[12px] font-semibold text-[#1B4D2E]" colSpan={5}>
          {group.species} · {group.cycleLabel}{group.cycleName ? ` · ${group.cycleName}` : ''}
        </td>
      </tr>
      {group.rows.map((row) => {
        const on = selected.has(row.key)
        return (
          <tr key={row.key} className={`border-t border-[#F0F4F0] ${on ? 'bg-[#F9FAF9]' : ''}`} data-testid="force-harvest-unit-row">
            <td className="px-3 py-2">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1B4D2E]"
                checked={on}
                onChange={() => onToggle(row.key)}
                aria-label={`Select ${row.unitLabel} of ${row.cycleLabel}`}
              />
            </td>
            <td className="px-3 py-2">{row.species}</td>
            <td className="whitespace-nowrap px-3 py-2">{row.cycleLabel}</td>
            <td className="whitespace-nowrap px-3 py-2 font-semibold text-[#1A2B1A]">{row.unitLabel}</td>
            <td className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${row.estimate == null ? 'italic text-[#7A8E7A]' : ''}`}>{estimateText(row.estimate)}</td>
            <td className="px-3 py-1.5 text-right align-top">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                disabled={!on}
                value={actual[row.key] ?? ''}
                onChange={(e) => onActual(row.key, e.target.value)}
                aria-label={`Actual harvest in kg for ${row.unitLabel} of ${row.cycleLabel}`}
                aria-invalid={Boolean(errors[row.key])}
                className={`${baseInputClasses} w-28 text-right tabular-nums disabled:bg-[#F0F4F0] disabled:text-[#9AA89A]`}
              />
              <FieldError>{errors[row.key]}</FieldError>
            </td>
          </tr>
        )
      })}
    </>
  )
}
