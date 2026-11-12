import { useEffect, useMemo, useRef, useState } from 'react'
import { Zap } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import {
  buildPayload, errorMessage, estimateText, flattenCycles, fmtKg, groupByCycle, manilaToday, reviewRows, totalKg, validateForm,
} from './emergencyForceHarvest.js'
import { fmtLong } from './stockingHelpers.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// Force Harvest (Aquaculture Monitoring ⋮ menu): record an emergency harvest of several production cycles and ponds / cages of ONE
// fisherfolk in one go, for one of six fixed reasons. Separate from the Health Log Force Harvest, which is not touched.
//
// Everything is laid out as tables, in the page's own table style: the details (reason, date), the cycles and their ponds /
// cages (grouped by cycle: Selection, Species, Cycle Number, Production Unit, Estimated, Actual), the review, and the saved details.
// Nothing is prefilled: the actual quantity of every selected unit is typed. The server checks every rule again and saves the
// whole request or nothing; on an error the window stays open with everything typed so far.

function FieldError({ children }) {
  return children ? <p className="mt-1 text-[12px] font-medium text-rose-600" role="alert">{children}</p> : null
}

export default function ForceHarvestModal({ stockingRecord, onClose, onRecorded }) {
  const [load, setLoad] = useState({ status: 'loading', data: null })
  const [step, setStep] = useState('form')
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`force-harvest:${stockingRecord.id}`)
  const [reason, setReason] = useDraftField(draft, 'reason', '')
  const [date, setDate] = useDraftField(draft, 'date', () => manilaToday())          // the application's local date (Asia/Manila), editable
  // The ticked ponds/cages are kept as a list (a draft cannot hold a Set).
  const [selectedKeys, setSelectedKeys] = useDraftField(draft, 'selected', [])
  const selected = useMemo(() => new Set(selectedKeys), [selectedKeys])
  const [actual, setActual] = useDraftField(draft, 'actual', {})
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

  const toggle = (key) => setSelectedKeys((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key); else next.add(key)
    return [...next]
  })
  const toggleCycle = (group) => setSelectedKeys((prev) => {
    const next = new Set(prev)
    const all = group.rows.every((r) => next.has(r.key))
    group.rows.forEach((r) => (all ? next.delete(r.key) : next.add(r.key)))
    return [...next]
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
      draft.clear()
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
      <Button variant="outline" type="button" onClick={onClose}>Cancel</Button>
      <Button type="button" onClick={goReview} disabled={load.status !== 'ok' || rows.length === 0}>Review Force Harvest</Button>
    </>
  ) : (
    <>
      <Button variant="outline" type="button" onClick={() => setStep('form')} disabled={submitting}>Back</Button>
      <Button variant="outline" type="button" onClick={onClose} disabled={submitting}>Cancel</Button>
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
        <DraftBanner draft={draft} />
        {submitError && (
          <p className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] font-medium text-rose-700" role="alert" data-testid="force-harvest-error">
            {submitError}
          </p>
        )}

        {load.status === 'loading' && <p className="py-8 text-center text-[13px] italic text-[#7A8E7A]" role="status">Loading ponds and cages…</p>}
        {load.status === 'error' && <p className="py-8 text-center text-[13px] text-rose-600" role="alert">{load.message}</p>}

        {load.status === 'ok' && step === 'form' && (
          <>
            <div data-testid="force-harvest-details-table">
              <FormSection title="Force Harvest Details">
                <FormRows label="Force Harvest Details">
                  <FormRow>
                    <FormCell label="Fisherfolk" wide><div className="py-1 text-[13px] font-semibold text-[#1A2B1A]">{data.fisherfolk.name}</div></FormCell>
                  </FormRow>
                  <FormRow>
                    <FormCell label="Reason for Force Harvest" required error={showErrors ? errors.reason : ''}>
                      <select
                        id="force-harvest-reason"
                        data-testid="force-harvest-reason"
                        aria-label="Reason for Force Harvest"
                        className={`${baseInputClasses} w-full`}
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        aria-invalid={showErrors && Boolean(errors.reason)}
                      >
                        <option value="">Select a reason</option>
                        {data.reasons.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                      </select>
                    </FormCell>
                    <FormCell label="Harvest Date" required error={showErrors ? errors.date : ''}>
                      <input
                        id="force-harvest-date"
                        data-testid="force-harvest-date"
                        aria-label="Harvest Date"
                        type="date"
                        className={`${baseInputClasses} w-full`}
                        value={date}
                        max={today}
                        onChange={(e) => setDate(e.target.value)}
                        aria-invalid={showErrors && Boolean(errors.date)}
                      />
                    </FormCell>
                  </FormRow>
                </FormRows>
              </FormSection>
            </div>

            <FormSection title="Ponds and Cages">
              <EntryTable bare label="Ponds and cages to harvest" testId="force-harvest-select-table">
                <EntryHead>
                  <EntryTh>Selection</EntryTh>
                  <EntryTh>Species</EntryTh>
                  <EntryTh>Cycle Number</EntryTh>
                  <EntryTh>Production Unit</EntryTh>
                  <EntryTh className="md:text-right">Estimated Harvest (kg)</EntryTh>
                  <EntryTh className="md:text-right">Actual Harvest (kg)</EntryTh>
                </EntryHead>
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
                    <tr className="border-t border-[#E2E8E2] bg-[#F9FAF9] font-bold max-md:flex max-md:justify-between max-md:px-3 max-md:py-2">
                      <td className="px-3 py-2.5 max-md:p-0" colSpan={5}>Total actual harvest (kg)</td>
                      <td className="px-3 py-2.5 text-right tabular-nums max-md:p-0" data-testid="force-harvest-total">{fmtKg(total)}</td>
                    </tr>
                  </tfoot>
                )}
              </EntryTable>
            </FormSection>
            <FieldError>{showErrors && errors.selection}</FieldError>
          </>
        )}

        {load.status === 'ok' && step === 'review' && (
          <>
            <div data-testid="force-harvest-review-details">
              <DetailTable title="Force Harvest Details" columns={1} fields={[
                { label: 'Fisherfolk', value: data.fisherfolk.name },
                { label: 'Reason for Force Harvest', value: reasonText },
                { label: 'Harvest Date', value: fmtLong(date) },
              ]} />
            </div>
            <FormSection title="Ponds and Cages">
              <EntryTable bare label="Ponds and cages to harvest" testId="force-harvest-review-table">
                <EntryHead>
                  <EntryTh>Species</EntryTh>
                  <EntryTh>Cycle Number</EntryTh>
                  <EntryTh>Production Unit</EntryTh>
                  <EntryTh className="md:text-right">Estimated Harvest (kg)</EntryTh>
                  <EntryTh className="md:text-right">Actual Harvest (kg)</EntryTh>
                </EntryHead>
                <tbody>
                  {review.map((r) => (
                    <EntryRow key={r.key} data-testid="force-harvest-review-row">
                      <EntryCell label="Species">{r.species}</EntryCell>
                      <EntryCell label="Cycle Number">{r.cycleLabel}</EntryCell>
                      <EntryCell label="Production Unit" className="font-semibold text-[#1A2B1A]">{r.unitLabel}</EntryCell>
                      <EntryCell label="Estimated Harvest (kg)" className={`tabular-nums md:text-right ${r.estimate === 'Estimate unavailable' ? 'italic text-[#7A8E7A]' : ''}`}>{r.estimate}</EntryCell>
                      <EntryCell label="Actual Harvest (kg)" className="tabular-nums md:text-right">{r.actual}</EntryCell>
                    </EntryRow>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-[#E2E8E2] bg-[#F9FAF9] font-bold max-md:flex max-md:justify-between max-md:px-3 max-md:py-2">
                    <td className="px-3 py-2.5 max-md:p-0" colSpan={4}>Total actual harvest (kg)</td>
                    <td className="px-3 py-2.5 text-right tabular-nums max-md:p-0" data-testid="force-harvest-review-total">{fmtKg(total)}</td>
                  </tr>
                </tfoot>
              </EntryTable>
            </FormSection>
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
      <EntryRow tone="bg-[#F5F8F5]" className="max-md:flex max-md:items-center max-md:gap-2">
        <td className="px-3 py-2 max-md:p-0">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1B4D2E]"
            checked={allSelected}
            onChange={onToggleCycle}
            aria-label={`Select every pond and cage of ${group.cycleLabel}`}
          />
        </td>
        <td className="px-3 py-2 text-[12px] font-semibold text-[#1B4D2E] max-md:p-0" colSpan={5}>
          {group.species} · {group.cycleLabel}{group.cycleName ? ` · ${group.cycleName}` : ''}
        </td>
      </EntryRow>
      {group.rows.map((row) => {
        const on = selected.has(row.key)
        return (
          <EntryRow key={row.key} tone={on ? 'bg-[#F9FAF9]' : ''} data-testid="force-harvest-unit-row">
            <EntryCell label="Selection">
              <input
                type="checkbox"
                className="h-4 w-4 accent-[#1B4D2E]"
                checked={on}
                onChange={() => onToggle(row.key)}
                aria-label={`Select ${row.unitLabel} of ${row.cycleLabel}`}
              />
            </EntryCell>
            <EntryCell label="Species">{row.species}</EntryCell>
            <EntryCell label="Cycle Number" className="whitespace-nowrap">{row.cycleLabel}</EntryCell>
            <EntryCell label="Production Unit" className="whitespace-nowrap font-semibold text-[#1A2B1A]">{row.unitLabel}</EntryCell>
            <EntryCell label="Estimated Harvest (kg)" className={`whitespace-nowrap tabular-nums md:text-right ${row.estimate == null ? 'italic text-[#7A8E7A]' : ''}`}>{estimateText(row.estimate)}</EntryCell>
            <EntryCell label="Actual Harvest (kg)" className="md:text-right">
              <input
                type="text"
                inputMode="decimal"
                placeholder="0.00"
                disabled={!on}
                value={actual[row.key] ?? ''}
                onChange={(e) => onActual(row.key, e.target.value)}
                aria-label={`Actual harvest in kg for ${row.unitLabel} of ${row.cycleLabel}`}
                aria-invalid={Boolean(errors[row.key])}
                className={`${baseInputClasses} w-full tabular-nums md:w-28 md:text-right disabled:bg-[#F0F4F0] disabled:text-[#9AA89A]`}
              />
              <FieldError>{errors[row.key]}</FieldError>
            </EntryCell>
          </EntryRow>
        )
      })}
    </>
  )
}
