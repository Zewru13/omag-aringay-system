import { useEffect, useState } from 'react'
import { AlertTriangle, CheckCircle2, Search, Users, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

const todayISO = () => new Date().toISOString().split('T')[0]

// New capability alongside the existing one-by-one "Report/Log Assistance"
// flow (AddAssistanceModal / LogGovernmentAssistanceModal) — creates ONE
// record per CURRENT member of a picked organization in a single request.
// Three steps: pick org + fill in shared assistance details ('form') ->
// mandatory confirmation showing exactly what will happen, built from a
// dry_run call to the same backend endpoint so the member count and any
// 30-day cross-org flags are real, not guessed ('confirm') -> submit for
// real and show the per-member outcome, not a generic success toast ('result').
export default function DistributeAssistanceModal({ domain, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [step, setStep] = useState('form') // 'form' | 'confirm' | 'result'

  const [orgSearch, setOrgSearch] = useState('')
  const [orgResults, setOrgResults] = useState([])
  const [org, setOrg] = useState(null)

  const [form, setForm] = useState({
    assistance_type: '',
    source_agency: '',
    source_agency_other: '',
    date_given: todayISO(),
    quantity: '',
    description: '',
    season: domain.seasonOptions ? domain.seasonOptions[0] : '',
    program: '',
  })
  const [programs, setPrograms] = useState([])
  const [preview, setPreview] = useState(null) // dry-run response
  const [finalResult, setFinalResult] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/interventions/programs/')
      .then((r) => setPrograms((Array.isArray(r.data) ? r.data : (r.data.results || [])).filter((p) => p.is_active)))
      .catch(() => setPrograms([]))
  }, [])

  useEffect(() => {
    if (!orgSearch.trim()) { setOrgResults([]); return }
    const handle = setTimeout(() => {
      api.get(domain.orgSearchUrl, { params: { search: orgSearch } })
        .then((r) => setOrgResults(Array.isArray(r.data) ? r.data : (r.data.results || [])))
        .catch(() => setOrgResults([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [orgSearch, domain.orgSearchUrl])

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  const buildPayload = (dryRun) => {
    const sourceAgency = form.source_agency === 'Other' ? form.source_agency_other.trim() : form.source_agency
    return {
      assistance_type: form.assistance_type,
      source_agency: sourceAgency,
      date_given: form.date_given,
      quantity: form.quantity,
      description: form.description,
      season: form.season,
      ...(form.program ? { program: form.program } : {}),
      ...(dryRun ? { dry_run: true } : {}),
    }
  }

  const handlePreview = async (e) => {
    e.preventDefault()
    setError('')
    if (!org) { showToast('Pick an organization first.', 'error'); return }
    if (!form.assistance_type || !form.date_given) {
      showToast('Fill in all required fields.', 'error'); return
    }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) {
      showToast('Please specify the source agency.', 'error'); return
    }
    setIsBusy(true)
    try {
      const r = await api.post(domain.distributeUrl(org.id), buildPayload(true))
      setPreview(r.data)
      setStep('confirm')
    } catch (err) {
      const data = err?.response?.data
      setError((data && typeof data === 'object' && Object.values(data)[0]) || 'Failed to preview distribution.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleConfirm = async () => {
    setIsBusy(true)
    setError('')
    try {
      const r = await api.post(domain.distributeUrl(org.id), buildPayload(false))
      setFinalResult(r.data)
      setStep('result')
      onSuccess?.()
    } catch (err) {
      const data = err?.response?.data
      setError((data && typeof data === 'object' && Object.values(data)[0]) || 'Failed to distribute assistance.')
    } finally {
      setIsBusy(false)
    }
  }

  const flaggedInPreview = (preview?.results || []).filter((r) => r.note)
  const skippedInPreview = (preview?.results || []).filter((r) => r.status === 'skipped')

  const resultBadge = (status) => {
    if (status === 'created') return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-emerald-700"><CheckCircle2 size={13} /> Created</span>
    if (status === 'skipped') return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-amber-700"><AlertTriangle size={13} /> Skipped</span>
    return <span className="inline-flex items-center gap-1 text-[12px] font-medium text-rose-700"><XCircle size={13} /> Error</span>
  }

  return (
    <ModalShell
      title="Distribute to Organization"
      subtitle={step === 'form' ? `Create one assistance record for every current ${domain.personLabel.toLowerCase()} member.` : org?.name}
      icon={Users}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {step === 'form' && (
        <form onSubmit={handlePreview} className="space-y-4">
          <div className="relative">
            <label className="mb-1.5 block text-[13px] font-medium text-[#4A5E4A]">
              {domain.orgLabel} <span className="text-rose-500">*</span>
            </label>
            {!org ? (
              <>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
                  <input
                    type="text"
                    className={`${baseInputClasses} pl-8`}
                    placeholder={`Search ${domain.orgLabel.toLowerCase()}…`}
                    value={orgSearch}
                    onChange={(e) => setOrgSearch(e.target.value)}
                  />
                </div>
                {orgSearch.trim() && (
                  <div className="absolute z-50 mt-1 w-full max-h-52 overflow-y-auto rounded-xl border border-[#E2E8E2] bg-white shadow-lg">
                    {orgResults.length === 0 ? (
                      <p className="px-4 py-3 text-xs text-[#7A8E7A]">No organizations found.</p>
                    ) : (
                      orgResults.map((o) => (
                        <button
                          key={o.id}
                          type="button"
                          onClick={() => { setOrg(o); setOrgSearch('') }}
                          className="block w-full px-4 py-2.5 text-left hover:bg-[#F5F7F5] transition-colors"
                        >
                          <p className="text-xs font-semibold text-[#1A2B1A]">{o.name}</p>
                          <p className="text-[11px] text-[#7A8E7A]">{o.barangay}</p>
                        </button>
                      ))
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F0F7F0] border border-[#C8D5C8] px-3 py-2">
                <div>
                  <p className="text-[13px] font-medium text-[#1A2B1A]">{org.name}</p>
                  <p className="text-[11px] text-[#7A8E7A]">{org.barangay}</p>
                </div>
                <button type="button" onClick={() => setOrg(null)} className="text-xs font-medium text-rose-600 hover:underline">Change</button>
              </div>
            )}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <FormField label="Assistance Type" required>
              <select className={baseInputClasses} value={form.assistance_type} onChange={(e) => set('assistance_type', e.target.value)}>
                <option value="">Select Assistance Type</option>
                {domain.assistanceTypeOptions.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </FormField>
            <FormField label="Source Agency">
              <ComboboxWithOther
                options={SOURCE_AGENCY_OPTIONS}
                value={form.source_agency}
                otherValue={form.source_agency_other}
                onChange={(v) => set('source_agency', v)}
                onOtherChange={(v) => set('source_agency_other', v)}
                placeholder="Select source agency…"
              />
            </FormField>
            <FormField label="Date Given" required>
              <input type="date" className={baseInputClasses} value={form.date_given} max={todayISO()} onChange={(e) => set('date_given', e.target.value)} />
            </FormField>
            <FormField label="Quantity (per member)">
              <input className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="e.g. 1 sack" />
            </FormField>
            {domain.seasonOptions ? (
              <FormField label="Season">
                <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
                  <option value="">Select…</option>
                  {domain.seasonOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              </FormField>
            ) : (
              <FormField label="Season">
                <input className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)} />
              </FormField>
            )}
          </div>

          <FormField label="Description">
            <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
          </FormField>

          <FormField label="Attach to a formal program (optional)">
            <select className={baseInputClasses} value={form.program} onChange={(e) => set('program', e.target.value)}>
              <option value="">No program — standalone record</option>
              {programs.map((p) => <option key={p.id} value={p.id}>{p.program_name} ({p.season} {p.year})</option>)}
            </select>
            <p className="mt-1 text-[11px] text-[#7A8E7A]">
              A member already enrolled in this program will be skipped, not blocked — the rest still receive the distribution.
            </p>
          </FormField>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isBusy}>Review Distribution</Button>
          </div>
        </form>
      )}

      {step === 'confirm' && preview && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4 space-y-1.5">
            <p className="text-[13px]"><span className="font-medium text-[#1A2B1A]">Organization:</span> {preview.organization_name}</p>
            <p className="text-[13px]"><span className="font-medium text-[#1A2B1A]">Current members:</span> {preview.member_count}</p>
            <p className="text-[13px]"><span className="font-medium text-[#1A2B1A]">Assistance:</span> {form.assistance_type}{form.quantity ? ` — ${form.quantity}` : ''} on {form.date_given}</p>
            {form.program && <p className="text-[13px]"><span className="font-medium text-[#1A2B1A]">Program:</span> {programs.find((p) => String(p.id) === String(form.program))?.program_name}</p>}
          </div>

          {skippedInPreview.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-[12px] font-semibold text-amber-800 mb-1">{skippedInPreview.length} member(s) will be skipped</p>
              <ul className="text-[12px] text-amber-700 space-y-0.5">
                {skippedInPreview.map((r) => <li key={r.person_id}>{r.name} — {r.reason}</li>)}
              </ul>
            </div>
          )}

          {flaggedInPreview.length > 0 && (
            <div className="rounded-xl border border-sky-200 bg-sky-50 p-3">
              <p className="text-[12px] font-semibold text-sky-800 mb-1">{flaggedInPreview.length} member(s) flagged for review</p>
              <ul className="text-[12px] text-sky-700 space-y-0.5">
                {flaggedInPreview.map((r) => <li key={r.person_id}>{r.name} — {r.note}</li>)}
              </ul>
            </div>
          )}

          <p className="text-[12px] text-[#7A8E7A]">
            {preview.member_count - skippedInPreview.length} member(s) will receive a new record. This cannot be undone automatically — review carefully before confirming.
          </p>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-3">
            <Button type="button" variant="outline" onClick={() => setStep('form')}>Back</Button>
            <Button type="button" isLoading={isBusy} onClick={handleConfirm}>Confirm & Distribute</Button>
          </div>
        </div>
      )}

      {step === 'result' && finalResult && (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="text-[13px] font-medium text-[#1A2B1A]">{finalResult.organization_name}</p>
            <p className="text-[12px] text-[#7A8E7A]">
              {finalResult.results.filter((r) => r.status === 'created').length} created ·{' '}
              {finalResult.results.filter((r) => r.status === 'skipped').length} skipped ·{' '}
              {finalResult.results.filter((r) => r.status === 'error').length} errors
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
          <div className="flex justify-end border-t border-[#F0F4F0] pt-3">
            <Button type="button" onClick={onClose}>Done</Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
