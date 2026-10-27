import { useCallback, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronDown, Printer, Users } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AvatarInitials from '../../components/UI/AvatarInitials.jsx'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SectionEyebrow from '../../components/UI/SectionEyebrow.jsx'
import StatTile from '../../components/UI/StatTile.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import StepIndicator from '../../components/UI/StepIndicator.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import { todayISO } from '../../utils/localDate.js'
import { printSpec } from '../Monitoring/disasterReportDocument.js'
import AssistanceDetailsFields from './AssistanceDetailsFields.jsx'
import RecipientTable from './RecipientTable.jsx'
import { buildAssistanceReportSpec } from './assistanceReport.js'
import {
  MAX_RECIPIENTS, assistanceFormProblem, eligibleIds, makeAssistanceForm, organizationRequest, outcomeTotals, peopleRequest, personOutcomeTotals,
  quantityText, reportRecords, reviewTotals, toggleInMap, typeName,
} from './distributeFlow.js'

// Giving assistance from the Assistance pages, one window and one form for everyone:
//   mode 'people'         the farmers (or fisherfolk) ticked in the table of registered ones;
//   mode 'organizations'  the members of the organizations ticked in the table of registered organizations.
// Three steps: the details and the recipients -> a review that asks the server what would happen (nothing is saved; who is blocked by the
// 30-day rule or refused) and lets you untick people -> the saved result, with the Assistance Distribution Report ready to print.
// `memberUrl` (people): an organization account chooses among its own members only. `fixedOrg` (organizations): an organization account
// gives to its own organization, so there is nothing to choose.
const STEPS = [
  { key: 'form',    label: 'Distribution Details' },
  { key: 'confirm', label: 'Review & Confirm' },
  { key: 'result',  label: 'Distribution Results' },
]
const STEP_INDEX = { form: 0, confirm: 1, result: 2 }
const STATUS_TONE = { created: 'green', blocked: 'rose', error: 'rose' }
const STATUS_LABEL = { created: 'Created', blocked: 'Blocked', error: 'Error' }

