import { useState } from 'react'
import { Waves } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

// Must match fisheries.models.WATER_SOURCE_CHOICES on the backend exactly.
const WATER_SOURCE_OPTIONS = ['River', 'Spring', 'Rain-fed', 'Deep Well', 'Other']

// Add/Edit Pond — a single modal for both, since the form is small (name,
// barangay, area, water source). is_active is toggled from the Ponds table
// row action, not here.
function PondModal({ fisherfolkId, pond, onClose, onSuccess }) {
  const isEdit = Boolean(pond)
  const [form, setForm] = useState({
    name: pond?.name || '',
    barangay: pond?.barangay || '',
    area_hectares: pond?.area_hectares != null ? String(pond.area_hectares) : '',
    water_source: pond?.water_source || '',
  })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState('')

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    const payload = {
      name: form.name,
      barangay: form.barangay,
      area_hectares: form.area_hectares !== '' ? parseFloat(form.area_hectares) : null,
      water_source: form.water_source,
    }
    try {
      if (isEdit) {
        await api.patch(`/fisheries/ponds/${pond.id}/`, payload)
      } else {
        await api.post(`/fisheries/fisherfolk/${fisherfolkId}/ponds/`, payload)
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      if (data && typeof data === 'object') {
        const msgs = Object.entries(data).map(([k, v]) => `${k.replace(/_/g, ' ')}: ${Array.isArray(v) ? v[0] : v}`)
        setError(msgs.join(' · ') || 'Failed to save pond.')
      } else {
        setError('Failed to save pond.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Pond' : 'Add Pond'}
      subtitle={isEdit ? 'Update this pond\'s details.' : 'Leave the name blank to auto-number it (e.g. "Pond 2").'}
      icon={Waves}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="pond-form" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : 'Add Pond'}</Button>
        </>
      }
    >
      <form id="pond-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Pond Name (optional)">
          <input
            type="text"
            className={baseInputClasses}
            placeholder={isEdit ? pond.name : 'Auto-numbered if left blank'}
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
          />
        </FormField>

        <BarangaySelect
          label="Barangay"
          value={form.barangay}
          onChange={(e) => set('barangay', e.target.value)}
        />

        <FormField label="Area (ha)">
          <input
            type="number" step="0.0001" min="0"
            className={baseInputClasses}
            placeholder="0.0000"
            value={form.area_hectares}
            onChange={(e) => set('area_hectares', e.target.value)}
          />
        </FormField>

        <FormField label="Water Source">
          <select className={baseInputClasses} value={form.water_source} onChange={(e) => set('water_source', e.target.value)}>
            <option value="">Select…</option>
            {WATER_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        </FormField>

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{error}</p>
        )}

      </form>
    </ModalShell>
  )
}

export default PondModal
