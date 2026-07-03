import { useCallback, useEffect, useState } from 'react'
import { Leaf, Pencil, Plus, Tag, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
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
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Category Name *">
          <input
            className={baseInputClasses}
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
            placeholder="e.g. Cereals"
          />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update Category' : '+ Add Category'}
          </Button>
        </div>
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
    >
      <form onSubmit={handleSubmit} className="space-y-4">
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
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? '+ Update Subcategory' : '+ Add Subcategory'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default function CropCategoryPage() {
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
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE] transition-colors"
          onClick={() => { setEditCat(c); setCatModal(true) }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
          onClick={() => setDeletingCat(c)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </span>
    ),
  }))

  const subcatRows = subcategories.map(s => ({
    ...s,
    actions: (
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE] transition-colors"
          onClick={() => { setEditSubcat(s); setSubcatModal(true) }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
          onClick={() => setDeletingSubcat(s)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </span>
    ),
  }))

  return (
    <PageLayout
      title="Crop Category Management"
      subtitle="Manage crop categories and subcategories used across the system."
    >
      <div className="space-y-4">
        {error && <ErrorMessage message={error} />}

        {/* Categories card */}
        <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F0]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-[#1B4D2E]" />
              <h2 className="text-[13px] font-semibold text-[#1A2B1A]">Crop Categories</h2>
            </div>
            <button
              type="button"
              onClick={() => { setEditCat(null); setCatModal(true) }}
              className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#235E38] transition-colors"
            >
              <Plus size={12} />
              Add Category
            </button>
          </div>
          <div className="p-0">
            <DataTable columns={CAT_COLUMNS} data={catRows} isLoading={isLoading} />
          </div>
        </div>

        {/* Subcategories card */}
        <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[#F0F4F0]">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-[3px] bg-[#2D7A4F]" />
              <h2 className="text-[13px] font-semibold text-[#1A2B1A]">Crop Subcategories</h2>
            </div>
            <button
              type="button"
              onClick={() => { setEditSubcat(null); setSubcatModal(true) }}
              disabled={categories.length === 0}
              className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-1.5 text-[12px] font-medium text-white hover:bg-[#235E38] transition-colors disabled:opacity-50"
            >
              <Plus size={12} />
              Add Subcategory
            </button>
          </div>
          <div className="p-0">
            <DataTable columns={SUBCAT_COLUMNS} data={subcatRows} isLoading={isLoading} />
          </div>
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
    </PageLayout>
  )
}
