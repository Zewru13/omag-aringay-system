import { useEffect, useState } from 'react'
import { AlertTriangle, Check, Fish, FlaskConical } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import {
  CitizenBody, CitizenEmptyState, CitizenScreen, CitizenSubHeader, FISH_THEME,
} from './citizenUI.jsx'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'

// ─── Log ng Kalusugan ─────────────────────────────────────────────────────
// The new fisheries reference (frames 7, 9-12, 15) gives fish health its own
// screen with its own tab, NOT a field inside the activity log. It is a
// three-step wizard — pond, then illness, then the form — with a confirmation
// state at the end.
//
// It still WRITES a FisheriesActivityLog with activity='Disease Control', so
// nothing downstream (suggestions, history, staff review) has to learn about
// a new record type. What changed is the path a citizen takes to get there:
// picking the pond and the illness first means the guidance panel can be
// fetched and shown BEFORE they describe the problem, which is the whole
// point of the reference's ordering.
//
// The guidance panel is DiseaseResponseGuide, seeded earlier. It is advisory
// text only — no drug names, no dosages — and the reference wraps it in two
// separate disclaimers, both reproduced verbatim.


const FIELD = 'w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-[13px] text-[15px] text-cz-text placeholder:text-cz-text-muted focus:border-cz-text-2 focus:outline-none disabled:opacity-50'

function StepLabel({ children }) {
  return (
    <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
      {children}
    </p>
  )
}

