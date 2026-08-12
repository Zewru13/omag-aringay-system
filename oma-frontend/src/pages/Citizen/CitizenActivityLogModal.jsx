import { useEffect, useState } from 'react'
import { Check, ChevronDown, Frown, Meh, Smile } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'
import { labels } from './labels.js'
import { CITIZEN_GUTTER, CROP_THEME, CitizenScreen, CitizenSubHeader, FISH_THEME } from './citizenUI.jsx'
import { todayISO, yesterdayISO } from '../../utils/localDate.js'


const dateMode = (dateStr) => {
  if (dateStr === todayISO()) return 'today'
  if (dateStr === yesterdayISO()) return 'yesterday'
  return 'custom'
}

// Shared control geometry from the citizen visual spec: hairline border,
// 8px radius, 13px/12px padding, 15px value text.
const FIELD = 'w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-[13px] text-[15px] text-cz-text placeholder:text-cz-text-muted focus:border-cz-text-2 focus:outline-none disabled:opacity-50'

function FieldBlock({ label, required, error, children }) {
  return (
    <div className="mb-[18px]">
      {label && (
        <label className="mb-2 block text-[14px] font-medium text-cz-text">
          {label}
          {required && <span className="ml-1 text-cz-danger-accent">*</span>}
        </label>
      )}
      {children}
      {error && <p className="mt-1.5 text-[12px] text-cz-danger-accent">{error}</p>}
    </div>
  )
}

// Native select restyled to the spec (own chevron, 18px, right-aligned).
function SelectField({ value, onChange, disabled, children }) {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={onChange}
        disabled={disabled}
        className={`${FIELD} appearance-none pr-10`}
      >
        {children}
      </select>
      <ChevronDown
        size={18}
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-cz-text-2"
        aria-hidden="true"
      />
    </div>
  )
}

// Three large tappable tiles — icon above label, so the chosen condition
// is carried by shape and text, not just the fill colour.
const CONDITION_ICONS = { Good: Smile, Fair: Meh, Poor: Frown }

function ConditionTiles({ theme, value, onSelect, disabled }) {
  return (
    <div className="flex gap-2">
      {['Good', 'Fair', 'Poor'].map((cond) => {
        const Icon = CONDITION_ICONS[cond]
        const selected = value === cond
        return (
          <button
            key={cond}
            type="button"
            disabled={disabled}
            aria-pressed={selected}
            onClick={() => onSelect(cond)}
            className={`flex min-h-[44px] flex-1 flex-col items-center justify-center gap-1 rounded-[8px] border-[0.5px] px-1 py-3 transition-colors disabled:opacity-50 ${
              selected
                ? `${theme.tileSelectedBorder} ${theme.tileSelectedBg} ${theme.tileSelectedText}`
                : 'border-cz-border-strong text-cz-text-2'
            }`}
          >
            <Icon size={20} aria-hidden="true" />
            <span className={`text-[12px] ${selected ? 'font-medium' : ''}`}>
              {labels.activityLog.plantConditionOptions[cond]}
            </span>
          </button>
        )
      })}
    </div>
  )
}

