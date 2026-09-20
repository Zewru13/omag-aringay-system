import { useEffect, useState } from 'react'
import { AlertTriangle, ArrowLeft, ArrowRight, Building2, CheckCircle2, Search, Users } from 'lucide-react'
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
import { useToast } from '../../context/ToastContext.jsx'
import { todayISO } from '../../utils/localDate.js'
import { SourceAgencyMultiSelect, TypeConditionalFields } from './sharedAssistanceFields.jsx'
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, buildTypeConditionalPayload, validateTrainingDuration,
  isTrainingType, isEquipmentType, isSeedsType, isFertilizerType,
} from './assistanceFieldHelpers.js'

const STEPS = [
  { key: 'form',    label: 'Distribution Details' },
  { key: 'confirm', label: 'Review & Confirm' },
  { key: 'result',  label: 'Distribution Results' },
]
const STEP_INDEX = { form: 0, confirm: 1, result: 2 }

const EMPTY_FORM = (domain) => ({
  assistance_type: '',
  assistance_type_other: '',
  source_agencies: [],
  date_given: todayISO(),
  quantity: '',
  cash_amount: '',
  description: '',
  season: domain.seasonOptions ? domain.seasonOptions[0] : '',
  // Type-conditional fields — only the one matching the selected
  // assistance_type is ever shown/submitted; see sharedAssistanceFields.jsx.
  ...EMPTY_TYPE_CONDITIONAL_FIELDS,
})

function formatDateLong(iso) {
  if (!iso) return ''
  return new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(iso + 'T00:00:00'))
}

