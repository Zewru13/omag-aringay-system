import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, ChevronDown, Printer, Users } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AvatarInitials from '../../components/UI/AvatarInitials.jsx'
import Button from '../../components/UI/Button.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { FormSection } from '../../components/UI/FormTable.jsx'
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
import { scheduleText } from './assistanceStatus.js'
import {
  MAX_RECIPIENTS, assistanceLines, assistanceLinesProblem, eligibleIds, lineSummary, makeAssistanceForm, organizationRequest, outcomeCreated, outcomeTotals, peopleRequest,
  personOutcomeTotals, quantityText, repeatWarningCount, reportRecords, reviewTotalsAll, toggleInMap, typeName,
} from './distributeFlow.js'

// Giving assistance from the Assistance pages, one window and one form for everyone (one or several assistance at a time, to the same recipients):
//   mode 'people'         the farmers (or fisherfolk) ticked in the table of registered ones;
//   mode 'organizations'  the members of the organizations ticked in the table of registered organizations.
// Three steps: the details and the recipients -> a review that asks the server what would happen (nothing is saved; who is blocked by the
// 30-day rule or refused) and lets you untick people -> the saved result, with the Assistance Distribution Report ready to print. With several
// assistance, the review and the result have a section for each one; every assistance is checked and saved as a distribution of its own.
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

const firstMessage = (data, fallback) => {
  if (data && typeof data === 'object') {
    const value = Object.values(data).flat()[0]
    if (typeof value === 'string') return value
  }
  return fallback
}