// Batch 11 built this as a minimal activity/date/notes form; Batch E added
// the confirm-don't-ask header, date shortcuts and crop conditional
// fields; Batch F extended it to the fisheries domain. This revision
// re-skins it to the citizen visual spec and lifts it out of a modal
// into a full screen — the header now carries the activity name and
// record context. Endpoint, payload keys, validation and useRecordLock
// usage are all byte-for-byte unchanged from Batch F.
export default function CitizenActivityLogScreen({
  domain, theme, recordId, record, log, prefill, onClose, onSuccess,
}) {
  const { showToast } = useToast()
  const isEdit = Boolean(log)
  // 'Iba pa' disclosure for the fisheries activity picker.
  const [showMoreActivities, setShowMoreActivities] = useState(false)
  // Real DiseaseType rows. The citizen log form never offered this field
  // before -- only the staff modal did -- so a fisherfolk could report a
  // disease event without being able to say what it was.
  const [diseaseTypes, setDiseaseTypes] = useState([])
  const isCrop = domain.key === 'crop'
  const isFisheries = domain.key === 'fisheries'
  const isPrefilled = !isEdit && Boolean(prefill?.activityType)
  const t = theme || (isFisheries ? FISH_THEME : CROP_THEME)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedTypeOptions, setFeedTypeOptions] = useState([])

  const initialDate = log?.date_of_activity || todayISO()
  const [selectedDateMode, setSelectedDateMode] = useState(dateMode(initialDate))

  const [form, setForm] = useState({
    // Fisheries opens on Feed Monitoring rather than activityChoices[0]
    // ('Pond Preparation'): the reference gives three activities their own
    // cards, and defaulting to a non-carded one made the screen open with
    // the 'Iba pa' disclosure already expanded. Feed Monitoring is also by
    // far the most logged (147 of 383). Crop keeps its existing default.
    [domain.activityField]: log?.[domain.activityField] || prefill?.activityType
      || (domain.key === 'fisheries' ? 'Feed Monitoring' : domain.activityChoices[0]),
    [domain.activityOtherField]: log?.[domain.activityOtherField] || '',
    date_of_activity: initialDate,
    [domain.notesField]: log?.[domain.notesField] || '',
    plant_condition: log?.plant_condition || '',
    fertilizer_type: log?.fertilizer_type || '',
    quantity_applied: log?.quantity_applied ?? '',
    quantity_unit: log?.quantity_unit || 'kg',
    pest_disease_name: log?.pest_disease_name || '',
    // FK to DiseaseType. Sent only for Disease Control, cleared otherwise, so
    // switching activity type cannot smuggle a stale disease onto a feeding log.
    disease_type: log?.disease_type || '',
    area_affected_ha: log?.area_affected_ha ?? '',
    severity: log?.severity || '',
    water_fish_condition: log?.water_fish_condition || '',
    // feed_type is a plain free-text CharField on the backend (no
    // "_other_specify" companion, unlike disease_type) — ComboboxWithOther
    // still needs a value/otherValue split for its own UI purposes, so
    // feed_type_selection drives the combobox and is resolved down to the
    // single feed_type payload key at submit time.
    feed_type_selection: log?.feed_type || '',
    feed_type_other: '',
    feed_quantity_kg: log?.feed_quantity_kg ?? '',
    feed_brand: log?.feed_brand || '',
    mortality_count: log?.mortality_count ?? '',
    vet_consulted: log?.vet_consulted || '',
    treatment_applied: log?.treatment_applied || '',
    outcome: log?.outcome || '',
    recommendations: log?.recommendations || '',
  })
  const [areaAffectedError, setAreaAffectedError] = useState('')

  const recordLock = useRecordLock(domain.lockType, recordId, !isEdit)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const activityValue = form[domain.activityField]
  // activity_type/activity is free text with no backend choices, so the
  // value here can come from two different vocabularies: the citizen's own
  // dropdown (citizenDomainConfig's activityChoices, e.g. "Pesticide
  // Application") when picked manually, OR a suggestion engine stage name
  // (CropActivityStage/SpeciesActivityStage's stage/activity name, e.g.
  // "Pest Control", "First Fertilizer Application") when opened pre-filled
  // from a task card. Both are checked so the relevant fields show either way.
  const showFertilizerFields = isCrop && activityValue.includes('Fertilizer')
  const showPestFields = isCrop && ['Pesticide Application', 'Pest Control', 'Disease Control'].includes(activityValue)
  // True when the chosen activity is NOT one of the three carded ones, so
  // the 'Iba pa' disclosure stays open when editing such a log.
  useEffect(() => {
    if (!isFisheries) return undefined
    let cancelled = false
    api.get('/fisheries/disease-types/')
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setDiseaseTypes(rows.filter((x) => x.is_active !== false))
      })
      .catch(() => { if (!cancelled) setDiseaseTypes([]) })
    return () => { cancelled = true }
  }, [isFisheries])

  const isOtherActivity = isFisheries
    && Boolean(activityValue)
    && !['Feed Monitoring', 'Disease Control', 'Water Quality Check'].includes(activityValue)

  const showWaterQualityFields = isFisheries && activityValue === 'Water Quality Check'
  const showFeedFields = isFisheries && activityValue === 'Feed Monitoring'
  const showIssueFields = isFisheries && activityValue === 'Disease Control'
  const plantedArea = isCrop
    ? (record?.area_planted_ha ? Number(record.area_planted_ha) : null)
    : (record?.area_hectares ? Number(record.area_hectares) : null)

  useEffect(() => {
    if (!showFeedFields || !record?.species) { setFeedTypeOptions([]); return }
    let cancelled = false
    api.get('/fisheries/feed-types/', { params: { species: record.species } })
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setFeedTypeOptions(rows.map((f) => f.name))
      })
      .catch(() => { if (!cancelled) setFeedTypeOptions([]) })
    return () => { cancelled = true }
  }, [showFeedFields, record?.species])

  const validateAreaAffected = (value) => {
    if (!value || value === '') return labels.activityLog.errors.areaAffectedRequired
    const n = parseFloat(value)
    if (isNaN(n) || n <= 0) return labels.activityLog.errors.areaAffectedInvalid
    if (plantedArea != null && n > plantedArea) return labels.activityLog.errors.areaAffectedExceeds(plantedArea)
    return ''
  }

  const handleDateShortcut = (mode) => {
    setSelectedDateMode(mode)
    if (mode === 'today') set('date_of_activity', todayISO())
    else if (mode === 'yesterday') set('date_of_activity', yesterdayISO())
    // 'custom' leaves the current date_of_activity as-is and reveals the picker
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.date_of_activity) { showToast(labels.activityLog.errors.dateRequired, 'error'); return }
    if (form[domain.activityField] === 'Other' && !form[domain.activityOtherField].trim()) {
      showToast(labels.activityLog.errors.specifyActivity, 'error')
      return
    }
    if (showPestFields || showIssueFields) {
      const err = validateAreaAffected(form.area_affected_ha)
      if (err) { setAreaAffectedError(err); showToast(err, 'error'); return }
    }
    if (showFeedFields && form.feed_type_selection === 'Other' && !form.feed_type_other.trim()) {
      showToast(labels.activityLog.errors.specifyFeedType, 'error')
      return
    }
    if (!isEdit && recordLock.lockedByOther) {
      showToast(labels.activityLog.errors.lockedByOther, 'error')
      return
    }
    setIsSubmitting(true)
    try {
      const payload = {
        [domain.activityField]: form[domain.activityField],
        [domain.activityOtherField]: form[domain.activityField] === 'Other' ? form[domain.activityOtherField] : '',
        date_of_activity: form.date_of_activity,
        [domain.notesField]: form[domain.notesField],
      }
      if (isCrop) {
        payload.plant_condition = form.plant_condition
        payload.fertilizer_type = showFertilizerFields ? form.fertilizer_type : ''
        payload.quantity_applied = showFertilizerFields ? (form.quantity_applied || null) : null
        payload.quantity_unit = showFertilizerFields ? form.quantity_unit : ''
        payload.pest_disease_name = showPestFields ? form.pest_disease_name : ''
        payload.area_affected_ha = showPestFields ? (form.area_affected_ha || null) : null
        payload.severity = showPestFields ? form.severity : ''
      }
      if (isFisheries) {
        payload.water_fish_condition = form.water_fish_condition
        payload.feed_type = showFeedFields ? (form.feed_type_selection === 'Other' ? form.feed_type_other.trim() : form.feed_type_selection) : ''
        payload.feed_quantity_kg = showFeedFields ? (form.feed_quantity_kg || null) : null
        payload.feed_brand = showFeedFields ? form.feed_brand : ''
        payload.disease_type = showIssueFields ? (form.disease_type || null) : null
        payload.severity = showIssueFields ? form.severity : ''
        payload.mortality_count = showIssueFields ? (form.mortality_count || null) : null
        payload.area_affected_ha = showIssueFields ? (form.area_affected_ha || null) : null
        payload.vet_consulted = showIssueFields ? form.vet_consulted : ''
        payload.treatment_applied = showIssueFields ? form.treatment_applied : ''
        payload.outcome = showIssueFields ? form.outcome : ''
        payload.recommendations = form.recommendations
      }
      if (isEdit) {
        await api.patch(domain.logDetailUrl(log.id), payload)
        showToast(labels.activityLog.successEdit, 'success')
      } else {
        await api.post(domain.logsUrl(recordId), payload)
        showToast(labels.activityLog.successNew, 'success')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object'
        ? Object.values(data).flat()[0]
        : null
      showToast(firstError || data?.detail || labels.common.genericSaveError, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  const blockedByOther = !isEdit && recordLock.lockedByOther

  // Header: when opened from a task card the activity is already known, so
  // it becomes the title and the record identifies itself underneath.
  const headerTitle = isPrefilled
    ? activityValue
    : (isEdit ? labels.activityLog.titleEdit : labels.activityLog.titleNew)
  const headerSubtitle = record
    ? (isCrop
        ? labels.farmerHome.needsAttention.contextLine(
            record.crop_type_name || labels.yieldAnalysis.cropCropLabel,
            record.farm_location_barangay || labels.common.unknown,
            record.area_planted_ha ?? labels.common.unknown,
          )
        : labels.fisherfolkHome.myPonds.pondSpecies(
            record.pond_name || labels.common.unknown,
            record.species_name || labels.yieldAnalysis.fisheriesCropLabel,
          ))
    : undefined

  return (
    <CitizenScreen>
      <CitizenSubHeader theme={t} title={headerTitle} subtitle={headerSubtitle} onBack={onClose} />

      <form onSubmit={handleSubmit} className={`${CITIZEN_GUTTER} py-4`}>
        {blockedByOther && (
          <div className="mb-[18px] rounded-[12px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg p-[14px]">
            <p className="text-[13px] text-cz-warn-body">
              🔒 <strong className="font-medium">{recordLock.lockedByOther.name}</strong> {labels.common.lockedByOtherSuffix}
              {recordLock.secondsRemaining ? labels.common.lockedByOtherMinutes(Math.ceil(recordLock.secondsRemaining / 60)) : ''}.
            </p>
          </div>
        )}

        {/* ACTIVITY — only asked for when it isn't already known */}
        {/* The reference's three prominent cards, fisheries only — the crop
            side has eight choices and the reference keeps a dropdown there.
            'Iba pa' expands to the remaining real choices rather than
            dropping them: six of them are actively logged. */}
        {!isPrefilled && isFisheries && (
          <FieldBlock label={labels.ffNew.activityTypeHeading} required>
            <div className="space-y-2">
              {['Feed Monitoring', 'Disease Control', 'Water Quality Check'].map((choice) => {
                const selected = form[domain.activityField] === choice
                return (
                  <button
                    key={choice}
                    type="button"
                    disabled={blockedByOther}
                    onClick={() => { set(domain.activityField, choice); setShowMoreActivities(false) }}
                    className={`flex w-full items-center gap-3 rounded-[10px] border-[0.5px] px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                      selected
                        ? 'border-cz-fish-header bg-cz-fish-header text-white'
                        : 'border-cz-border bg-cz-surface hover:bg-cz-page'
                    }`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className={`block text-[15px] font-semibold ${selected ? 'text-white' : 'text-cz-text'}`}>
                        {choice}
                      </span>
                      <span className={`mt-0.5 block text-[12.5px] ${selected ? 'text-cz-fish-100' : 'text-cz-text-2'}`}>
                        {labels.ffNew.activitySubtitles[choice]}
                      </span>
                    </span>
                  </button>
                )
              })}

              <button
                type="button"
                disabled={blockedByOther}
                onClick={() => setShowMoreActivities((v) => !v)}
                className={`flex w-full items-center gap-3 rounded-[10px] border-[0.5px] px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                  showMoreActivities || isOtherActivity
                    ? 'border-cz-fish-header bg-cz-surface'
                    : 'border-cz-border bg-cz-surface hover:bg-cz-page'
                }`}
              >
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold text-cz-text">{labels.ffNew.activityMore}</span>
                  <span className="mt-0.5 block text-[12.5px] text-cz-text-2">{labels.ffNew.activityMoreSub}</span>
                </span>
              </button>

              {(showMoreActivities || isOtherActivity) && (
                <ComboboxWithOther
                  options={domain.activityChoices.filter(
                    (x) => x !== 'Other' && !['Feed Monitoring', 'Disease Control', 'Water Quality Check'].includes(x),
                  )}
                  value={isOtherActivity ? form[domain.activityField] : ''}
                  otherValue={form[domain.activityOtherField]}
                  onChange={(v) => set(domain.activityField, v)}
                  onOtherChange={(v) => set(domain.activityOtherField, v)}
                  disabled={blockedByOther}
                  placeholder={labels.activityLog.selectPlaceholder}
                  inputClassName={FIELD}
                  chevronSize={18}
                />
              )}
            </div>
          </FieldBlock>
        )}

        {!isPrefilled && !isFisheries && (
          <FieldBlock label={labels.activityLog.fields.activity} required>
            <ComboboxWithOther
              options={domain.activityChoices.filter((x) => x !== 'Other')}
              value={form[domain.activityField]}
              otherValue={form[domain.activityOtherField]}
              onChange={(v) => set(domain.activityField, v)}
              onOtherChange={(v) => set(domain.activityOtherField, v)}
              disabled={blockedByOther}
              placeholder={labels.activityLog.selectPlaceholder}
              inputClassName={FIELD}
              chevronSize={18}
            />
          </FieldBlock>
        )}

        {/* DATE */}
        <FieldBlock label={labels.activityLog.fields.dateOfActivity} required>
          <div className="flex gap-2">
            {['today', 'yesterday', 'custom'].map((mode) => {
              const selected = selectedDateMode === mode
              const isPick = mode === 'custom'
              return (
                <button
                  key={mode}
                  type="button"
                  disabled={blockedByOther}
                  aria-pressed={selected}
                  onClick={() => handleDateShortcut(mode)}
                  className={`min-h-[44px] flex-1 rounded-[8px] px-1.5 py-3 transition-colors disabled:opacity-50 ${
                    selected
                      ? t.solidBtn
                      : `border-[0.5px] border-cz-border-strong ${isPick ? 'text-cz-text-2' : 'text-cz-text'}`
                  }`}
                >
                  <span className={`text-[14px] ${selected ? 'font-medium' : ''}`}>
                    {mode === 'today' ? labels.activityLog.dateShortcuts.today
                      : mode === 'yesterday' ? labels.activityLog.dateShortcuts.yesterday
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
              value={form.date_of_activity}
              onChange={(e) => set('date_of_activity', e.target.value)}
              disabled={blockedByOther}
              autoFocus
            />
          )}
          <p className="mt-1.5 text-[12px] text-cz-text-muted">
            {labels.activityLog.dateResolved(form.date_of_activity)}
          </p>
        </FieldBlock>

        {/* CONDITION — crop and fisheries each have their own field name */}
        {isCrop && (
          <FieldBlock label={labels.activityLog.fields.plantCondition}>
            <ConditionTiles
              theme={t}
              value={form.plant_condition}
              onSelect={(v) => set('plant_condition', v)}
              disabled={blockedByOther}
            />
          </FieldBlock>
        )}
        {isFisheries && (
          <FieldBlock label={labels.activityLog.fields.waterFishCondition}>
            <ConditionTiles
              theme={t}
              value={form.water_fish_condition}
              onSelect={(v) => set('water_fish_condition', v)}
              disabled={blockedByOther}
            />
          </FieldBlock>
        )}

        {/* FERTILISER (crop) */}
        {showFertilizerFields && (
          <>
            <FieldBlock label={labels.activityLog.fields.fertilizerType}>
              <input
                type="text"
                className={FIELD}
                value={form.fertilizer_type}
                onChange={(e) => set('fertilizer_type', e.target.value)}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.quantityApplied}>
              <div className="flex gap-2">
                <input
                  type="number" step="0.01" inputMode="decimal"
                  className={`${FIELD} flex-[2]`}
                  value={form.quantity_applied}
                  onChange={(e) => set('quantity_applied', e.target.value)}
                  disabled={blockedByOther}
                />
                <div className="flex-[3]">
                  <SelectField
                    value={form.quantity_unit}
                    onChange={(e) => set('quantity_unit', e.target.value)}
                    disabled={blockedByOther}
                  >
                    {Object.entries(labels.activityLog.quantityUnitOptions).map(([v, l]) => (
                      <option key={v} value={v}>{l}</option>
                    ))}
                  </SelectField>
                </div>
              </div>
            </FieldBlock>
          </>
        )}

        {/* PEST / DISEASE (crop) */}
        {showPestFields && (
          <>
            <FieldBlock label={labels.activityLog.fields.pestDiseaseName}>
              <input
                type="text"
                className={FIELD}
                value={form.pest_disease_name}
                onChange={(e) => set('pest_disease_name', e.target.value)}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.areaAffected} required error={areaAffectedError}>
              <input
                type="number" step="0.0001" inputMode="decimal"
                className={FIELD}
                value={form.area_affected_ha}
                onChange={(e) => { set('area_affected_ha', e.target.value); setAreaAffectedError('') }}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.severity}>
              <SelectField
                value={form.severity}
                onChange={(e) => set('severity', e.target.value)}
                disabled={blockedByOther}
              >
                <option value="">{labels.activityLog.selectPlaceholder}</option>
                {Object.entries(labels.activityLog.severityOptions).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </SelectField>
            </FieldBlock>
          </>
        )}

        {/* FEEDING (fisheries) */}
        {/* WATER QUALITY — pH, dissolved oxygen and clarity, per the new
            reference. These are real model fields as of this batch; before
            it, a water-quality log could only carry the free-text condition
            field, which every existing water-quality record still uses. */}
        {showWaterQualityFields && (
          <>
            <FieldBlock label={labels.ffNew.phLevel}>
              <input
                type="number"
                step="0.1"
                min="0"
                max="14"
                inputMode="decimal"
                value={form.ph_level ?? ''}
                onChange={(e) => set('ph_level', e.target.value)}
                placeholder={labels.ffNew.phPlaceholder}
                className={FIELD}
              />
            </FieldBlock>
            <FieldBlock label={labels.ffNew.dissolvedOxygen}>
              <select
                value={form.dissolved_oxygen || ''}
                onChange={(e) => set('dissolved_oxygen', e.target.value)}
                className={FIELD}
              >
                <option value="">{labels.activityLog.selectPlaceholder}</option>
                {Object.entries(labels.ffNew.doOptions).map(([v, lbl]) => (
                  <option key={v} value={v}>{lbl}</option>
                ))}
              </select>
            </FieldBlock>
            <FieldBlock label={labels.ffNew.waterClarity}>
              <select
                value={form.water_clarity || ''}
                onChange={(e) => set('water_clarity', e.target.value)}
                className={FIELD}
              >
                <option value="">{labels.activityLog.selectPlaceholder}</option>
                {Object.entries(labels.ffNew.clarityOptions).map(([v, lbl]) => (
                  <option key={v} value={v}>{lbl}</option>
                ))}
              </select>
            </FieldBlock>
          </>
        )}

        {showFeedFields && (
          <>
            <FieldBlock label={labels.activityLog.fields.feedType}>
              <ComboboxWithOther
                options={feedTypeOptions}
                value={form.feed_type_selection}
                otherValue={form.feed_type_other}
                onChange={(v) => set('feed_type_selection', v)}
                onOtherChange={(v) => set('feed_type_other', v)}
                disabled={blockedByOther}
                placeholder={labels.activityLog.selectPlaceholder}
                inputClassName={FIELD}
                chevronSize={18}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.feedQuantity}>
              <div className="flex gap-2">
                <input
                  type="number" step="0.01" inputMode="decimal"
                  className={`${FIELD} flex-[2]`}
                  value={form.feed_quantity_kg}
                  onChange={(e) => set('feed_quantity_kg', e.target.value)}
                  disabled={blockedByOther}
                />
                <input
                  type="text"
                  placeholder={labels.activityLog.fields.feedBrand}
                  className={`${FIELD} flex-[3]`}
                  value={form.feed_brand}
                  onChange={(e) => set('feed_brand', e.target.value)}
                  disabled={blockedByOther}
                />
              </div>
            </FieldBlock>
          </>
        )}

        {/* HEALTH MONITORING (fisheries) */}
        {showIssueFields && (
          <>
            {/* URI NG SAKIT — the reference makes this its own step with big
                tappable options. Values are real DiseaseType rows, so the
                choice is stored as the FK the model already has rather than
                as free text. */}
            {diseaseTypes.length > 0 && (
              <FieldBlock label={labels.ffNew.illnessHeading}>
                <div className="space-y-2">
                  {diseaseTypes.map((dt) => {
                    const selected = String(form.disease_type || '') === String(dt.id)
                    return (
                      <button
                        key={dt.id}
                        type="button"
                        disabled={blockedByOther}
                        onClick={() => set('disease_type', selected ? '' : dt.id)}
                        // Selection is shown with a left accent bar, weight
                        // and a check -- NOT a background fill. On this
                        // control a bg-* utility, and even an inline
                        // background-color, both lose to an !important rule
                        // somewhere in the cascade, which produced an
                        // invisible (white-on-white) selected state. Border,
                        // colour and content all apply normally, so the
                        // indicator is built from those instead.
                        className={`relative flex w-full items-center gap-2.5 overflow-hidden rounded-[10px] border-[0.5px] px-4 py-3 text-left transition-colors disabled:opacity-50 ${
                          selected
                            ? 'border-cz-fish-header'
                            : 'border-cz-border hover:bg-cz-page'
                        }`}
                      >
                        {selected && (
                          <span
                            className="absolute inset-y-0 left-0 w-[4px] bg-cz-fish-header"
                            aria-hidden="true"
                          />
                        )}
                        <Check
                          size={16}
                          className={`shrink-0 ${selected ? 'text-cz-fish-header' : 'text-transparent'}`}
                          aria-hidden="true"
                        />
                        <span className={`text-[14px] leading-[1.35] ${
                          selected ? 'font-semibold text-cz-fish-header' : 'text-cz-text'
                        }`}
                        >
                        {dt.name}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </FieldBlock>
            )}

            <FieldBlock label={labels.activityLog.fields.areaAffected} required error={areaAffectedError}>
              <input
                type="number" step="0.0001" inputMode="decimal"
                className={FIELD}
                value={form.area_affected_ha}
                onChange={(e) => { set('area_affected_ha', e.target.value); setAreaAffectedError('') }}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.severity}>
              <SelectField
                value={form.severity}
                onChange={(e) => set('severity', e.target.value)}
                disabled={blockedByOther}
              >
                <option value="">{labels.activityLog.selectPlaceholder}</option>
                {Object.entries(labels.activityLog.severityOptions).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </SelectField>
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.mortalityCount}>
              <input
                type="number" step="1" min="0" inputMode="numeric"
                className={FIELD}
                value={form.mortality_count}
                onChange={(e) => set('mortality_count', e.target.value)}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.vetConsulted}>
              <input
                type="text"
                className={FIELD}
                value={form.vet_consulted}
                onChange={(e) => set('vet_consulted', e.target.value)}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.treatmentApplied}>
              <input
                type="text"
                className={FIELD}
                value={form.treatment_applied}
                onChange={(e) => set('treatment_applied', e.target.value)}
                disabled={blockedByOther}
              />
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.outcome}>
              <SelectField
                value={form.outcome}
                onChange={(e) => set('outcome', e.target.value)}
                disabled={blockedByOther}
              >
                <option value="">{labels.activityLog.selectPlaceholder}</option>
                {Object.entries(labels.activityLog.outcomeOptions).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </SelectField>
            </FieldBlock>
            <FieldBlock label={labels.activityLog.fields.recommendations}>
              <textarea
                rows={2}
                className={FIELD}
                value={form.recommendations}
                onChange={(e) => set('recommendations', e.target.value)}
                disabled={blockedByOther}
              />
            </FieldBlock>
          </>
        )}

        {/* NOTES */}
        <FieldBlock label={isCrop ? labels.activityLog.fields.notes : labels.activityLog.fields.notesFisheries}>
          <textarea
            rows={3}
            className={FIELD}
            value={form[domain.notesField]}
            onChange={(e) => set(domain.notesField, e.target.value)}
            disabled={blockedByOther}
          />
        </FieldBlock>

        {/* SUBMIT */}
        <button
          type="submit"
          disabled={blockedByOther || isSubmitting}
          className={`flex w-full items-center justify-center gap-2 rounded-[8px] px-4 py-[15px] transition-opacity hover:opacity-90 disabled:opacity-50 ${t.solidBtn}`}
        >
          <Check size={18} aria-hidden="true" />
          <span className="text-[16px] font-medium">
            {isEdit ? labels.activityLog.submitEdit : labels.activityLog.submitNew}
          </span>
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-1 w-full py-[14px] text-center text-cz-text-2"
        >
          <span className="text-[14px]">{labels.common.cancel}</span>
        </button>
      </form>
    </CitizenScreen>
  )
}
