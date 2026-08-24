import { useState } from 'react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { labels } from './labels.js'
import { OrgScreen, OrgSectionLabel } from './OrgDashboardParts.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import { todayISO } from '../../utils/localDate.js'

// Reference images 5-8, built as ONE component with conditional rendering.
// The four drawn states are not four screens — they are this screen with a
// different assistance type selected:
//
//   image8  Fertilizer      -> DAMI + YUNIT, unit list "bags (50 kg)" ...
//   image7  Equipment       -> DAMI + YUNIT, unit list "unit / set / piece"
//   image5  Training        -> DAMI + YUNIT, unit list "session / day"
//   image6  Cash Assistance -> HALAGA BAWAT KASAPI, no unit, live preview
//
// The type list is the DOMAIN'S REAL ONE from orgDomainConfig, not the
// mockup's: a Fisherfolk Organization offers Fishing Gear / Boat-Vessel /
// Fingerlings-Seeds / Feed, which the mockup (drawn for a farmers org) never
// shows. Seven/eight types where the mockup draws five.
//
// RECIPIENTS: option (b), as agreed. The mockup draws a checkbox per member;
// real per-recipient subsets are a backend change that has not been made, so
// rather than draw checkboxes that would silently do nothing, this renders
// the select-all row (which IS what the endpoint does) and lists the members
// read-only so the user can still see exactly who is included.
//
// The submit path is untouched: the same dry_run preview -> mandatory
// confirmation -> real POST against domain.distributeUrl that Batch 12
// shipped. Only its presentation changed.

const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

// Per-type unit lists. These are presentation, not backend choices — the
// record's `quantity` is a free-text CharField, and the chosen unit is
// composed into it ("2 bags (50 kg)"), which is exactly the shape image9's
// history entries read back in.
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

const FIELD_LABEL = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-text-2'
// Base only — the focus-border colour is domain-specific (Field green vs
// Tide navy), so `fieldBox` below appends domain.theme.focusBorder per render.
const FIELD_BOX_BASE = 'min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 text-[14px] text-cz-text outline-none'
const CARD = 'rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]'

