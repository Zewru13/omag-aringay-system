import { useCallback, useEffect, useState } from 'react'
import AddButton from '../../components/UI/AddButton.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { Leaf, Pencil, Tag, Trash2 } from 'lucide-react'
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

const CAT_COLUMNS = [
  { key: 'name',    label: 'CATEGORY NAME' },
  { key: 'actions', label: 'ACTIONS' },
]

const SUBCAT_COLUMNS = [
  { key: 'name',          label: 'SUBCATEGORY NAME' },
  { key: 'category_name', label: 'PARENT CATEGORY' },
  { key: 'actions',       label: 'ACTIONS' },
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
        await api.patch(`/production/crop-categories/${category.id}/`, { name })
      } else {
        await api.post('/production/crop-categories/', { name })
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
      subtitle={isEdit ? `Update details for ${category.name}` : 'Enter category information below'}
      icon={Leaf}
      onClose={onClose}
      maxWidth="max-w-xs"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="crop-category-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update Category' : '+ Add Category'}
          </Button>
        </>
      }
    >
      <form id="crop-category-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Category Name *">
          <input
            className={baseInputClasses}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Cereals"
          />
        </FormField>
      </form>
    </ModalShell>
  )
}

function SubcategoryModal({ subcategory, categories, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(subcategory)
  const originalForm = {
    name:     subcategory?.name     || '',
    category: subcategory?.category || (categories[0]?.id ?? ''),
  }
  const [form, setForm] = useState(originalForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(originalForm)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Subcategory name is required.', 'error'); return }
    if (!form.category)    { showToast('Please select a category.', 'error'); return }
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(`/production/crop-subcategories/${subcategory.id}/`, form)
      } else {
        await api.post('/production/crop-subcategories/', form)
      }
      showToast(`Subcategory ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Subcategory' : 'Add New Subcategory'}
      subtitle={isEdit ? `Update details for ${subcategory.name}` : 'Enter subcategory information below'}
      icon={Tag}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="crop-subcategory-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? '+ Update Subcategory' : '+ Add Subcategory'}
          </Button>
        </>
      }
    >
      <form id="crop-subcategory-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Parent Category" required>
          <select className={baseInputClasses} value={form.category} onChange={e => set('category', e.target.value)}>
            <option value="">— Select —</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField label="Subcategory Name *">
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. Rice"
          />
        </FormField>
      </form>
    </ModalShell>
  )
}

export default function CropCategoryPage({ asTab = false }) {
  const { showToast } = useToast()
  const [categories,    setCategories]    = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState('')
  const [catModal,      setCatModal]      = useState(false)
  const [subcatModal,   setSubcatModal]   = useState(false)
  const [editCat,       setEditCat]       = useState(null)
  const [editSubcat,    setEditSubcat]    = useState(null)
  const [deletingCat,   setDeletingCat]   = useState(null)
  const [deletingSubcat,setDeletingSubcat]= useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const [catsRes, subcatsRes] = await Promise.all([
        api.get('/production/crop-categories/'),
        api.get('/production/crop-subcategories/'),
      ])
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : (catsRes.data.results || []))
      setSubcategories(Array.isArray(subcatsRes.data) ? subcatsRes.data : (subcatsRes.data.results || []))
    } catch {
      setError('Failed to load categories.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const catRows = categories.map(c => ({
    ...c,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditCat(c); setCatModal(true) } },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingCat(c), tone: 'rose' },
      ]} />
    ),
  }))

  const subcatRows = subcategories.map(s => ({
    ...s,
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditSubcat(s); setSubcatModal(true) } },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingSubcat(s), tone: 'rose' },
      ]} />
    ),
  }))

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      {/* Categories card */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader
            title="Crop Categories"
            markerClass="bg-[#1B4D2E]"
            action={<AddButton onClick={() => { setEditCat(null); setCatModal(true) }}>Add Category</AddButton>}
          />
        <div className="p-0">
          <DataTable bare columns={CAT_COLUMNS} data={catRows} isLoading={isLoading} />
        </div>
      </div>

      {/* Subcategories card */}
      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader
            title="Crop Subcategories"
            markerClass="bg-[#2D7A4F]"
            action={<AddButton onClick={() => { setEditSubcat(null); setSubcatModal(true) }} disabled={categories.length === 0}>Add Subcategory</AddButton>}
          />
        <div className="p-0">
          <DataTable bare columns={SUBCAT_COLUMNS} data={subcatRows} isLoading={isLoading} />
        </div>
      </div>

      {catModal && (
        <CategoryModal
          category={editCat}
          onClose={() => { setCatModal(false); setEditCat(null) }}
          onSaved={fetchAll}
        />
      )}
      {subcatModal && (
        <SubcategoryModal
          subcategory={editSubcat}
          categories={categories}
          onClose={() => { setSubcatModal(false); setEditSubcat(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingCat && (
        <ConfirmDialog
          title="Delete Category"
          message={`Delete "${deletingCat.name}"? This may affect existing crops assigned to this category.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/production/crop-categories/${deletingCat.id}/`)
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

      {deletingSubcat && (
        <ConfirmDialog
          title="Delete Subcategory"
          message={`Delete "${deletingSubcat.name}"? This may affect existing crops assigned to this subcategory.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/production/crop-subcategories/${deletingSubcat.id}/`)
              showToast(`"${deletingSubcat.name}" deleted.`, 'success')
              setDeletingSubcat(null); fetchAll()
            } catch {
              showToast('Failed to delete. It may be in use.', 'error')
              setDeletingSubcat(null)
            }
          }}
          onCancel={() => setDeletingSubcat(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Crop Category Management"
      subtitle="Manage crop categories and subcategories used across the system."
    >
      {innerContent}
    </PageLayout>
  )
}
