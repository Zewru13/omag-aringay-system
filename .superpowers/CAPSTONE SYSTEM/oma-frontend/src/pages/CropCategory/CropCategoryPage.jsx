import { useCallback, useEffect, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
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
  { key: 'name',         label: 'Category Name' },
  { key: 'subcat_count', label: 'Subcategories' },
  { key: 'actions',      label: '' },
]

const SUBCAT_COLUMNS = [
  { key: 'name',          label: 'Subcategory Name' },
  { key: 'category_name', label: 'Category' },
  { key: 'actions',       label: '' },
]

function CategoryModal({ category, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(category)
  const [name, setName]             = useState(category?.name || '')
  const [isSubmitting, setIsSubmitting] = useState(false)

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
    <ModalShell title={isEdit ? 'Edit Category' : 'Add Category'} onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Category Name" required>
          <input className={baseInputClasses} value={name} onChange={(e) => setName(e.target.value)} autoFocus />
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Save' : 'Add'}</Button>
        </div>
      </form>
    </ModalShell>
  )
}

function SubcategoryModal({ subcategory, categories, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(subcategory)
  const [form, setForm] = useState({
    name: subcategory?.name || '',
    category: subcategory?.category || (categories[0]?.id ?? ''),
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Subcategory name is required.', 'error'); return }
    if (!form.category) { showToast('Please select a category.', 'error'); return }
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
    <ModalShell title={isEdit ? 'Edit Subcategory' : 'Add Subcategory'} onClose={onClose} maxWidth="max-w-sm">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Subcategory Name" required>
          <input className={baseInputClasses} value={form.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </FormField>
        <FormField label="Category" required>
          <select className={baseInputClasses} value={form.category} onChange={(e) => set('category', e.target.value)}>
            <option value="">— Select —</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Save' : 'Add'}</Button>
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

  const [catModal,    setCatModal]    = useState(false)
  const [subcatModal, setSubcatModal] = useState(false)
  const [editCat,     setEditCat]     = useState(null)
  const [editSubcat,  setEditSubcat]  = useState(null)
  const [deleteCat,   setDeleteCat]   = useState(null)
  const [deleteSubcat, setDeleteSubcat] = useState(null)

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

  const handleDeleteCat = async () => {
    try {
      await api.delete(`/production/crop-categories/${deleteCat.id}/`)
      showToast('Category deleted.', 'success')
      setDeleteCat(null); fetchAll()
    } catch { showToast('Failed to delete category.', 'error') }
  }

  const handleDeleteSubcat = async () => {
    try {
      await api.delete(`/production/crop-subcategories/${deleteSubcat.id}/`)
      showToast('Subcategory deleted.', 'success')
      setDeleteSubcat(null); fetchAll()
    } catch { showToast('Failed to delete subcategory.', 'error') }
  }

  const subcatCountMap = subcategories.reduce((acc, s) => {
    acc[s.category] = (acc[s.category] || 0) + 1
    return acc
  }, {})

  const catRows = categories.map((c) => ({
    ...c,
    subcat_count: subcatCountMap[c.id] ?? 0,
    actions: (
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          onClick={() => { setEditCat(c); setCatModal(true) }}
        ><Pencil size={14} /></button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          onClick={() => setDeleteCat(c)}
        ><Trash2 size={14} /></button>
      </div>
    ),
  }))

  const subcatRows = subcategories.map((s) => ({
    ...s,
    actions: (
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          onClick={() => { setEditSubcat(s); setSubcatModal(true) }}
        ><Pencil size={14} /></button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          onClick={() => setDeleteSubcat(s)}
        ><Trash2 size={14} /></button>
      </div>
    ),
  }))

  return (
    <PageLayout title="Crop Category Management" subtitle="Manage crop categories and subcategories">
      <div className="space-y-8">
        {error && <ErrorMessage message={error} />}

        {/* Categories section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Categories</h2>
              <p className="text-xs text-slate-500">{categories.length} category{categories.length !== 1 ? 'ies' : ''}</p>
            </div>
            <Button size="sm" onClick={() => { setEditCat(null); setCatModal(true) }}>
              <Plus size={14} className="mr-1" /> Add Category
            </Button>
          </div>
          <DataTable
            columns={CAT_COLUMNS}
            data={catRows}
            isLoading={isLoading}
          />
        </div>

        {/* Divider */}
        <hr className="border-slate-200" />

        {/* Subcategories section */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-slate-800">Subcategories</h2>
              <p className="text-xs text-slate-500">{subcategories.length} subcategor{subcategories.length !== 1 ? 'ies' : 'y'}</p>
            </div>
            <Button size="sm" onClick={() => { setEditSubcat(null); setSubcatModal(true) }} disabled={categories.length === 0}>
              <Plus size={14} className="mr-1" /> Add Subcategory
            </Button>
          </div>
          <DataTable
            columns={SUBCAT_COLUMNS}
            data={subcatRows}
            isLoading={isLoading}
          />
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
      {deleteCat && (
        <ConfirmDialog
          title="Delete Category"
          message={`Delete "${deleteCat.name}"? Subcategories and associated crop types will lose this category.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteCat}
          onCancel={() => setDeleteCat(null)}
        />
      )}
      {deleteSubcat && (
        <ConfirmDialog
          title="Delete Subcategory"
          message={`Delete "${deleteSubcat.name}"?`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDeleteSubcat}
          onCancel={() => setDeleteSubcat(null)}
        />
      )}
    </PageLayout>
  )
}
