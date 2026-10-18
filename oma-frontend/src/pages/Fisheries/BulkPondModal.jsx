import { useState } from 'react'
import { Layers, Plus, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { EMPTY_PCIC, pcicError, pcicPayload, uploadPcicForm } from '../../utils/pcic.js'

// Must match fisheries.models.WATER_SOURCE_CHOICES on the backend exactly
// (same list as PondModal.jsx).
const WATER_SOURCE_OPTIONS = ['River', 'Spring', 'Rain-fed', 'Deep Well', 'Other']

const emptyRow = (name) => ({ name, barangay: '', area_hectares: '', water_source: '', pcic: { ...EMPTY_PCIC } })

// Batch D — bulk pond creation, alongside PondModal's existing single-add
// flow (untouched). Opens with one row already visible; "+ Add Another
// Pond" appends more, one click at a time, instead of asking for a count
// up front. Suggested names continue the same auto-numbering Pond.save()
// already does on the backend ("Pond N+1", "Pond N+2", ...) so the two
// flows never diverge — the suggestion is just a pre-filled, still-editable
// default.
function BulkPondModal({ fisherfolkId, existingPondCount, onClose, onSuccess }) {
  const { showToast } = useToast()
  const [rows, setRows] = useState([emptyRow(`Pond ${existingPondCount + 1}`)])
  const [rowErrors, setRowErrors] = useState([{}])
  const [formError, setFormError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const addRow = () => {
    setRows((prev) => [...prev, emptyRow(`Pond ${existingPondCount + prev.length + 1}`)])
    setRowErrors((prev) => [...prev, {}])
  }

  const removeRow = (index) => {
    setRows((prev) => prev.filter((_, i) => i !== index))
    setRowErrors((prev) => prev.filter((_, i) => i !== index))
  }

  const setRowField = (index, field, value) => {
    setRows((prev) => prev.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setFormError('')
    for (let i = 0; i < rows.length; i += 1) {
      const problem = pcicError(rows[i].pcic)
      if (problem) { setFormError(`Pond ${i + 1}: ${problem}`); return }
    }
    setIsSubmitting(true)
    const payload = rows.map((r) => ({
      name: r.name,
      barangay: r.barangay,
      area_hectares: r.area_hectares !== '' ? parseFloat(r.area_hectares) : null,
      water_source: r.water_source,
      ...pcicPayload(r.pcic),
    }))
    try {
      const { data: created } = await api.post(`/fisheries/fisherfolk/${fisherfolkId}/ponds/bulk/`, payload)
      const failed = []
      for (let i = 0; i < rows.length; i += 1) {
        try {
          await uploadPcicForm(api, 'pond', created[i].id, rows[i].pcic)
        } catch {
          failed.push(created[i]?.name || `Pond ${i + 1}`)
        }
      }
      if (failed.length) {
        showToast(`Ponds saved, but the PCIC form photo could not be uploaded for: ${failed.join(', ')}. Edit the pond to try again.`, 'error')
      }
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      if (data?.errors) {
        // Per-row error detail, aligned to input order — nothing was
        // created (backend validates all rows before creating any), and
        // rows themselves are left exactly as typed so nothing is lost.
        setRowErrors(data.errors.map((e) => e || {}))
        setFormError('Some rows have errors — fix them and submit again. No ponds were created.')
      } else {
        setFormError(data?.detail || 'Failed to create ponds.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const rowFieldError = (index, field) => {
    const e = rowErrors[index]?.[field]
    return Array.isArray(e) ? e[0] : e
  }

  return (
    <ModalShell
      title="Bulk Add Ponds"
      subtitle="Add a row for each pond — names are auto-suggested, edit any field as needed."
      icon={Layers}
      onClose={onClose}
      maxWidth="max-w-2xl"
      footer={
        <>
          <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bulk-pond-form" isLoading={isSubmitting}>Create {rows.length} Pond{rows.length === 1 ? '' : 's'}</Button>
        </>
      }
    >
      <form id="bulk-pond-form" onSubmit={handleSubmit} className="space-y-4">
        <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
          {rows.map((row, i) => (
            <div key={i} className="rounded-lg border border-[#E2E8E2] p-3">
              <div className="mb-2 flex items-center justify-between">
                <p className="text-[12px] font-medium uppercase tracking-wide text-slate-400">Pond {i + 1}</p>
                {rows.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeRow(i)}
                    className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Remove Pond ${i + 1}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <FormField label="Pond Name" error={rowFieldError(i, 'name')}>
                  <input
                    type="text"
                    className={baseInputClasses}
                    value={row.name}
                    onChange={(e) => setRowField(i, 'name', e.target.value)}
                  />
                </FormField>
                <BarangaySelect
                  label="Barangay"
                  value={row.barangay}
                  onChange={(e) => setRowField(i, 'barangay', e.target.value)}
                  error={rowFieldError(i, 'barangay')}
                />
                <FormField label="Area (ha)" error={rowFieldError(i, 'area_hectares')}>
                  <DecimalInput
                    decimals={4}
                    className={baseInputClasses}
                    placeholder="0.0000"
                    value={row.area_hectares}
                    onChange={(v) => setRowField(i, 'area_hectares', v)}
                  />
                </FormField>
                <FormField label="Water Source" error={rowFieldError(i, 'water_source')}>
                  <select
                    className={baseInputClasses}
                    value={row.water_source}
                    onChange={(e) => setRowField(i, 'water_source', e.target.value)}
                  >
                    <option value="">Select…</option>
                    {WATER_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                </FormField>
                <div className="sm:col-span-2">
                  <PcicInsuranceField value={row.pcic} onChange={(next) => setRowField(i, 'pcic', next)} subject="pond" />
                </div>
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={addRow}
          disabled={rows.length >= 50}
          className="flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-[#B7CBB7] py-2 text-[13px] font-medium text-[#1B4D2E] hover:bg-[#EBF5EE]/50 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus size={15} /> Add Another Pond
        </button>

        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{formError}</p>
        )}

      </form>
    </ModalShell>
  )
}

export default BulkPondModal
