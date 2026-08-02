import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { labels } from './labels.js'

const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

const todayISO = () => new Date().toISOString().split('T')[0]
const L = labels.distributeAssistance

// Batch 12 sibling of CitizenReportAssistanceModal — same org, same fields,
// but distributes to EVERY current member instead of one picked member.
// Org is always `orgId` (the citizen's own — never a free-text picker, see
// MyOrgReportingSection's ownership). Two-step: fill in assistance details
// -> mandatory confirmation built from a dry_run call to the same endpoint
// (real member count, real 30-day cross-org flags) -> submit for real and
// show the per-member outcome, matching the repeat-feeding guard's "show
// exactly what will happen before it happens" pattern.
export default function CitizenDistributeToOrgModal({ domain, orgId, orgName, onClose, onSuccess }) {
  const [step, setStep] = useState('form') // 'form' | 'confirm' | 'result'
  const [form, setForm] = useState({
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
  const [programs, setPrograms] = useState([])
  const [preview, setPreview] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

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
      setStep('result')
      onSuccess?.()
    } catch (err) {
      setErrorMessage(extractError(err) || L.errors.distributeFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const skippedInPreview = (preview?.results || []).filter((r) => r.status === 'skipped')
  const flaggedInPreview = (preview?.results || []).filter((r) => r.note)

  const resultBadge = (status) => {
    if (status === 'created') return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700"><CheckCircle2 size={13} /> {L.statusCreated}</span>
    if (status === 'skipped') return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700"><AlertTriangle size={13} /> {L.statusSkipped}</span>
    return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-rose-700"><XCircle size={13} /> {L.statusError}</span>
  }

  return (
    <ModalShell
      title={L.title}
      subtitle={step === 'form' ? L.subtitle(domain.personLabel.toLowerCase()) : orgName}
      icon={Users}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      {step === 'form' && (
        <form className="space-y-4" onSubmit={handlePreview}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label={L.fields.assistanceType} required>
              <ComboboxWithOther
                options={domain.assistanceTypeOptions.filter((o) => o !== 'Other')}
                value={form.assistance_type}
                otherValue={form.assistance_type_other}
                onChange={(v) => set('assistance_type', v)}
                onOtherChange={(v) => set('assistance_type_other', v)}
              />
            </FormField>
            <FormField label={L.fields.dateGiven} required>
              <input type="date" max={todayISO()} className={baseInputClasses} value={form.date_given} onChange={(e) => set('date_given', e.target.value)} />
            </FormField>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {isCashAssistance ? (
              <FormField label={L.fields.cashAmount} required>
                <input type="number" step="0.01" min="0.01" className={baseInputClasses} value={form.cash_amount}
                  onChange={(e) => set('cash_amount', e.target.value)} placeholder="e.g. 500.00" />
              </FormField>
            ) : (
              <FormField label={L.fields.quantity}>
                <input type="text" className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} />
              </FormField>
            )}
            <FormField label={L.fields.sourceAgency}>
              <ComboboxWithOther
                options={SOURCE_AGENCY_OPTIONS}
                value={form.source_agency}
                otherValue={form.source_agency_other}
                onChange={(v) => set('source_agency', v)}
                onOtherChange={(v) => set('source_agency_other', v)}
              />
            </FormField>
          </div>
          {domain.seasonOptions ? (
            <FormField label={L.fields.season}>
              <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
                {domain.seasonOptions.map((s) => <option key={s}>{s}</option>)}
              </select>
            </FormField>
          ) : (
            <FormField label={L.fields.season}>
              <input type="text" className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)} />
            </FormField>
          )}
          <FormField label={L.fields.program}>
            <select className={baseInputClasses} value={form.program} onChange={(e) => set('program', e.target.value)}>
              <option value="">{L.fields.programNone}</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.program_name} ({p.season} {p.year})</option>)}
            </select>
            <p className="mt-1 text-[11px] text-slate-500">{L.fields.programHelp}</p>
          </FormField>
          <FormField label={L.fields.description}>
            <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>

          {errorMessage && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
            <Button isLoading={isBusy} type="submit" variant="primary">{L.reviewButton}</Button>
          </div>
        </form>
      )}

      {step === 'confirm' && preview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4 space-y-1.5">
            <p className="text-[13px]"><span className="font-medium text-[#1A2B1A]">Organization:</span> {preview.organization_name}</p>
            <p className="text-[13px]"><span className="font-medium text-[#1A2B1A]">{L.currentMembers}:</span> {preview.member_count}</p>
            <p className="text-[13px]">
              <span className="font-medium text-[#1A2B1A]">{L.assistanceSummary}:</span>{' '}
              {form.assistance_type === 'Other' ? form.assistance_type_other.trim() : form.assistance_type}
              {isCashAssistance ? ` — ₱${form.cash_amount} per head` : (form.quantity ? ` — ${form.quantity}` : '')} on {form.date_given}
            </p>
          </div>

          {skippedInPreview.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] font-semibold text-amber-800 mb-1">{L.willSkip(skippedInPreview.length)}</p>
              <ul className="text-[12px] text-amber-700 space-y-0.5">
                {skippedInPreview.map((r) => <li key={r.person_id}>{r.name} — {r.reason}</li>)}
              </ul>
            </div>
          )}

          {flaggedInPreview.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-[12px] font-semibold text-sky-800 mb-1">{L.willFlag(flaggedInPreview.length)}</p>
              <ul className="text-[12px] text-sky-700 space-y-0.5">
                {flaggedInPreview.map((r) => <li key={r.person_id}>{r.name} — {r.note}</li>)}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-[#7A8E7A]">{L.willReceive(preview.member_count - skippedInPreview.length)}</p>

          {errorMessage && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
          )}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button type="button" variant="ghost" onClick={() => setStep('form')}>{L.back}</Button>
            <Button type="button" isLoading={isBusy} onClick={handleConfirm}>{L.confirmButton}</Button>
          </div>
        </div>
      )}

      {step === 'result' && finalResult && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="text-[13px] font-medium text-[#1A2B1A]">{finalResult.organization_name}</p>
            <p className="text-[12px] text-[#7A8E7A]">
              {L.resultSummary(
                finalResult.results.filter((r) => r.status === 'created').length,
                finalResult.results.filter((r) => r.status === 'skipped').length,
                finalResult.results.filter((r) => r.status === 'error').length,
              )}
            </p>
          </div>
          <ul className="max-h-72 overflow-y-auto divide-y divide-[#F0F4F0] rounded-xl border border-[#E2E8E2]">
            {finalResult.results.map((r) => (
              <li key={r.person_id} className="px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[13px] text-[#1A2B1A]">{r.name}</span>
                  {resultBadge(r.status)}
                </div>
                {(r.reason || r.note) && <p className="mt-0.5 text-[11px] text-[#7A8E7A]">{r.reason || r.note}</p>}
              </li>
            ))}
          </ul>
          <div className="flex justify-end border-t border-slate-100 pt-4">
            <Button type="button" onClick={onClose}>{L.done}</Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
