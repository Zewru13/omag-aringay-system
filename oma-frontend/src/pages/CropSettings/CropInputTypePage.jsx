import { useCallback, useEffect, useState } from 'react'
import AddButton from '../../components/UI/AddButton.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Pencil, Sprout, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

// Mirrors FisheriesSettings/FeedTypePage.jsx exactly, crop fields substituted.
const GROWTH_STAGE_OPTIONS = ['Vegetative', 'Flowering', 'Fruiting', 'Maturity']
const INPUT_TYPE_OPTIONS = ['Fertilizer', 'Pesticide', 'Herbicide', 'Fungicide', 'Other']

const COLUMNS = [
  { key: 'name',              label: 'INPUT TYPE' },
  { key: 'input_type_cell',   label: 'CATEGORY' },
  { key: 'growth_stage_cell', label: 'GROWTH STAGE' },
  { key: 'status_pill',       label: 'STATUS' },
  { key: 'actions',           label: 'ACTIONS' },
]

function CropInputTypeModal({ inputType, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(inputType)
  const [name,        setName]        = useState(inputType?.name || '')
  const [description, setDescription] = useState(inputType?.description || '')
  const [category,    setCategory]    = useState(inputType?.input_type || '')
  const [growthStage, setGrowthStage] = useState(inputType?.growth_stage || '')
  const [isActive,    setIsActive]    = useState(inputType?.is_active ?? true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Input type name is required.', 'error'); return }
    if (!category)    { showToast('Category is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { name, description, is_active: isActive, input_type: category, growth_stage: growthStage }
      if (isEdit) {
        await api.patch(`/production/input-types/${inputType.id}/`, payload)
      } else {
        await api.post('/production/input-types/', payload)
      }
      showToast(`Input type ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Input Type' : 'Add Input Type'}
      subtitle="Generic input category — not a per-crop formulation."
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="crop-input-type-form" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : '+ Add Input Type'}</Button>
        </>
      }
    >
      <form id="crop-input-type-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name *">
          <input className={baseInputClasses} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description (optional)">
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
        </FormField>
        <FormField label="Category *">
          <select className={baseInputClasses} value={category} onChange={e => setCategory(e.target.value)}>
            <option value="">— Select —</option>
            {INPUT_TYPE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </FormField>
        <FormField label="Growth Stage (optional)">
          <select className={baseInputClasses} value={growthStage} onChange={e => setGrowthStage(e.target.value)}>
            <option value="">Any stage</option>
            {GROWTH_STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-slate-400">
            Narrows this input type to a specific growth stage for the automatic input recommendation. Leave as "Any stage" for a general-purpose input.
          </p>
        </FormField>
        <label className="flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          Active
        </label>
      </form>
    </ModalShell>
  )
}

export default function CropInputTypePage({ asTab = false }) {
  const { showToast } = useToast()
  const [inputTypes, setInputTypes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [deleting,  setDeleting]  = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/input-types/')
      setInputTypes(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load input types.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows = inputTypes.map(it => ({
    ...it,
    input_type_cell: <StatusPill tone="slate">{it.input_type}</StatusPill>,
    growth_stage_cell: it.growth_stage
      ? <StatusPill tone="slate">{it.growth_stage}</StatusPill>
      : <span className="text-[12px] text-slate-400">Any stage</span>,
    status_pill: <StatusPill tone={it.is_active ? 'green' : 'slate'}>{it.is_active ? 'Active' : 'Inactive'}</StatusPill>,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditing(it); setShowModal(true) } },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(it), tone: 'rose' },
      ]} />
    ),
  }))

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader
            title="Input Types"
            markerClass="bg-[#1B4D2E]"
            action={<AddButton onClick={() => { setEditing(null); setShowModal(true) }}>Add Input Type</AddButton>}
          />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {showModal && (
        <CropInputTypeModal inputType={editing} onClose={() => { setShowModal(false); setEditing(null) }} onSaved={fetchAll} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete Input Type"
          message={`Delete "${deleting.name}"? This may affect activity logs referencing it.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/production/input-types/${deleting.id}/`)
              showToast(`"${deleting.name}" deleted.`, 'success')
              setDeleting(null); fetchAll()
            } catch {
              showToast('Failed to delete.', 'error')
              setDeleting(null)
            }
          }}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout title="Crop Input Type Management" subtitle="Manage input type reference data used in activity logs.">
      {innerContent}
    </PageLayout>
  )
}
