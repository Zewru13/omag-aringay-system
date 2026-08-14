import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, Check, CheckCircle2, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'
import { labels } from './labels.js'
import { CitizenScreen, CitizenSubHeader } from './citizenUI.jsx'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'

// Same control geometry as CitizenActivityLogModal — hairline border, 8px
// radius, 13px/12px padding, 15px value text. Deliberately not imported
// from there since it's a plain string constant, not a shared component.
const FIELD = 'w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-[13px] text-[15px] text-cz-text placeholder:text-cz-text-muted focus:border-cz-text-2 focus:outline-none disabled:opacity-50'

function FieldBlock({ label, required, error, hint, children }) {
  return (
    <div className="mb-[18px]">
      {label && (
        <label className="mb-2 block text-[14px] font-medium text-cz-text">
          {label}
          {required && <span className="ml-1 text-cz-danger-accent">*</span>}
        </label>
      )}
      {children}
      {hint && !error && <p className="mt-1.5 text-[12px] text-cz-text-muted">{hint}</p>}
      {error && <p className="mt-1.5 text-[12px] text-cz-danger-accent">{error}</p>}
    </div>
  )
}

// Evaluator-parity batch: report + status-track + recover disasters on a
// citizen's own record. One screen with two internal modes rather than a
// separate create modal plus a separate history screen — for Fisherfolk
// there is no existing per-pond history view to slot a "disasters" section
// into (unlike FarmerCropHistoryView), so this screen has to stand on its
// own as both the report form AND the status list for either domain. The
// Farmer side still gets a compact entry point from FarmerCropHistoryView
// (see that file), which opens this same component instead of duplicating
// the list-rendering logic there.
//
// Endpoint/permission/validation are exactly what Step 0-2 investigated:
// GET/POST domain.disastersUrl(recordId) (own-record scoped via
// IsStaffOrOwnRecordCitizen, Batch — Evaluator-parity), POST
// domain.disasterResolveUrl(id) for recovery (same two-path auto/manual
// logic already built server-side, not reimplemented here).
// `onLogResponse({ rule, disaster })` is optional: when supplied, an
// unticked recommendation row opens the activity log prefilled with that
// rule's response activity. Without it the rows render as plain read-only
// status, which is still correct — they were never toggles.
export default function CitizenDisasterScreen({ domain, theme, recordId, record, onClose, onSuccess, onLogResponse, bare = false }) {
  const { showToast } = useToast()
  const isCrop = domain.key === 'crop'
  const [mode, setMode] = useState('list') // 'list' | 'create'

  const [disasters, setDisasters] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [hasError, setHasError] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  const [isSubmitting, setIsSubmitting] = useState(false)
  const [selectedDateMode, setSelectedDateMode] = useState('today')
  const [form, setForm] = useState({
    disaster_type: domain.disasterTypeChoices[0],
    disaster_type_other_specify: '',
    date_of_occurrence: todayISO(),
    area_affected_ha: '',
    estimated_damage: '',
    production_loss: '',
    severity: '',
    is_total_loss: false,
  })
  const [areaError, setAreaError] = useState('')

  // Recovery UI state, keyed by disaster id.
  // disaster_id -> { rules, all_rules_done }, from the record's suggestions
  // endpoint. This is the ONLY source of checklist state: a rule is done when
  // its response activity has actually been logged against that disaster
  // (disaster_rule_id on the activity log), never because someone tapped a
  // box. Tapping a row therefore opens the log screen rather than toggling
  // anything -- a tick the user could set by hand would not move the resolve
  // rule, which is what actually gates recovery.
  const [responseByDisaster, setResponseByDisaster] = useState({})

  const [recoverNotes, setRecoverNotes] = useState({})
  const [recoveringId, setRecoveringId] = useState(null)
  // Frame 28 shows only the button; frame 29 shows the reason form it
  // opens. Keeping the reason collapsed until then stops a half-filled
  // textarea sitting under every active disaster.
  const [recoverOpenId, setRecoverOpenId] = useState(null)
  // Frames 29-30: a confirmation panel sits above the form after a
  // successful report, rather than the list silently reappearing.
  const [justReported, setJustReported] = useState(false)
  const [recoverErrors, setRecoverErrors] = useState({})

  const recordArea = isCrop
    ? (record?.area_planted_ha ? Number(record.area_planted_ha) : null)
    : (record?.area_hectares ? Number(record.area_hectares) : null)

  const recordLock = useRecordLock(domain.lockType, recordId, mode === 'create')

  const fetchDisasters = () => {
    setIsLoading(true)
    setHasError(false)
    api.get(domain.disastersUrl(recordId))
      .then((r) => setDisasters(Array.isArray(r.data) ? r.data : (r.data?.results || [])))
      .catch(() => { setDisasters([]); setHasError(true) })
      .finally(() => setIsLoading(false))

    // Recommendation checklist state. Failing here must not break the
    // disaster list itself, so it has its own catch and simply yields no
    // checklist rather than an error.
    api.get(domain.suggestionsUrl(recordId))
      .then((r) => {
        const rows = r.data?.disaster_response || []
        setResponseByDisaster(Object.fromEntries(rows.map((x) => [x.disaster_id, x])))
      })
      .catch(() => setResponseByDisaster({}))
  }

  useEffect(() => {
    fetchDisasters()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId, reloadKey])

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const validateArea = (value) => {
    if (!value || value === '') return labels.disaster.errors.areaAffectedRequired
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) return labels.disaster.errors.areaAffectedInvalid
    if (recordArea != null && n > recordArea) return labels.disaster.errors.areaAffectedExceeds(recordArea)
    return ''
  }

  const handleDateShortcut = (m) => {
    setSelectedDateMode(m)
    if (m === 'today') set('date_of_occurrence', todayISO())
    else if (m === 'yesterday') set('date_of_occurrence', yesterdayISO())
  }

  const blockedByOther = mode === 'create' && recordLock.lockedByOther

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date_of_occurrence) { showToast(labels.disaster.errors.dateRequired, 'error'); return }
    if (form.disaster_type === 'Other' && !form.disaster_type_other_specify.trim()) {
      showToast(labels.disaster.errors.specifyType, 'error')
      return
    }
    const areaErr = validateArea(form.area_affected_ha)
    if (areaErr) { setAreaError(areaErr); showToast(areaErr, 'error'); return }
    if (blockedByOther) {
      showToast(labels.disaster.errors.lockedByOther, 'error')
      return
    }
    setIsSubmitting(true)
    try {
      await api.post(domain.disastersUrl(recordId), {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify : '',
        date_of_occurrence: form.date_of_occurrence,
        area_affected_ha: form.area_affected_ha,
        estimated_damage: form.estimated_damage,
        production_loss: form.production_loss,
        severity: form.severity,
        is_total_loss: form.is_total_loss,
      })
      showToast(labels.disaster.submitSuccess, 'success')
      setJustReported(true)
      setMode('list')
      setReloadKey((k) => k + 1)
      onSuccess?.()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      showToast(firstError || data?.detail || labels.disaster.errors.genericSaveError, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleRecover = async (disasterId) => {
    setRecoveringId(disasterId)
    setRecoverErrors((e) => ({ ...e, [disasterId]: '' }))
    try {
      const note = (recoverNotes[disasterId] || '').trim()
      await api.post(domain.disasterResolveUrl(disasterId), note ? { recovery_note: note } : {})
      showToast(labels.disaster.recoverSuccess, 'success')
      setReloadKey((k) => k + 1)
      onSuccess?.()
    } catch (err) {
      const detail = err?.response?.data?.detail
      setRecoverErrors((e) => ({ ...e, [disasterId]: detail || labels.disaster.errors.genericRecoverError }))
    } finally {
      setRecoveringId(null)
    }
  }

  const statusPill = (status, isTotalLoss) => {
    if (isTotalLoss) {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-cz-danger-bg px-2 py-[3px] text-[11px] font-medium text-cz-danger-accent">
          <AlertTriangle size={11} aria-hidden="true" /> {labels.disaster.statusTotalLoss}
        </span>
      )
    }
    if (status === 'Recovered') {
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-cz-status-good-bg px-2 py-[3px] text-[11px] font-medium text-cz-status-good-fg">
          <Check size={11} aria-hidden="true" /> {labels.disaster.statusRecovered}
        </span>
      )
    }
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-cz-warn-bg px-2 py-[3px] text-[11px] font-medium text-cz-warn-accent">
        <AlertCircle size={11} aria-hidden="true" /> {labels.disaster.statusActive}
      </span>
    )
  }

  if (mode === 'create') {
    return (
      <CitizenScreen>
        <CitizenSubHeader theme={theme} title={labels.disaster.reportButton} onBack={() => setMode('list')} />
        <form onSubmit={handleSubmit} className="px-[14px] py-4">
          {blockedByOther && (
            <div className="mb-[18px] rounded-[12px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg p-[14px]">
              <p className="text-[13px] text-cz-warn-body">
                🔒 <strong className="font-medium">{recordLock.lockedByOther.name}</strong> {labels.common.lockedByOtherSuffix}
                {recordLock.secondsRemaining ? labels.common.lockedByOtherMinutes(Math.ceil(recordLock.secondsRemaining / 60)) : ''}.
              </p>
            </div>
          )}

          {/* URI NG SAKUNA — tiles, per the reference. Every type the model
              defines is offered, not just the reference's subset: Strong Winds
              carries this domain's response rules, and Disease Outbreak /
              Predator Attack appear in live fisheries records, so omitting
              them would make real events unreportable. */}
          <FieldBlock label={labels.ffNew.disasterTypeHeading} required>
            <div className="grid grid-cols-2 gap-2">
              {domain.disasterTypeChoices.map((choice) => {
                const selected = form.disaster_type === choice
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={blockedByOther}
                    onClick={() => set('disaster_type', choice)}
                    className={`flex min-h-[46px] items-center rounded-[10px] border-[0.5px] px-3 py-2.5 text-left transition-colors disabled:opacity-50 ${
                      selected
                        ? `${theme.tileSelectedBorder} ${theme.tileSelectedBg}`
                        : 'border-cz-border bg-cz-surface hover:bg-cz-page'
                    }`}
                  >
                    <span className={`text-[13.5px] leading-[1.3] ${
                      selected ? `font-semibold ${theme.tileSelectedText}` : 'text-cz-text'
                    }`}
                    >
                      {labels.ffNew.disasterTypes[choice] || choice}
                    </span>
                  </button>
                )
              })}
            </div>
            {form.disaster_type === 'Other' && (
              <input
                type="text"
                value={form.disaster_type_other_specify}
                onChange={(e) => set('disaster_type_other_specify', e.target.value)}
                disabled={blockedByOther}
                placeholder={labels.ffNew.disasterOtherPlaceholder}
                className={`${FIELD} mt-2`}
              />
            )}
          </FieldBlock>

          <FieldBlock label={labels.disaster.fields.dateOfOccurrence} required>
            <div className="flex gap-2">
              {['today', 'yesterday', 'custom'].map((m) => {
                const selected = selectedDateMode === m
                const isPick = m === 'custom'
                return (
                  <button
                    key={m}
                    type="button"
                    disabled={blockedByOther}
                    aria-pressed={selected}
                    onClick={() => handleDateShortcut(m)}
                    className={`min-h-[44px] flex-1 rounded-[8px] px-1.5 py-3 transition-colors disabled:opacity-50 ${
                      selected
                        ? theme.solidBtn
                        : `border-[0.5px] border-cz-border-strong ${isPick ? 'text-cz-text-2' : 'text-cz-text'}`
                    }`}
                  >
                    <span className={`text-[14px] ${selected ? 'font-medium' : ''}`}>
                      {m === 'today' ? labels.activityLog.dateShortcuts.today
                        : m === 'yesterday' ? labels.activityLog.dateShortcuts.yesterday
                        : labels.activityLog.dateShortcuts.pickDate}
                    </span>
                  </button>
                )
              })}
            </div>
            {selectedDateMode === 'custom' && (
              <input
                type="date"
                max={todayISO()}
                className={`${FIELD} mt-2`}
                value={form.date_of_occurrence}
                onChange={(e) => set('date_of_occurrence', e.target.value)}
                disabled={blockedByOther}
                autoFocus
              />
            )}
          </FieldBlock>

          <FieldBlock label={labels.disaster.fields.areaAffected} required error={areaError}>
            <input
              type="number" step="0.0001" inputMode="decimal"
              className={FIELD}
              value={form.area_affected_ha}
              onChange={(e) => { set('area_affected_ha', e.target.value); setAreaError('') }}
              disabled={blockedByOther}
            />
          </FieldBlock>

          <FieldBlock label={labels.disaster.fields.estimatedDamage}>
            <textarea
              rows={2}
              className={FIELD}
              value={form.estimated_damage}
              onChange={(e) => set('estimated_damage', e.target.value)}
              disabled={blockedByOther}
            />
          </FieldBlock>

          <FieldBlock label={labels.disaster.fields.productionLoss}>
            <textarea
              rows={2}
              className={FIELD}
              value={form.production_loss}
              onChange={(e) => set('production_loss', e.target.value)}
              disabled={blockedByOther}
            />
          </FieldBlock>

          {/* ANTAS NG PINSALA (frames 17, 18, 27, 28). Tinted per level
              rather than one accent, because the reference uses colour here
              to carry the level itself. The numeric damage fields above are
              untouched -- staff keep filling those in. */}
          <FieldBlock label={labels.ffNew.sakuna.damageLevel}>
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(labels.ffNew.sakuna.damageOptions).map(([value, text]) => {
                const on = form.severity === value
                const tone = value === 'Low' ? 'border-cz-status-good-fg bg-cz-status-good-bg text-cz-status-good-fg'
                  : value === 'Medium' ? 'border-cz-warn-accent bg-cz-warn-bg text-cz-warn-accent'
                    : 'border-cz-danger-accent bg-cz-danger-bg text-cz-danger-accent'
                return (
                  <button
                    key={value}
                    type="button"
                    disabled={blockedByOther}
                    aria-pressed={on}
                    onClick={() => set('severity', on ? '' : value)}
                    className={`min-h-[44px] rounded-[8px] border-[0.5px] px-3 py-2.5 text-[14px] transition-colors disabled:opacity-50 ${
                      on ? `${tone} font-semibold` : 'border-cz-border-strong bg-cz-surface text-cz-text hover:bg-cz-page'
                    }`}
                  >
                    {text}
                  </button>
                )
              })}
            </div>
          </FieldBlock>

          <FieldBlock hint={form.is_total_loss ? labels.disaster.fields.isTotalLossHint : undefined}>
            <button
              type="button"
              disabled={blockedByOther}
              aria-pressed={form.is_total_loss}
              onClick={() => set('is_total_loss', !form.is_total_loss)}
              className={`flex min-h-[44px] w-full items-center gap-3 rounded-[8px] border-[0.5px] px-3 py-3 text-left transition-colors disabled:opacity-50 ${
                form.is_total_loss ? 'border-cz-danger-accent bg-cz-danger-bg' : 'border-cz-border-strong'
              }`}
            >
              <span
                className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-[5px] border-[1.5px] ${
                  form.is_total_loss ? 'border-cz-danger-accent bg-cz-danger-accent' : 'border-cz-border-strong'
                }`}
              >
                {form.is_total_loss && <Check size={14} className="text-cz-danger-on" aria-hidden="true" />}
              </span>
              <span className={`text-[14px] font-medium ${form.is_total_loss ? 'text-cz-danger-title' : 'text-cz-text'}`}>
                {labels.disaster.fields.isTotalLoss}
              </span>
            </button>
          </FieldBlock>

          <button
            type="submit"
            disabled={blockedByOther || isSubmitting}
            className={`flex w-full items-center justify-center gap-2 rounded-[8px] px-4 py-[15px] transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`}
          >
            <span className="text-[16px] font-medium">{labels.disaster.submit}</span>
          </button>
          <button
            type="button"
            onClick={() => setMode('list')}
            className="mt-1 w-full py-[14px] text-center text-cz-text-2"
          >
            <span className="text-[14px]">{labels.common.cancel}</span>
          </button>
        </form>
      </CitizenScreen>
    )
  }

  const body = (
    <div className={bare ? '' : 'px-[14px] py-4'}>
        <button
          type="button"
          onClick={() => setMode('create')}
          className="mb-4 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 py-2 text-cz-text transition-colors hover:bg-cz-page"
        >
          <Plus size={15} aria-hidden="true" />
          <span className="text-[14px] font-medium">{labels.disaster.reportButton}</span>
        </button>

        {isLoading ? (
          <p className="text-[15px] italic text-cz-text-2">{labels.disaster.loading}</p>
        ) : hasError ? (
          <div className="rounded-[12px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg p-4">
            <div className="flex items-start gap-2">
              <AlertCircle size={16} className="mt-px shrink-0 text-cz-danger-accent" aria-hidden="true" />
              <p className="text-[13px] leading-[1.5] text-cz-danger-body">{labels.disaster.loadError}</p>
            </div>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-danger-accent px-3 py-[11px] text-cz-danger-body transition-opacity hover:opacity-90"
            >
              <span className="text-[14px] font-medium">{labels.disaster.retry}</span>
            </button>
          </div>
        ) : null}
        {justReported && (
          <div className="mb-3 rounded-[12px] border-[0.5px] border-cz-status-good-fg/25 bg-cz-status-good-bg px-4 py-5 text-center">
            <div className="mx-auto mb-2.5 flex h-[46px] w-[46px] items-center justify-center rounded-full border-[0.5px] border-cz-status-good-fg/30 bg-cz-surface">
              <CheckCircle2 size={22} className="text-cz-status-good-fg" aria-hidden="true" />
            </div>
            <p className="text-[17px] font-bold text-cz-text">{labels.ffNew.sakuna.reportedTitle}</p>
            <p className="mx-auto mt-1 max-w-[300px] text-[13px] leading-[1.5] text-cz-text-2">
              {labels.ffNew.sakuna.reportedBody}
            </p>
            <button
              type="button"
              onClick={() => { setJustReported(false); setMode('create') }}
              className="mt-3 rounded-[8px] border-[0.5px] border-cz-status-good-fg/40 bg-cz-surface px-4 py-2.5 text-[13.5px] font-semibold text-cz-status-good-fg"
            >
              {labels.ffNew.sakuna.reportAnother}
            </button>
          </div>
        )}
        {isLoading || hasError ? null : disasters.length === 0 ? (
          <p className="text-[14px] italic text-cz-text-muted">{labels.disaster.empty}</p>
        ) : (
          <ul className="space-y-2">
            {disasters.map((d) => {
              const canRecover = d.status === 'Active' && !d.is_total_loss
              return (
                <li key={d.id} className="rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[14px]">
                  <div className="mb-1.5 flex items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-medium text-cz-text">
                      {d.disaster_type === 'Other' ? d.disaster_type_other_specify : d.disaster_type}
                    </p>
                    {d.severity && (
                      <span className={`shrink-0 text-[13px] font-semibold ${
                        d.severity === 'Low' ? 'text-cz-status-good-fg'
                          : d.severity === 'Medium' ? 'text-cz-warn-accent' : 'text-cz-danger-accent'
                      }`}
                      >
                        {labels.ffNew.sakuna.damageOptions[d.severity]}
                      </span>
                    )}
                    {statusPill(d.status, d.is_total_loss)}
                  </div>
                  <p className="text-[12px] text-cz-text-2">{d.date_of_occurrence} · {d.area_affected_ha} {domain.areaLabel.split(' ')[0]} affected</p>
                  {d.status === 'Recovered' && (
                    <p className="mt-1.5 text-[12px] text-cz-status-good-fg">{labels.disaster.recoveredOn(d.recovered_date)}</p>
                  )}
                  {d.is_total_loss && d.status !== 'Recovered' && (
                    <p className="mt-1.5 text-[12px] leading-[1.5] text-cz-danger-body">{labels.disaster.totalLossNotice}</p>
                  )}

                  {/* MGA REKOMENDASYON — read-only. Each tick reflects a
                      LOGGED response activity, so the rows are links to the
                      log screen, not checkboxes. A box the farmer could tick
                      by hand would not advance the resolve rule, which is
                      what actually gates marking a disaster recovered. */}
                  {(() => {
                    const resp = responseByDisaster[d.id]
                    if (!resp || d.status === 'Recovered' || d.is_total_loss) return null
                    const rules = resp.rules || []
                    if (rules.length === 0) {
                      return (
                        <p className="mt-3 border-t-[0.5px] border-cz-border pt-3 text-[12px] italic text-cz-text-muted">
                          {labels.ffNew.recNone}
                        </p>
                      )
                    }
                    const done = rules.filter((x) => x.is_done).length
                    const left = rules.length - done
                    return (
                      <div className="mt-3 border-t-[0.5px] border-cz-border pt-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
                            {labels.ffNew.recommendations}
                          </p>
                          <span className="text-[12px] font-bold tabular-nums text-cz-text-2">
                            {labels.ffNew.recProgress(done, rules.length)}
                          </span>
                        </div>
                        <ul className="space-y-1">
                          {rules.map((rule) => (
                            <li key={rule.rule_id}>
                              <button
                                type="button"
                                onClick={() => onLogResponse?.({ rule, disaster: d })}
                                disabled={rule.is_done || !onLogResponse}
                                aria-label={rule.is_done ? rule.title : `${rule.title} \u2014 ${labels.ffNew.recTapHint}`}
                                className={`flex w-full items-start gap-2.5 rounded-[8px] px-1.5 py-1.5 text-left transition-colors ${
                                  rule.is_done ? 'cursor-default' : 'hover:bg-cz-page'
                                }`}
                              >
                                <span
                                  className={`mt-[2px] flex h-4 w-4 shrink-0 items-center justify-center rounded-[4px] border-[1.5px] ${
                                    rule.is_done
                                      ? 'border-cz-status-good-fg bg-cz-status-good-fg text-white'
                                      : 'border-cz-border-strong'
                                  }`}
                                  aria-hidden="true"
                                >
                                  {rule.is_done && <Check size={11} strokeWidth={3} />}
                                </span>
                                <span
                                  className={`min-w-0 flex-1 text-[13px] leading-[1.4] ${
                                    rule.is_done ? 'text-cz-text-muted line-through' : 'text-cz-text'
                                  }`}
                                >
                                  {rule.title}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                        <p className="mt-2 text-[12px] text-cz-text-2">
                          {left === 0 ? labels.ffNew.recAllDone : labels.ffNew.recRemaining(left)}
                        </p>
                      </div>
                    )
                  })()}
                  {canRecover && recoverOpenId !== d.id && (
                    <div className="mt-3 border-t-[0.5px] border-cz-border pt-3">
                      <button
                        type="button"
                        onClick={() => setRecoverOpenId(d.id)}
                        className="flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] border-[0.5px] border-cz-status-good-fg/40 bg-cz-status-good-bg px-3 py-[11px] text-[13.5px] font-semibold text-cz-status-good-fg transition-colors hover:opacity-90"
                      >
                        <CheckCircle2 size={15} aria-hidden="true" />
                        {labels.ffNew.sakuna.markRecovered}
                      </button>
                    </div>
                  )}
                  {canRecover && recoverOpenId === d.id && (
                    <div className="mt-3 border-t-[0.5px] border-cz-border pt-3">
                      <p className="mb-1.5 text-[13px] font-semibold text-cz-text">
                        {labels.ffNew.sakuna.recoverQuestion}{' '}
                        <span className="font-normal text-cz-warn-accent">{labels.ffNew.sakuna.recoverRequired}</span>
                      </p>
                      <textarea
                        rows={2}
                        placeholder={labels.disaster.fields.recoveryNote}
                        className={`${FIELD} text-[13px]`}
                        value={recoverNotes[d.id] || ''}
                        onChange={(e) => setRecoverNotes((n) => ({ ...n, [d.id]: e.target.value }))}
                        disabled={recoveringId === d.id}
                      />
                      <p className="mt-1 text-[11px] text-cz-text-muted">{labels.disaster.fields.recoveryNoteHint}</p>
                      {recoverErrors[d.id] && (
                        <p className="mt-1 text-[12px] text-cz-danger-accent">{recoverErrors[d.id]}</p>
                      )}
                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          disabled={recoveringId === d.id}
                          onClick={() => handleRecover(d.id)}
                          className={`flex min-h-[44px] flex-1 items-center justify-center rounded-[8px] px-3 py-[11px] transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`}
                        >
                          <span className="text-[13px] font-semibold">
                            {recoveringId === d.id ? labels.disaster.recovering : labels.ffNew.sakuna.recoverConfirm}
                          </span>
                        </button>
                        <button
                          type="button"
                          disabled={recoveringId === d.id}
                          onClick={() => setRecoverOpenId(null)}
                          className="min-h-[44px] rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-4 text-[13px] font-medium text-cz-text-2 disabled:opacity-50"
                        >
                          {labels.ffNew.sakuna.recoverBack}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
    </div>
  )

  if (bare) return body

  return (
    <CitizenScreen>
      <CitizenSubHeader theme={theme} title={labels.disaster.title} onBack={onClose} />
      {body}
    </CitizenScreen>
  )
}