const STATUS_TONE = { created: 'green', skipped: 'slate', blocked: 'rose', error: 'rose' }
const STATUS_LABEL = { created: 'Created', skipped: 'Skipped', blocked: 'Blocked', error: 'Error' }

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

  const [form, setForm] = useState(EMPTY_FORM(domain))
  const [preview, setPreview] = useState(null) // dry-run response
  const [finalResult, setFinalResult] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [resultFilter, setResultFilter] = useState('all')

  useEffect(() => {
    if (!orgSearch.trim()) { setOrgResults([]); return }
    const handle = setTimeout(() => {
      api.get(domain.orgSearchUrl, { params: { search: orgSearch } })
        .then((r) => setOrgResults(Array.isArray(r.data) ? r.data : (r.data.results || [])))
        .catch(() => setOrgResults([]))
    }, 300)
    return () => clearTimeout(handle)
  }, [orgSearch, domain.orgSearchUrl])

  // Resetting type-conditional fields on type change avoids stale hidden-
  // field values lingering in state if the user switches types back and
  // forth — buildPayload below also only ever sends the field matching
  // the CURRENT type regardless, so this is belt-and-suspenders, not the
  // only guard.
  const setAssistanceType = (v) => setForm((f) => ({
    ...f,
    assistance_type: v,
    quantity: '',
    cash_amount: '',
    training_duration_days: '',
    equipment_type: '',
    seed_type: '',
    fertilizer_type: '',
  }))
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const isCashAssistance = form.assistance_type === 'Cash Assistance'
  const isTraining       = isTrainingType(form.assistance_type)
  const isEquipment      = isEquipmentType(form.assistance_type)
  const isSeeds          = isSeedsType(form.assistance_type)
  const isFertilizer     = isFertilizerType(form.assistance_type)

  const buildPayload = (dryRun) => {
    const assistanceType = form.assistance_type === 'Other' ? form.assistance_type_other.trim() : form.assistance_type
    const quantity = isCashAssistance
      ? (form.cash_amount ? `₱${form.cash_amount} per head` : '')
      : isTraining ? '' : form.quantity
    return {
      assistance_type: assistanceType,
      source_agencies: form.source_agencies,
      date_given: form.date_given,
      quantity,
      description: form.description,
      season: form.season,
      // Only the field matching the CURRENT type is ever sent — even if
      // something stale slipped past the reset above, it never reaches
      // the request for the wrong type.
      ...buildTypeConditionalPayload(form.assistance_type, form),
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
    if (form.assistance_type === 'Other' && !form.assistance_type_other.trim()) {
      showToast('Please specify the assistance type.', 'error'); return
    }
    if (isCashAssistance && (!form.cash_amount || Number(form.cash_amount) <= 0)) {
      showToast('Enter a valid cash amount per head.', 'error'); return
    }
    const trainingError = validateTrainingDuration(form.assistance_type, form)
    if (trainingError) { showToast(trainingError, 'error'); return }
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
      setResultFilter('all')
      setStep('result')
      onSuccess?.()
    } catch (err) {
      const data = err?.response?.data
      setError((data && typeof data === 'object' && Object.values(data)[0]) || 'Failed to distribute assistance.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleStartNew = () => {
    setOrg(null)
    setOrgSearch('')
    setForm(EMPTY_FORM(domain))
    setPreview(null)
    setFinalResult(null)
    setError('')
    setStep('form')
  }

  const skippedInPreview = (preview?.results || []).filter((r) => r.status === 'skipped')
  const blockedInPreview = (preview?.results || []).filter((r) => r.status === 'would_block')
  const eligibleCount = preview ? preview.member_count - skippedInPreview.length - blockedInPreview.length : 0

  const assistanceTypeDisplay = form.assistance_type === 'Other' ? form.assistance_type_other.trim() : form.assistance_type
  const typeFieldDisplay = isEquipment ? form.equipment_type : isSeeds ? form.seed_type : isFertilizer ? form.fertilizer_type : ''
  const quantityDisplay = isCashAssistance
    ? `₱${form.cash_amount} per head`
    : isTraining
      ? `${form.training_duration_days || '—'} day${form.training_duration_days === '1' ? '' : 's'}`
      : (form.quantity || '—') + (typeFieldDisplay ? ` — ${typeFieldDisplay}` : '')

  const createdResults = (finalResult?.results || []).filter((r) => r.status === 'created')
  const skippedResults = (finalResult?.results || []).filter((r) => r.status === 'skipped')
  const errorResults   = (finalResult?.results || []).filter((r) => r.status === 'error')
  const blockedResults = (finalResult?.results || []).filter((r) => r.status === 'blocked')

  const RESULT_TABS = finalResult ? [
    { key: 'all',     label: `All ${finalResult.results.length}` },
    { key: 'created', label: `${createdResults.length} Created` },
    ...(skippedResults.length ? [{ key: 'skipped', label: `${skippedResults.length} Skipped` }] : []),
    ...(blockedResults.length ? [{ key: 'blocked', label: `${blockedResults.length} Blocked` }] : []),
    ...(errorResults.length ? [{ key: 'error', label: `${errorResults.length} Error` }] : []),
  ] : []

  const visibleResults = !finalResult ? [] : finalResult.results.filter((r) => {
    if (resultFilter === 'all') return true
    return r.status === resultFilter
  })

  return (
    <ModalShell
      title="Distribute to Organization"
      subtitle={`Issue assistance to every current ${domain.personLabel.toLowerCase()} member in one operation.`}
      icon={Users}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'form' && (
        <form onSubmit={handlePreview} className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <SectionEyebrow>Target Organization</SectionEyebrow>
            <FormField label={domain.orgLabel} required pillLabel>
              {!org ? (
                <div className="relative">
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
                </div>
              ) : (
                <div className="flex items-start gap-3 rounded-xl border border-[#C8D5C8] bg-[#EBF5EE] p-4">
                  <div className="w-9 h-9 rounded-lg bg-[#D7E7D9] flex items-center justify-center shrink-0">
                    <Building2 size={18} className="text-[#1B4D2E]" aria-hidden="true" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] font-semibold text-[#1A2B1A]">{org.name}</p>
                    <p className="mt-0.5 text-[12px] text-[#5A6B5C]">
                      {org.barangay}
                      {org.member_count != null ? ` · ${org.member_count} member${org.member_count === 1 ? '' : 's'}` : ''}
                      {org.contact_person ? ` · Contact: ${org.contact_person}` : ''}
                    </p>
                  </div>
                  <button type="button" onClick={() => setOrg(null)} className="text-xs font-medium text-rose-600 hover:underline shrink-0">Change</button>
                </div>
              )}
            </FormField>
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5 space-y-4">
            <SectionEyebrow className="mb-0">Assistance Details</SectionEyebrow>
            <FormField label="Assistance Type" required pillLabel>
              <ComboboxWithOther
                options={domain.assistanceTypeOptions.filter((o) => o !== 'Other')}
                value={form.assistance_type}
                otherValue={form.assistance_type_other}
                onChange={setAssistanceType}
                onOtherChange={(v) => set('assistance_type_other', v)}
                placeholder="Select Assistance Type"
              />
            </FormField>

            <FormField label="Source Agency" pillLabel>
              <SourceAgencyMultiSelect value={form.source_agencies} onChange={(v) => set('source_agencies', v)} />
            </FormField>

            {/* Type-conditional fields — exactly one quantity-shaped field
                (Amount for Cash, Duration for Training, Quantity for
                everything else) plus, for Equipment/Seeds/Fertilizer only,
                a second field naming what kind. */}
            <div className="grid gap-4 sm:grid-cols-2">
              {isCashAssistance && (
                <FormField label="Amount per Member (₱)" required pillLabel>
                  <input type="number" step="0.01" min="0.01" className={baseInputClasses} value={form.cash_amount}
                    onChange={(e) => set('cash_amount', e.target.value)} placeholder="e.g. 500.00" />
                </FormField>
              )}
              {isTraining && (
                <FormField label="Duration of Training (days)" required pillLabel>
                  <input type="number" min="1" max="3" step="1" className={baseInputClasses} value={form.training_duration_days}
                    onChange={(e) => set('training_duration_days', e.target.value)} placeholder="1–3 days" />
                </FormField>
              )}
              {!isCashAssistance && !isTraining && (
                <FormField label="Quantity per Member" pillLabel>
                  <input className={baseInputClasses} value={form.quantity} onChange={(e) => set('quantity', e.target.value)} placeholder="e.g. 1 sack" />
                </FormField>
              )}
              <TypeConditionalFields assistanceType={form.assistance_type} form={form} set={set} pillLabel />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Distribution Date" required pillLabel>
                <input type="date" className={baseInputClasses} value={form.date_given} onChange={(e) => set('date_given', e.target.value)} />
                <p className="mt-1 text-[11px] text-[#7A8E7A]">A future date schedules the distribution — it stays Pending until that date arrives.</p>
              </FormField>
              {domain.seasonOptions ? (
                <FormField label="Season" pillLabel>
                  <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
                    <option value="">Select…</option>
                    {domain.seasonOptions.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormField>
              ) : (
                <FormField label="Season" pillLabel>
                  <input className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)} />
                </FormField>
              )}
            </div>

            <FormField label="Description" pillLabel>
              <textarea rows={2} className={baseInputClasses} value={form.description} onChange={(e) => set('description', e.target.value)} />
            </FormField>
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isBusy}>
              Review Distribution <ArrowRight size={14} className="ml-0.5" aria-hidden="true" />
            </Button>
          </div>
        </form>
      )}

      {step === 'confirm' && preview && (
        <div className="stagger-item mt-6 space-y-4">
          <SectionEyebrow>Confirm Distribution</SectionEyebrow>

          <div className="rounded-2xl bg-[#1B4D2E] p-6 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">You Are About to Distribute</p>
            <p className="mt-2 text-[26px] font-semibold leading-tight">{quantityDisplay}</p>
            <p className="text-[15px] font-medium text-[#D7E7D9]">{assistanceTypeDisplay}</p>
            <div className="my-4 border-t border-white/15" />
            <p className="text-[13px] text-[#B7CBBB]">To all current members of</p>
            <p className="text-[15px] font-semibold">{preview.organization_name}</p>
            <p className="mt-0.5 text-[13px] text-[#B7CBBB]">
              on <span className="font-semibold text-white">{formatDateLong(form.date_given)}</span>
            </p>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <StatTile value={preview.member_count} label="Total members" />
            <StatTile value={eligibleCount} label="Eligible recipients" />
            <StatTile value={blockedInPreview.length} label="Blocked — already received" />
          </div>

          {skippedInPreview.length > 0 && (
            <div className="rounded-2xl border border-[#F3DDA6] bg-[#FDF3DC] p-4">
              <p className="text-[13px] font-semibold text-[#8A5207]">{skippedInPreview.length} member(s) will be skipped</p>
              <div className="mt-2 space-y-2">
                {skippedInPreview.map((r) => (
                  <div key={r.person_id} className="rounded-xl bg-white p-3">
                    <p className="text-[13px] font-medium text-[#1A2B1A]">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-[#8A5207]">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {blockedInPreview.length > 0 && (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4">
              <div className="flex items-center gap-2">
                <AlertTriangle size={16} className="text-rose-700" aria-hidden="true" />
                <p className="text-[13px] font-semibold text-rose-700">{blockedInPreview.length} member(s) will be blocked</p>
              </div>
              <p className="mt-1.5 text-[13px] text-rose-700">
                These members will NOT receive a record — they already received this assistance type from
                another organization within the last 30 days. Only one organization's distribution counts
                per person in that window.
              </p>
              <div className="mt-3 space-y-2">
                {blockedInPreview.map((r) => (
                  <div key={r.person_id} className="rounded-xl bg-white p-3">
                    <p className="text-[13px] font-medium text-[#1A2B1A]">{r.name}</p>
                    <p className="mt-0.5 text-[12px] text-rose-700">{r.reason}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="mb-2 text-[13px] font-semibold text-[#1A2B1A]">Summary of what will happen:</p>
            <ul className="space-y-1 text-[13px] text-[#4A5A4C]">
              <li><span className="font-semibold text-[#1E5637]">{eligibleCount} record(s) created</span> — assistance logged for {eligibleCount} member{eligibleCount === 1 ? '' : 's'}</li>
              {blockedInPreview.length > 0 && (
                <li><span className="font-semibold text-rose-700">{blockedInPreview.length} blocked</span> — already received this assistance type from another organization within 30 days</li>
              )}
              <li>
                <span className={skippedInPreview.length ? 'font-semibold text-[#8A5207]' : 'font-semibold text-[#7A8E7A]'}>{skippedInPreview.length} record(s) skipped</span>
                {' — '}{skippedInPreview.length ? 'already enrolled in the selected program' : 'no duplicates in this batch'}
              </li>
            </ul>
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex items-center justify-between pt-1">
            <button type="button" onClick={() => setStep('form')} className="inline-flex items-center gap-1 text-[13px] font-medium text-[#7A8E7A] hover:text-[#1A2B1A] transition-colors">
              <ArrowLeft size={14} aria-hidden="true" /> Back to Edit
            </button>
            <Button type="button" isLoading={isBusy} onClick={handleConfirm}>Confirm and Distribute</Button>
          </div>
        </div>
      )}

      {step === 'result' && finalResult && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CC] bg-[#EBF5EE] p-4">
            <CheckCircle2 size={20} className="mt-0.5 text-[#1E5637] shrink-0" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-semibold text-[#1E5637]">Distribution Complete</p>
              <p className="mt-0.5 text-[13px] text-[#1A2B1A]">
                <span className="font-semibold">{createdResults.length}</span> record{createdResults.length === 1 ? '' : 's'} created,{' '}
                <span className="font-semibold">{skippedResults.length}</span> skipped,{' '}
                <span className="font-semibold text-rose-700">{blockedResults.length}</span> blocked
              </p>
              <p className="mt-1 text-[11px] text-[#5A6B5C]">{finalResult.organization_name}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <SectionEyebrow className="mb-0">Per-Member Outcome</SectionEyebrow>
              <div className="flex flex-wrap gap-1.5">
                {RESULT_TABS.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setResultFilter(t.key)}
                    className={
                      'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ' +
                      (resultFilter === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-[#F0F4F0] text-[#5A6B5C] hover:bg-[#E2E8E2]')
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="-mx-5 divide-y divide-[#F0F4F0]">
              {visibleResults.map((r) => (
                <div key={r.person_id} className="flex items-center gap-3 px-5 py-3">
                  <AvatarInitials name={r.name} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#1A2B1A]">{r.name}</p>
                    {r.id_number && <p className="text-[11px] text-[#A8BCA8]">{r.id_number}</p>}
                    {r.reason && (
                      <p className={`mt-0.5 text-[12px] ${r.status === 'error' || r.status === 'blocked' ? 'text-rose-600' : 'text-[#8A5207]'}`}>{r.reason}</p>
                    )}
                  </div>
                  <StatusPill tone={STATUS_TONE[r.status] || 'slate'}>{STATUS_LABEL[r.status] || r.status}</StatusPill>
                </div>
              ))}
            </div>
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Close</Button>
            <Button type="button" onClick={handleStartNew}>Start New Distribution</Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
