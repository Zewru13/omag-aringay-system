import { useCallback, useEffect, useState } from 'react'
import { Fish, Pencil, Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const COLUMNS = [
  { key: 'name',    label: 'CATEGORY NAME' },
  { key: 'actions', label: 'ACTIONS' },
]

function CategoryModal({ category, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(category)
  const originalName = category?.name || ''
  const [name,         setName]         = useState(originalName)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = !isEdit || name !== originalName

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Category name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(`/fisheries/species-categories/${category.id}/`, { name })
      } else {
        await api.post('/fisheries/species-categories/', { name })
      }
      showToast(`Category ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Category' : 'Add New Category'}
      subtitle={isEdit ? `Update details for ${category.name}` : 'Enter category name below'}
      icon={Fish}
      onClose={onClose}
      maxWidth="max-w-xs"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="species-category-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update Category' : '+ Add Category'}
          </Button>
        </>
      }
    >
      <form id="species-category-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Category Name *">
          <input
            className={baseInputClasses}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Finfish"
          />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function SpeciesCategoryPage({ asTab = false }) {
  const { showToast } = useToast()
  const [categories,   setCategories]   = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editCat,      setEditCat]      = useState(null)
  const [deletingCat,  setDeletingCat]  = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const r = await api.get('/fisheries/species-categories/')
      setCategories(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setError('Failed to load species categories.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const rows = categories.map(c => ({
    ...c,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditCat(c); setShowModal(true) } },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingCat(c), tone: 'rose' },
      ]} />
    ),
  }))

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F0]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-[3px] bg-[#1B4D2E]" />
            <h2 className="text-[13px] font-semibold text-[#1A2B1A]">Species Categories</h2>
          </div>
          <button
            type="button"
            onClick={() => { setEditCat(null); setShowModal(true) }}
            className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#235E38] transition-colors"
          >
            <Plus size={12} />
            Add Category
          </button>
        </div>
        <DataTable columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {showModal && (
        <CategoryModal
          category={editCat}
          onClose={() => { setShowModal(false); setEditCat(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingCat && (
        <ConfirmDialog
          title="Delete Category"
          message={`Delete "${deletingCat.name}"? This may affect existing species assigned to this category.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/fisheries/species-categories/${deletingCat.id}/`)
              showToast(`"${deletingCat.name}" deleted.`, 'success')
              setDeletingCat(null); fetchAll()
            } catch {
              showToast('Failed to delete. It may be in use.', 'error')
              setDeletingCat(null)
            }
          }}
          onCancel={() => setDeletingCat(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Species Category Management"
      subtitle="Manage species categories used across the fisheries system."
    >
      {innerContent}
    </PageLayout>
  )
}
