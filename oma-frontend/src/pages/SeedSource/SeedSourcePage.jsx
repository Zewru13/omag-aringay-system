import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Droplets, Pencil, Plus, Trash2 } from 'lucide-react'
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
  { key: 'name',        label: 'SEED SOURCE NAME' },
  { key: 'status',      label: 'STATUS' },
  { key: 'actions',     label: 'ACTIONS' },
]

function SeedSourceModal({ source, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(source)
  const original = { name: source?.name || '', is_active: source?.is_active ?? true }
  const [form, setForm] = useState(original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(original)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Seed source name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(`/production/seed-sources/${source.id}/`, form)
      } else {
        await api.post('/production/seed-sources/', form)
      }
      showToast(`Seed source ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Seed Source' : 'Add New Seed Source'}
      subtitle={isEdit ? `Update details for ${source.name}` : 'Enter seed source information below'}
      icon={Droplets}
      onClose={onClose}
      maxWidth="max-w-xs"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Seed Source Name" required>
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. DA, Local Market"
          />
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
            {isEdit ? 'Update Source' : '+ Add Source'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default function SeedSourcePage({ asTab = false }) {
  const { showToast } = useToast()
  const [sources,      setSources]      = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editSource,   setEditSource]   = useState(null)
  const [deletingSource, setDeletingSource] = useState(null)
  const [page,         setPage]         = useState(1)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/production/seed-sources/')
      setSources(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load seed sources.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalPages = Math.max(1, Math.ceil(sources.length / PAGE_SIZE))
  const paginated = useMemo(
    () => sources.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [sources, page],
  )

  const rows = paginated.map(s => ({
    ...s,
    status: (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        s.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}>
        {s.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
    actions: (
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE] transition-colors"
          onClick={() => { setEditSource(s); setShowModal(true) }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
          onClick={() => setDeletingSource(s)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </span>
    ),
  }))

  const actionBtn = (
    <Button size="sm" onClick={() => { setEditSource(null); setShowModal(true) }}>
      <Plus size={15} />
      Add New Seed Source
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
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sources.length)} of {sources.length}
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
        <SeedSourceModal
          source={editSource}
          onClose={() => { setShowModal(false); setEditSource(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingSource && (
        <ConfirmDialog
          title="Delete Seed Source"
          message={`Delete "${deletingSource.name}"? This will remove it from the Add Crop dropdown.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/production/seed-sources/${deletingSource.id}/`)
              showToast(`"${deletingSource.name}" deleted.`, 'success')
              setDeletingSource(null); fetchAll()
            } catch {
              showToast('Failed to delete seed source.', 'error')
              setDeletingSource(null)
            }
          }}
          onCancel={() => setDeletingSource(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Seed Source Management"
      subtitle="Manage seed source options used across the system."
      action={actionBtn}
    >
      {innerContent}
    </PageLayout>
  )
}
