import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const COLUMNS = [
  { key: 'name',        label: 'FEED TYPE' },
  { key: 'status_pill', label: 'STATUS' },
  { key: 'actions',     label: 'ACTIONS' },
]

function FeedTypeModal({ feedType, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(feedType)
  const [name,        setName]        = useState(feedType?.name || '')
  const [description, setDescription] = useState(feedType?.description || '')
  const [isActive,    setIsActive]    = useState(feedType?.is_active ?? true)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Feed type name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      const payload = { name, description, is_active: isActive }
      if (isEdit) {
        await api.patch(`/fisheries/feed-types/${feedType.id}/`, payload)
      } else {
        await api.post('/fisheries/feed-types/', payload)
      }
      showToast(`Feed type ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Feed Type' : 'Add Feed Type'}
      subtitle="Generic feed category — not a per-species formulation."
      icon={Wheat}
      onClose={onClose}
      maxWidth="max-w-sm"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Name *">
          <input className={baseInputClasses} value={name} onChange={e => setName(e.target.value)} autoFocus />
        </FormField>
        <FormField label="Description (optional)">
          <textarea rows={2} className={`${baseInputClasses} resize-none`} value={description} onChange={e => setDescription(e.target.value)} />
        </FormField>
        <label className="flex items-center gap-2 text-[13px] text-slate-700">
          <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)} />
          Active
        </label>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : '+ Add Feed Type'}</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default function FeedTypePage({ asTab = false }) {
  const { showToast } = useToast()
  const [feedTypes, setFeedTypes] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error,     setError]     = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editing,   setEditing]   = useState(null)
  const [deleting,  setDeleting]  = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/fisheries/feed-types/')
      setFeedTypes(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load feed types.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows = feedTypes.map(ft => ({
    ...ft,
    status_pill: <StatusPill tone={ft.is_active ? 'green' : 'slate'}>{ft.is_active ? 'Active' : 'Inactive'}</StatusPill>,
    actions: (
      <span className="flex items-center gap-1">
        <button type="button" className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE]" onClick={() => { setEditing(ft); setShowModal(true) }} title="Edit">
          <Pencil size={14} />
        </button>
        <button type="button" className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50" onClick={() => setDeleting(ft)} title="Delete">
          <Trash2 size={14} />
        </button>
      </span>
    ),
  }))

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F0]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[#1B4D2E]" />
            <h2 className="text-[13px] font-semibold text-[#1A2B1A]">Feed Types</h2>
          </div>
          <button type="button" onClick={() => { setEditing(null); setShowModal(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#235E38]">
            <Plus size={12} /> Add Feed Type
          </button>
        </div>
        <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {showModal && (
        <FeedTypeModal feedType={editing} onClose={() => { setShowModal(false); setEditing(null) }} onSaved={fetchAll} />
      )}

      {deleting && (
        <ConfirmDialog
          title="Delete Feed Type"
          message={`Delete "${deleting.name}"? This may affect activity logs referencing it.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/fisheries/feed-types/${deleting.id}/`)
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
    <PageLayout title="Feed Type Management" subtitle="Manage feed type reference data used in activity logs.">
      {innerContent}
    </PageLayout>
  )
}
