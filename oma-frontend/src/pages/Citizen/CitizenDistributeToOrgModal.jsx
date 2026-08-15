import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, CheckCircle2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import AvatarInitials from '../../components/UI/AvatarInitials.jsx'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SectionEyebrow from '../../components/UI/SectionEyebrow.jsx'
import StatTile from '../../components/UI/StatTile.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import StepIndicator from '../../components/UI/StepIndicator.jsx'
import { labels } from './labels.js'
import { todayISO } from '../../utils/localDate.js'

const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

const L = labels.distributeAssistance

function formatDateLong(iso) {
  if (!iso) return ''
  return labels.common.formatDate(iso)
}

const STATUS_TONE = { created: 'green', skipped: 'slate', error: 'rose' }

// Batch 12 sibling of CitizenReportAssistanceModal — same org, same fields,
// but distributes to EVERY current member instead of one picked member.
// Org is always `orgId` (the citizen's own — never a free-text picker, see
// MyOrgReportingSection's ownership). Three steps, mirroring the staff-side
// DistributeAssistanceModal's exemplar-matched layout: fill in assistance
// details -> mandatory confirmation built from a dry_run call to the same
// endpoint (real member count, real 30-day cross-org flags) -> submit for
// real and show the per-member outcome.
export default function CitizenDistributeToOrgModal({ domain, orgId, orgName, onClose, onSuccess }) {
  const STEPS = [
    { key: 'form',    label: L.steps.details },
    { key: 'confirm', label: L.steps.review },
    { key: 'result',  label: L.steps.results },
  ]
  const STEP_INDEX = { form: 0, confirm: 1, result: 2 }

  const emptyForm = () => ({
    assistance_type: domain.assistanceTypeOptions[0],
    assistance_type_other: '',
    source_agency: '',
    source_agency_other: '',
    date_given: todayISO(),
    quantity: '',
    cash_amount: '',
    description: '',
    season: domain.seasonOptions ? domain.seasonOptions[0] : '',
    program: '',
  })

  const [step, setStep] = useState('form') // 'form' | 'confirm' | 'result'
  const [form, setForm] = useState(emptyForm())
  const [programs, setPrograms] = useState([])
  const [preview, setPreview] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [resultFilter, setResultFilter] = useState('all')

  useEffect(() => {
    api.get('/interventions/programs/')
      .then((r) => setPrograms((Array.isArray(r.data) ? r.data : (r.data.results || [])).filter((p) => p.is_active)))
      .catch(() => setPrograms([]))
  }, [])

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))
  const isCashAssistance = form.assistance_type === 'Cash Assistance'

  const buildPayload = (dryRun) => {
    const sourceAgency = form.source_agency === 'Other' ? form.source_agency_other.trim() : form.source_agency
    const assistanceType = form.assistance_type === 'Other' ? form.assistance_type_other.trim() : form.assistance_type
    const quantity = isCashAssistance
      ? (form.cash_amount ? `₱${form.cash_amount} per head` : '')
      : form.quantity
    return {
      assistance_type: assistanceType,
      source_agency: sourceAgency,
      date_given: form.date_given,
      quantity,
      description: form.description,
      season: form.season,
      ...(form.program ? { program: form.program } : {}),
      ...(dryRun ? { dry_run: true } : {}),
    }
  }

  const extractError = (err) => {
    const data = err?.response?.data
    return (data && typeof data === 'object' ? Object.values(data).flat()[0] : null) || data?.detail || null
  }

  const handlePreview = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!form.assistance_type || !form.date_given) {
      setErrorMessage(L.errors.requiredFields)
      return
    }
    if (form.assistance_type === 'Other' && !form.assistance_type_other.trim()) {
      setErrorMessage(L.errors.specifyAssistanceType)
      return
    }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) {
      setErrorMessage(L.errors.specifySourceAgency)
      return
    }
    if (isCashAssistance && (!form.cash_amount || Number(form.cash_amount) <= 0)) {
      setErrorMessage(L.errors.invalidCashAmount)
      return
    }
    setIsBusy(true)
    try {
      const r = await api.post(domain.distributeUrl(orgId), buildPayload(true))
      setPreview(r.data)
      setStep('confirm')
    } catch (err) {
      setErrorMessage(extractError(err) || L.errors.previewFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const handleConfirm = async () => {
    setIsBusy(true)
    setErrorMessage('')
    try {
      const r = await api.post(domain.distributeUrl(orgId), buildPayload(false))
      setFinalResult(r.data)
      setResultFilter('all')
      setStep('result')
      onSuccess?.()
    } catch (err) {
      setErrorMessage(extractError(err) || L.errors.distributeFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const handleStartNew = () => {
    setForm(emptyForm())
    setPreview(null)
    setFinalResult(null)
    setErrorMessage('')
    setStep('form')
  }

  const skippedInPreview = (preview?.results || []).filter((r) => r.status === 'skipped')
  const flaggedInPreview = (preview?.results || []).filter((r) => r.note)
  const eligibleCount = preview ? preview.member_count - skippedInPreview.length : 0

  const assistanceTypeDisplay = form.assistance_type === 'Other' ? form.assistance_type_other.trim() : form.assistance_type
  const quantityDisplay = isCashAssistance ? `₱${form.cash_amount} per head` : (form.quantity || '—')

  const createdResults = (finalResult?.results || []).filter((r) => r.status === 'created')
  const skippedResults = (finalResult?.results || []).filter((r) => r.status === 'skipped')
  const errorResults   = (finalResult?.results || []).filter((r) => r.status === 'error')
  const flaggedResults = (finalResult?.results || []).filter((r) => r.note)

  const RESULT_TABS = finalResult ? [
    { key: 'all',     label: L.filterAll(finalResult.results.length) },
    { key: 'created', label: L.filterCreated(createdResults.length) },
    ...(skippedResults.length ? [{ key: 'skipped', label: L.filterSkipped(skippedResults.length) }] : []),
    ...(flaggedResults.length ? [{ key: 'flagged', label: L.filterFlagged(flaggedResults.length) }] : []),
    ...(errorResults.length ? [{ key: 'error', label: L.filterError(errorResults.length) }] : []),
  ] : []

  const visibleResults = !finalResult ? [] : finalResult.results.filter((r) => {
    if (resultFilter === 'all') return true
    if (resultFilter === 'flagged') return !!r.note
    return r.status === resultFilter
  })

  return (
    <ModalShell
      title={L.title}
      subtitle={orgName}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'form' && (
        <form className="mt-6 space-y-4" onSubmit={handlePreview}>
          <div className="rounded-2xl border border-[0.5px] border-cz-border-strong bg-white p-5 space-y-4">
            <SectionEyebrow className="mb-0">{L.sections.assistanceDetails}</SectionEyebrow>
            <FormField label={L.fields.assistanceType} required pillLabel>
              <ComboboxWithOther
                options={domain.assistanceTypeOptions.filter((o) => o !== 'Other')}
                value={form.assistance_type}
                otherValue={form.assistance_type_other}
                onChange={(v) => set('assistance_type', v)}
                onOtherChange={(v) => set('assistance_type_other', v)}
              />
            </FormField>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={L.fields.sourceAgency} pillLabel>
                <ComboboxWithOther
                  options={SOURCE_AGENCY_OPTIONS}
                  value={form.source_agency}
                  otherValue={form.source_agency_other}
                  onChange={(v) => set('source_agency', v)}
                  onOtherChange={(v) => set('source_agency_other', v)}
                />
              </FormField>
              {isCashAssistance ? (
                <FormField label={L.fields.cashAmount} required pillLabel>
                  <input type="number" step="0.01" min="0.01" className={baseInputClasses} value={form.cash_amount}
                    onChange={(e) => set('cash_amount', e.target.value)} placeholder="e.g. 500.00" />
                </FormField>
              ) : (
                <FormField label={L.fields.quantity} pillLabel>
                  <input type="text" className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
                </FormField>
              )}
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label={L.fields.dateGiven} required pillLabel>
                <input type="date" max={todayISO()} className={baseInputClasses} value={form.date_given} onChange={(e) => set('date_given', e.target.value)} />
              </FormField>
              {domain.seasonOptions ? (
                <FormField label={L.fields.season} pillLabel>
                  <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
                    {domain.seasonOptions.map((s) => <option key={s}>{s}</option>)}
                  </select>
                </FormField>
              ) : (
                <FormField label={L.fields.season} pillLabel>
                  <input type="text" className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)} />
                </FormField>
              )}
            </div>
            <FormField label={L.fields.program} pillLabel>
              <select className={baseInputClasses} value={form.program} onChange={(e) => set('program', e.target.value)}>
                <option value="">{L.fields.programNone}</option>
                {programs.map((p) => <option key={p.id} value={p.id}>{p.program_name} ({p.season} {p.year})</option>)}
              </select>
              <p className="mt-1 text-[11px] text-slate-500">{L.fields.programHelp}</p>
            </FormField>
            <FormField label={L.fields.description} pillLabel>
              <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </FormField>
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-3 pt-1">
            <Button onClick={onClose} type="button" variant="ghost">{labels.common.cancel}</Button>
            <Button isLoading={isBusy} type="submit" variant="primary">
              {L.reviewButton} <ArrowRight size={14} className="ml-0.5" aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {step === 'confirm' && preview && (
        <div className="mt-6 space-y-4">
          <SectionEyebrow>{L.sections.confirmDistribution}</SectionEyebrow>

          <div className="rounded-2xl bg-[#1B4D2E] p-6 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">{L.aboutToDistribute}</p>
            <p className="mt-2 text-[26px] font-semibold leading-tight">{quantityDisplay}</p>
            <p className="text-[15px] font-medium text-[#D7E7D9]">{assistanceTypeDisplay}</p>
            <div className="my-4 border-t border-white/15" />
            <p className="text-[13px] text-[#B7CBBB]">{L.toAllMembersOf}</p>
            <p className="text-[15px] font-semibold">{preview.organization_name}</p>
            <p className="mt-0.5 text-[13px] text-[#B7CBBB]">{L.onDateBold(formatDateLong(form.date_given))}</p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile value={preview.member_count} label={L.stats.totalMembers} />
            <StatTile value={eligibleCount} label={L.stats.eligible} />
            <StatTile value={flaggedInPreview.length} label={L.stats.flagged} />
          </div>

          {skippedInPreview.length > 0 && (
            <div className="rounded-2xl border border-[#F5E0A3] bg-cz-alert-bg p-4">
              <p className="text-[13px] font-semibold text-cz-alert-title">{L.skippedPanelTitle(skippedInPreview.length)}</p>
              <div className="mt-2 space-y-2">
                {skippedInPreview.map((r) => (
                  <div key={r.person_id} className="rounded-xl bg-white p-3">
                    <p className="text-[13px] font-medium text-cz-text">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-cz-alert-title">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {flaggedInPreview.length > 0 && (
            <div className="rounded-2xl border-[0.5px] border-cz-tile-blue-fg/30 bg-cz-tile-blue-bg p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-cz-tile-blue-fg" aria-hidden="true" />
                <p className="text-[13px] font-semibold text-cz-tile-blue-fg">{L.flaggedPanelTitle(flaggedInPreview.length)}</p>
              </div>
              <p className="mt-1.5 text-[13px] text-cz-tile-blue-fg">{L.flaggedPanelBody}</p>
              <div className="mt-3 space-y-2">
                {flaggedInPreview.map((r) => (
                  <div key={r.person_id} className="rounded-xl bg-white p-3">
                    <p className="text-[13px] font-medium text-cz-text">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-cz-tile-blue-fg">{r.note}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[0.5px] border-cz-border-strong bg-cz-page p-4">
            <p className="mb-2 text-[13px] font-semibold text-cz-text">{L.summaryTitle}</p>
            <ul className="space-y-1 text-[13px] text-cz-text-2">
              <li><span className="font-semibold text-[#1E5637]">{L.summaryCreated(eligibleCount)}</span> {L.summaryCreatedDetail(eligibleCount)}</li>
              {flaggedInPreview.length > 0 && (
                <li><span className="font-semibold text-cz-tile-blue-fg">{L.summaryFlagged(flaggedInPreview.length)}</span> {L.summaryFlaggedDetail}</li>
              )}
              <li>
                <span className={skippedInPreview.length ? 'font-semibold text-cz-alert-title' : 'font-semibold text-cz-text-2'}>{L.summarySkipped(skippedInPreview.length)}</span>
                {' '}{skippedInPreview.length ? L.summarySkippedDetailProgram : L.summarySkippedDetailNone}
              </li>
            </ul>
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
          )}

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setStep('form')} className="inline-flex items-center gap-1 text-[13px] font-medium text-cz-text-2 hover:text-cz-text transition-colors">
              <ArrowLeft size={14} aria-hidden="true" /> {L.backToEdit}
            </button>
            <Button type="button" isLoading={isBusy} onClick={handleConfirm}>{L.confirmAndDistribute}</Button>
          </div>
        </div>
      )}

      {step === 'result' && finalResult && (
        <div className="mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border-[0.5px] border-cz-status-good-fg/30 bg-cz-status-good-bg p-4">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-cz-status-good-fg" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-semibold text-cz-status-good-fg">{L.completeTitle}</p>
              <p className="mt-0.5 text-[13px] text-cz-text">{L.completeSummary(createdResults.length, skippedResults.length, flaggedResults.length)}</p>
              <p className="mt-1 text-[11px] text-cz-text-2">{finalResult.organization_name}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[0.5px] border-cz-border-strong bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionEyebrow className="mb-0">{L.sections.perMemberOutcome}</SectionEyebrow>
              <div className="flex flex-wrap gap-1.5">
                {RESULT_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setResultFilter(t.key)}
                    className={
                      'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ' +
                      (resultFilter === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-cz-page text-cz-text-2 hover:bg-cz-border')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="-mx-5 divide-y divide-cz-border">
              {visibleResults.map((r) => (
                <div key={r.person_id} className="flex items-center gap-3 px-5 py-3">
                  <AvatarInitials name={r.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-cz-text">{r.name}</p>
                    {r.id_number && <p className="text-[11px] text-cz-text-muted">{r.id_number}</p>}
                    {(r.reason || r.note) && (
                      <p className={`mt-0.5 text-[12px] ${r.status === 'error' ? 'text-cz-danger-accent' : r.reason ? 'text-cz-alert-title' : 'text-cz-tile-blue-fg'}`}>{r.reason || r.note}</p>
                    )}
                  </div>
                  <StatusPill tone={STATUS_TONE[r.status] || 'slate'}>{r.status === 'created' ? L.statusCreated : r.status === 'skipped' ? L.statusSkipped : L.statusError}</StatusPill>
                </div>
              ))}
            </div>
          </div>

          {errorMessage && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={onClose}>{L.close}</Button>
            <Button type="button" onClick={handleStartNew}>{L.startNew}</Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
