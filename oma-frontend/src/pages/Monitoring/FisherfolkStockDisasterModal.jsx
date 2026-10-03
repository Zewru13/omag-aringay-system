import { useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { fmtLong } from '../FisheriesRecords/stockingHelpers.js'
import {
  AQUACULTURE_EQUIPMENT_GROUPS, FISHERFOLK_DISASTER_TYPES, equipmentPayload, saveErrorMessage,
} from './fisheriesDisasterConstants.js'
import { DamagePhotosField, EquipmentChecklist } from './fisheriesDisasterShared.jsx'
import useDamagePhotos from './useDamagePhotos.js'

// Log Disaster on an aquaculture stock - the full Fisheries disaster form, used by a fisherfolk for their OWN
// stock and by Admin/Evaluator logging on behalf of a fisherfolk (Admin > Disaster > Fisheries Disaster).
// Saves to the existing /fisheries/stocking/<id>/disasters/ endpoint (the backend checks a fisherfolk's
// ownership). A fisherfolk's log is submitted to Admin by that same save - there is no second step.
// onSaved(log) receives the saved log so the page can open its Disaster Details.

const todayLocal = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

export default function FisherfolkStockDisasterModal({ record, onClose, onSaved }) {
  const { showToast } = useToast()
  const { isFisherfolk } = useAuth()
  const damagePhotos = useDamagePhotos()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    date_of_occurrence: todayLocal(),
    disaster_type: 'Typhoon',
    disaster_type_other_specify: '',
    area_affected_ha: '',
    volume_lost_kg: '',
    equipment_damaged: [],
    equipment_damaged_other: '',
    estimated_damage: '',
    is_total_loss: false,
  })
  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const maxArea = record.area_hectares ? parseFloat(record.area_hectares) : null
  const dateStocked = record.date_stocked || null

  const toggleEquipment = (option) => setForm((prev) => {
    const next = prev.equipment_damaged.includes(option)
      ? prev.equipment_damaged.filter(item => item !== option)
      : [...prev.equipment_damaged, option]
    return { ...prev, equipment_damaged: next, equipment_damaged_other: next.includes('Other') ? prev.equipment_damaged_other : '' }
  })

  const validate = () => {
    const today = todayLocal()
    if (!form.date_of_occurrence) return 'Date of occurrence is required.'
    if (form.date_of_occurrence > today) return 'Date of occurrence cannot be in the future.'
    if (dateStocked && form.date_of_occurrence < dateStocked) return `Date of occurrence cannot be before the stocking date (${fmtLong(dateStocked)}).`
    if (form.disaster_type === 'Other' && !form.disaster_type_other_specify.trim()) return 'Please specify the disaster type.'
    const area = form.is_total_loss && maxArea ? maxArea : parseFloat(form.area_affected_ha)
    if (!area || area <= 0) return 'Area affected must be greater than 0.'
    if (maxArea !== null && area > maxArea) return `Area affected cannot exceed the ${maxArea} ha stocked.`
    if (form.volume_lost_kg !== '' && parseFloat(form.volume_lost_kg) < 0) return 'Volume lost cannot be negative.'
    if (form.equipment_damaged.includes('Other') && !form.equipment_damaged_other.trim()) return 'Specify Equipment Damaged.'
    if (!form.estimated_damage.trim()) return 'Please describe the damage.'
    return ''
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (isSubmitting) return
    const problem = validate()
    if (problem) { showToast(problem, 'error'); return }
    setIsSubmitting(true)
    try {
      const fields = {
        disaster_type: form.disaster_type,
        disaster_type_other_specify: form.disaster_type === 'Other' ? form.disaster_type_other_specify.trim() : '',
        date_of_occurrence: form.date_of_occurrence,
        area_affected_ha: form.is_total_loss && maxArea ? maxArea : parseFloat(form.area_affected_ha),
        volume_lost_kg: form.volume_lost_kg === '' ? null : parseFloat(form.volume_lost_kg),
        equipment_damaged: equipmentPayload(form.equipment_damaged, form.equipment_damaged_other),
        estimated_damage: form.estimated_damage.trim(),
        is_total_loss: form.is_total_loss,
      }
      let payload = fields
      if (damagePhotos.photos.length) {
        payload = new FormData()
        Object.entries(fields).forEach(([k, v]) => { if (v !== null && v !== undefined) payload.append(k, v) })
        // Every damage photo as its own `photos` file - the backend stores each one separately.
        damagePhotos.photos.forEach(p => payload.append('photos', p.file, p.file.name))
      }
      const r = await api.post(`/fisheries/stocking/${record.id}/disasters/`, payload)
      showToast(isFisherfolk ? 'Disaster logged and submitted to Admin successfully.'
        : `Disaster logged for ${record.fisherfolk_name || 'the fisherfolk'}.`, 'success')
      onSaved(r.data)
    } catch (err) {
      // Never a false success; the form keeps everything entered so the user can fix it and retry.
      showToast(saveErrorMessage(err), 'error')
    } finally { setIsSubmitting(false) }
  }

  const stockSummary = [
    !isFisherfolk && record.fisherfolk_name,
    record.species_name,
    record.production_cycle_name,
    record.date_stocked && `stocked ${fmtLong(record.date_stocked)}`,
  ].filter(Boolean).join(' · ')

  return (
    <ModalShell
      title="Log Disaster"
      subtitle={stockSummary}
      icon={AlertTriangle}
      iconBg="bg-rose-100"
      iconColor="text-rose-600"
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={<>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="ff-stock-disaster-form" isLoading={isSubmitting} disabled={isSubmitting}>Log Disaster</Button>
      </>}
    >
      <form id="ff-stock-disaster-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="rounded-xl border border-green-200 bg-[#f0f7f0] px-3 py-2 text-sm" data-testid="affected-stock">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#1E4620]">Affected Stock</p>
          <p className="font-medium text-slate-800">{record.species_name || 'Stock'}{record.production_cycle_name ? ` · ${record.production_cycle_name}` : ''}</p>
          <p className="text-xs text-slate-500">
            {[
              record.date_stocked && `Stocked ${fmtLong(record.date_stocked)}`,
              record.pond_location_barangay,
              record.organization_name,
              record.area_hectares && `${parseFloat(record.area_hectares)} ha stocked`,
            ].filter(Boolean).join(' · ')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Date of Occurrence" required>
            <input type="date" className={baseInputClasses} required value={form.date_of_occurrence}
              max={todayLocal()} min={dateStocked || undefined}
              onChange={e => set('date_of_occurrence', e.target.value)} />
          </FormField>
          <FormField label="Disaster Type" required>
            <select className={baseInputClasses} value={form.disaster_type} onChange={e => set('disaster_type', e.target.value)}>
              {FISHERFOLK_DISASTER_TYPES.map(d => <option key={d}>{d}</option>)}
            </select>
            {form.disaster_type === 'Other' && (
              <input className={`${baseInputClasses} mt-2`} value={form.disaster_type_other_specify}
                onChange={e => set('disaster_type_other_specify', e.target.value)}
                placeholder="Specify disaster type" maxLength={150} required />
            )}
          </FormField>
          <FormField label="Area Affected (ha)" required>
            <input type="number" step="0.0001" min="0" className={`${baseInputClasses} ${form.is_total_loss ? 'cursor-not-allowed bg-slate-100' : ''}`}
              value={form.is_total_loss && maxArea ? maxArea : form.area_affected_ha}
              disabled={form.is_total_loss}
              onChange={e => set('area_affected_ha', e.target.value)}
              placeholder={maxArea ? `0.01 – ${maxArea}` : 'e.g. 0.50'} />
            {maxArea && !form.is_total_loss && <p className="mt-1 text-xs text-slate-400">Max: {maxArea} ha (total area stocked)</p>}
          </FormField>
          <FormField label="Volume Lost (kg)">
            <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.volume_lost_kg}
              onChange={e => set('volume_lost_kg', e.target.value)} placeholder="e.g. 150" />
          </FormField>
          <FormField label="Equipment Damaged" className="sm:col-span-2">
            <EquipmentChecklist
              groups={AQUACULTURE_EQUIPMENT_GROUPS}
              selected={form.equipment_damaged}
              onToggle={toggleEquipment}
              otherValue={form.equipment_damaged_other}
              onOtherChange={(v) => set('equipment_damaged_other', v)}
              inputClassName={baseInputClasses}
            />
          </FormField>
          <FormField label="Description of Damage" required className="sm:col-span-2">
            <textarea rows={3} className={`${baseInputClasses} resize-none`} required value={form.estimated_damage}
              onChange={e => set('estimated_damage', e.target.value)}
              placeholder="Describe the damage to the stock, pond/cage and equipment" />
          </FormField>
          <label className="flex cursor-pointer items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 sm:col-span-2">
            <input type="checkbox" checked={form.is_total_loss}
              onChange={e => set('is_total_loss', e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-rose-300 text-rose-600 focus:ring-rose-500" />
            <span>
              <span className="text-sm font-medium text-rose-800">Total loss — stock completely destroyed</span>
              <span className="mt-0.5 block text-xs text-rose-500">This ends the production cycle. No harvest can be recorded.</span>
            </span>
          </label>
          <div className="sm:col-span-2">
            <DamagePhotosField photosState={damagePhotos} />
          </div>
        </div>
      </form>
    </ModalShell>
  )
}