function formatDateLong(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${iso}T00:00:00`))
}

const firstMessage = (data, fallback) => {
  if (data && typeof data === 'object') {
    const value = Object.values(data).flat()[0]
    if (typeof value === 'string') return value
  }
  return fallback
}

export default function DistributeAssistanceModal({ domain, mode = 'organizations', fixedOrg = null, memberUrl = null, onClose, onSuccess }) {
  const { showToast } = useToast()
  const today = todayISO()
  const people = mode === 'people'
  const [step, setStep] = useState('form')
  // The details and the ticked recipients are a draft: still here when the window is opened again (see hooks/useDraftState.js).
  const [work, setWork, draft] = useDraftState(
    `distribute-assistance:${domain.key}:${mode}${fixedOrg ? ':own' : ''}${memberUrl ? ':members' : ''}`,
    () => ({ form: makeAssistanceForm(today), picked: fixedOrg ? [[fixedOrg.id, fixedOrg]] : [] }),
  )
  const { form } = work
  const setForm = useCallback((next) => setWork((w) => ({ ...w, form: typeof next === 'function' ? next(w.form) : next })), [setWork])
  const picked = useMemo(() => new Map(work.picked), [work.picked])   // id -> person / organization
  const setPicked = useCallback((next) => setWork((w) => {
    const now = typeof next === 'function' ? next(new Map(w.picked)) : next
    return { ...w, picked: [...now] }
  }), [setWork])
  const [previews, setPreviews] = useState([])      // organizations: one answer each; people: one answer with every person
  const [selected, setSelected] = useState([])      // a Set of person ids per preview
  const [open, setOpen] = useState(() => new Set())
  const [outcomes, setOutcomes] = useState([])      // organizations: one per organization; people: [{ results }]
  const [isBusy, setIsBusy] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState('')

  const loadRecipients = useCallback((query) => {
    if (people) return memberUrl ? domain.loadOwnMembers(memberUrl, query) : domain.loadPeople(query)
    return domain.loadOrganizations(query)
  }, [people, memberUrl, domain])

  const chosen = [...picked.values()]
  const recipientNoun = people ? domain.peopleLabel : 'organizations'

  // ── step 1 -> 2: check the form, then ask the server what would happen
  const handleReview = async (e) => {
    e.preventDefault()
    setError('')
    const problem = assistanceFormProblem(form, { today })
    if (problem) { setError(problem); return }
    if (chosen.length === 0) { setError(`Tick at least one ${people ? domain.personLabel.toLowerCase() : 'organization'} in the table.`); return }
    if (chosen.length > MAX_RECIPIENTS) { setError(`You can choose at most ${MAX_RECIPIENTS} at a time.`); return }
    setIsBusy(true)
    try {
      if (people) {
        const { data } = await api.post(domain.bulkUrl, peopleRequest(form, { idsKey: domain.idsKey, ids: chosen.map((p) => p.id), descriptionKey: domain.descriptionKey, dryRun: true, allowSeedFertilizer: domain.allowSeedFertilizer }))
        setPreviews([data])
        setSelected([new Set(eligibleIds(data))])
      } else {
        const answers = await Promise.all(chosen.map((org) => api.post(domain.distributeUrl(org.id), organizationRequest(form, { dryRun: true, allowSeedFertilizer: domain.allowSeedFertilizer }))))
        const found = answers.map((a) => a.data)
        setPreviews(found)
        setSelected(found.map((p) => new Set(eligibleIds(p))))
      }
      setOpen(new Set())
      setStep('confirm')
    } catch (err) {
      setError(firstMessage(err?.response?.data, 'Could not check this distribution. Nothing was saved.'))
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

  // ── step 2 -> 3: save
  const handleConfirm = async () => {
    setIsBusy(true)
    setError('')
    try {
      if (people) {
        const ids = [...selected[0]].filter((id) => eligibleIds(previews[0]).includes(id))
        const { data } = await api.post(domain.bulkUrl, peopleRequest(form, { idsKey: domain.idsKey, ids, descriptionKey: domain.descriptionKey, allowSeedFertilizer: domain.allowSeedFertilizer }))
        setOutcomes([{ results: data.results }])
        const made = personOutcomeTotals(data.results).created
        showToast(`${made} assistance record${made === 1 ? '' : 's'} created.`, made > 0 ? 'success' : 'error')
      } else {
        const done = []
        for (let i = 0; i < chosen.length; i += 1) {
          const ids = [...selected[i]].filter((id) => eligibleIds(previews[i]).includes(id))
          if (ids.length === 0) { done.push({ skipped: true, org: chosen[i] }); continue }
          try {
            const r = await api.post(domain.distributeUrl(chosen[i].id), organizationRequest(form, { memberIds: ids, allowSeedFertilizer: domain.allowSeedFertilizer }))
            done.push({ ...r.data, org: chosen[i] })
          } catch (err) {
            done.push({ failed: firstMessage(err?.response?.data, 'This organization could not be saved.'), org: chosen[i] })
          }
        }
        setOutcomes(done)
        const made = outcomeTotals(done).created
        showToast(`${made} assistance record${made === 1 ? '' : 's'} created.`, made > 0 ? 'success' : 'error')
      }
      setStep('result')
      draft.clear()
      onSuccess?.()
    } catch (err) {
      setError(firstMessage(err?.response?.data, 'Failed to distribute the assistance.'))
    } finally {
      setIsBusy(false)
    }
  }

  const handleStartNew = () => {
    draft.discard()
    setPreviews([]); setSelected([]); setOutcomes([]); setOpen(new Set()); setError(''); setStep('form')
  }

  // The report of what was just created, built from the same answers the result step shows.
  const reportOf = () => {
    const results = outcomes.flatMap((o) => (o.results || []).map((r) => ({ ...r, organization_name: o.org?.name })))
    const records = reportRecords(results, form, { organizationName: fixedOrg?.name || '' })
    return { records, spec: records.length ? buildAssistanceReportSpec({ domain: domain.reportDomain, records, confirmedOn: today, dateLabel: 'Date Distributed' }) : null }
  }
  const { spec: reportSpec } = step === 'result' ? reportOf() : { spec: null }
  const print = async () => {
    setIsPrinting(true)
    try {
      await printSpec(reportSpec)
    } catch {
      showToast('Could not open the report for printing.', 'error')
    } finally {
      setIsPrinting(false)
    }
  }

  const footer = step === 'form' ? (
    <>
      <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      <Button type="submit" form="distribute-assistance-form" isLoading={isBusy}>
        Review Distribution <ArrowRight size={14} className="ml-0.5" aria-hidden="true" />
      </Button>
    </>
  ) : step === 'confirm' ? (
    <div className="flex w-full flex-col-reverse items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
      <button type="button" onClick={() => setStep('form')} className="inline-flex items-center justify-center gap-1 py-1 text-[13px] font-medium text-[#7A8E7A] transition-colors hover:text-[#1A2B1A]">
        <ArrowLeft size={14} aria-hidden="true" /> Back to Edit
      </button>
      <Button type="button" isLoading={isBusy} disabled={totals.records === 0} onClick={handleConfirm}>
        Confirm and Distribute ({totals.records})
      </Button>
    </div>
  ) : (
    <>
      <Button type="button" variant="outline" onClick={onClose}>Close</Button>
      <Button type="button" variant="outline" icon={Printer} isLoading={isPrinting} disabled={!reportSpec} onClick={print}>Print Report</Button>
      <Button type="button" onClick={handleStartNew}>Start New Distribution</Button>
    </>
  )

  const title = people
    ? (memberUrl ? 'Distribute to Members' : `Distribute ${domain.personLabel} Assistance`)
    : (fixedOrg ? 'Distribute to All Members' : 'Distribute to Organizations')
  const subtitle = people
    ? `Give one assistance to the ${domain.peopleLabel} you tick below, in one step.`
    : (fixedOrg ? 'Give the same assistance to the members you choose, in one step.' : `Give one assistance to the members of the ${domain.orgLabel.toLowerCase()}s you tick below.`)

  return (
    <ModalShell title={title} subtitle={subtitle} icon={people ? Users : Building2} onClose={onClose} maxWidth="max-w-4xl" footer={footer}>
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'form' && (
        <form id="distribute-assistance-form" onSubmit={handleReview} className="stagger-item mt-6 space-y-4">
          <DraftBanner draft={draft} />
          <AssistanceDetailsFields domain={domain} form={form} setForm={setForm} today={today} />

          {fixedOrg ? (
            <div className="flex items-start gap-3 rounded-xl border border-[#C8D5C8] bg-[#EBF5EE] p-4">
              <Building2 size={18} className="mt-0.5 shrink-0 text-[#1B4D2E]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#1A2B1A]">{fixedOrg.name}</p>
                <p className="text-[12px] text-[#5A6B5C]">{fixedOrg.barangay} · you choose the members in the review</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3 rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
              <SectionEyebrow className="mb-0">{people ? (memberUrl ? 'Members' : `Registered ${domain.personLabel}s`) : `Registered ${domain.orgLabel}s`}</SectionEyebrow>
              <p className="text-[12.5px] text-[#4A5E4A]">
                {people ? `Search, then tick every ${domain.personLabel.toLowerCase()} who receives this assistance.` : 'Search, then tick every organization whose members receive this assistance. You can untick members in the review.'}
              </p>
              <RecipientTable
                noun={recipientNoun}
                columns={people ? domain.personColumns : domain.orgColumns}
                searchPlaceholder={people ? 'Search by name, RSBSA number or barangay…' : 'Search organizations by name or barangay…'}
                load={loadRecipients}
                picked={picked}
                onToggle={(record) => setPicked((m) => toggleInMap(m, record))}
                onPickPage={(rows) => setPicked((m) => new Map([...m, ...rows.map((r) => [r.id, r])]))}
                onClear={() => setPicked(new Map())}
              />
            </div>
          )}

          {error && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </form>
      )}

      {step === 'confirm' && (
        <div className="stagger-item mt-6 space-y-4">
          <SectionEyebrow>Confirm Distribution</SectionEyebrow>
          <div className="rounded-2xl bg-[#1B4D2E] p-6 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">You Are About to Distribute</p>
            <p className="mt-2 text-[26px] font-semibold leading-tight">{quantityText(form) || (form.training_duration_days ? `${form.training_duration_days} day(s)` : '—')}</p>
            <p className="text-[15px] font-medium text-[#D7E7D9]">{typeName(form)}</p>
            <div className="my-4 border-t border-white/15" />
            <p className="text-[13px] text-[#B7CBBB]">
              To {totals.records} selected {people ? (totals.records === 1 ? domain.personLabel.toLowerCase() : domain.peopleLabel) : `member${totals.records === 1 ? '' : 's'}`}
              {!people && ` of ${totals.organizations} organization${totals.organizations === 1 ? '' : 's'}`}
            </p>
            <p className="mt-0.5 text-[13px] text-[#B7CBBB]">on <span className="font-semibold text-white">{formatDateLong(form.date_given)}</span></p>
          </div>

          {people ? (
            <PeopleReview preview={previews[0]} selected={selected[0]} onToggle={(id) => toggleMember(0, id)} onSetAll={(ids) => setAll(0, ids)} />
          ) : (
            <ul className="space-y-3" aria-label="Organizations to distribute to">
              {chosen.map((org, i) => (
                <OrganizationReview key={org.id} org={org} index={i} preview={previews[i]} selected={selected[i]} isOpen={open.has(org.id)}
                  onToggleOpen={() => toggleOpen(org.id)} onToggle={(id) => toggleMember(i, id)} onSetAll={(ids) => setAll(i, ids)} />
              ))}
            </ul>
          )}

          {totals.blocked > 0 && !people && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {totals.blocked} member{totals.blocked === 1 ? '' : 's'} already received this assistance type from another organization within 30 days, so they are blocked.
            </p>
          )}
          {error && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </div>
      )}

      {step === 'result' && (
        <Result people={people} outcomes={outcomes} domain={domain} />
      )}
    </ModalShell>
  )
}

// ── the review of people: who would receive it, and why anyone would not
function PeopleReview({ preview, selected, onToggle, onSetAll }) {
  const results = preview?.results || []
  const eligible = eligibleIds(preview)
  const refused = results.filter((r) => r.status !== 'would_create')
  const chosenCount = [...selected].filter((id) => eligible.includes(id)).length
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatTile value={results.length} label="Chosen" />
        <StatTile value={chosenCount} label="Will receive" />
        <StatTile value={refused.length} label="Cannot receive" />
      </div>
      <div className="rounded-2xl border border-[#E2E8E2] bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#E2E8E2] px-4 py-3">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">Recipients <span className="font-normal text-[#4A5A4C]">— {chosenCount} of {eligible.length} selected</span></p>
          <div className="flex gap-3 text-[12px] font-medium">
            <button type="button" className="text-[#1E5637] hover:underline" onClick={() => onSetAll(eligible)}>Select all</button>
            <button type="button" className="text-[#7A8E7A] hover:underline" onClick={() => onSetAll([])}>Clear</button>
          </div>
        </div>
        <ul className="max-h-72 divide-y divide-[#EEF2EE] overflow-y-auto" aria-label="People to receive this assistance">
          {results.map((m) => {
            const refusedRow = m.status !== 'would_create'
            return (
              <li key={m.person_id} className={refusedRow ? 'bg-rose-50/50' : ''}>
                <label className={`flex items-start gap-3 px-4 py-2.5 ${refusedRow ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-[#F5F7F5]'}`}>
                  <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1B4D2E]" disabled={refusedRow} checked={!refusedRow && selected.has(m.person_id)}
                    onChange={() => onToggle(m.person_id)} aria-label={`${refusedRow ? 'Cannot receive: ' : ''}${m.name || 'Unknown'}`} />
                  <span className="min-w-0">
                    <span className="block text-[13px] font-medium text-[#1A2B1A]">{m.name || 'Unknown'}</span>
                    <span className="block text-[12px] text-[#7A8E7A]">{[m.id_number, m.barangay].filter(Boolean).join(' · ')}</span>
                    {refusedRow && <span className="block text-[12px] text-rose-700">{m.reason}</span>}
                  </span>
                </label>
              </li>
            )
          })}
        </ul>
      </div>
    </>
  )
}

