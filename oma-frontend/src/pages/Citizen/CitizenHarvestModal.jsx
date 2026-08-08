import { useState } from 'react'
import { Tractor } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useRecordLock from '../../hooks/useRecordLock.js'
import { labels } from './labels.js'

const todayISO = () => new Date().toISOString().split('T')[0]

const UNIT_OPTIONS = [
  { value: 'kg', label: labels.harvest.unitOptions.kg },
  { value: 'bags', label: labels.harvest.unitOptions.bags },
  { value: 'cavan', label: labels.harvest.unitOptions.cavan },
  { value: 'sacks', label: labels.harvest.unitOptions.sacks },
  { value: 'pieces', label: labels.harvest.unitOptions.pieces },
  { value: 'bundles', label: labels.harvest.unitOptions.bundles },
  { value: 'boxes', label: labels.harvest.unitOptions.boxes },
  { value: 'other', label: labels.harvest.unitOptions.other },
]

// Batch 11: citizen-facing harvest form — create AND edit, for both domains.
// Deliberately much simpler than Production/RecordHarvestModal.jsx, which
// searches across ALL farmers/parcels (a staff-only capability) — here the
// record is already fixed (the citizen's own crop/stocking cycle), so the
// form only asks for the harvest's own fields.
export default function CitizenHarvestModal({ domain, record, harvest, onClose, onSuccess }) {
  const { showToast } = useToast()
  const isEdit = Boolean(harvest)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const recordLock = useRecordLock(domain.lockType, record.id, !isEdit)
  const blockedByOther = !isEdit && recordLock.lockedByOther

  const isCrop = domain.key === 'crop'

  const [form, setForm] = useState(
    isCrop
      ? {
          season: harvest?.season || record.season || 'Dry',
          year: harvest?.year || record.year || new Date().getFullYear(),
          crop_name: harvest?.crop_name || record.crop_type_name || '',
          harvest_start_date: harvest?.harvest_start_date || todayISO(),
          harvest_end_date: harvest?.harvest_end_date || '',
          area_harvested_hectares: harvest?.area_harvested_hectares || record.area_planted_ha || '',
          volume_kg: harvest?.volume_kg || '',
          unit_of_measure: harvest?.unit_of_measure || 'kg',
        }
      : {
          harvest_date: harvest?.harvest_date || todayISO(),
          quantity_kg: harvest?.quantity_kg || '',
          avg_body_weight_kg: harvest?.avg_body_weight_kg || '',
          area_or_units_harvested: harvest?.area_or_units_harvested || '',
          is_final: harvest?.is_final ?? true,
          early_late_reason: harvest?.early_late_reason || '',
          notes: harvest?.notes || '',
        },
  )

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    if (!isEdit && recordLock.lockedByOther) {
      setErrorMessage(labels.harvest.errors.lockedByOther)
      return
    }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(domain.harvestDetailUrl(harvest.id), form)
        showToast(labels.harvest.successEdit, 'success')
      } else if (isCrop) {
        await api.post(domain.harvestCreateUrl(), { ...form, monitoring_record: record.id })
        showToast(labels.harvest.successNew, 'success')
      } else {
        await api.post(domain.harvestCreateUrl(record.id), form)
        showToast(labels.harvest.successNew, 'success')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      const firstError = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
      setErrorMessage(firstError || data?.detail || labels.harvest.errors.genericSaveError)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? labels.harvest.titleEdit : labels.harvest.titleNew}
      subtitle={domain.recordTitle(record)}
      icon={Tractor}
      onClose={onClose}
      maxWidth="max-w-2xl"
    >
      {blockedByOther && (
        <div className="mb-4 rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-[12px] text-amber-800">
          🔒 <strong>{recordLock.lockedByOther.name}</strong> {labels.common.lockedByOtherSuffix}
          {recordLock.secondsRemaining ? labels.common.lockedByOtherMinutes(Math.ceil(recordLock.secondsRemaining / 60)) : ''}.
        </div>
      )}
      <form className="space-y-4" onSubmit={handleSubmit}>
        <fieldset disabled={blockedByOther} className="space-y-4">
          {isCrop ? (
            <>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={labels.harvest.fields.season} required>
                  {/* value= stays the English DB value; only the label is
                      translated, so form.season (and the payload) is
                      unchanged by this. */}
                  <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
                    {Object.entries(labels.harvest.seasonOptions).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </FormField>
                <FormField label={labels.harvest.fields.year} required>
                  <input type="number" className={baseInputClasses} value={form.year} onChange={(e) => set('year', e.target.value)} />
                </FormField>
              </div>
              <FormField label={labels.harvest.fields.cropName} required>
                <input type="text" className={baseInputClasses} value={form.crop_name} onChange={(e) => set('crop_name', e.target.value)} />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={labels.harvest.fields.harvestStartDate} required>
                  <input
                    type="date" max={todayISO()} className={baseInputClasses}
                    value={form.harvest_start_date} onChange={(e) => set('harvest_start_date', e.target.value)}
                  />
                </FormField>
                <FormField label={labels.harvest.fields.harvestEndDate}>
                  <input
                    type="date" min={form.harvest_start_date || undefined} max={todayISO()} className={baseInputClasses}
                    value={form.harvest_end_date} onChange={(e) => set('harvest_end_date', e.target.value)}
                  />
                </FormField>
              </div>
              <FormField label={labels.harvest.fields.areaHarvested} required>
                <input type="number" step="0.01" className={baseInputClasses} value={form.area_harvested_hectares} onChange={(e) => set('area_harvested_hectares', e.target.value)} />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={labels.harvest.fields.volume} required>
                  <input type="number" step="0.01" className={baseInputClasses} value={form.volume_kg} onChange={(e) => set('volume_kg', e.target.value)} />
                </FormField>
                <FormField label={labels.harvest.fields.unitOfMeasure}>
                  <select className={baseInputClasses} value={form.unit_of_measure} onChange={(e) => set('unit_of_measure', e.target.value)}>
                    {UNIT_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                  </select>
                </FormField>
              </div>
            </>
          ) : (
            <>
              <FormField label={labels.harvest.fields.harvestDate} required>
                <input type="date" max={todayISO()} className={baseInputClasses} value={form.harvest_date} onChange={(e) => set('harvest_date', e.target.value)} />
              </FormField>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FormField label={labels.harvest.fields.quantity} required>
                  <input type="number" step="0.01" className={baseInputClasses} value={form.quantity_kg} onChange={(e) => set('quantity_kg', e.target.value)} />
                </FormField>
                <FormField label={labels.harvest.fields.avgBodyWeight}>
                  <input type="number" step="0.001" className={baseInputClasses} value={form.avg_body_weight_kg} onChange={(e) => set('avg_body_weight_kg', e.target.value)} />
                </FormField>
              </div>
              <FormField label={labels.harvest.fields.areaOrUnits} hint={labels.harvest.fields.areaOrUnitsHint}>
                <input type="text" className={baseInputClasses} value={form.area_or_units_harvested} onChange={(e) => set('area_or_units_harvested', e.target.value)} />
              </FormField>
              <FormField label={labels.harvest.fields.isFinal}>
                <input type="checkbox" checked={form.is_final} onChange={(e) => set('is_final', e.target.checked)} className="h-4 w-4" />
              </FormField>
              {form.is_final && (
                <FormField label={labels.harvest.fields.earlyLateReason} hint={labels.harvest.fields.earlyLateReasonHint}>
                  <input type="text" className={baseInputClasses} value={form.early_late_reason} onChange={(e) => set('early_late_reason', e.target.value)} />
                </FormField>
              )}
              <FormField label={labels.harvest.fields.notes}>
                <textarea rows={3} className={baseInputClasses} value={form.notes} onChange={(e) => set('notes', e.target.value)} />
              </FormField>
            </>
          )}
        </fieldset>

        {errorMessage && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{errorMessage}</p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">{labels.common.cancel}</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary" disabled={blockedByOther}>
            {isEdit ? labels.harvest.submitEdit : labels.harvest.submitNew}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}
