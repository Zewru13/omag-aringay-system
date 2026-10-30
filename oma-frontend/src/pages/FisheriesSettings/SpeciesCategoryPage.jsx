import { useCallback, useEffect, useState } from 'react'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Fish, Pencil, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { AddRowFooter, DraftActions, DraftInput, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const COLUMNS = [
  { key: 'name',    label: 'CATEGORY NAME' },
  { key: 'actions', label: 'ACTIONS' },
]

// Edit Category. New categories are added in the table itself (the Add button under it).
function CategoryModal({ category, onClose, onSaved }) {
  const { showToast } = useToast()
  const originalName = category.name
  const [name,         setName]         = useState(originalName)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = name !== originalName

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) { showToast('Category name is required.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/species-categories/${category.id}/`, { name })
      showToast('Category updated.', 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title="Edit Category"
      subtitle={`Update details for ${category.name}`}
      icon={Fish}
      onClose={onClose}
      maxWidth="max-w-xs"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="species-category-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            Update Category
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
  const [editCat,      setEditCat]      = useState(null)
  const add = useAddRow({ name: '' })
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

  const saveDraft = async () => {
    const name = add.draft.name.trim()
    if (!name) { showToast('Type the category name first.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/fisheries/species-categories/', { name })
      showToast('Category added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      showToast(err?.response?.data?.name?.[0] || 'Failed to save.', 'error')
    } finally {
      add.setIsSaving(false)
    }
  }

  const rows = newestFirst(categories).map(c => ({
    ...c,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditCat(c) },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingCat(c), tone: 'rose' },
      ]} />
    ),
  }))
  if (add.isOpen) {
    rows.unshift({
      id: 'new',
      name: <DraftInput value={add.draft.name} aria-label="New category" placeholder="e.g. Finfish"
        onChange={e => add.change({ name: e.target.value })} onSave={saveDraft} onCancel={add.close} />,
      actions: <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />,
    })
  }

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Species Categories" count={categories.length} markerClass="bg-[#1B4D2E]" />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
        {!isLoading && <AddRowFooter onClick={add.open} disabled={add.isOpen} label="Add Category" />}
      </div>

      {editCat && (
        <CategoryModal
          category={editCat}
          onClose={() => setEditCat(null)}
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