export default function OrgReportAssistanceScreen({
  domain, orgId, orgName, members, onBack, tabBar,
}) {
  const fieldBox = `${FIELD_BOX_BASE} ${domain.theme.focusBorder}`
  const [step, setStep] = useState('form') // 'form' | 'confirm' | 'result'
  const [form, setForm] = useState({
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
  const [preview, setPreview] = useState(null)
  const [finalResult, setFinalResult] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  // Switching type re-seeds the unit, so the unit shown always belongs to
  // the type shown — "session" can never linger over Fertilizer.
  const selectType = (type) => {
    setErrorMessage('')
    setForm((f) => ({ ...f, assistance_type: type, unit: unitsFor(type)[0] }))
  }

  const isCash = form.assistance_type === 'Cash Assistance'
  const isOtherType = form.assistance_type === 'Other'
  const resolvedType = isOtherType ? form.assistance_type_other.trim() : form.assistance_type

  // Identical payload shape to the modal this replaces.
  const buildPayload = (dryRun) => {
    const sourceAgency = form.source_agency === 'Other' ? form.source_agency_other.trim() : form.source_agency
    const quantity = isCash
      ? (form.cash_amount ? `₱${form.cash_amount} per head` : '')
      : [form.quantity, form.unit].filter(Boolean).join(' ')
    return {
      assistance_type: resolvedType,
      source_agency: sourceAgency,
      date_given: form.date_given,
      quantity,
      description: form.description,
      season: form.season,
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
    if (!form.assistance_type || !form.date_given) { setErrorMessage(L.errors.requiredFields); return }
    if (isOtherType && !form.assistance_type_other.trim()) { setErrorMessage(L.errors.specifyAssistanceType); return }
    if (form.source_agency === 'Other' && !form.source_agency_other.trim()) { setErrorMessage(L.errors.specifySourceAgency); return }
    if (isCash && (!form.cash_amount || Number(form.cash_amount) <= 0)) { setErrorMessage(L.errors.invalidCashAmount); return }
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
    } catch (err) {
      setErrorMessage(extractError(err) || L.errors.distributeFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const skipped = (preview?.results || []).filter((r) => r.status === 'skipped')
  const flagged = (preview?.results || []).filter((r) => r.note)

  const statusBadge = (status) => {
    if (status === 'created') {
      return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-[#15803D]"><CheckCircle2 size={13} /> {L.statusCreated}</span>
    }
    if (status === 'skipped') {
      return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-cz-tile-amber-fg"><AlertTriangle size={13} /> {L.statusSkipped}</span>
    }
    return <span className="inline-flex shrink-0 items-center gap-1 text-[12px] font-semibold text-cz-danger-accent"><XCircle size={13} /> {L.statusError}</span>
  }

  const primaryBtn = `flex min-h-[48px] w-full items-center justify-center rounded-[10px] ${domain.theme.header} text-[15px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50`
  const ghostBtn = 'flex min-h-[46px] w-full items-center justify-center rounded-[10px] border-[0.5px] border-cz-border-strong text-[14px] text-cz-text-2 transition-colors hover:bg-cz-org-panel'

  // ── Confirmation (unchanged dry_run contract, restyled) ──────────────
  if (step === 'confirm' && preview) {
    return (
      <OrgScreen title={R.confirmTitle} chipLabel={orgName} onBack={() => setStep('form')} tabBar={tabBar} theme={domain.theme}>
        <div className={`${CARD} space-y-1.5`}>
          <p className="text-[13px] text-cz-text-2">
            <span className="font-semibold text-cz-text">{L.organizationLabel}:</span> {preview.organization_name}
          </p>
          <p className="text-[13px] text-cz-text-2">
            <span className="font-semibold text-cz-text">{L.currentMembers}:</span> {preview.member_count}
          </p>
          <p className="text-[13px] text-cz-text-2">
            <span className="font-semibold text-cz-text">{L.assistanceSummary}:</span>{' '}
            {resolvedType}
            {isCash ? L.perHeadSummary(form.cash_amount) : (form.quantity ? ` — ${form.quantity} ${form.unit}` : '')}
            {L.onDate(labels.common.formatDate(form.date_given))}
          </p>
        </div>

        {skipped.length > 0 && (
          <div className="mt-3 rounded-[12px] border border-[#F5E0A3] bg-cz-alert-bg p-3.5">
            <p className="text-[13px] font-semibold text-cz-alert-title">{L.willSkip(skipped.length)}</p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-cz-alert-title/80">
              {skipped.map((r) => <li key={r.person_id}>{r.name} — {r.reason}</li>)}
            </ul>
          </div>
        )}

        {flagged.length > 0 && (
          <div className="mt-3 rounded-[12px] border-[0.5px] border-cz-tile-blue-fg/30 bg-cz-tile-blue-bg p-3.5">
            <p className="text-[13px] font-semibold text-cz-tile-blue-fg">{L.willFlag(flagged.length)}</p>
            <ul className="mt-1 space-y-0.5 text-[12px] text-cz-tile-blue-fg">
              {flagged.map((r) => <li key={r.person_id}>{r.name} — {r.note}</li>)}
            </ul>
          </div>
        )}

        <p className="mt-3 text-[13px] text-cz-text-2">{L.willReceive(preview.member_count - skipped.length)}</p>

        {errorMessage && (
          <p className="mt-3 rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        <div className="mt-4 space-y-2">
          <button type="button" disabled={isBusy} onClick={handleConfirm} className={primaryBtn}>
            {L.confirmButton}
          </button>
          <button type="button" onClick={() => setStep('form')} className={ghostBtn}>{L.back}</button>
        </div>
      </OrgScreen>
    )
  }

  // ── Result ───────────────────────────────────────────────────────────
  if (step === 'result' && finalResult) {
    const created = finalResult.results.filter((r) => r.status === 'created').length
    return (
      <OrgScreen title={R.resultTitle} chipLabel={orgName} onBack={onBack} tabBar={tabBar} theme={domain.theme}>
        <div className={CARD}>
          <p className="text-[15px] font-semibold text-cz-text">{finalResult.organization_name}</p>
          <p className="mt-0.5 text-[13px] text-cz-text-2">
            {L.resultSummary(
              created,
              finalResult.results.filter((r) => r.status === 'skipped').length,
              finalResult.results.filter((r) => r.status === 'error').length,
            )}
          </p>
        </div>
        <ul className="mt-3 overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {finalResult.results.map((r, i) => (
            <li
              key={r.person_id}
              className={`px-4 py-3 ${i === finalResult.results.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[14px] text-cz-text">{r.name}</span>
                {statusBadge(r.status)}
              </div>
              {(r.reason || r.note) && <p className="mt-0.5 text-[12px] text-cz-text-2">{r.reason || r.note}</p>}
            </li>
          ))}
        </ul>
        <button type="button" onClick={onBack} className={`${primaryBtn} mt-4`}>{L.done}</button>
      </OrgScreen>
    )
  }

  // ── Form (images 5-8) ────────────────────────────────────────────────
  return (
    <OrgScreen title={R.title} chipLabel={orgName} onBack={onBack} tabBar={tabBar} theme={domain.theme}>
      <form onSubmit={handlePreview}>
        {/* URI NG TULONG — segmented pills, real per-domain type list */}
        <OrgSectionLabel>{R.typeHeading}</OrgSectionLabel>
        <div className="flex flex-wrap gap-2">
          {domain.assistanceTypeOptions.map((type) => {
            const active = form.assistance_type === type
            return (
              <button
                key={type}
                type="button"
                aria-pressed={active}
                onClick={() => selectType(type)}
                className={`min-h-[42px] rounded-[10px] px-4 text-[14px] font-semibold transition-colors ${
                  active
                    ? `${domain.theme.header} text-white`
                    : 'border-[0.5px] border-cz-border bg-cz-surface text-cz-text hover:bg-cz-org-panel'
                }`}
              >
                {type}
              </button>
            )
          })}
        </div>

        {isOtherType && (
          <input
            type="text"
            value={form.assistance_type_other}
            onChange={(e) => set('assistance_type_other', e.target.value)}
            placeholder={R.otherTypePlaceholder}
            aria-label={R.otherTypePlaceholder}
            className={`${fieldBox} mt-3`}
          />
        )}

        {/* Amount block — the one part that genuinely differs by type */}
        <div className={`${CARD} mt-4`}>
          {isCash ? (
            <>
              <label className={FIELD_LABEL} htmlFor="org-cash">{R.cashPerMember}</label>
              <div className={`flex items-center gap-2 rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 ${domain.theme.focusWithinBorder}`}>
                <span className="text-[14px] text-cz-text-2" aria-hidden="true">₱</span>
                <input
                  id="org-cash"
                  type="number" step="0.01" min="0.01"
                  value={form.cash_amount}
                  onChange={(e) => set('cash_amount', e.target.value)}
                  placeholder="0"
                  className="min-h-[46px] w-full bg-transparent text-[14px] text-cz-text outline-none"
                />
              </div>
              {/* Live preview, exactly as image6 draws it */}
              {form.cash_amount && Number(form.cash_amount) > 0 && (
                <p className="mt-2.5 rounded-[8px] bg-cz-tile-blue-bg px-3 py-2 text-[13px] font-semibold text-cz-tile-blue-fg">
                  {R.cashPreview(Number(form.cash_amount).toLocaleString('en-PH'))}
                </p>
              )}
            </>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={FIELD_LABEL} htmlFor="org-qty">{R.quantity}</label>
                <input
                  id="org-qty"
                  type="text"
                  value={form.quantity}
                  onChange={(e) => set('quantity', e.target.value)}
                  placeholder="0"
                  className={fieldBox}
                />
              </div>
              <div>
                <label className={FIELD_LABEL} htmlFor="org-unit">{R.unit}</label>
                <select
                  id="org-unit"
                  value={form.unit}
                  onChange={(e) => set('unit', e.target.value)}
                  className={fieldBox}
                >
                  {unitsFor(form.assistance_type).map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
              </div>
            </div>
          )}
        </div>

        {/* Remaining real fields the record needs. The mockup stops at the
            amount; these are not optional extras invented here — date and
            source agency are what the beneficiary record actually stores. */}
        <div className={`${CARD} mt-3 space-y-3`}>
          <div>
            <label className={FIELD_LABEL} htmlFor="org-date">{L.fields.dateGiven}</label>
            <input
              id="org-date" type="date" max={todayISO()}
              value={form.date_given}
              onChange={(e) => set('date_given', e.target.value)}
              className={fieldBox}
            />
          </div>
          <div>
            <label className={FIELD_LABEL} htmlFor="org-agency">{L.fields.sourceAgency}</label>
            <select
              id="org-agency" value={form.source_agency}
              onChange={(e) => set('source_agency', e.target.value)}
              className={fieldBox}
            >
              <option value="">{R.notSpecified}</option>
              {SOURCE_AGENCY_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              <option value="Other">{R.other}</option>
            </select>
            {form.source_agency === 'Other' && (
              <input
                type="text"
                value={form.source_agency_other}
                onChange={(e) => set('source_agency_other', e.target.value)}
                placeholder={R.otherAgencyPlaceholder}
                aria-label={R.otherAgencyPlaceholder}
                className={`${fieldBox} mt-2`}
              />
            )}
          </div>
          {domain.seasonOptions && (
            <div>
              <label className={FIELD_LABEL} htmlFor="org-season">{L.fields.season}</label>
              <select
                id="org-season" value={form.season}
                onChange={(e) => set('season', e.target.value)}
                className={fieldBox}
              >
                {domain.seasonOptions.map((s) => <option key={s} value={s}>{labels.harvest.seasonOptions?.[s] || s}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className={FIELD_LABEL} htmlFor="org-desc">{L.fields.description}</label>
            <textarea
              id="org-desc" rows={2}
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={`${fieldBox} py-2.5`}
            />
          </div>
        </div>

        {/* MGA TATANGGAP — select-all row, then the real member list read-only */}
        <div className="mt-5">
          <OrgSectionLabel>{R.recipientsHeading}</OrgSectionLabel>
          <div className={CARD}>
            <div className="flex items-start gap-3">
              <span
                className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[4px] ${domain.theme.header} text-white`}
                aria-hidden="true"
              >
                <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="3.4">
                  <path d="M4 12.5l5.5 5.5L20 7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-semibold text-cz-text">{R.allMembers}</p>
                <p className="mt-0.5 text-[13px] text-cz-text-2">{R.memberCount(members.length)}</p>
              </div>
            </div>
            <p className="mt-2.5 border-t-[0.5px] border-cz-border pt-2.5 text-[12px] leading-[1.45] text-cz-text-2">
              {R.allMembersNote}
            </p>
          </div>

          {members.length > 0 && (
            <ul className="mt-2 overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              {members.map((m, i) => (
                <li
                  key={m.id}
                  className={`flex items-center gap-3 px-4 py-2.5 ${
                    i === members.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
                  }`}
                >
                  <OrgAvatar name={domain.rowName(m)} id={domain.rowPersonId(m)} size={32} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] text-cz-text">{domain.rowName(m)}</p>
                    <p className="truncate text-[12px] text-cz-text-2">
                      {domain.rowBarangay(m) ? `Brgy. ${domain.rowBarangay(m)}` : labels.common.unknown}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        {errorMessage && (
          <p className="mt-4 rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3.5 py-2.5 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        <button type="submit" disabled={isBusy || members.length === 0} className={`${primaryBtn} mt-4`}>
          {R.previewButton}
        </button>
      </form>
    </OrgScreen>
  )
}
