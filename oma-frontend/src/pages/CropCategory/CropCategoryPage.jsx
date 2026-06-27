import { useCallback, useEffect, useState } from 'react'
import { Leaf, Pencil, Plus, Tag } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
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
      <button
        type="button"
        className="text-[#1E4620] hover:text-[#2D6A31] p-1.5 rounded-lg hover:bg-[#f0f7f0]"
        onClick={() => { setEditCat(c); setCatModal(true) }}
        title="Edit"
      >
        <Pencil size={14} />
      </button>
    ),
  }))

  const subcatRows = subcategories.map(s => ({
    ...s,
    actions: (
      <button
        type="button"
        className="text-[#1E4620] hover:text-[#2D6A31] p-1.5 rounded-lg hover:bg-[#f0f7f0]"
        onClick={() => { setEditSubcat(s); setSubcatModal(true) }}
        title="Edit"
      >
        <Pencil size={14} />
      </button>
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
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Crop Categories</h2>
            <button
              type="button"
              onClick={() => { setEditCat(null); setCatModal(true) }}
              className="flex items-center gap-1 rounded-xl bg-[#1E4620] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2D6A31] transition-colors"
            >
              <Plus size={12} />
              + Add Category
            </button>
          </div>
          <DataTable columns={CAT_COLUMNS} data={catRows} isLoading={isLoading} />
        </div>

        {/* Subcategories card */}
        <div className="bg-white rounded-xl border border-slate-100 p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-semibold text-slate-800">Crop Subcategories</h2>
            <button
              type="button"
              onClick={() => { setEditSubcat(null); setSubcatModal(true) }}
              disabled={categories.length === 0}
              className="flex items-center gap-1 rounded-xl bg-[#1E4620] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2D6A31] transition-colors disabled:opacity-50"
            >
              <Plus size={12} />
              + Add Subcategory
            </button>
          </div>
          <DataTable columns={SUBCAT_COLUMNS} data={subcatRows} isLoading={isLoading} />
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
    </PageLayout>
  )
}
