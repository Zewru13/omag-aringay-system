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

const COLUMNS = [
  { key: 'name',              label: 'Crop Name' },
  { key: 'category_name',     label: 'Category' },
  { key: 'subcategory_name',  label: 'Subcategory' },
  { key: 'days_to_harvest',   label: 'Growth Duration (Days)' },
  { key: 'yield_display',     label: 'Yield per ha (kg)' },
  { key: 'actions',           label: '' },
]

const EMPTY_FORM = {
  name: '',
  days_to_harvest: '',
  yield_per_ha_kg: '',
  category: '',
  subcategory: '',
  suggested_activities: '',
}

function CropTypeModal({ crop, categories, subcategories, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(crop)
  const [form, setForm] = useState(
    isEdit
      ? {
          name: crop.name || '',
          days_to_harvest: crop.days_to_harvest || '',
          yield_per_ha_kg: crop.yield_per_ha_kg || '',
          category: crop.category || '',
          subcategory: crop.subcategory || '',
          suggested_activities: crop.suggested_activities || '',
        }
      : EMPTY_FORM
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const filteredSubcats = subcategories.filter(
    (s) => !form.category || String(s.category) === String(form.category)
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Crop name is required.', 'error'); return }
    if (!form.days_to_harvest) { showToast('Growth duration is required.', 'error'); return }
    const payload = {
      ...form,
      category: form.category || null,
      subcategory: form.subcategory || null,
      yield_per_ha_kg: form.yield_per_ha_kg || null,
    }
    setPendingPayload(payload)
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(`/production/crop-types/${crop.id}/`, pendingPayload)
      } else {
        await api.post('/production/crop-types/', pendingPayload)
      }
      showToast(`Crop type ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save crop type.', 'error')
    } finally {
      setIsSubmitting(false)
      setPendingPayload(null)
    }
  }

  return (
    <>
      <ModalShell title={isEdit ? 'Edit Crop Type' : 'Add Crop Type'} onClose={onClose} maxWidth="max-w-lg">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Crop Name" required>
              <input className={baseInputClasses} placeholder="e.g. Palay (Rice)" value={form.name} onChange={(e) => set('name', e.target.value)} />
            </FormField>
            <FormField label="Growth Duration (Days)" required>
              <input
                type="number"
                min="1"
                className={baseInputClasses}
                placeholder="e.g. 120"
                value={form.days_to_harvest}
                onChange={(e) => set('days_to_harvest', e.target.value)}
              />
            </FormField>
            <FormField label="Yield per ha (kg)">
              <input
                type="number"
                min="0"
                step="0.01"
                className={baseInputClasses}
                placeholder="e.g. 4500"
                value={form.yield_per_ha_kg}
                onChange={(e) => set('yield_per_ha_kg', e.target.value)}
              />
            </FormField>
            <FormField label="Category">
              <select
                className={baseInputClasses}
                value={form.category}
                onChange={(e) => { set('category', e.target.value); set('subcategory', '') }}
              >
                <option value="">— None —</option>
                {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </FormField>
            <FormField label="Subcategory">
              <select
                className={baseInputClasses}
                value={form.subcategory}
                onChange={(e) => set('subcategory', e.target.value)}
                disabled={!form.category}
              >
                <option value="">— None —</option>
                {filteredSubcats.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </FormField>
          </div>
          <FormField label="Suggested Activities">
            <input
              className={baseInputClasses}
              placeholder="Fertilizer Application, Irrigation, Weeding"
              value={form.suggested_activities}
              onChange={(e) => set('suggested_activities', e.target.value)}
            />
          </FormField>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting}>{isEdit ? 'Save Changes' : 'Add Crop Type'}</Button>
          </div>
        </form>
      </ModalShell>

      {pendingPayload && (
        <ConfirmDialog
          title={isEdit ? 'Save Changes?' : 'Add Crop Type?'}
          message={isEdit ? `Save changes to "${pendingPayload.name}"?` : `Add "${pendingPayload.name}" as a new crop type?`}
          confirmLabel={isEdit ? 'Save Changes' : 'Add Crop Type'}
          onConfirm={handleConfirm}
          onCancel={() => setPendingPayload(null)}
        />
      )}
    </>
  )
}

export default function CropOptionPage() {
  const { showToast } = useToast()
  const [crops, setCrops]             = useState([])
  const [categories, setCategories]   = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [isLoading, setIsLoading]     = useState(true)
  const [error, setError]             = useState('')
  const [search, setSearch]           = useState('')
  const [showModal, setShowModal]     = useState(false)
  const [editCrop, setEditCrop]       = useState(null)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const [cropsRes, catsRes, subcatsRes] = await Promise.all([
        api.get('/production/crop-types/'),
        api.get('/production/crop-categories/'),
        api.get('/production/crop-subcategories/'),
      ])
      setCrops(Array.isArray(cropsRes.data) ? cropsRes.data : (cropsRes.data.results || []))
      setCategories(Array.isArray(catsRes.data) ? catsRes.data : (catsRes.data.results || []))
      setSubcategories(Array.isArray(subcatsRes.data) ? subcatsRes.data : (subcatsRes.data.results || []))
    } catch {
      setError('Failed to load crop options.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleDelete = async () => {
    try {
      await api.delete(`/production/crop-types/${deleteTarget.id}/`)
      showToast('Crop type deleted.', 'success')
      setDeleteTarget(null)
      fetchAll()
    } catch {
      showToast('Failed to delete crop type.', 'error')
    }
  }

  const filteredCrops = search
    ? crops.filter((c) =>
        c.name.toLowerCase().includes(search.toLowerCase()) ||
        (c.category_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.subcategory_name || '').toLowerCase().includes(search.toLowerCase())
      )
    : crops

  const rows = filteredCrops.map((c) => ({
    ...c,
    category_name:    c.category_name    || '—',
    subcategory_name: c.subcategory_name || '—',
    yield_display:    c.yield_per_ha_kg  ? `${Number(c.yield_per_ha_kg).toLocaleString()} kg` : '—',
    actions: (
      <div className="flex gap-1">
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          onClick={() => { setEditCrop(c); setShowModal(true) }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="rounded-lg p-1.5 text-slate-500 hover:bg-rose-50 hover:text-rose-600"
          onClick={() => setDeleteTarget(c)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </div>
    ),
  }))

  return (
    <PageLayout title="Crop Options" subtitle="Manage crop types, categories, and suggested activities">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 w-64"
              placeholder="Search crop name or category…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <p className="text-sm text-slate-500 whitespace-nowrap">
              {filteredCrops.length} of {crops.length} crop type{crops.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditCrop(null); setShowModal(true) }}>
            <Plus size={15} className="mr-1" />
            Add Crop Type
          </Button>
        </div>

        {error && <ErrorMessage message={error} />}

        <DataTable
          columns={COLUMNS}
          data={rows}
          isLoading={isLoading}
        />
      </div>

      {showModal && (
        <CropTypeModal
          crop={editCrop}
          categories={categories}
          subcategories={subcategories}
          onClose={() => { setShowModal(false); setEditCrop(null) }}
          onSaved={fetchAll}
        />
      )}

      {deleteTarget && (
        <ConfirmDialog
          title="Delete Crop Type"
          message={`Are you sure you want to delete "${deleteTarget.name}"? This action cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={handleDelete}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </PageLayout>
  )
}
