import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronDown, Copy, Plus, Search, Trash2 } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import { bulkCellInputClasses, bulkThCenterClasses, bulkThClasses } from '../../components/UI/bulkEntryStyles.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { isCashType, isTrainingType } from './assistanceFieldHelpers.js'
import {
  MAX_DISTRIBUTION_ROWS, distributionPayload, eligibleIds, makeDistributionRow, outcomeTotals, quantityText, reviewTotals, typeName,
  validateRows, withAssistanceType,
} from './multiDistribution.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'

// Distribute to Multiple Organizations: a table where every row is one organization and the assistance it receives for its members (type,
// date, quantity or cash, source agencies...). Review checks every row with the server first (who would receive it, who is blocked by the
// 30-day rule, nothing is saved), then each organization's distribution is saved on its own and the outcome is shown per organization.
// Staff only. `domain` is the per-domain config (distributionDomains.js).

const COL = { index: 44, org: 290, type: 230, date: 150, quantity: 190, remove: 56 }
const CELL = 'px-3 py-3 max-md:block max-md:w-full! max-md:px-0 max-md:py-1.5 max-md:text-left max-md:before:mb-1 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'
const REMOVE_BTN = 'inline-flex items-center gap-1.5 rounded-md p-1.5 text-rose-500 hover:bg-rose-50 transition-colors max-md:min-h-[40px] max-md:px-3 max-md:text-[13px] max-md:font-medium'