// ── the review of one organization: how many of its members will receive it, with the members to untick
function OrganizationReview({ org, index, preview, selected, isOpen, onToggleOpen, onToggle, onSetAll }) {
  const eligible = eligibleIds(preview)
  const blocked = (preview?.results || []).filter((m) => m.status === 'would_block')
  const count = [...selected].filter((id) => eligible.includes(id)).length
  return (
    <li className="rounded-2xl border border-[#E2E8E2] bg-white">
      <div className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1A2B1A]">#{index + 1} {org.name}</p>
          {org.barangay && <p className="text-[12.5px] text-[#5A6B5C]">{org.barangay}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <StatusPill tone={count > 0 ? 'green' : 'slate'}>{count} of {preview?.member_count ?? 0} will receive</StatusPill>
          {blocked.length > 0 && <StatusPill tone="rose">{blocked.length} blocked</StatusPill>}
        </div>
      </div>
      {count === 0 && (
        <p className="flex items-center gap-1.5 border-t border-[#F0F4F0] bg-amber-50 px-4 py-2 text-[12.5px] text-amber-800">
          <AlertTriangle size={14} aria-hidden="true" /> Nobody is selected, so this organization is skipped.
        </p>
      )}
      <div className="border-t border-[#F0F4F0] px-4 py-2">
        <button type="button" onClick={onToggleOpen} aria-expanded={isOpen} className="inline-flex min-h-9 items-center gap-1 text-[12.5px] font-medium text-[#1E5637] hover:underline">
          Choose members <ChevronDown size={14} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
        </button>
        {isOpen && (
          <div className="mt-1 pb-2">
            <div className="mb-1 flex gap-3 text-[12px] font-medium">
              <button type="button" className="text-[#1E5637] hover:underline" onClick={() => onSetAll(eligible)}>Select all</button>
              <button type="button" className="text-[#7A8E7A] hover:underline" onClick={() => onSetAll([])}>Clear</button>
            </div>
            <ul className="max-h-56 divide-y divide-[#EEF2EE] overflow-y-auto rounded-lg border border-[#E2E8E2]" aria-label={`Members of ${org.name}`}>
              {(preview?.results || []).map((m) => {
                const isBlocked = m.status === 'would_block'
                return (
                  <li key={m.person_id} className={isBlocked ? 'bg-rose-50/50' : ''}>
                    <label className={`flex items-start gap-3 px-3 py-2 ${isBlocked ? 'cursor-not-allowed opacity-70' : 'cursor-pointer hover:bg-[#F5F7F5]'}`}>
                      <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#1B4D2E]" disabled={isBlocked} checked={!isBlocked && selected.has(m.person_id)}
                        onChange={() => onToggle(m.person_id)} aria-label={`${isBlocked ? 'Blocked: ' : ''}${m.name}`} />
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
}

// ── the result: what was created, who was refused and why
function Result({ people, outcomes, domain }) {
  const [filter, setFilter] = useState('all')
  if (people) {
    const results = outcomes[0]?.results || []
    const sum = personOutcomeTotals(results)
    const tabs = [{ key: 'all', label: `All ${results.length}` }, { key: 'created', label: `${sum.created} Created` }, ...(sum.errors ? [{ key: 'error', label: `${sum.errors} Error` }] : [])]
    const shown = results.filter((r) => filter === 'all' || r.status === filter)
    return (
      <div className="stagger-item mt-6 space-y-4">
        <Banner>
          <span className="font-semibold">{sum.created}</span> record{sum.created === 1 ? '' : 's'} created,{' '}
          <span className={sum.errors ? 'font-semibold text-rose-700' : 'font-semibold'}>{sum.errors}</span> error{sum.errors === 1 ? '' : 's'}
        </Banner>
        <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <SectionEyebrow className="mb-0">Per-{domain.personLabel} Outcome</SectionEyebrow>
            <div className="flex flex-wrap gap-1.5">
              {tabs.map((t) => (
                <button key={t.key} type="button" onClick={() => setFilter(t.key)}
                  className={'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors max-md:min-h-[36px] ' + (filter === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-[#F0F4F0] text-[#5A6B5C] hover:bg-[#E2E8E2]')}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
          <div className="-mx-5 divide-y divide-[#F0F4F0]">
            {shown.map((r) => (
              <div key={r.person_id} className="flex items-center gap-3 px-5 py-3">
                <AvatarInitials name={r.name || '?'} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[13px] font-medium text-[#1A2B1A]">{r.name || 'Unknown'}</p>
                  <p className="text-[11px] text-[#A8BCA8]">{[r.id_number, r.barangay].filter(Boolean).join(' · ')}</p>
                  {r.reason && <p className="mt-0.5 text-[12px] text-rose-600">{r.reason}</p>}
                </div>
                <StatusPill tone={STATUS_TONE[r.status] || 'slate'}>{STATUS_LABEL[r.status] || r.status}</StatusPill>
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }
  const sum = outcomeTotals(outcomes)
  return (
    <div className="stagger-item mt-6 space-y-4">
      <Banner>
        <span className="font-semibold">{sum.created}</span> record{sum.created === 1 ? '' : 's'} created in {sum.organizations} organization{sum.organizations === 1 ? '' : 's'},{' '}
        <span className="font-semibold text-rose-700">{sum.blocked}</span> blocked,{' '}
        <span className={sum.errors + sum.failed ? 'font-semibold text-rose-700' : 'font-semibold'}>{sum.errors + sum.failed}</span> error{sum.errors + sum.failed === 1 ? '' : 's'}
      </Banner>
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
    </div>
  )
}

function Banner({ children }) {
  return (
    <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CC] bg-[#EBF5EE] p-4">
      <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1E5637]" aria-hidden="true" />
      <div>
        <p className="text-[14px] font-semibold text-[#1E5637]">Distribution Complete</p>
        <p className="mt-0.5 text-[13px] text-[#1A2B1A]">{children}</p>
        <p className="mt-1 text-[11px] text-[#5A6B5C]">Press Print Report below to print the Assistance Distribution Report now.</p>
      </div>
    </div>
  )
}
