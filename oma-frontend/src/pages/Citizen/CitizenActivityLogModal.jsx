import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'
import { labels } from './labels.js'

const todayISO = () => new Date().toISOString().split('T')[0]
const yesterdayISO = () => {
  const d = new Date()
  d.setDate(d.getDate() - 1)
  return d.toISOString().split('T')[0]
}

const dateMode = (dateStr) => {
  if (dateStr === todayISO()) return 'today'
  if (dateStr === yesterdayISO()) return 'yesterday'
  return 'custom'
}

// Batch 11 built this as a minimal activity/date/notes form. Batch E reworked
// it for the crop domain (fertilizer/pest conditional fields, date
// shortcuts, prefilled-context header, tappable plant condition). Batch F
// extends the same treatment to the fisheries domain: water/fish condition
// (general, mirrors plant_condition), feed fields (Feed Monitoring only,
// feed type via a species-scoped ComboboxWithOther), and health-monitoring
// fields (Disease Control only) — disease_type itself stays out of scope
// (its picker endpoint is still staff-only; not requested this batch), so
// that field is left unset same as crop's Disaster Remedy exclusion.
// Endpoint, payload keys, useRecordLock usage, and server-side validation
// (future-date / pre-stocking-date guards) are all completely unchanged —
// this batch only adds fields the backend already accepted from staff and
// changes how they're presented.
export default function CitizenActivityLogModal({ domain, recordId, record, log, prefill, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = Boolean(log)
  const isCrop = domain.key === 'crop'
  const isFisheries = domain.key === 'fisheries'
  const isPrefilled = !isEdit && Boolean(prefill?.activityType)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [feedTypeOptions, setFeedTypeOptions] = useState([])

  const initialDate = log?.date_of_activity || todayISO()
  const [selectedDateMode, setSelectedDateMode] = useState(dateMode(initialDate))

  const [form, setForm] = useState({
    [domain.activityField]: log?.[domain.activityField] || prefill?.activityType || domain.activityChoices[0],
    [domain.activityOtherField]: log?.[domain.activityOtherField] || '',
    date_of_activity: initialDate,
    [domain.notesField]: log?.[domain.notesField] || '',
    plant_condition: log?.plant_condition || '',
    fertilizer_type: log?.fertilizer_type || '',
    quantity_applied: log?.quantity_applied ?? '',
    quantity_unit: log?.quantity_unit || 'kg',
    pest_disease_name: log?.pest_disease_name || '',
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

  return (
    <ModalShell
      title={isEdit ? labels.activityLog.titleEdit : labels.activityLog.titleNew}
      subtitle={record ? labels.activityLog.prefilledSubtitle(domain.recordTitle(record)) : undefined}
      onClose={onClose}
    >
      {blockedByOther && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[13px] text-amber-800">
          🔒 <strong>{recordLock.lockedByOther.name}</strong> {labels.common.lockedByOtherSuffix}
          {recordLock.secondsRemaining ? labels.common.lockedByOtherMinutes(Math.ceil(recordLock.secondsRemaining / 60)) : ''}.
        </div>
      )}
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label={labels.activityLog.fields.activity} required>
          {isPrefilled ? (
            <div className="flex min-h-[44px] items-center rounded-lg border border-[#C8D5C8] bg-[#F0F7F0] px-3 text-[15px] font-medium text-[#1B4D2E]">
              {activityValue}
            </div>
          ) : (
            <ComboboxWithOther
              options={domain.activityChoices.filter((t) => t !== 'Other')}
              value={form[domain.activityField]}
              otherValue={form[domain.activityOtherField]}
              onChange={(v) => set(domain.activityField, v)}
              onOtherChange={(v) => set(domain.activityOtherField, v)}
              disabled={blockedByOther}
            />
          )}
        </FormField>

        <FormField label={labels.activityLog.fields.dateOfActivity} required hint={labels.activityLog.fields.dateHint}>
          <div className="flex flex-wrap gap-2">
            {['today', 'yesterday', 'custom'].map((mode) => (
              <button
                key={mode}
                type="button"
                disabled={blockedByOther}
                onClick={() => handleDateShortcut(mode)}
                className={`min-h-[44px] rounded-lg border px-4 text-[15px] font-medium transition-colors disabled:opacity-50 ${
                  selectedDateMode === mode
                    ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white'
                    : 'border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
                }`}
              >
                {mode === 'today' ? labels.activityLog.dateShortcuts.today
                  : mode === 'yesterday' ? labels.activityLog.dateShortcuts.yesterday
                  : labels.activityLog.dateShortcuts.pickDate}
              </button>
            ))}
          </div>
          {selectedDateMode === 'custom' && (
            <input
              type="date"
              max={todayISO()}
              className={`${baseInputClasses} mt-2`}
              value={form.date_of_activity}
              onChange={(e) => set('date_of_activity', e.target.value)}
              disabled={blockedByOther}
              autoFocus
            />
          )}
        </FormField>

        {isCrop && (
          <FormField label={labels.activityLog.fields.plantCondition}>
            <div className="grid grid-cols-3 gap-2">
              {['Good', 'Fair', 'Poor'].map((cond) => (
                <button
                  key={cond}
                  type="button"
                  disabled={blockedByOther}
                  onClick={() => set('plant_condition', cond)}
                  className={`min-h-[44px] rounded-lg border px-2 text-[15px] font-medium transition-colors disabled:opacity-50 ${
                    form.plant_condition === cond
                      ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white'
                      : 'border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
                  }`}
                >
                  {labels.activityLog.plantConditionOptions[cond]}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {isFisheries && (
          <FormField label={labels.activityLog.fields.waterFishCondition}>
            <div className="grid grid-cols-3 gap-2">
              {['Good', 'Fair', 'Poor'].map((cond) => (
                <button
                  key={cond}
                  type="button"
                  disabled={blockedByOther}
                  onClick={() => set('water_fish_condition', cond)}
                  className={`min-h-[44px] rounded-lg border px-2 text-[15px] font-medium transition-colors disabled:opacity-50 ${
                    form.water_fish_condition === cond
                      ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white'
                      : 'border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
                  }`}
                >
                  {labels.activityLog.plantConditionOptions[cond]}
                </button>
              ))}
            </div>
          </FormField>
        )}

        {showFeedFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={labels.activityLog.fields.feedType}>
              <ComboboxWithOther
                options={feedTypeOptions}
                value={form.feed_type_selection}
                otherValue={form.feed_type_other}
                onChange={(v) => set('feed_type_selection', v)}
                onOtherChange={(v) => set('feed_type_other', v)}
                disabled={blockedByOther}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label={labels.activityLog.fields.feedQuantity}>
                <input
                  type="number" step="0.01"
                  className={baseInputClasses}
                  value={form.feed_quantity_kg}
                  onChange={(e) => set('feed_quantity_kg', e.target.value)}
                  disabled={blockedByOther}
                />
              </FormField>
              <FormField label={labels.activityLog.fields.feedBrand}>
                <input
                  type="text"
                  className={baseInputClasses}
                  value={form.feed_brand}
                  onChange={(e) => set('feed_brand', e.target.value)}
                  disabled={blockedByOther}
                />
              </FormField>
            </div>
          </div>
        )}

        {showIssueFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={labels.activityLog.fields.areaAffected} required error={areaAffectedError}>
              <input
                type="number" step="0.0001"
                className={baseInputClasses}
                value={form.area_affected_ha}
                onChange={(e) => { set('area_affected_ha', e.target.value); setAreaAffectedError('') }}
                disabled={blockedByOther}
              />
            </FormField>
            <FormField label={labels.activityLog.fields.severity}>
              <select
                className={baseInputClasses}
                value={form.severity}
                onChange={(e) => set('severity', e.target.value)}
                disabled={blockedByOther}
              >
                <option value=""></option>
                {Object.entries(labels.activityLog.severityOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>
            <FormField label={labels.activityLog.fields.mortalityCount}>
              <input
                type="number" step="1" min="0"
                className={baseInputClasses}
                value={form.mortality_count}
                onChange={(e) => set('mortality_count', e.target.value)}
                disabled={blockedByOther}
              />
            </FormField>
            <FormField label={labels.activityLog.fields.vetConsulted}>
              <input
                type="text"
                className={baseInputClasses}
                value={form.vet_consulted}
                onChange={(e) => set('vet_consulted', e.target.value)}
                disabled={blockedByOther}
              />
            </FormField>
            <FormField label={labels.activityLog.fields.treatmentApplied}>
              <input
                type="text"
                className={baseInputClasses}
                value={form.treatment_applied}
                onChange={(e) => set('treatment_applied', e.target.value)}
                disabled={blockedByOther}
              />
            </FormField>
            <FormField label={labels.activityLog.fields.outcome}>
              <select
                className={baseInputClasses}
                value={form.outcome}
                onChange={(e) => set('outcome', e.target.value)}
                disabled={blockedByOther}
              >
                <option value=""></option>
                {Object.entries(labels.activityLog.outcomeOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>
            <div className="sm:col-span-2">
              <FormField label={labels.activityLog.fields.recommendations}>
                <textarea
                  rows={2}
                  className={baseInputClasses}
                  value={form.recommendations}
                  onChange={(e) => set('recommendations', e.target.value)}
                  disabled={blockedByOther}
                />
              </FormField>
            </div>
          </div>
        )}

        {showFertilizerFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={labels.activityLog.fields.fertilizerType}>
              <input
                type="text"
                className={baseInputClasses}
                value={form.fertilizer_type}
                onChange={(e) => set('fertilizer_type', e.target.value)}
                disabled={blockedByOther}
              />
            </FormField>
            <div className="grid grid-cols-2 gap-2">
              <FormField label={labels.activityLog.fields.quantityApplied}>
                <input
                  type="number" step="0.01"
                  className={baseInputClasses}
                  value={form.quantity_applied}
                  onChange={(e) => set('quantity_applied', e.target.value)}
                  disabled={blockedByOther}
                />
              </FormField>
              <FormField label={labels.activityLog.fields.quantityUnit}>
                <select
                  className={baseInputClasses}
                  value={form.quantity_unit}
                  onChange={(e) => set('quantity_unit', e.target.value)}
                  disabled={blockedByOther}
                >
                  {Object.entries(labels.activityLog.quantityUnitOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </FormField>
            </div>
          </div>
        )}

        {showPestFields && (
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label={labels.activityLog.fields.pestDiseaseName}>
              <input
                type="text"
                className={baseInputClasses}
                value={form.pest_disease_name}
                onChange={(e) => set('pest_disease_name', e.target.value)}
                disabled={blockedByOther}
              />
            </FormField>
            <FormField label={labels.activityLog.fields.areaAffected} required error={areaAffectedError}>
              <input
                type="number" step="0.0001"
                className={baseInputClasses}
                value={form.area_affected_ha}
                onChange={(e) => { set('area_affected_ha', e.target.value); setAreaAffectedError('') }}
                disabled={blockedByOther}
              />
            </FormField>
            <FormField label={labels.activityLog.fields.severity}>
              <select
                className={baseInputClasses}
                value={form.severity}
                onChange={(e) => set('severity', e.target.value)}
                disabled={blockedByOther}
              >
                <option value=""></option>
                {Object.entries(labels.activityLog.severityOptions).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </FormField>
          </div>
        )}

        <FormField label={domain.key === 'crop' ? labels.activityLog.fields.notes : labels.activityLog.fields.notesFisheries}>
          <textarea
            className={baseInputClasses}
            rows={3}
            value={form[domain.notesField]}
            onChange={(e) => set(domain.notesField, e.target.value)}
            disabled={blockedByOther}
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>{labels.common.cancel}</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={blockedByOther}>
            {isEdit ? labels.activityLog.submitEdit : labels.activityLog.submitNew}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
