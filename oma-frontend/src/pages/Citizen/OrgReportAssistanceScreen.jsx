import { useState } from 'react'
import { CheckCircle2, ChevronRight, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { labels } from './labels.js'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'
import OrgMemberPicker from './OrgMemberPicker.jsx'
import { ORG_FIELD_LABEL, ORG_SURFACE } from './orgStyles.js'
import { todayISO } from '../../utils/localDate.js'

// Organization Reference rebuild — Mag-report ng Tulong (image5-7, 17, 19,
// 20). This screen now consolidates what used to be THREE separate code
// paths (this screen's own org-wide-only form, CitizenReportAssistanceModal
// via the Members screen's Gift icon, and MyOrgReportingSection's inline
// search-and-report section) into one real entry point: a chooser
// ("Para sa Isang Miyembro" / "I-distribute sa Buong Organisasyon"), then
// one focused form per choice.
//
// FIELDS: the reference's own screenshots of both forms show only a type
// dropdown and a date — but BeneficiaryRecord actually stores quantity,
// source agency, description, and season too (real, backend-required
// columns), same as this screen's previous version. Per explicit
// confirmation, those stay; only the STEP STRUCTURE was rebuilt to match
// the reference's chooser -> focused-form flow.
//
// REMOVED CAPABILITY, flagged rather than silently dropped: the old
// MyOrgReportingSection also had an inline "edit a past entry" action
// (reusing CitizenReportAssistanceModal in edit mode). The reference's own
// Kasaysayan ng Reporting screen (OrgReportHistoryScreen.jsx) has no edit
// affordance anywhere, and this consolidation removes the only UI path
// that reached it. The backend PATCH endpoint (domain.detailUrl) still
// exists; there is simply no button wired to it anymore.

const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

// Per-type unit lists. Presentation only — quantity is a free-text
// CharField server-side; the chosen unit is composed into it
// ("2 bags (50 kg)"), which is exactly the shape the history screen reads
// back in.
const UNIT_OPTIONS = {
  Fertilizer: ['bags (50 kg)', 'kg', 'sako'],
  Seeds: ['kg', 'bags', 'packs'],
  'Fingerlings/Seeds': ['pieces', 'bags', 'kg'],
  Feed: ['bags (25 kg)', 'kg', 'sako'],
  Equipment: ['unit', 'set', 'piece'],
  'Fishing Gear': ['unit', 'set', 'piece'],
  'Boat/Vessel': ['unit'],
  Training: ['session', 'day'],
}
const DEFAULT_UNITS = ['unit']
const unitsFor = (type) => UNIT_OPTIONS[type] || DEFAULT_UNITS

const L = labels.distributeAssistance
const R = labels.orgReportAssistance
const RA = labels.reportAssistance

const FIELD_LABEL = ORG_FIELD_LABEL
const CARD = `${ORG_SURFACE} p-4`

// Type selector alone (image5/6/20's "URI NG TULONG" dropdown) — split out
// from the amount fields below so the org-wide flow can show just this +
// the date on its own first wizard step, matching the reference exactly,
// while the member form still renders type+amount together in one step.
function AssistanceTypeField({ domain, form, set, fieldBox }) {
  const isOtherType = form.assistance_type === 'Other'
  return (
    <div className={CARD}>
      <label className={FIELD_LABEL} htmlFor="assistance-type">{R.typeHeading}</label>
      <select
        id="assistance-type"
        value={form.assistance_type}
        onChange={(e) => set('typeChange', e.target.value)}
        className={fieldBox}
      >
        {domain.assistanceTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
      </select>
      {isOtherType && (
        <input
          type="text"
          value={form.assistance_type_other}
          onChange={(e) => set('assistance_type_other', e.target.value)}
          placeholder={R.otherTypePlaceholder}
          className={`${fieldBox} mt-3`}
        />
      )}
    </div>
  )
}

// Quantity/unit (or cash amount) — the real backend-required fields the
// reference's own screenshots don't show on this step, kept per earlier
// explicit instruction. Split from the type selector for the same reason.
function AssistanceAmountFields({ theme, form, set }) {
  const isCash = form.assistance_type === 'Cash Assistance'
  return (
    <div className={CARD}>
      {isCash ? (
        <>
          <label className={FIELD_LABEL} htmlFor="cash-amount">{R.cashPerMember}</label>
          <div className={`flex items-center gap-2 rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 ${theme.focusWithinBorder}`}>
            <span className="text-[14px] text-cz-text-2" aria-hidden="true">₱</span>
            <input
              id="cash-amount"
              type="number" step="0.01" min="0.01"
              value={form.cash_amount}
              onChange={(e) => set('cash_amount', e.target.value)}
              placeholder="0"
              className="min-h-[46px] w-full bg-transparent text-[14px] text-cz-text outline-none"
            />
          </div>
          {form.cash_amount && Number(form.cash_amount) > 0 && (
            <p className={`mt-2.5 rounded-[8px] px-3 py-2 text-[13px] font-semibold ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
              {R.cashPreview(Number(form.cash_amount).toLocaleString('en-PH'))}
            </p>
          )}
        </>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={FIELD_LABEL} htmlFor="qty">{R.quantity}</label>
            <input
              id="qty" type="text"
              value={form.quantity}
              onChange={(e) => set('quantity', e.target.value)}
              placeholder="0"
              className="min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 text-[14px] text-cz-text outline-none"
            />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="unit">{R.unit}</label>
            <select id="unit" value={form.unit} onChange={(e) => set('unit', e.target.value)} className="min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 text-[14px] text-cz-text outline-none">
              {unitsFor(form.assistance_type).map((u) => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>
        </div>
      )}
    </div>
  )
}

// Combines the two above, in order — the member form (image6/19) isn't
// wizard-split, so it renders type+amount together in one step exactly as
// this function did before the org-wide flow's step split.
function AssistanceTypeAndAmountFields({ theme, domain, form, set, fieldBox }) {
  return (
    <>
      <AssistanceTypeField domain={domain} form={form} set={set} fieldBox={fieldBox} />
      <AssistanceAmountFields theme={theme} form={form} set={set} />
    </>
  )
}

// Date alone (image5/20 step 1's "PETSA NG DISTRIBUSYON").
function DateField({ form, set, fieldBox }) {
  return (
    <div className={CARD}>
      <label className={FIELD_LABEL} htmlFor="date-given">{L.fields.dateGiven}</label>
      <input id="date-given" type="date" value={form.date_given} onChange={(e) => set('date_given', e.target.value)} className={fieldBox} />
      <p className="mt-1.5 text-[12px] text-cz-text-2">{R.futureDateHint}</p>
    </div>
  )
}

// Source/season/description — the real required fields the reference never
// shows for the org-wide flow (its screenshots stop at type+date). Rendered
// on the org-wide wizard's SECOND step, alongside the amount fields.
function SourceSeasonDescriptionFields({ domain, form, set, fieldBox }) {
  return (
    <div className={`${CARD} space-y-3`}>
      <div>
        <label className={FIELD_LABEL} htmlFor="source-agency">{L.fields.sourceAgency}</label>
        <ComboboxWithOther
          options={SOURCE_AGENCY_OPTIONS}
          value={form.source_agency}
          otherValue={form.source_agency_other}
          onChange={(v) => set('source_agency', v)}
          onOtherChange={(v) => set('source_agency_other', v)}
          otherLabel={R.other}
          placeholder={R.notSpecified}
          inputClassName={fieldBox}
        />
      </div>
      {domain.seasonOptions && (
        <div>
          <label className={FIELD_LABEL} htmlFor="season">{L.fields.season}</label>
          <select id="season" value={form.season} onChange={(e) => set('season', e.target.value)} className={fieldBox}>
            {domain.seasonOptions.map((s) => <option key={s} value={s}>{labels.harvest.seasonOptions?.[s] || s}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={FIELD_LABEL} htmlFor="description">{L.fields.description}</label>
        <textarea id="description" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={`${fieldBox} py-2.5`} />
      </div>
    </div>
  )
}

// Member form (image6/19) keeps date+source+season+description together in
// ONE card, unchanged from before this rewrite — only the org-wide flow is
// wizard-split (DateField / SourceSeasonDescriptionFields above, rendered
// as two separate steps with their own card each).
function DateSourceSeasonDescriptionFields({ domain, form, set, fieldBox }) {
  return (
    <div className={`${CARD} space-y-3`}>
      <div>
        <label className={FIELD_LABEL} htmlFor="date-given">{L.fields.dateGiven}</label>
        <input id="date-given" type="date" value={form.date_given} onChange={(e) => set('date_given', e.target.value)} className={fieldBox} />
        <p className="mt-1.5 text-[12px] text-cz-text-2">{R.futureDateHint}</p>
      </div>
      <div>
        <label className={FIELD_LABEL} htmlFor="source-agency">{L.fields.sourceAgency}</label>
        <ComboboxWithOther
          options={SOURCE_AGENCY_OPTIONS}
          value={form.source_agency}
          otherValue={form.source_agency_other}
          onChange={(v) => set('source_agency', v)}
          onOtherChange={(v) => set('source_agency_other', v)}
          otherLabel={R.other}
          placeholder={R.notSpecified}
          inputClassName={fieldBox}
        />
      </div>
      {domain.seasonOptions && (
        <div>
          <label className={FIELD_LABEL} htmlFor="season">{L.fields.season}</label>
          <select id="season" value={form.season} onChange={(e) => set('season', e.target.value)} className={fieldBox}>
            {domain.seasonOptions.map((s) => <option key={s} value={s}>{labels.harvest.seasonOptions?.[s] || s}</option>)}
          </select>
        </div>
      )}
      <div>
        <label className={FIELD_LABEL} htmlFor="description">{L.fields.description}</label>
        <textarea id="description" rows={2} value={form.description} onChange={(e) => set('description', e.target.value)} className={`${fieldBox} py-2.5`} />
      </div>
    </div>
  )
}

const emptyForm = (domain) => ({
  assistance_type: domain.assistanceTypeOptions[0],
  assistance_type_other: '',
  source_agency: '',
  source_agency_other: '',
  date_given: todayISO(),
  quantity: '',
  unit: unitsFor(domain.assistanceTypeOptions[0])[0],
  cash_amount: '',
  description: '',
  season: domain.seasonOptions ? domain.seasonOptions[0] : '',
})

export default function OrgReportAssistanceScreen({
  domain, orgId, orgName, members, onBack, tabBar, onSuccess,
}) {
  const theme = domain.dashboardTheme
  // The org-wide distribution goes to ACTIVE members only (the backend
  // filters the same way), so every "N kasapi" shown for that flow counts
  // active rows. The per-member picker below still lists everyone — an
  // inactive member can legitimately still be reported for.
  const activeMemberCount = members.filter((m) => domain.rowIsActive(m)).length
  const fieldBox = `min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 text-[14px] text-cz-text outline-none ${theme.focusBorder}`

  const [step, setStep] = useState('chooser') // 'chooser' | 'memberForm' | 'orgForm' | 'orgFormDetails' | 'confirm' | 'result'
  const [memberId, setMemberId] = useState('')
  const [form, setForm] = useState(emptyForm(domain))
  const [preview, setPreview] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const set = (field, value) => {
    if (field === 'typeChange') {
      setForm((f) => ({ ...f, assistance_type: value, unit: unitsFor(value)[0] }))
      return
    }
    setForm((f) => ({ ...f, [field]: value }))
  }

  const isCash = form.assistance_type === 'Cash Assistance'
  const isOtherType = form.assistance_type === 'Other'
  const resolvedType = isOtherType ? form.assistance_type_other.trim() : form.assistance_type

  const extractError = (err) => {
    const data = err?.response?.data
    return (data && typeof data === 'object' ? Object.values(data).flat()[0] : null) || data?.detail || null
  }

  const resetToChooser = () => {
    setStep('chooser')
    setMemberId('')
    setForm(emptyForm(domain))
    setPreview(null)
    setFinalResult(null)
    setErrorMessage('')
  }

  // ── "Para sa Isang Miyembro" — single save, no preview step, matching
  // image6/19 exactly (a plain "I-save" button, not a two-step flow).
  const submitMemberForm = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!memberId) { setErrorMessage(RA.errors.requiredFields); return }
    if (!form.assistance_type || !form.date_given) { setErrorMessage(RA.errors.requiredFields); return }
    if (isOtherType && !form.assistance_type_other.trim()) { setErrorMessage(RA.errors.specifyAssistanceType); return }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) { setErrorMessage(RA.errors.specifySourceAgency); return }
    if (isCash ? (!form.cash_amount || Number(form.cash_amount) <= 0) : !form.quantity.trim()) {
      setErrorMessage(isCash ? RA.errors.invalidCashAmount : RA.errors.requiredFields)
      return
    }
    const row = members.find((m) => String(domain.rowPersonId(m)) === String(memberId))
    setIsBusy(true)
    try {
      const sourceAgency = form.source_agency === 'Other' ? form.source_agency_other.trim() : form.source_agency
      const quantity = isCash ? `₱${form.cash_amount} per head` : [form.quantity, form.unit].filter(Boolean).join(' ')
      const otherNote = isOtherType && form.assistance_type_other.trim() ? `Other: ${form.assistance_type_other.trim()}` : ''
      const remarks = [otherNote, form.description.trim()].filter(Boolean).join(' — ')
      await api.post(domain.createUrl, {
        assistance_type: form.assistance_type,
        // This screen's own single-select UI is unchanged — wrapped into a
        // one-item list to match source_agencies' new shape on the model,
        // same conversion the data migration applied to existing rows.
        source_agencies: sourceAgency ? [sourceAgency] : [],
        quantity,
        date_given: form.date_given,
        season: form.season,
        remarks,
        year: new Date(form.date_given).getFullYear(),
        [domain.personField]: domain.rowPersonId(row),
      })
      onSuccess?.()
      onBack()
    } catch (err) {
      setErrorMessage(extractError(err) || RA.errors.genericSaveError)
    } finally {
      setIsBusy(false)
    }
  }

  // ── "I-distribute sa Organisasyon" — unchanged dry_run -> confirm ->
  // submit contract, just restructured under the chooser.
  const buildOrgPayload = (dryRun) => {
    const sourceAgency = form.source_agency === 'Other' ? form.source_agency_other.trim() : form.source_agency
    const quantity = isCash
      ? (form.cash_amount ? `₱${form.cash_amount} per head` : '')
      : [form.quantity, form.unit].filter(Boolean).join(' ')
    const otherNote = isOtherType && form.assistance_type_other.trim() ? `Other: ${form.assistance_type_other.trim()}` : ''
    const description = [otherNote, form.description.trim()].filter(Boolean).join(' — ')
    return {
      assistance_type: form.assistance_type,
      // See handleSubmit's own identical comment above.
      source_agencies: sourceAgency ? [sourceAgency] : [],
      date_given: form.date_given,
      quantity,
      description,
      season: form.season,
      ...(dryRun ? { dry_run: true } : {}),
    }
  }

  // ── Org-wide wizard step 1 -> 2 (image5/20's "Susunod: I-preview").
  // Only validates what step 1 actually collects — type + date — the rest
  // (quantity/source/season/description) is validated by handlePreview once
  // the user reaches step 2 and actually previews.
  const handleOrgStep1Next = (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!form.assistance_type || !form.date_given) { setErrorMessage(L.errors.requiredFields); return }
    if (isOtherType && !form.assistance_type_other.trim()) { setErrorMessage(L.errors.specifyAssistanceType); return }
    setStep('orgFormDetails')
  }

  const handlePreview = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!form.assistance_type || !form.date_given) { setErrorMessage(L.errors.requiredFields); return }
    if (isOtherType && !form.assistance_type_other.trim()) { setErrorMessage(L.errors.specifyAssistanceType); return }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) { setErrorMessage(L.errors.specifySourceAgency); return }
    if (isCash && (!form.cash_amount || Number(form.cash_amount) <= 0)) { setErrorMessage(L.errors.invalidCashAmount); return }
    setIsBusy(true)
    try {
      const r = await api.post(domain.distributeUrl(orgId), buildOrgPayload(true))
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
      const r = await api.post(domain.distributeUrl(orgId), buildOrgPayload(false))
      setFinalResult(r.data)
      setStep('result')
      onSuccess?.()
    } catch (err) {
      setErrorMessage(extractError(err) || L.errors.distributeFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const blocked = (preview?.results || []).filter((r) => r.status === 'would_block')

  const statusBadge = (status) => {
    if (status === 'created') return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#15803D]"><CheckCircle2 size={13} /> {L.statusCreated}</span>
    if (status === 'blocked') return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-cz-danger-accent"><XCircle size={13} /> {L.statusBlocked}</span>
    return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-cz-danger-accent"><XCircle size={13} /> {L.statusError}</span>
  }

  const primaryBtn = `press-scale flex min-h-[48px] w-full items-center justify-center rounded-[10px] text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`
  const ghostBtn = 'press-scale flex min-h-[46px] w-full items-center justify-center rounded-[10px] border-[0.5px] border-cz-border-strong bg-white text-[14px] text-cz-text-2 transition-colors hover:bg-[#F6F5F1]'

  const shellNav = (key) => (key === 'home' ? onBack() : onBack())

  // ── Chooser (image7/17) ────────────────────────────────────────────
  if (step === 'chooser') {
    return (
      <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={shellNav} tabBar={tabBar} wide={false} pageKey={step}>
        <OrgPageHeader title={R.title} subtitle={R.chooserSubtitle} onBack={onBack} />
        <div className="max-w-lg space-y-3">
          <button
            type="button"
            onClick={() => { setForm(emptyForm(domain)); setStep('memberForm') }}
            className={`${CARD} press-scale w-full text-left transition-colors hover:bg-[#F6F5F1]`}
          >
            <span className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-semibold ${theme.accentText}`}>{R.chooseMemberTitle}</span>
                <span className="mt-1 block text-[13px] leading-[1.45] text-cz-text-2">{R.chooseMemberBody}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
            </span>
          </button>
          <button
            type="button"
            onClick={() => { setForm(emptyForm(domain)); setStep('orgForm') }}
            className={`${CARD} press-scale w-full text-left transition-colors hover:bg-[#F6F5F1]`}
          >
            <span className="flex items-center gap-3">
              <span className="min-w-0 flex-1">
                <span className={`block text-[15px] font-semibold ${theme.accentText}`}>{R.chooseOrgTitle}</span>
                <span className="mt-1 block text-[13px] leading-[1.45] text-cz-text-2">{R.chooseOrgBody(activeMemberCount)}</span>
              </span>
              <ChevronRight size={18} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
            </span>
          </button>
        </div>
      </OrgShell>
    )
  }

  // ── Para sa Isang Miyembro (image6/19) ──────────────────────────────
  if (step === 'memberForm') {
    return (
      <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={shellNav} tabBar={tabBar} wide={false} pageKey={step}>
        <OrgPageHeader title={R.memberFormTitle} subtitle={R.memberFormSubtitle} onBack={resetToChooser} />
        <form onSubmit={submitMemberForm} className="max-w-lg space-y-4">
          <div>
            <label className={FIELD_LABEL} htmlFor="member-select">{R.memberFieldLabel}</label>
            <OrgMemberPicker
              id="member-select"
              domain={domain}
              members={members}
              value={memberId}
              onChange={setMemberId}
            />
          </div>

          <AssistanceTypeAndAmountFields theme={theme} domain={domain} form={form} set={set} fieldBox={fieldBox} />
          <DateSourceSeasonDescriptionFields domain={domain} form={form} set={set} fieldBox={fieldBox} />

          {errorMessage && (
            <p className="rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">{errorMessage}</p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={resetToChooser} className={ghostBtn}>{labels.common.cancel}</button>
            <button type="submit" disabled={isBusy} className={primaryBtn}>{labels.common.save}</button>
          </div>
        </form>
      </OrgShell>
    )
  }

  // ── I-distribute sa Organisasyon, step 1 (image5/20) — type + date only,
  // matching the reference's own two fields and "Susunod: I-preview" button
  // exactly. The rest of the real fields live on step 2 below, which the
  // reference doesn't show (its screenshots stop here).
  if (step === 'orgForm') {
    return (
      <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={shellNav} tabBar={tabBar} wide={false} pageKey={step}>
        <OrgPageHeader title={R.orgFormTitle} subtitle={R.orgFormSubtitle(activeMemberCount)} onBack={resetToChooser} />
        <form onSubmit={handleOrgStep1Next} className="max-w-lg space-y-4">
          <AssistanceTypeField domain={domain} form={form} set={set} fieldBox={fieldBox} />
          <DateField form={form} set={set} fieldBox={fieldBox} />

          {errorMessage && (
            <p className="rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">{errorMessage}</p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={resetToChooser} className={ghostBtn}>{labels.common.cancel}</button>
            <button type="submit" disabled={activeMemberCount === 0} className={primaryBtn}>{R.step1NextButton}</button>
          </div>
        </form>
      </OrgShell>
    )
  }

  // ── I-distribute sa Organisasyon, step 2 — the real required fields the
  // reference's screenshots don't reach (quantity/cash, source, season,
  // description), plus the recipients summary, ending in the actual preview
  // trigger. Not shown in the reference; organized to match its own card
  // patterns since there is nothing here to match literally.
  if (step === 'orgFormDetails') {
    return (
      <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={shellNav} tabBar={tabBar} wide={false} pageKey={step}>
        <OrgPageHeader title={R.orgFormTitle} subtitle={R.orgFormSubtitle(activeMemberCount)} onBack={() => setStep('orgForm')} />
        <form onSubmit={handlePreview} className="max-w-lg space-y-4">
          <AssistanceAmountFields theme={theme} form={form} set={set} />
          <SourceSeasonDescriptionFields domain={domain} form={form} set={set} fieldBox={fieldBox} />

          <div>
            <p className={FIELD_LABEL}>{R.recipientsHeading}</p>
            <div className={CARD}>
              <div className="flex items-start gap-3">
                <span className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] text-white ${theme.solidBtn}`} aria-hidden="true">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4">
                    <path d="M4 12.5l5.5 5.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <p className="text-[15px] font-semibold text-cz-text">{R.allMembers}</p>
                  <p className="mt-0.5 text-[13px] text-cz-text-2">{R.memberCount(activeMemberCount)}</p>
                </div>
              </div>
              <p className="mt-2.5 border-t-[0.5px] border-cz-border pt-2.5 text-[12px] leading-[1.45] text-cz-text-2">{R.allMembersNote}</p>
            </div>
          </div>

          {errorMessage && (
            <p className="rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">{errorMessage}</p>
          )}

          <div className="flex gap-3">
            <button type="button" onClick={() => setStep('orgForm')} className={ghostBtn}>{labels.common.cancel}</button>
            <button type="submit" disabled={isBusy || activeMemberCount === 0} className={primaryBtn}>{R.previewButton}</button>
          </div>
        </form>
      </OrgShell>
    )
  }

  // ── Confirmation (unchanged dry_run contract) ───────────────────────
  if (step === 'confirm' && preview) {
    return (
      <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={shellNav} tabBar={tabBar} wide={false} pageKey={step}>
        <OrgPageHeader title={R.confirmTitle} onBack={() => setStep('orgFormDetails')} />
        <div className={`${CARD} max-w-lg space-y-1.5`}>
          <p className="text-[13px] text-cz-text-2"><span className="font-semibold text-cz-text">{L.organizationLabel}:</span> {preview.organization_name}</p>
          <p className="text-[13px] text-cz-text-2"><span className="font-semibold text-cz-text">{L.currentMembers}:</span> {preview.member_count}</p>
          <p className="text-[13px] text-cz-text-2">
            <span className="font-semibold text-cz-text">{L.assistanceSummary}:</span>{' '}
            {resolvedType}{isCash ? L.perHeadSummary(form.cash_amount) : (form.quantity ? ` — ${form.quantity} ${form.unit}` : '')}
            {L.onDate(labels.common.formatDate(form.date_given))}
          </p>
        </div>

        {blocked.length > 0 && (
          <div className="mt-3 max-w-lg rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-3.5">
            <p className="text-[13px] font-semibold text-cz-danger-body">{L.willBlock(blocked.length)}</p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-cz-danger-body">
              {blocked.map((r) => <li key={r.person_id}>{r.name} — {r.reason}</li>)}
            </ul>
          </div>
        )}

        <p className="mt-3 max-w-lg text-[13px] text-cz-text-2">{L.willReceive(preview.member_count - blocked.length)}</p>

        {errorMessage && (
          <p className="mt-3 max-w-lg rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">{errorMessage}</p>
        )}

        <div className="mt-4 max-w-lg space-y-2">
          <button type="button" disabled={isBusy} onClick={handleConfirm} className={primaryBtn}>{L.confirmButton}</button>
          <button type="button" onClick={() => setStep('orgFormDetails')} className={ghostBtn}>{L.back}</button>
        </div>
      </OrgShell>
    )
  }

  // ── Result ───────────────────────────────────────────────────────────
  if (step === 'result' && finalResult) {
    const created = finalResult.results.filter((r) => r.status === 'created').length
    return (
      <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={shellNav} tabBar={tabBar} wide={false} pageKey={step}>
        <OrgPageHeader title={R.resultTitle} onBack={onBack} />
        <div className={`${CARD} max-w-lg`}>
          <p className="text-[15px] font-semibold text-cz-text">{finalResult.organization_name}</p>
          <p className="mt-0.5 text-[13px] text-cz-text-2">
            {L.resultSummary(
              created,
              finalResult.results.filter((r) => r.status === 'blocked').length,
              finalResult.results.filter((r) => r.status === 'error').length,
            )}
          </p>
        </div>
        <ul className={`mt-3 max-w-lg ${ORG_SURFACE}`}>
          {finalResult.results.map((r, i) => (
            <li key={r.person_id} className={`px-4 py-3 ${i === finalResult.results.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[14px] text-cz-text">{r.name}</span>
                {statusBadge(r.status)}
              </div>
              {r.reason && <p className="mt-0.5 text-[12px] text-cz-text-2">{r.reason}</p>}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onBack} className={`${primaryBtn} mt-4 max-w-lg`}>{L.done}</button>
      </OrgShell>
    )
  }

  return null
}
