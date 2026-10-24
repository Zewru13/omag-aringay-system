import { useEffect, useMemo, useState } from 'react'
import { Info, Pencil, Scale, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import AddButton from '../../components/UI/AddButton.jsx'
import Button from '../../components/UI/Button.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { resetHarvestUnitWeights } from '../Monitoring/useHarvestUnitWeights.js'

// Harvest Unit Settings: how many kg one harvest unit weighs. A harvest is typed in the unit it was counted in (20 sacks) and saved in
// kg using these weights. A row for one crop wins over the row for the same unit with no crop; a unit with no weight has no standard,
// and the harvest form then asks for the total kg. Changing a weight never changes a harvest that is already saved.

const COLUMNS = [
  { key: 'unit', label: 'UNIT' },
  { key: 'crop', label: 'CROP' },
  { key: 'weight', label: 'KG PER UNIT' },
  { key: 'note', label: 'NOTE' },
  { key: 'actions', label: 'ACTIONS' },
]

const fmtKg = (value) => (value === null || value === undefined || value === '' ? null : Number(value).toLocaleString('en-US', { maximumFractionDigits: 4 }))

function WeightModal({ weight, cropTypes, unitSuggestions, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(weight)
  const original = { unit: weight?.unit || '', crop_type: weight?.crop_type ?? '', kg_per_unit: weight?.kg_per_unit === null || weight?.kg_per_unit === undefined ? '' : String(Number(weight.kg_per_unit)), note: weight?.note || '' }
  const [form, setForm] = useState(original)
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(original)
  const set = (field, value) => { setForm((f) => ({ ...f, [field]: value })); setErrors((e) => ({ ...e, [field]: undefined })) }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.unit.trim()) { setErrors({ unit: 'Enter the unit name, as the harvest form lists it.' }); return }
    setIsSubmitting(true)
    try {
      const body = { unit: form.unit.trim(), crop_type: form.crop_type === '' ? null : Number(form.crop_type), kg_per_unit: form.kg_per_unit === '' ? null : form.kg_per_unit, note: form.note.trim() }
      if (isEdit) await api.patch(`/production/harvest-unit-weights/${weight.id}/`, body)
      else await api.post('/production/harvest-unit-weights/', body)
      showToast(`Unit weight ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      const data = err?.response?.data || {}
      const first = (v) => (Array.isArray(v) ? v[0] : v)
      setErrors({ unit: first(data.unit), kg_per_unit: first(data.kg_per_unit), general: first(data.detail) || first(data.non_field_errors) || (Object.keys(data).length ? undefined : 'Failed to save the unit weight.') })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Unit Weight' : 'Add Unit Weight'}
      subtitle={isEdit ? `${weight.unit}${weight.crop_type_name ? ` · ${weight.crop_type_name}` : ' · every crop'}` : 'How many kg one unit weighs'}
      icon={Scale}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="harvest-unit-weight-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update' : 'Add Unit Weight'}
          </Button>
        </>
      )}
    >
      <form id="harvest-unit-weight-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errors.general && <p role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">{errors.general}</p>}
        <FormField label="Unit" required error={errors.unit}>
          <input className={baseInputClasses} list="harvest-unit-names" value={form.unit} autoFocus placeholder="e.g. Sack" onChange={(e) => set('unit', e.target.value)} />
          <datalist id="harvest-unit-names">{unitSuggestions.map((u) => <option key={u} value={u} />)}</datalist>
        </FormField>
        <FormField label="Crop">
          <select className={baseInputClasses} value={form.crop_type} onChange={(e) => set('crop_type', e.target.value)}>
            <option value="">Every crop</option>
            {cropTypes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <p className="mt-1 text-[11.5px] text-[#7A8E7A]">A row for one crop is used for that crop instead of the row for every crop.</p>
        </FormField>
        <FormField label="Kg per unit" error={errors.kg_per_unit}>
          <DecimalInput decimals={4} className={baseInputClasses} value={form.kg_per_unit} placeholder="e.g. 50" onChange={(v) => set('kg_per_unit', v)} />
          <p className="mt-1 text-[11.5px] text-[#7A8E7A]">Leave empty when the unit has no standard weight: the harvest form then asks for the total kg.</p>
        </FormField>
        <FormField label="Note">
          <input className={baseInputClasses} value={form.note} maxLength={200} placeholder="Where this weight comes from" onChange={(e) => set('note', e.target.value)} />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function HarvestUnitSettingsPage() {
  const { showToast } = useToast()
  const [weights, setWeights] = useState([])
  const [cropTypes, setCropTypes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [editing, setEditing] = useState(undefined)   // undefined = closed, null = adding, object = editing
  const [deleting, setDeleting] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    let alive = true
    Promise.all([api.get('/production/harvest-unit-weights/'), api.get('/production/crop-types/')])
      .then(([w, c]) => {
        if (!alive) return
        setWeights(Array.isArray(w.data) ? w.data : (w.data.results || []))
        setCropTypes((Array.isArray(c.data) ? c.data : (c.data.results || [])).filter((ct) => ct.is_active !== false))
        setError('')
      })
      .catch(() => { if (alive) setError('Failed to load the harvest unit weights.') })
      .finally(() => { if (alive) setIsLoading(false) })
    return () => { alive = false }
  }, [version])

  const refresh = () => { resetHarvestUnitWeights(); setVersion((v) => v + 1) }

  // The units the crops are already harvested in, offered while typing a unit name.
  const unitSuggestions = useMemo(() => [...new Set([...cropTypes.flatMap((c) => c.allowed_units || []), ...weights.map((w) => w.unit)])].filter((u) => u.toLowerCase() !== 'kg').sort(), [cropTypes, weights])

  const rows = weights.map((w) => ({
    ...w,
    crop: w.crop_type_name || <span className="text-[#7A8E7A]">Every crop</span>,
    weight: fmtKg(w.kg_per_unit) ? `${fmtKg(w.kg_per_unit)} kg` : <span className="text-amber-700">No standard weight</span>,
    note: w.note || <span className="text-[#A8BCA8]">—</span>,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(w) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(w), tone: 'rose' },
      ]} />
    ),
  }))

  return (
    <PageLayout title="Harvest Unit Settings" subtitle="How many kg one harvest unit weighs. A harvest is typed in its own unit and saved in kg.">
      <div className="space-y-4">
        <div className="flex items-start gap-3 rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
          <Info size={16} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
          <p className="text-[13px] text-sky-800">
            <span className="font-semibold">kg is always 1 kg.</span> A unit with no row here, or with no weight, has no standard weight, so the harvest form asks
            for the total kg. Changing a weight never changes a harvest that is already saved.
          </p>
        </div>
        {error && <ErrorMessage message={error} />}
        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <CardHeader title="Unit Weights" count={weights.length} action={<AddButton onClick={() => setEditing(null)}>Add Unit Weight</AddButton>} />
          <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        </div>
      </div>

      {editing !== undefined && <WeightModal weight={editing} cropTypes={cropTypes} unitSuggestions={unitSuggestions} onClose={() => setEditing(undefined)} onSaved={refresh} />}

      {deleting && (
        <ConfirmDialog
          title="Delete Unit Weight"
          message={`Delete the weight of ${deleting.unit}${deleting.crop_type_name ? ` for ${deleting.crop_type_name}` : ' for every crop'}? Harvests already saved keep their kg.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/production/harvest-unit-weights/${deleting.id}/`)
              showToast('Unit weight deleted.', 'success')
              setDeleting(null); refresh()
            } catch {
              showToast('Failed to delete the unit weight.', 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </PageLayout>
  )
}
