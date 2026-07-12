import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

const currentYear = new Date().getFullYear()
const yearOptions = []
for (let y = 2022; y <= currentYear + 1; y++) yearOptions.push(y.toString())

function LogDamageReportModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    barangay: '',
    calamity_name: '',
    calamity_date: '',
    season: 'Dry',
    year: currentYear.toString(),
    damaged_crops: '',
    crop_volume_damaged_kg: '',
    damaged_livestock: '',
    livestock_head_count_affected: '',
    estimated_loss_php: '',
    remarks: '',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.barangay || !form.calamity_name || !form.calamity_date || !form.year) {
      setError('Barangay, Calamity Name, Date, and Year are required.')
      return
    }
    setIsSubmitting(true)
    try {
      const payload = {
        barangay: form.barangay,
        calamity_name: form.calamity_name,
        calamity_date: form.calamity_date,
        season: form.season,
        year: parseInt(form.year),
        damaged_crops: form.damaged_crops,
        damaged_livestock: form.damaged_livestock,
        remarks: form.remarks,
      }
      if (form.crop_volume_damaged_kg !== '') payload.crop_volume_damaged_kg = parseFloat(form.crop_volume_damaged_kg)
      if (form.livestock_head_count_affected !== '') payload.livestock_head_count_affected = parseInt(form.livestock_head_count_affected)
      if (form.estimated_loss_php !== '') payload.estimated_loss_php = parseFloat(form.estimated_loss_php)
      await api.post('/production/damage-reports/', payload)
      onSuccess()
    } catch (err) {
      const data = err.response?.data
      if (data) {
        const msgs = Object.values(data).flat().join(' ')
        setError(msgs || 'Failed to save damage report.')
      } else {
        setError('Failed to save damage report.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Log Calamity Damage Report" onClose={onClose} maxWidth="max-w-2xl">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <BarangaySelect label="Barangay" required value={form.barangay} onChange={(e) => update('barangay', e.target.value)} />

        <FormField label="Calamity Name" required>
          <input
            className={baseInputClasses}
            maxLength={150}
            placeholder="e.g. Typhoon Egay, Drought 2024"
            value={form.calamity_name}
            onChange={(e) => update('calamity_name', e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Calamity Date" required>
            <input
              className={baseInputClasses}
              type="date"
              value={form.calamity_date}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => update('calamity_date', e.target.value)}
            />
          </FormField>
          <div>
            <label className={labelCls}>Season</label>
            <select className={baseInputClasses} value={form.season} onChange={(e) => update('season', e.target.value)}>
              <option value="Dry">Dry</option>
              <option value="Wet">Wet</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <select className={baseInputClasses} value={form.year} onChange={(e) => update('year', e.target.value)}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Crop Damage</p>
          <FormField label="Crops Damaged">
            <textarea
              className={baseInputClasses}
              placeholder="e.g. Palay (Rice), Corn (Mais)"
              rows={2}
              value={form.damaged_crops}
              onChange={(e) => update('damaged_crops', e.target.value)}
            />
          </FormField>
          <FormField label="Crop Volume Damaged (kg)">
            <input
              className={baseInputClasses}
              min="0"
              placeholder="Optional"
              step="0.01"
              type="number"
              value={form.crop_volume_damaged_kg}
              onChange={(e) => update('crop_volume_damaged_kg', e.target.value)}
            />
          </FormField>
        </div>

        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 space-y-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Livestock Damage</p>
          <FormField label="Livestock Affected">
            <textarea
              className={baseInputClasses}
              placeholder="e.g. Carabao, Swine"
              rows={2}
              value={form.damaged_livestock}
              onChange={(e) => update('damaged_livestock', e.target.value)}
            />
          </FormField>
          <FormField label="Head Count Affected">
            <input
              className={baseInputClasses}
              min="0"
              placeholder="Optional"
              type="number"
              value={form.livestock_head_count_affected}
              onChange={(e) => update('livestock_head_count_affected', e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Estimated Loss (PHP)">
          <input
            className={baseInputClasses}
            min="0"
            placeholder="Optional"
            step="0.01"
            type="number"
            value={form.estimated_loss_php}
            onChange={(e) => update('estimated_loss_php', e.target.value)}
          />
        </FormField>

        <FormField label="Remarks">
          <textarea
            className={baseInputClasses}
            rows={2}
            value={form.remarks}
            onChange={(e) => update('remarks', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? 'Saving...' : 'Save Report'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default LogDamageReportModal