export default function DistributeAssistanceModal({ domain, mode = 'organizations', fixedOrg = null, initialOrg = null, memberUrl = null, onClose, onSuccess }) {
  const { showToast } = useToast()
  const today = todayISO()
  const people = mode === 'people'
  const [step, setStep] = useState('form')
  // The details and the ticked recipients are a draft: still here when the window is opened again (see hooks/useDraftState.js).
  const [work, setWork, draft] = useDraftState(
    `distribute-assistance:${domain.key}:${mode}${fixedOrg ? ':own' : ''}${memberUrl ? ':members' : ''}`,
    () => ({ form: makeAssistanceForm(today), more: [], picked: fixedOrg ? [[fixedOrg.id, fixedOrg]] : [] }),
  )
  const { form } = work
  const more = useMemo(() => work.more || [], [work.more])   // the extra assistance (a draft saved before they existed has none)
  const setForm = useCallback((next) => setWork((w) => ({ ...w, form: typeof next === 'function' ? next(w.form) : next })), [setWork])
  const setMore = useCallback((next) => setWork((w) => ({ ...w, more: typeof next === 'function' ? next(w.more || []) : next })), [setWork])
  const lines = useMemo(() => assistanceLines(form, more), [form, more])
  const picked = useMemo(() => new Map(work.picked), [work.picked])   // id -> person / organization
  const setPicked = useCallback((next) => setWork((w) => {
    const now = typeof next === 'function' ? next(new Map(w.picked)) : next
    return { ...w, picked: [...now] }
  }), [setWork])
  // `initialOrg`: the organization chosen before the window opened ("Add assistance" in the organization table's menu): ticked once, kept if already.
  useEffect(() => {
    if (initialOrg && !picked.has(initialOrg.id)) setPicked((p) => p.set(initialOrg.id, initialOrg))
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOrg?.id])
  // For each assistance (a line): organizations: one answer each; people: one answer with every person.
  const [previews, setPreviews] = useState([])
  const [selected, setSelected] = useState([])      // for each line, a Set of person ids per preview
  const [open, setOpen] = useState(() => new Set())
  const [outcomes, setOutcomes] = useState([])      // for each line, organizations: one per organization; people: [{ results }]
  const [isBusy, setIsBusy] = useState(false)
  const [isPrinting, setIsPrinting] = useState(false)
  const [error, setError] = useState('')

  const loadRecipients = useCallback((query) => {
    if (people) return memberUrl ? domain.loadOwnMembers(memberUrl, query) : domain.loadPeople(query)
    return domain.loadOrganizations(query)
  }, [people, memberUrl, domain])

  const chosen = [...picked.values()]
  const recipientNoun = people ? domain.peopleLabel : 'cooperatives'

  // ── step 1 -> 2: check the form, then ask the server what would happen
  const handleReview = async (e) => {
    e.preventDefault()
    setError('')
    const problem = assistanceLinesProblem(lines, { today })
    if (problem) { setError(problem); return }
    if (chosen.length === 0) { setError(`Tick at least one ${people ? domain.personLabel.toLowerCase() : 'cooperative'} in the table.`); return }
    if (chosen.length > MAX_RECIPIENTS) { setError(`You can choose at most ${MAX_RECIPIENTS} at a time.`); return }
    setIsBusy(true)
    try {
      const found = []   // for each assistance, what the server says would happen
      for (const line of lines) {
        if (people) {
          const { data } = await api.post(domain.bulkUrl, peopleRequest(line, { idsKey: domain.idsKey, ids: chosen.map((p) => p.id), descriptionKey: domain.descriptionKey, dryRun: true, allowSeedFertilizer: domain.allowSeedFertilizer }))
          found.push([data])
        } else {
          const answers = await Promise.all(chosen.map((org) => api.post(domain.distributeUrl(org.id), organizationRequest(line, { dryRun: true, allowSeedFertilizer: domain.allowSeedFertilizer }))))
          found.push(answers.map((a) => a.data))
        }
      }
      setPreviews(found)
      setSelected(found.map((previewsOfLine) => previewsOfLine.map((p) => new Set(eligibleIds(p)))))
      setOpen(new Set())
      setStep('confirm')
    } catch (err) {
      setError(firstMessage(err?.response?.data, 'Could not check this distribution. Nothing was saved.'))
    } finally {
      setIsBusy(false)
    }
  }

  const changeSet = (line, index, change) => setSelected((all) => all.map((sets, l) => (l !== line ? sets : sets.map((s, i) => (i === index ? change(s) : s)))))
  const toggleMember = (line, index, personId) => changeSet(line, index, (s) => {
    const next = new Set(s)
    if (next.has(personId)) next.delete(personId)
    else next.add(personId)
    return next
  })
  const setAll = (line, index, ids) => changeSet(line, index, () => new Set(ids))
  const toggleOpen = (id) => setOpen((o) => {
    const next = new Set(o)
    if (next.has(id)) next.delete(id)
    else next.add(id)
    return next
  })

  const totals = reviewTotalsAll(previews, selected)

  // ── step 2 -> 3: save
  const handleConfirm = async () => {
    setIsBusy(true)
    setError('')
    try {
      // Each assistance is saved as a distribution of its own, one after the other. A failure of the first one saves nothing, so the window
      // stays here to try again; a failure after another was saved is shown in the result instead (saving again would repeat that one).
      const done = []
      for (let l = 0; l < lines.length; l += 1) {
        const line = lines[l]
        if (people) {
          const ids = [...selected[l][0]].filter((id) => eligibleIds(previews[l][0]).includes(id))
          if (ids.length === 0) { done.push([{ results: [], skipped: true }]); continue }
          try {
            const { data } = await api.post(domain.bulkUrl, peopleRequest(line, { idsKey: domain.idsKey, ids, descriptionKey: domain.descriptionKey, allowSeedFertilizer: domain.allowSeedFertilizer, confirmDuplicate: true }))
            done.push([{ results: data.results }])
          } catch (err) {
            if (outcomeCreated(done) === 0) throw err
            done.push([{ results: [], failed: firstMessage(err?.response?.data, 'This assistance could not be saved.') }])
          }
        } else {
          const outcomesOfLine = []
          for (let i = 0; i < chosen.length; i += 1) {
            const ids = [...selected[l][i]].filter((id) => eligibleIds(previews[l][i]).includes(id))
            if (ids.length === 0) { outcomesOfLine.push({ skipped: true, org: chosen[i] }); continue }
            try {
              const r = await api.post(domain.distributeUrl(chosen[i].id), organizationRequest(line, { memberIds: ids, allowSeedFertilizer: domain.allowSeedFertilizer }))
              outcomesOfLine.push({ ...r.data, org: chosen[i] })
            } catch (err) {
              outcomesOfLine.push({ failed: firstMessage(err?.response?.data, 'This cooperative could not be saved.'), org: chosen[i] })
            }
          }
          done.push(outcomesOfLine)
        }
      }
      setOutcomes(done)
      const made = outcomeCreated(done)
      showToast(`${made} assistance record${made === 1 ? '' : 's'} created.`, made > 0 ? 'success' : 'error')
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
    const records = outcomes.flatMap((outcomesOfLine, l) => reportRecords(
      outcomesOfLine.flatMap((o) => (o.results || []).map((r) => ({ ...r, organization_name: o.org?.name }))), lines[l], { organizationName: fixedOrg?.name || '' },
    ))
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
    : (fixedOrg ? 'Distribute to All Members' : 'Distribute to Cooperatives')
  const subtitle = people
    ? `Give one or more assistance to the ${domain.peopleLabel} you tick below, in one step.`
    : (fixedOrg ? 'Give the same assistance to the members you choose, in one step.' : `Give one or more assistance to the members of the ${domain.orgLabel.toLowerCase()}s you tick below.`)

  return (
    <ModalShell title={title} subtitle={subtitle} icon={people ? Users : Building2} onClose={onClose} maxWidth="max-w-4xl" footer={footer}>
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'form' && (
        <form id="distribute-assistance-form" onSubmit={handleReview} className="stagger-item mt-6 space-y-4">
          <DraftBanner draft={draft} />
          <AssistanceDetailsFields domain={domain} form={form} setForm={setForm} more={more} setMore={setMore} today={today} />

          {fixedOrg ? (
            <div className="flex items-start gap-3 rounded-xl border border-[#C8D5C8] bg-[#EBF5EE] p-4">
              <Building2 size={18} className="mt-0.5 shrink-0 text-[#1B4D2E]" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-[#1A2B1A]">{fixedOrg.name}</p>
                <p className="text-[12px] text-[#5A6B5C]">{fixedOrg.barangay} · you choose the members in the review</p>
              </div>
            </div>
          ) : (
            <FormSection title={people ? (memberUrl ? 'Members' : `Registered ${domain.personLabel}s`) : `Registered ${domain.orgLabel}s`}>
              <div className="space-y-3 p-3">
              <p className="text-[12.5px] text-[#4A5E4A]">
                {people ? `Search, then tick every ${domain.personLabel.toLowerCase()} who receives this assistance.` : 'Search, then tick every cooperative whose members receive this assistance. You can untick members in the review.'}
              </p>
              <RecipientTable
                noun={recipientNoun}
                columns={people ? domain.personColumns : domain.orgColumns}
                searchPlaceholder={people ? 'Search by name, RSBSA number or barangay…' : 'Search cooperatives by name or barangay…'}
                load={loadRecipients}
                picked={picked}
                onToggle={(record) => setPicked((m) => toggleInMap(m, record))}
                onPickPage={(rows) => setPicked((m) => new Map([...m, ...rows.map((r) => [r.id, r])]))}
                onClear={() => setPicked(new Map())}
              />
              </div>
            </FormSection>
          )}

          {error && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </form>
      )}

      {step === 'confirm' && (
        <div className="stagger-item mt-6 space-y-4">
          <SectionEyebrow>Confirm Distribution</SectionEyebrow>
          <div className="rounded-2xl bg-[#1B4D2E] p-6 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">You Are About to Distribute</p>
            {lines.map((line, i) => (
              <div key={i} className={i > 0 ? 'mt-4 border-t border-white/15 pt-4' : ''}>
                <p className="mt-2 text-[26px] font-semibold leading-tight">{quantityText(line) || (line.training_duration_days ? `${line.training_duration_days} day(s)` : '—')}</p>
                <p className="text-[15px] font-medium text-[#D7E7D9]">{typeName(line)}</p>
              </div>
            ))}
            <div className="my-4 border-t border-white/15" />
            <p className="text-[13px] text-[#B7CBBB]">
              {lines.length > 1
                ? `${totals.records} assistance record${totals.records === 1 ? '' : 's'} in all`
                : `To ${totals.records} selected ${people ? (totals.records === 1 ? domain.personLabel.toLowerCase() : domain.peopleLabel) : `member${totals.records === 1 ? '' : 's'}`}`}
              {!people && ` ${lines.length > 1 ? 'across' : 'of'} ${totals.organizations} cooperative${totals.organizations === 1 ? '' : 's'}`}
            </p>
            <p className="mt-0.5 text-[13px] text-[#B7CBBB]">on <span className="font-semibold text-white">{scheduleText(form)}</span></p>
          </div>

          {lines.map((line, l) => (
            <div key={l} className="space-y-3">
              {lines.length > 1 && <SectionEyebrow>{`Assistance ${l + 1}: ${lineSummary(line)}`}</SectionEyebrow>}
              {people ? (
                <PeopleReview preview={previews[l]?.[0]} selected={selected[l]?.[0] || new Set()} onToggle={(id) => toggleMember(l, 0, id)} onSetAll={(ids) => setAll(l, 0, ids)} />
              ) : (
                <ul className="space-y-3" aria-label={lines.length > 1 ? `Cooperatives to distribute assistance ${l + 1} to` : 'Cooperatives to distribute to'}>
                  {chosen.map((org, i) => (
                    <OrganizationReview key={org.id} org={org} index={i} preview={previews[l]?.[i]} selected={selected[l]?.[i] || new Set()} isOpen={open.has(`${l}:${org.id}`)}
                      onToggleOpen={() => toggleOpen(`${l}:${org.id}`)} onToggle={(id) => toggleMember(l, i, id)} onSetAll={(ids) => setAll(l, i, ids)} />
                  ))}
                </ul>
              )}
            </div>
          ))}

          {totals.blocked > 0 && !people && (
            <p className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-[12.5px] text-rose-700">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden="true" />
              {totals.blocked} member{totals.blocked === 1 ? '' : 's'} already received this assistance type from another cooperative within 30 days, so they are blocked.
            </p>
          )}
          {error && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </div>
      )}

      {step === 'result' && (
        <Result people={people} outcomes={outcomes} domain={domain} lines={lines} />
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
  const repeatCount = repeatWarningCount(preview, selected)
  return (
    <>
      <div className="grid grid-cols-3 gap-3">
        <StatTile value={results.length} label="Chosen" />
        <StatTile value={chosenCount} label="Will receive" />
        <StatTile value={refused.length} label="Cannot receive" />
      </div>
      {repeatCount > 0 && (
        <p role="status" className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-[13px] text-amber-900">
          <span className="font-semibold">{repeatCount} ticked {repeatCount === 1 ? 'person already received' : 'people already received'} this type of assistance within 30 days.</span>{' '}
          Untick anyone who should not get it again. Saving gives it to everyone who is still ticked.
        </p>
      )}
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
                    {!refusedRow && m.warning && <span className="block text-[12px] text-amber-700">{m.warning}</span>}
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
          <AlertTriangle size={14} aria-hidden="true" /> Nobody is selected, so this cooperative is skipped.
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

// ── the result: what was created, who was refused and why. With several assistance, one banner and a section for each.
function Result({ people, outcomes, domain, lines }) {
  if (lines.length === 1) return <LineResult people={people} outcomes={outcomes[0] || []} domain={domain} withBanner />
  const created = outcomeCreated(outcomes)
  return (
    <div className="stagger-item mt-6 space-y-6">
      <Banner><span className="font-semibold">{created}</span> record{created === 1 ? '' : 's'} created for {lines.length} assistance.</Banner>
      {lines.map((line, l) => (
        <section key={l} aria-label={`Assistance ${l + 1}`} className="space-y-3">
          <SectionEyebrow>{`Assistance ${l + 1}: ${lineSummary(line)}`}</SectionEyebrow>
          <LineResult people={people} outcomes={outcomes[l] || []} domain={domain} />
        </section>
      ))}
    </div>
  )
}

// The result of one assistance.
function LineResult({ people, outcomes, domain, withBanner = false }) {
  const [filter, setFilter] = useState('all')
  const wrap = withBanner ? 'stagger-item mt-6 space-y-4' : 'space-y-4'
  if (people) {
    const results = outcomes[0]?.results || []
    const sum = personOutcomeTotals(results)
    const tabs = [{ key: 'all', label: `All ${results.length}` }, { key: 'created', label: `${sum.created} Created` }, ...(sum.errors ? [{ key: 'error', label: `${sum.errors} Error` }] : [])]
    const shown = results.filter((r) => filter === 'all' || r.status === filter)
    return (
      <div className={wrap}>
        {withBanner ? (
          <Banner>
            <span className="font-semibold">{sum.created}</span> record{sum.created === 1 ? '' : 's'} created,{' '}
            <span className={sum.errors ? 'font-semibold text-rose-700' : 'font-semibold'}>{sum.errors}</span> error{sum.errors === 1 ? '' : 's'}
          </Banner>
        ) : (
          <p className="text-[13px] text-[#1A2B1A]">
            <span className="font-semibold">{sum.created}</span> record{sum.created === 1 ? '' : 's'} created,{' '}
            <span className={sum.errors ? 'font-semibold text-rose-700' : 'font-semibold'}>{sum.errors}</span> error{sum.errors === 1 ? '' : 's'}
          </p>
        )}
        {outcomes[0]?.skipped && <p className="text-[12.5px] text-amber-800">Nobody was ticked for this assistance, so nothing was saved.</p>}
        {outcomes[0]?.failed && <p role="alert" className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">Not saved: {outcomes[0].failed}</p>}
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
  const summary = (
    <>
      <span className="font-semibold">{sum.created}</span> record{sum.created === 1 ? '' : 's'} created in {sum.organizations} cooperative{sum.organizations === 1 ? '' : 's'},{' '}
      <span className="font-semibold text-rose-700">{sum.blocked}</span> blocked,{' '}
      <span className={sum.errors + sum.failed ? 'font-semibold text-rose-700' : 'font-semibold'}>{sum.errors + sum.failed}</span> error{sum.errors + sum.failed === 1 ? '' : 's'}
    </>
  )
  return (
    <div className={wrap}>
      {withBanner ? <Banner>{summary}</Banner> : <p className="text-[13px] text-[#1A2B1A]">{summary}</p>}
      <ul className="divide-y divide-[#EEF2EE] overflow-hidden rounded-2xl border border-[#E2E8E2] bg-white" aria-label="Outcome per cooperative">
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