function formatDateLong(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${iso}T00:00:00`))
}

// Pick one organization by searching; the chosen one shows as a small card with a way to change it.
function OrgPicker({ domain, org, onPick }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const box = useRef(null)
  useEffect(() => {
    if (!query.trim()) return undefined
    const handle = setTimeout(() => {
      api.get(domain.orgSearchUrl, { params: { search: query } })
        .then((r) => setResults(Array.isArray(r.data) ? r.data : (r.data.results || [])))
        .catch(() => setResults([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [query, domain.orgSearchUrl])
  useEffect(() => {
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setQuery('') }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  if (org) {
    return (
      <div className="flex min-h-10 items-center gap-2 rounded-md border border-[#C8D5C8] bg-[#EBF5EE] px-2.5 py-1.5">
        <Building2 size={15} className="shrink-0 text-[#1B4D2E]" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-semibold text-[#1A2B1A]">{org.name}</span>
          {org.barangay && <span className="block truncate text-[11px] text-[#5A6B5C]">{org.barangay}</span>}
        </span>
        <button type="button" onClick={() => onPick(null)} className="shrink-0 text-[12px] font-medium text-rose-600 hover:underline">Change</button>
      </div>
    )
  }
  return (
    <div ref={box} className="relative">
      <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A8BCA8]" aria-hidden="true" />
      <input type="text" className={`${bulkCellInputClasses} pl-8`} placeholder={`Search ${domain.orgLabel.toLowerCase()}…`} value={query}
        onChange={(e) => setQuery(e.target.value)} aria-label={`Search ${domain.orgLabel.toLowerCase()}`} />
      {query.trim() && (
        <div className="absolute z-40 mt-1 max-h-52 w-full min-w-64 overflow-y-auto rounded-xl border border-[#E2E8E2] bg-white shadow-lg">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">No organizations found.</p>
          ) : results.map((o) => (
            <button key={o.id} type="button" onClick={() => { onPick({ id: o.id, name: o.name, barangay: o.barangay }); setQuery(''); setResults([]) }}
              className="block w-full px-4 py-2.5 text-left transition-colors hover:bg-[#F5F7F5]">
              <span className="block text-xs font-semibold text-[#1A2B1A]">{o.name}</span>
              <span className="block text-[11px] text-[#7A8E7A]">{o.barangay}{o.member_count != null ? ` · ${o.member_count} member${o.member_count === 1 ? '' : 's'}` : ''}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function DistributionRow({ row, index, total, domain, error, today, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(row._id, { [field]: value })
  const cash = isCashType(row.assistance_type)
  const training = isTrainingType(row.assistance_type)
  const setForm = (field, value) => set(field, value)
  return (
    <>
      <tr className={`border-b border-[#F0F4F0] align-top max-md:block max-md:mb-3 max-md:rounded-xl max-md:border max-md:border-[#E2E8E2] max-md:p-3 ${error ? 'bg-rose-50/40' : 'max-md:bg-white'}`}>
        <td data-label="Row" className={`${CELL} text-center text-[13px] text-[#7A8E7A] max-md:text-left`} style={{ width: COL.index }}>{index + 1}</td>
        <td data-label={`${domain.orgLabel} *`} className={CELL} style={{ width: COL.org }}>
          <OrgPicker domain={domain} org={row.org} onPick={(org) => set('org', org)} />
        </td>
        <td data-label="Assistance type *" className={CELL} style={{ width: COL.type }}>
          <ComboboxWithOther
            options={domain.assistanceTypeOptions.filter((o) => o !== 'Other')}
            value={row.assistance_type}
            otherValue={row.assistance_type_other}
            onChange={(v) => onUpdate(row._id, withAssistanceType(row, v))}
            onOtherChange={(v) => set('assistance_type_other', v)}
            placeholder="Select type…"
            inputClassName={bulkCellInputClasses}
            chevronSize={13}
          />
        </td>
        <td data-label="Date given *" className={CELL} style={{ width: COL.date }}>
          <input type="date" className={bulkCellInputClasses} value={row.date_given} min={today} onChange={(e) => set('date_given', e.target.value)} />
        </td>
        <td data-label={cash ? 'Amount per member (₱) *' : training ? 'Duration' : 'Quantity per member'} className={CELL} style={{ width: COL.quantity }}>
          {cash ? (
            <DecimalInput decimals={2} className={bulkCellInputClasses} placeholder="0.00" value={row.cash_amount} onChange={(v) => set('cash_amount', v)} />
          ) : training ? (
            <p className="py-2 text-[12px] text-[#7A8E7A]">Set the days below.</p>
          ) : (
            <input className={bulkCellInputClasses} placeholder="e.g. 1 sack" value={row.quantity} onChange={(e) => set('quantity', e.target.value)} />
          )}
        </td>
        <td className="px-3 py-3 text-center max-md:block max-md:w-full! max-md:px-0 max-md:py-1 max-md:text-right" style={{ width: COL.remove }}>
          {total > 1 && (
            <button type="button" onClick={() => onRemove(row._id)} title="Remove row" className={REMOVE_BTN}>
              <Trash2 size={13} /> <span className="md:hidden">Remove row</span>
            </button>
          )}
        </td>
      </tr>
      <tr className={`border-b border-[#E2E8E2] max-md:block max-md:mb-3 ${error ? 'bg-rose-50/40' : ''}`}>
        <td colSpan={6} className="px-3 pb-4 max-md:block max-md:px-0">
          <div className="grid gap-3 rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3 md:grid-cols-2">
            <FormField label="Source Agency">
              <SourceAgencyMultiSelect value={row.source_agencies} onChange={(v) => set('source_agencies', v)} />
            </FormField>
            <TypeConditionalFields assistanceType={row.assistance_type} form={row} set={setForm} />
            <div className="md:col-span-2">
              <FormField label="Description">
                <textarea rows={2} className={baseInputClasses} value={row.description} onChange={(e) => set('description', e.target.value)} />
              </FormField>
            </div>
          </div>
        </td>
      </tr>
      {error && (
        <tr className="max-md:block">
          <td colSpan={6} className="px-3 pb-2.5 text-[12px] text-rose-600 max-md:block max-md:px-0">{error}</td>
        </tr>
      )}
    </>
  )
}

