import { useState } from 'react'
import { Layers, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import AddButton from '../../components/UI/AddButton.jsx'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import BARANGAYS from '../../constants/barangays.js'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftState from '../../hooks/useDraftState.js'
import { EMPTY_PCIC, pcicError, pcicPayload, uploadPcicForm } from '../../utils/pcic.js'

// Must match fisheries.models.WATER_SOURCE_CHOICES on the backend exactly
// (same list as PondModal.jsx).
const WATER_SOURCE_OPTIONS = ['River', 'Spring', 'Rain-fed', 'Deep Well', 'Other']

const RowError = ({ message }) => (message ? <p className="mt-1 text-[12px] text-[#C0392B]">{message}</p> : null)

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
  // The ponds being filled in are a draft: still here when the window is opened again (see hooks/useDraftState.js). One per fisherfolk.
  const [rows, setRows, draft] = useDraftState(`bulk-add-ponds:${fisherfolkId}`, () => [emptyRow(`Pond ${existingPondCount + 1}`)])
  const [rowErrors, setRowErrors] = useState(() => rows.map(() => ({})))
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
      draft.clear()
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
      subtitle="One row for each pond. The names are suggested; change any of them."
      icon={Layers}
      onClose={onClose}
      maxWidth="max-w-5xl"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="bulk-pond-form" isLoading={isSubmitting}>Create {rows.length} Pond{rows.length === 1 ? '' : 's'}</Button>
        </>
      }
    >
      <form id="bulk-pond-form" onSubmit={handleSubmit} className="space-y-4">
        <DraftBanner draft={draft} />
        <EntryTable label="Ponds to add" testId="bulk-pond-table">
          <EntryHead>
            <EntryTh>Pond</EntryTh>
            <EntryTh>Pond Name</EntryTh>
            <EntryTh>Barangay</EntryTh>
            <EntryTh>Area (ha)</EntryTh>
            <EntryTh>Water Source</EntryTh>
            <EntryTh>PCIC Insured</EntryTh>
            <EntryTh className="w-10"><span className="sr-only">Remove</span></EntryTh>
          </EntryHead>
          <tbody>
            {rows.map((row, i) => (
              <EntryRow key={i}>
                <EntryCell className="whitespace-nowrap font-medium text-[#1A2B1A] md:pt-4">Pond {i + 1}</EntryCell>
                <EntryCell label="Pond Name">
                  <input type="text" className={baseInputClasses} value={row.name} aria-label={`Pond ${i + 1} name`} onChange={(e) => setRowField(i, 'name', e.target.value)} />
                  <RowError message={rowFieldError(i, 'name')} />
                </EntryCell>
                <EntryCell label="Barangay">
                  <select className={baseInputClasses} value={row.barangay} aria-label={`Pond ${i + 1} barangay`} onChange={(e) => setRowField(i, 'barangay', e.target.value)}>
                    <option value="">Select barangay...</option>
                    {BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
                  </select>
                  <RowError message={rowFieldError(i, 'barangay')} />
                </EntryCell>
                <EntryCell label="Area (ha)">
                  <DecimalInput decimals={4} className={baseInputClasses} placeholder="0.0000" value={row.area_hectares} aria-label={`Pond ${i + 1} area (ha)`}
                    onChange={(v) => setRowField(i, 'area_hectares', v)} />
                  <RowError message={rowFieldError(i, 'area_hectares')} />
                </EntryCell>
                <EntryCell label="Water Source">
                  <select className={baseInputClasses} value={row.water_source} aria-label={`Pond ${i + 1} water source`} onChange={(e) => setRowField(i, 'water_source', e.target.value)}>
                    <option value="">Select…</option>
                    {WATER_SOURCE_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
                  </select>
                  <RowError message={rowFieldError(i, 'water_source')} />
                </EntryCell>
                <EntryCell label="PCIC Insured">
                  <PcicInsuranceField compact value={row.pcic} onChange={(next) => setRowField(i, 'pcic', next)} subject="pond" />
                </EntryCell>
                <EntryCell className="md:pt-3">
                  {rows.length > 1 && (
                    <button type="button" onClick={() => removeRow(i)} className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600" aria-label={`Remove Pond ${i + 1}`}>
                      <X size={14} />
                    </button>
                  )}
                </EntryCell>
              </EntryRow>
            ))}
          </tbody>
        </EntryTable>

        <AddButton onClick={addRow} disabled={rows.length >= 50}>Add Another Pond</AddButton>

        {formError && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700">{formError}</p>
        )}

      </form>
    </ModalShell>
  )
}

export default BulkPondModal