// Solid-fill selected state, exactly as the reference draws it: navy card,
// white title, pale subtitle. The earlier build used an accent bar instead
// after a background utility appeared not to apply; that turned out to be a
// misread of the DOM, not a cascade problem.
function ChoiceCard({ selected, onClick, disabled, title, subtitle, icon: Icon }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={`flex w-full items-center gap-3 rounded-[10px] border-[0.5px] px-4 py-3 text-left transition-colors disabled:opacity-50 ${
        selected
          ? 'border-cz-fish-header bg-cz-fish-header'
          : 'border-cz-border bg-cz-surface hover:bg-cz-page'
      }`}
    >
      {Icon && (
        <Icon
          size={20}
          className={`shrink-0 ${selected ? 'text-white' : 'text-cz-text-2'}`}
          aria-hidden="true"
        />
      )}
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] font-semibold leading-[1.3] ${selected ? 'text-white' : 'text-cz-text'}`}>
          {title}
        </span>
        {subtitle && (
          <span className={`block text-[13px] leading-[1.35] ${selected ? 'text-cz-fish-pale' : 'text-cz-text-muted'}`}>
            {subtitle}
          </span>
        )}
      </span>
    </button>
  )
}

export default function CitizenHealthLogScreen({ records, onBack, onSaved, tabBar }) {
  const { showToast } = useToast()

  const [step, setStep] = useState('pond')
  const [record, setRecord] = useState(null)
  const [diseaseTypes, setDiseaseTypes] = useState([])
  const [disease, setDisease] = useState(null)
  const [guide, setGuide] = useState(null)
  const [saving, setSaving] = useState(false)
  const [savedPondName, setSavedPondName] = useState('')

  const [form, setForm] = useState({
    date_of_activity: todayISO(),
    affected_portion: '',
    mortality_count: '',
    consulted: null,
    treatment_applied: '',
    notes: '',
  })
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))

  // DiseaseType is a lookup table; a citizen may read it (see
  // DiseaseTypeListCreateView.get_permissions). Failing here leaves the list
  // empty and the step shows its own empty state rather than a dead end.
  useEffect(() => {
    let cancelled = false
    api.get('/fisheries/disease-types/')
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setDiseaseTypes(rows.filter((x) => x.is_active !== false))
      })
      .catch(() => { if (!cancelled) setDiseaseTypes([]) })
    return () => { cancelled = true }
  }, [])

  // Guidance for the chosen illness. Advisory only — the form below still
  // records what the fisherfolk ACTUALLY did, never what was suggested.
  useEffect(() => {
    // No synchronous clear here — restart() already resets `guide`, and
    // setting state in the effect body costs a cascading render.
    if (!disease) return undefined
    let cancelled = false
    api.get('/fisheries/disease-response-guides/', { params: { disease_type: disease.id } })
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setGuide(rows[0] || null)
      })
      .catch(() => { if (!cancelled) setGuide(null) })
    return () => { cancelled = true }
  }, [disease])

  const pondName = (r) => labels.fisherfolkHome.myPonds.pondSpecies(
    r.pond_name || labels.common.unknown,
    r.species_name || labels.yieldAnalysis.fisheriesCropLabel,
  )

  const H = labels.ffNew.health

  const submit = async () => {
    if (!record || !disease) return
    setSaving(true)
    try {
      const payload = {
        activity: 'Disease Control',
        date_of_activity: form.date_of_activity,
        disease_type: disease.id,
        affected_portion: form.affected_portion || '',
        mortality_count: form.mortality_count === '' ? null : Number(form.mortality_count),
        // The reference asks a yes/no question; the model stores a name or
        // "N/A". Only the two ends of that are expressible here, which is
        // honest — a citizen answering "Oo" on their phone is not being
        // asked to name the vet.
        vet_consulted: form.consulted === true ? 'Oo' : form.consulted === false ? 'N/A' : '',
        treatment_applied: form.treatment_applied,
        notes: form.notes,
      }
      await api.post(`/fisheries/stocking/${record.id}/logs/`, payload)
      setSavedPondName(pondName(record))
      setStep('done')
      onSaved?.()
    } catch (err) {
      const detail = err?.response?.data
      const msg = typeof detail === 'string'
        ? detail
        : Object.values(detail || {}).flat().join(' ') || labels.common.genericSaveError
      showToast(msg, 'error')
    } finally {
      setSaving(false)
    }
  }

  const restart = () => {
    setRecord(null); setDisease(null); setGuide(null)
    setForm({
      date_of_activity: todayISO(), affected_portion: '', mortality_count: '',
      consulted: null, treatment_applied: '', notes: '',
    })
    setStep('pond')
  }

  const shell = (children) => (
    <CitizenScreen hasTabBar>
      <CitizenSubHeader
        theme={FISH_THEME}
        title={H.title}
        subtitle={H.subtitle}
        onBack={step === 'pond' || step === 'done' ? onBack : () => setStep(step === 'form' ? 'illness' : 'pond')}
      />
      <CitizenBody>{children}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )

  // ── Step 1 — pond ──────────────────────────────────────────────────────
  if (step === 'pond') {
    return shell(
      <>
        <div className="mb-5 rounded-[10px] border-[0.5px] border-cz-fish-deep/25 bg-cz-fish-pale px-4 py-3">
          <p className="text-[13px] leading-[1.5] text-cz-text-2">{H.notice}</p>
        </div>
        <h2 className="mb-3 text-[17px] font-semibold text-cz-text">{H.pondQuestion}</h2>
        {records.length === 0 ? (
          <CitizenEmptyState
            icon={Fish}
            iconClass="text-cz-text-muted"
            title={labels.fisherfolkHome.pondPicker.title}
            body={labels.fisherfolkHome.pondPicker.noPonds}
          />
        ) : (
          <div className="space-y-2">
            {records.map((r) => (
              <ChoiceCard
                key={r.id}
                selected={false}
                onClick={() => { setRecord(r); setStep('illness') }}
                icon={Fish}
                title={pondName(r)}
                subtitle={[
                  r.area_stocked_ha ? `${r.area_stocked_ha} ha` : null,
                  r.pond_location_barangay ? `Brgy. ${r.pond_location_barangay}` : null,
                ].filter(Boolean).join(' · ')}
              />
            ))}
          </div>
        )}
      </>,
    )
  }

  // ── Step 2 — illness ───────────────────────────────────────────────────
  if (step === 'illness') {
    return shell(
      <>
        <div className="mb-5 flex items-center gap-3 rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3">
          <div className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[10px] ${FISH_THEME.circleBg}`}>
            <Fish size={18} className={FISH_THEME.circleIcon} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <p className="text-[12px] text-cz-text-muted">{H.selectedPond}</p>
            <p className="truncate text-[15px] font-semibold text-cz-text">{pondName(record)}</p>
          </div>
        </div>
        <h2 className="mb-3 text-[17px] font-semibold text-cz-text">{H.illnessQuestion}</h2>
        {diseaseTypes.length === 0 ? (
          <p className="text-[13px] italic text-cz-text-muted">{H.noIllnessTypes}</p>
        ) : (
          <div className="space-y-2">
            {diseaseTypes.map((dt) => (
              <ChoiceCard
                key={dt.id}
                selected={false}
                onClick={() => { setDisease(dt); setStep('form') }}
                title={dt.name}
              />
            ))}
          </div>
        )}
      </>,
    )
  }

  // ── Step 4 — confirmation ──────────────────────────────────────────────
  if (step === 'done') {
    return shell(
      <div className="flex flex-col items-center pt-10 text-center">
        <div className="mb-5 flex h-[68px] w-[68px] items-center justify-center rounded-[18px] border-[0.5px] border-cz-status-good-fg/25 bg-cz-status-good-bg">
          <Check size={30} className="text-cz-status-good-fg" strokeWidth={2.5} aria-hidden="true" />
        </div>
        <h2 className="mb-2 text-[20px] font-bold text-cz-text">{H.successTitle}</h2>
        <p className="mb-6 max-w-[320px] text-[14px] leading-[1.5] text-cz-text-2">
          {H.successBody(savedPondName)}
        </p>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={restart}
            className="rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface px-5 py-3 text-[14px] font-medium text-cz-text transition-colors hover:bg-cz-page"
          >
            {H.logMore}
          </button>
          <button
            type="button"
            onClick={onBack}
            className={`rounded-[10px] px-5 py-3 text-[14px] font-semibold ${FISH_THEME.solidBtn}`}
          >
            {H.backHome}
          </button>
        </div>
      </div>,
    )
  }

  // ── Step 3 — the form ──────────────────────────────────────────────────
  // The reference draws the guidance as three bullets. The seeded
  // recommended_treatment is one paragraph of three sentences, so it is split
  // on sentence boundaries rather than newlines — which it has none of. The
  // separate `notes` column is a sourcing/limitations footnote, not advice,
  // so it renders below the list as small print instead of as a fourth item.
  const guideLines = (guide?.recommended_treatment || '')
    .split(/(?<=\.)\s+/)
    .map((x) => x.trim())
    .filter(Boolean)

  return shell(
    <>
      <div className="mb-4 rounded-[10px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-3">
        <p className="text-[12px] text-cz-text-muted">{H.contextLabel}</p>
        <p className="text-[15px] font-semibold text-cz-text">{pondName(record)}</p>
        <p className="text-[14px] text-cz-text-2">{disease?.name}</p>
      </div>

      {guideLines.length > 0 && (
        <div className="mb-5 rounded-[10px] border-[0.5px] border-cz-fish-deep/25 bg-cz-fish-pale px-4 py-3.5">
          <p className="mb-2 flex items-center gap-2 text-[12px] font-bold uppercase tracking-[0.04em] text-cz-fish-deep">
            <FlaskConical size={15} aria-hidden="true" />
            {H.guideHeading}
          </p>
          <p className="mb-2.5 text-[12px] italic leading-[1.5] text-cz-text-2">{H.guideDisclaimer}</p>
          <ul className="space-y-1.5">
            {guideLines.map((line, i) => (
              <li key={i} className="flex gap-2 text-[13px] leading-[1.5] text-cz-text">
                <span aria-hidden="true" className="text-cz-text-muted">&middot;</span>
                <span className="min-w-0 flex-1">{line}</span>
              </li>
            ))}
          </ul>
          {guide?.notes && (
            <p className="mt-2.5 border-t-[0.5px] border-cz-fish-deep/20 pt-2 text-[11px] italic leading-[1.5] text-cz-text-muted">
              {guide.notes}
            </p>
          )}
        </div>
      )}

      <div className="mb-[18px]">
        <StepLabel>{H.observationDate}</StepLabel>
        <div className="flex items-center gap-2">
          {[
            { key: todayISO(), text: labels.activityLog.dateShortcuts.today },
            { key: yesterdayISO(), text: labels.activityLog.dateShortcuts.yesterday },
          ].map((opt) => (
            <button
              key={opt.key}
              type="button"
              onClick={() => set('date_of_activity', opt.key)}
              className={`rounded-[10px] border-[0.5px] px-4 py-2.5 text-[14px] font-semibold transition-colors ${
                form.date_of_activity === opt.key
                  ? 'border-cz-fish-header bg-cz-fish-header text-white'
                  : 'border-cz-border-strong bg-cz-surface text-cz-text hover:bg-cz-page'
              }`}
            >
              {opt.text}
            </button>
          ))}
          <input
            type="date"
            value={form.date_of_activity}
            max={todayISO()}
            onChange={(e) => set('date_of_activity', e.target.value)}
            className={`${FIELD} flex-1 py-2.5`}
          />
        </div>
      </div>

      <div className="mb-[18px]">
        <StepLabel>{H.affectedPortion}</StepLabel>
        <select
          value={form.affected_portion}
          onChange={(e) => set('affected_portion', e.target.value)}
          className={FIELD}
        >
          <option value="">{labels.activityLog.selectPlaceholder}</option>
          {Object.entries(H.portionOptions).map(([value, text]) => (
            <option key={value} value={value}>{text}</option>
          ))}
        </select>
      </div>

      <div className="mb-[18px]">
        <StepLabel>{H.mortality}</StepLabel>
        <input
          type="number"
          min="0"
          value={form.mortality_count}
          onChange={(e) => set('mortality_count', e.target.value)}
          placeholder={H.mortalityPlaceholder}
          className={FIELD}
        />
      </div>

      <div className="mb-[18px]">
        <StepLabel>{H.consulted}</StepLabel>
        <div className="grid grid-cols-2 gap-2">
          {[{ v: true, t: H.yes }, { v: false, t: H.no }].map((opt) => (
            <button
              key={String(opt.v)}
              type="button"
              onClick={() => set('consulted', form.consulted === opt.v ? null : opt.v)}
              aria-pressed={form.consulted === opt.v}
              className={`rounded-[10px] border-[0.5px] py-3 text-[15px] font-semibold transition-colors ${
                form.consulted === opt.v
                  ? 'border-cz-fish-header bg-cz-fish-header text-white'
                  : 'border-cz-border-strong bg-cz-surface text-cz-text hover:bg-cz-page'
              }`}
            >
              {opt.t}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-[18px]">
        <StepLabel>{H.treatment}</StepLabel>
        <textarea
          rows={3}
          value={form.treatment_applied}
          onChange={(e) => set('treatment_applied', e.target.value)}
          placeholder={H.treatmentPlaceholder}
          className={`${FIELD} resize-none`}
        />
        <p className="mt-1.5 text-[12px] italic leading-[1.5] text-cz-text-muted">
          {H.treatmentDisclaimer}
        </p>
      </div>

      <div className="mb-[18px]">
        <StepLabel>{H.extraNotes}</StepLabel>
        <textarea
          rows={3}
          value={form.notes}
          onChange={(e) => set('notes', e.target.value)}
          placeholder={H.extraNotesPlaceholder}
          className={`${FIELD} resize-none`}
        />
      </div>

      <div className="mb-5 flex gap-2.5 rounded-[10px] border-[0.5px] border-cz-status-warn-fg/25 bg-cz-status-warn-bg px-4 py-3">
        <AlertTriangle size={16} className="mt-[2px] shrink-0 text-cz-status-warn-fg" aria-hidden="true" />
        <p className="text-[13px] leading-[1.5] text-cz-text-2">{H.escalation}</p>
      </div>

      <button
        type="button"
        onClick={submit}
        disabled={saving}
        className={`mb-2 w-full rounded-[10px] py-[15px] text-[15px] font-semibold disabled:opacity-50 ${FISH_THEME.solidBtn}`}
      >
        {saving ? labels.common.loading : H.save}
      </button>
    </>,
  )
}