export default function DistributeMultiplePage({ domain, backTo, backLabel }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const today = todayISO()
  const nextId = useRef(2)
  const [rows, setRows] = useState(() => [makeDistributionRow(1, today)])
  const [step, setStep] = useState('form') // 'form' | 'confirm' | 'result'
  const [rowErrors, setRowErrors] = useState({})
  const [error, setError] = useState('')
  const [previews, setPreviews] = useState([])
  const [selected, setSelected] = useState([])     // per row: Set of person ids that will receive it
  const [open, setOpen] = useState(() => new Set())   // review: rows whose member list is open
  const [outcomes, setOutcomes] = useState([])
  const [isBusy, setIsBusy] = useState(false)

  const updateRow = (id, patch) => setRows((rs) => rs.map((r) => (r._id === id ? { ...r, ...patch } : r)))
  const removeRow = (id) => setRows((rs) => rs.filter((r) => r._id !== id))
  const addRow = (copy) => {
    if (rows.length >= MAX_DISTRIBUTION_ROWS) { setError(`You can distribute to at most ${MAX_DISTRIBUTION_ROWS} organizations at a time.`); return }
    setError('')
    setRows((rs) => [...rs, makeDistributionRow(nextId.current++, today, copy ? rs[rs.length - 1] : null)])
  }

  const handleReview = async (e) => {
    e.preventDefault()
    setError('')
    const problems = validateRows(rows, { today })
    setRowErrors(problems)
    if (Object.keys(problems).length) { setError('Please fix the highlighted rows.'); return }
    setIsBusy(true)
    try {
      const answers = await Promise.all(rows.map((row) => api.post(domain.distributeUrl(row.org.id), distributionPayload(row, { dryRun: true }))))
      const found = answers.map((a) => a.data)
      setPreviews(found)
      setSelected(found.map((p) => new Set(eligibleIds(p))))
      setOpen(new Set())
      setStep('confirm')
    } catch (err) {
      const data = err?.response?.data
      setError((data && typeof data === 'object' && Object.values(data).flat()[0]) || 'Could not check these distributions. Nothing was saved.')
    } finally {
      setIsBusy(false)
    }
  }

  const toggleMember = (index, personId) => setSelected((all) => all.map((s, i) => {
    if (i !== index) return s
    const next = new Set(s)
    if (next.has(personId)) next.delete(personId)
    else next.add(personId)
    return next
  }))
  const setAll = (index, ids) => setSelected((all) => all.map((s, i) => (i === index ? new Set(ids) : s)))
  const toggleOpen = (id) => setOpen((o) => {
    const next = new Set(o)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const totals = reviewTotals(previews, selected)
  const handleConfirm = async () => {
    setIsBusy(true)
    setError('')
    const done = []
    for (let i = 0; i < rows.length; i += 1) {
      const ids = [...selected[i]].filter((id) => eligibleIds(previews[i]).includes(id))
      if (ids.length === 0) { done.push({ skipped: true, org: rows[i].org }); continue }
      try {
        const r = await api.post(domain.distributeUrl(rows[i].org.id), distributionPayload(rows[i], { memberIds: ids }))
        done.push({ ...r.data, org: rows[i].org })
      } catch (err) {
        const data = err?.response?.data
        done.push({ failed: (data && typeof data === 'object' && Object.values(data).flat()[0]) || 'This organization could not be saved.', org: rows[i].org })
      }
    }
    setOutcomes(done)
    setStep('result')
    setIsBusy(false)
    const made = outcomeTotals(done).created
    showToast(`${made} assistance record${made === 1 ? '' : 's'} created.`, made > 0 ? 'success' : 'error')
  }

  const startNew = () => {
    setRows([makeDistributionRow(1, today)])
    nextId.current = 2
    setPreviews([]); setSelected([]); setOutcomes([]); setRowErrors({}); setError(''); setStep('form')
  }

  const back = (
    <button type="button" onClick={() => navigate(backTo)} className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline max-md:min-h-[40px]">
      <ArrowLeft size={14} /> {backLabel}
    </button>
  )

  return (
    <PageLayout title="Distribute to Multiple Organizations" subtitle="Each row is one organization and the assistance its members receive. Review checks every row before anything is saved.">
      {back}

      {step === 'form' && (
        <form onSubmit={handleReview} className="space-y-5">
          <div className="flex flex-wrap items-center gap-4 text-[12px] text-[#4A5E4A]">
            <span className="flex items-center gap-1"><span className="text-rose-500">*</span> Required field</span>
            <span>Every current member of an organization receives its row; you can untick members in the review.</span>
          </div>

          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white max-md:overflow-visible max-md:border-0 max-md:bg-transparent">
            <table className="w-full table-fixed text-sm md:min-w-[1000px] max-md:block">
              <thead className="bg-[#1B4D2E] text-white max-md:hidden">
                <tr>
                  <th className={bulkThCenterClasses} style={{ width: COL.index }}>#</th>
                  <th className={bulkThClasses} style={{ width: COL.org }}>{domain.orgLabel} <span className="text-white/70">*</span></th>
                  <th className={bulkThClasses} style={{ width: COL.type }}>Assistance Type <span className="text-white/70">*</span></th>
                  <th className={bulkThClasses} style={{ width: COL.date }}>Date Given <span className="text-white/70">*</span></th>
                  <th className={bulkThClasses} style={{ width: COL.quantity }}>Quantity / Amount</th>
                  <th className={bulkThCenterClasses} style={{ width: COL.remove }} />
                </tr>
              </thead>
              <tbody className="max-md:block">
                {rows.map((row, i) => (
                  <DistributionRow key={row._id} row={row} index={i} total={rows.length} domain={domain} today={today} error={rowErrors[row._id]}
                    onUpdate={updateRow} onRemove={removeRow} />
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button type="button" onClick={() => addRow(false)} className="inline-flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3.5 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]">
              <Plus size={14} /> Add Row
            </button>
            <button type="button" onClick={() => addRow(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3.5 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#EBF5EE]">
              <Copy size={14} /> Add Row Like the Last
            </button>
            <span className="text-[12.5px] text-[#7A8E7A]">{rows.length} organization{rows.length === 1 ? '' : 's'}</span>
          </div>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
            <Button type="button" variant="outline" onClick={() => navigate(backTo)}>Cancel</Button>
            <Button type="submit" isLoading={isBusy}>Review Distribution <ArrowRight size={14} className="ml-0.5" aria-hidden="true" /></Button>
          </div>
        </form>
      )}

      {step === 'confirm' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#1B4D2E] p-5 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">You are about to distribute</p>
            <p className="mt-1 text-[24px] font-semibold leading-tight">{totals.records} record{totals.records === 1 ? '' : 's'}</p>
            <p className="text-[14px] text-[#D7E7D9]">to the members of {totals.organizations} of {rows.length} organization{rows.length === 1 ? '' : 's'}{totals.blocked > 0 ? ` · ${totals.blocked} blocked by the 30-day rule` : ''}</p>
          </div>

          <ul className="space-y-3" aria-label="Organizations to distribute to">
            {rows.map((row, i) => {
              const preview = previews[i]
              const eligible = eligibleIds(preview)
              const blocked = (preview?.results || []).filter((m) => m.status === 'would_block')
              const chosen = [...selected[i]].filter((id) => eligible.includes(id)).length
              const isOpen = open.has(row._id)
              const quantity = quantityText(row) || (isTrainingType(row.assistance_type) ? `${row.training_duration_days} day(s)` : '')
              return (
                <li key={row._id} className="rounded-2xl border border-[#E2E8E2] bg-white">
                  <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold text-[#1A2B1A]">#{i + 1} {row.org.name}</p>
                      <p className="text-[12.5px] text-[#5A6B5C]">
                        {typeName(row)}{quantity ? ` · ${quantity}` : ''} · {formatDateLong(row.date_given)}
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusPill tone={chosen > 0 ? 'green' : 'slate'}>{chosen} of {preview?.member_count ?? 0} will receive</StatusPill>
                      {blocked.length > 0 && <StatusPill tone="rose">{blocked.length} blocked</StatusPill>}
                    </div>
                  </div>
                  {chosen === 0 && (
                    <p className="flex items-center gap-1.5 border-t border-[#F0F4F0] bg-amber-50 px-4 py-2 text-[12.5px] text-amber-800">
                      <AlertTriangle size={14} aria-hidden="true" /> Nobody is selected, so this organization is skipped.
                    </p>
                  )}
                  <div className="border-t border-[#F0F4F0] px-4 py-2">
                    <button type="button" onClick={() => toggleOpen(row._id)} aria-expanded={isOpen} className="inline-flex min-h-9 items-center gap-1 text-[12.5px] font-medium text-[#1E5637] hover:underline">
                      Choose members <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </button>
                    {isOpen && (
                      <div className="mt-1 pb-2">
                        <div className="mb-1 flex gap-3 text-[12px] font-medium">
                          <button type="button" className="text-[#1E5637] hover:underline" onClick={() => setAll(i, eligible)}>Select all</button>
                          <button type="button" className="text-[#7A8E7A] hover:underline" onClick={() => setAll(i, [])}>Clear</button>
                        </div>
                        <ul className="max-h-56 divide-y divide-[#EEF2EE] overflow-y-auto rounded-lg border border-[#E2E8E2]" aria-label={`Members of ${row.org.name}`}>
                          {(preview?.results || []).map((m) => {
                            const isBlocked = m.status === 'would_block'
                            return (
                              <li key={m.person_id} className={isBlocked ? 'bg-rose-50/50' : ''}>
                                <label className={`flex items-start gap-3 px-3 py-2 ${isBlocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-[#F5F7F5]'}`}>
                                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1B4D2E]" disabled={isBlocked} checked={!isBlocked && selected[i].has(m.person_id)}
                                    onChange={() => toggleMember(i, m.person_id)} aria-label={`${isBlocked ? 'Blocked: ' : ''}${m.name}`} />
                                  <span className="min-w-0">
                                    <span className="block text-[13px] font-medium text-[#1A2B1A]">{m.name}</span>
                                    {m.id_number && <span className="block text-[12px] text-[#7A8E7A]">{m.id_number}</span>}
                                    {isBlocked && <span className="block text-[12px] text-rose-700">{m.reason}</span>}
                                  </span>
                                </label>
                              </li>
                            )
                          })}
                        </ul>
                      </div>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>

          {error && <p role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-600">{error}</p>}

          <div className="flex flex-col-reverse items-stretch gap-2 border-t border-[#F0F4F0] pt-4 sm:flex-row sm:items-center sm:justify-between">
            <button type="button" onClick={() => setStep('form')} className="inline-flex items-center justify-center gap-1 py-1 text-[13px] font-medium text-[#7A8E7A] transition-colors hover:text-[#1A2B1A]">
              <ArrowLeft size={14} aria-hidden="true" /> Back to Edit
            </button>
            <Button type="button" isLoading={isBusy} disabled={totals.records === 0} onClick={handleConfirm}>
              Confirm and Distribute ({totals.records})
            </Button>
          </div>
        </div>
      )}

      {step === 'result' && (() => {
        const sum = outcomeTotals(outcomes)
        return (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CC] bg-[#EBF5EE] p-4">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1E5637]" aria-hidden="true" />
              <div>
                <p className="text-[14px] font-semibold text-[#1E5637]">Distribution Complete</p>
                <p className="mt-0.5 text-[13px] text-[#1A2B1A]">
                  <span className="font-semibold">{sum.created}</span> record{sum.created === 1 ? '' : 's'} created in {sum.organizations} organization{sum.organizations === 1 ? '' : 's'},{' '}
                  <span className="font-semibold text-rose-700">{sum.blocked}</span> blocked,{' '}
                  <span className={sum.errors + sum.failed ? 'font-semibold text-rose-700' : 'font-semibold'}>{sum.errors + sum.failed}</span> error{sum.errors + sum.failed === 1 ? '' : 's'}
                </p>
              </div>
            </div>
            <ul className="divide-y divide-[#EEF2EE] overflow-hidden rounded-2xl border border-[#E2E8E2] bg-white" aria-label="Outcome per organization">
              {outcomes.map((o, i) => {
                const results = o.results || []
                const count = (s) => results.filter((r) => r.status === s).length
                const problems = results.filter((r) => r.status !== 'created')
                return (
                  <li key={i} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-[13.5px] font-semibold text-[#1A2B1A]">{o.org.name}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {o.skipped && <StatusPill tone="slate">Skipped</StatusPill>}
                        {o.failed && <StatusPill tone="rose">Not saved</StatusPill>}
                        {count('created') > 0 && <StatusPill tone="green">{count('created')} created</StatusPill>}
                        {count('blocked') > 0 && <StatusPill tone="rose">{count('blocked')} blocked</StatusPill>}
                        {count('error') > 0 && <StatusPill tone="rose">{count('error')} error</StatusPill>}
                      </div>
                    </div>
                    {o.failed && <p className="mt-1 text-[12.5px] text-rose-600">{o.failed}</p>}
                    {problems.length > 0 && (
                      <ul className="mt-1 space-y-0.5">
                        {problems.map((r) => <li key={r.person_id} className="text-[12px] text-rose-600"><span className="font-medium">{r.name}:</span> {r.reason}</li>)}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
              <Button type="button" variant="outline" onClick={() => navigate(backTo)}>{backLabel}</Button>
              <Button type="button" onClick={startNew}>Start New Distribution</Button>
            </div>
          </div>
        )
      })()}
    </PageLayout>
  )
}
