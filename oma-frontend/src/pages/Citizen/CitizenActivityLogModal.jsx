import { useState } from 'react'
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

// Batch 11 built this as a minimal activity/date/notes form. Batch E reworks
// it (crop domain only — fisheries keeps the original minimal shape, since
// only CropActivityLog has the fertilizer/pest conditional fields) to:
//   - confirm context instead of asking for it, when opened from a "Needs
//     Attention" task card (`prefill` prop) — activity type is shown as a
//     fixed confirmation, not a re-pickable combobox
//   - offer Today/Yesterday/Pick-a-date shortcuts instead of a bare date input
//   - show only the fields relevant to the selected activity type
//   - render plant condition as three large tappable options
// Endpoint, payload keys, useRecordLock usage, and server-side validation
// (future-date / pre-planting-date guards) are all completely unchanged —
// this batch only adds fields the backend already accepted from staff and
// changes how they're presented.
export default function CitizenActivityLogModal({ domain, recordId, record, log, prefill, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = Boolean(log)
  const isCrop = domain.key === 'crop'
  const isPrefilled = !isEdit && Boolean(prefill?.activityType)
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  })
  const [areaAffectedError, setAreaAffectedError] = useState('')

  const recordLock = useRecordLock(domain.lockType, recordId, !isEdit)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const activityValue = form[domain.activityField]
  // activity_type is free text with no backend choices, so the value here
  // can come from two different vocabularies: the citizen's own dropdown
  // (citizenDomainConfig's CROP_DOMAIN.activityChoices, e.g. "Pesticide
  // Application") when picked manually, OR a suggestion engine stage name
  // (CropActivityStage.stage_name, e.g. "Pest Control", "Disease Control",
  // "First Fertilizer Application") when opened pre-filled from a task
  // card. Both are checked so the relevant fields show either way.
  const showFertilizerFields = isCrop && activityValue.includes('Fertilizer')
  const showPestFields = isCrop && ['Pesticide Application', 'Pest Control', 'Disease Control'].includes(activityValue)
  const plantedArea = record?.area_planted_ha ? Number(record.area_planted_ha) : null

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
    if (showPestFields) {
      const err = validateAreaAffected(form.area_affected_ha)
      if (err) { setAreaAffectedError(err); showToast(err, 'error'); return }
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
