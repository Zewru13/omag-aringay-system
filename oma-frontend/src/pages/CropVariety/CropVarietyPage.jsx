import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Pencil, Plus, Sprout, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const PAGE_SIZE = 10

const COLUMNS = [
  { key: 'name',           label: 'VARIETY NAME' },
  { key: 'crop_type_disp', label: 'CROP' },
  { key: 'status',         label: 'STATUS' },
  { key: 'actions',        label: 'ACTIONS' },
]

function CropVarietyModal({ variety, cropTypes, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(variety)
  const original = {
    name: variety?.name || '',
    crop_type: variety?.crop_type || '',
    is_active: variety?.is_active ?? true,
  }
  const [form, setForm] = useState(original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState('')
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(original)

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'name' || field === 'crop_type') setNameError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Variety name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { ...form, crop_type: form.crop_type || null }
      if (isEdit) {
        await api.patch(`/production/varieties/${variety.id}/`, payload)
      } else {
        await api.post('/production/varieties/', payload)
      }
      showToast(`Variety ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      const nameErr = err?.response?.data?.name?.[0]
      if (nameErr) {
        setNameError(nameErr)
      } else {
        showToast('Failed to save.', 'error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Variety' : 'Add New Variety'}
      subtitle={isEdit ? `Update details for ${variety.name}` : 'Enter variety information below'}
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Variety Name" required error={nameError}>
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. NSIC Rc222"
          />
        </FormField>
        <FormField label="Crop">
          <select className={baseInputClasses} value={form.crop_type} onChange={e => set('crop_type', e.target.value)}>
            <option value="">— General (not crop-specific) —</option>
            {cropTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1B4D2E]"
            checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)}
          />
          <span className="text-[13px] text-[#1A2B1A]">Active (visible in Add Crop dropdown)</span>
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update Variety' : '+ Add Variety'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default function CropVarietyPage({ asTab = false }) {
  const { showToast } = useToast()
  const [varieties,    setVarieties]    = useState([])
  const [cropTypes,    setCropTypes]    = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editVariety,  setEditVariety]  = useState(null)
  const [deletingVariety, setDeletingVariety] = useState(null)
  const [page,         setPage]         = useState(1)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const [varRes, cropRes] = await Promise.all([
        api.get('/production/varieties/'),
        api.get('/production/crop-types/'),
      ])
      setVarieties(Array.isArray(varRes.data) ? varRes.data : (varRes.data.results || []))
      setCropTypes(Array.isArray(cropRes.data) ? cropRes.data : (cropRes.data.results || []))
    } catch {
      setError('Failed to load varieties.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalPages = Math.max(1, Math.ceil(varieties.length / PAGE_SIZE))
  const paginated = useMemo(
    () => varieties.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [varieties, page],
  )

  const rows = paginated.map(v => ({
    ...v,
    crop_type_disp: v.crop_type_name || '— General —',
    status: (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        v.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}>
        {v.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
    actions: (
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE] transition-colors"
          onClick={() => { setEditVariety(v); setShowModal(true) }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
          onClick={() => setDeletingVariety(v)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </span>
    ),
  }))

  const actionBtn = (
    <Button size="sm" onClick={() => { setEditVariety(null); setShowModal(true) }}>
      <Plus size={15} />
      Add New Variety
    </Button>
  )

  const innerContent = (
    <div className="space-y-4">
      {asTab && <div className="flex justify-end">{actionBtn}</div>}
      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#7A8E7A]">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, varieties.length)} of {varieties.length}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-[13px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <CropVarietyModal
          variety={editVariety}
          cropTypes={cropTypes}
          onClose={() => { setShowModal(false); setEditVariety(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingVariety && (
        <ConfirmDialog
          title="Delete Variety"
          message={`Delete "${deletingVariety.name}"? This will remove it from the Add Crop dropdown.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/production/varieties/${deletingVariety.id}/`)
              showToast(`"${deletingVariety.name}" deleted.`, 'success')
              setDeletingVariety(null); fetchAll()
            } catch {
              showToast('Failed to delete variety.', 'error')
              setDeletingVariety(null)
            }
          }}
          onCancel={() => setDeletingVariety(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Crop Variety Management"
      subtitle="Manage crop varieties used across the system."
      action={actionBtn}
    >
      {innerContent}
    </PageLayout>
  )
}
