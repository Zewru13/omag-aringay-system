import { useCallback, useEffect, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Pencil, Sprout, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { AddRowFooter, DraftActions, DraftInput, DraftSelect, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
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
  { key: 'actions',           label: 'ACTIONS' },
]

// Edit Input Type. New input types are added in the table itself (the Add button under it).
function CropInputTypeModal({ inputType, onClose, onSaved }) {
  const { showToast } = useToast()
  const [name,        setName]        = useState(inputType.name || '')
  const [description, setDescription] = useState(inputType.description || '')
  const [category,    setCategory]    = useState(inputType.input_type || '')
  const [growthStage, setGrowthStage] = useState(inputType.growth_stage || '')
  const isActive = inputType.is_active ?? true   // the Active tick box is gone: a saved input type keeps its value
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Input type name is required.', 'error'); return }
    if (!category)    { showToast('Category is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { name, description, is_active: isActive, input_type: category, growth_stage: growthStage }
      await api.patch(`/production/input-types/${inputType.id}/`, payload)
      showToast('Input type updated.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Input Type"
      subtitle="Generic input category — not a per-crop formulation."
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="crop-input-type-form" isLoading={isSubmitting}>Save Changes</Button>
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
      </form>
    </ModalShell>
  )
}

export default function CropInputTypePage({ asTab = false }) {
  const { showToast } = useToast()
  const [inputTypes, setInputTypes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState('')
  const [editing,   setEditing]   = useState(null)
  const add = useAddRow({ name: '', input_type: '', growth_stage: '' })
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

  const saveDraft = async () => {
    const { name, input_type, growth_stage } = add.draft
    if (!name.trim()) { showToast('Type the input type name first.', 'error'); return }
    if (!input_type) { showToast('Choose the category.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/production/input-types/', { name: name.trim(), description: '', is_active: true, input_type, growth_stage })
      showToast('Input type added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(inputTypes).map(it => ({
    ...it,
    input_type_cell: <StatusPill tone="slate">{it.input_type}</StatusPill>,
    growth_stage_cell: it.growth_stage
      ? <StatusPill tone="slate">{it.growth_stage}</StatusPill>
      : <span className="text-[12px] text-slate-400">Any stage</span>,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditing(it) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeleting(it), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New input type" placeholder="e.g. Urea"
        onChange={e => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      input_type_cell: (
        <DraftSelect value={add.draft.input_type} aria-label="Category" onChange={e => add.change({ input_type: e.target.value })}>
          <option value="">— Select —</option>
          {INPUT_TYPE_OPTIONS.map(c => <option key={c} value={c}>{c}</option>)}
        </DraftSelect>
      ),
      growth_stage_cell: (
        <DraftSelect value={add.draft.growth_stage} aria-label="Growth stage" onChange={e => add.change({ growth_stage: e.target.value })}>
          <option value="">Any stage</option>
          {GROWTH_STAGE_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
        </DraftSelect>
      ),
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Input Types" count={inputTypes.length} markerClass="bg-[#1B4D2E]" />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Input Type" />}
      </div>

      {editing && (
        <CropInputTypeModal inputType={editing} onClose={() => setEditing(null)} onSaved={fetchAll} />
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
