import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Leaf, Pencil, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const PAGE_SIZE = 10

const PRIORITY_BADGE = {
  HIGH:   'bg-rose-500 text-white',
  MEDIUM: 'bg-amber-500 text-white',
  LOW:    'bg-[#4CAF50] text-white',
}

const COLUMNS = [
  { key: 'name',             label: 'CROP NAME',              sortable: true },
  { key: 'category_name',    label: 'CATEGORY',               sortable: true },
  { key: 'subcategory_name', label: 'SUBCATEGORY',            sortable: false },
  { key: 'days_to_harvest',  label: 'GROWTH DURATION (DAYS)', sortable: true },
  { key: 'yield_display',    label: 'YIELD PER HA (KG)',       sortable: true },
  { key: 'actions',          label: 'ACTIONS',                sortable: false },
]

const EMPTY_FORM = { name: '', days_to_harvest: '', yield_per_ha_kg: '', category: '', subcategory: '' }

// ── Suggestions Section ────────────────────────────────────────────────────────

function SuggestionsSection({ cropId }) {
  const { showToast } = useToast()
  const [stages,      setStages]      = useState([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [showForm,    setShowForm]    = useState(false)
  const [newActivity, setNewActivity] = useState({ stage_name: '', priority: 'MEDIUM', recommendation: '' })
  const [isAdding,    setIsAdding]    = useState(false)

  const fetchStages = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/production/crop-types/${cropId}/stages/`)
      setStages(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { showToast('Failed to load stages.', 'error') }
    finally { setIsLoading(false) }
  }, [cropId])

  useEffect(() => { fetchStages() }, [fetchStages])

  const handleDelete = async (id) => {
    try {
      await api.delete(`/production/stages/${id}/`)
      showToast('Stage deleted.', 'success')
      setStages(s => s.filter(x => x.id !== id))
    } catch { showToast('Failed to delete stage.', 'error') }
  }

  const handleAdd = async () => {
    if (!newActivity.stage_name.trim()) { showToast('Activity name is required.', 'error'); return }
    setIsAdding(true)
    try {
      const r = await api.post(`/production/crop-types/${cropId}/stages/`, {
        stage_name:         newActivity.stage_name.trim(),
        priority:           newActivity.priority,
        recommendation:     newActivity.recommendation.trim(),
        day_after_planting: 0,
      })
      setStages(s => [...s, r.data])
      setNewActivity({ stage_name: '', priority: 'MEDIUM', recommendation: '' })
      setShowForm(false)
      showToast('Suggestion added.', 'success')
    } catch { showToast('Failed to add suggestion.', 'error') }
    finally { setIsAdding(false) }
  }

  return (
    <div className="border-t border-slate-100 pt-4 mt-2">
      <p className="text-sm font-semibold text-slate-700 mb-3">Activity Suggestions</p>

      {isLoading ? (
        <p className="text-xs text-slate-400">Loading…</p>
      ) : stages.length === 0 && !showForm ? (
        <p className="text-xs text-slate-400 italic mb-3">No suggestions yet.</p>
      ) : (
        <div className="space-y-2 mb-3">
          {stages.map(s => (
            <div key={s.id} className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 px-3 py-2">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-semibold shrink-0 ${PRIORITY_BADGE[s.priority] ?? 'bg-slate-200 text-slate-700'}`}>
                  {s.priority}
                </span>
                <span className="text-xs text-slate-800 font-medium truncate">{s.stage_name}</span>
                {s.recommendation && (
                  <span className="text-xs text-slate-500 truncate hidden sm:inline">— {s.recommendation}</span>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleDelete(s.id)}
                className="text-sm text-rose-500 hover:text-rose-700 shrink-0 font-medium leading-none"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {!showForm ? (
        <button
          type="button"
          onClick={() => setShowForm(true)}
          className="text-sm text-[#1E4620] hover:underline font-medium"
        >
          + Add Suggestion
        </button>
      ) : (
        <div className="space-y-2 rounded-xl border border-slate-100 bg-slate-50 p-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Activity Name</label>
            <input
              className={baseInputClasses}
              placeholder="e.g. Fertilizer Application"
              value={newActivity.stage_name}
              onChange={e => setNewActivity(a => ({ ...a, stage_name: e.target.value }))}
              autoFocus
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Priority</label>
            <select
              className={baseInputClasses}
              value={newActivity.priority}
              onChange={e => setNewActivity(a => ({ ...a, priority: e.target.value }))}
            >
              <option value="HIGH">High</option>
              <option value="MEDIUM">Medium</option>
              <option value="LOW">Low</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 mb-1">Recommendation</label>
            <textarea
              rows={2}
              className={`${baseInputClasses} resize-none`}
              placeholder="Describe the recommendation..."
              value={newActivity.recommendation}
              onChange={e => setNewActivity(a => ({ ...a, recommendation: e.target.value }))}
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleAdd}
              disabled={isAdding}
              className="rounded-xl bg-[#1E4620] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#2D6A31] transition-colors disabled:opacity-60"
            >
              {isAdding ? 'Adding…' : 'Add'}
            </button>
            <button
              type="button"
              onClick={() => { setShowForm(false); setNewActivity({ stage_name: '', priority: 'MEDIUM', recommendation: '' }) }}
              className="rounded-xl border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

// ── Crop Type Modal ────────────────────────────────────────────────────────────

function CropTypeModal({ crop, categories, subcategories, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(crop)
  const originalForm = isEdit
    ? {
        name:            crop.name            || '',
        days_to_harvest: crop.days_to_harvest || '',
        yield_per_ha_kg: crop.yield_per_ha_kg || '',
        category:        crop.category        || '',
        subcategory:     crop.subcategory     || '',
      }
    : EMPTY_FORM
  const [form, setForm] = useState(originalForm)
  const [isSubmitting,   setIsSubmitting]   = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(originalForm)

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const filteredSubcats = subcategories.filter(
    s => !form.category || String(s.category) === String(form.category)
  )

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.name.trim())     { showToast('Crop name is required.', 'error'); return }
    if (!form.days_to_harvest) { showToast('Growth duration is required.', 'error'); return }
    setPendingPayload({
      ...form,
      category:        form.category        || null,
      subcategory:     form.subcategory     || null,
      yield_per_ha_kg: form.yield_per_ha_kg || null,
    })
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
      <ModalShell
        title={isEdit ? 'Edit Crop' : 'Add New Crop'}
        subtitle={isEdit ? `Update details for ${crop.name}` : 'Enter crop information below'}
        icon={Leaf}
        onClose={onClose}
        maxWidth="max-w-md"
      >
        <form onSubmit={handleSubmit} className="space-y-3">
          <FormField label="Crop Name" required>
            <input
              className={baseInputClasses}
              placeholder="e.g. Palay (Rice)"
              value={form.name}
              onChange={e => set('name', e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Category">
            <select
              className={baseInputClasses}
              value={form.category}
              onChange={e => { set('category', e.target.value); set('subcategory', '') }}
            >
              <option value="">— None —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Subcategory">
            <select
              className={baseInputClasses}
              value={form.subcategory}
              onChange={e => set('subcategory', e.target.value)}
              disabled={!form.category}
            >
              <option value="">— None —</option>
              {filteredSubcats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </FormField>
          <FormField label="Growth Duration (days)" required>
            <input
              type="number"
              min="1"
              className={baseInputClasses}
              placeholder="e.g. 120"
              value={form.days_to_harvest}
              onChange={e => set('days_to_harvest', e.target.value)}
            />
          </FormField>
          <FormField label="Yield Per Hectare (kg)">
            <input
              type="number"
              min="0"
              step="0.01"
              className={baseInputClasses}
              placeholder="e.g. 4500"
              value={form.yield_per_ha_kg}
              onChange={e => set('yield_per_ha_kg', e.target.value)}
            />
          </FormField>

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
              {isEdit ? 'Update Crop' : '+ Add Crop'}
            </Button>
          </div>
        </form>

        {isEdit && <SuggestionsSection cropId={crop.id} />}
      </ModalShell>

      {pendingPayload && (
        <ConfirmDialog
          title="Confirm Action"
          message={isEdit ? `Save changes to "${pendingPayload.name}"?` : `Add "${pendingPayload.name}" as a new crop?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirm}
          onCancel={() => setPendingPayload(null)}
        />
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function CropOptionPage() {
  const { showToast } = useToast()
  const [crops,         setCrops]         = useState([])
  const [categories,    setCategories]    = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState('')
  const [search,        setSearch]        = useState('')
  const [showModal,     setShowModal]     = useState(false)
  const [editCrop,      setEditCrop]      = useState(null)
  const [sortKey,       setSortKey]       = useState('name')
  const [sortAsc,       setSortAsc]       = useState(true)
  const [page,          setPage]          = useState(1)

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

  const handleSort = (key) => {
    if (sortKey === key) { setSortAsc(a => !a) } else { setSortKey(key); setSortAsc(true) }
    setPage(1)
  }

  const filteredCrops = useMemo(() => {
    const q = search.toLowerCase()
    return search
      ? crops.filter(c =>
          c.name.toLowerCase().includes(q) ||
          (c.category_name    || '').toLowerCase().includes(q) ||
          (c.subcategory_name || '').toLowerCase().includes(q)
        )
      : crops
  }, [crops, search])

  const sortedCrops = useMemo(() => {
    return [...filteredCrops].sort((a, b) => {
      let aVal = a[sortKey] ?? ''
      let bVal = b[sortKey] ?? ''
      if (sortKey === 'days_to_harvest') { aVal = a.days_to_harvest || 0; bVal = b.days_to_harvest || 0 }
      if (sortKey === 'yield_display')   { aVal = parseFloat(a.yield_per_ha_kg || 0); bVal = parseFloat(b.yield_per_ha_kg || 0) }
      if (aVal < bVal) return sortAsc ? -1 : 1
      if (aVal > bVal) return sortAsc ? 1 : -1
      return 0
    })
  }, [filteredCrops, sortKey, sortAsc])

  const totalPages = Math.max(1, Math.ceil(sortedCrops.length / PAGE_SIZE))
  const paginated  = sortedCrops.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const rows = paginated.map(c => ({
    ...c,
    category_name:    c.category_name    || '—',
    subcategory_name: c.subcategory_name || '—',
    yield_display:    c.yield_per_ha_kg  ? `${Number(c.yield_per_ha_kg).toLocaleString()} kg/ha` : '—',
    actions: (
      <button
        type="button"
        className="text-[#1E4620] hover:text-[#2D6A31] p-1.5 rounded-lg hover:bg-[#f0f7f0]"
        onClick={() => { setEditCrop(c); setShowModal(true) }}
        title="Edit"
      >
        <Pencil size={14} />
      </button>
    ),
  }))

  return (
    <PageLayout title="Crop Option Management" subtitle="Add, edit, or remove crops and their details used across the system.">
      <div className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <input
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 placeholder-slate-400 shadow-sm outline-none focus:border-green-400 focus:ring-2 focus:ring-green-100 w-72"
              placeholder="Search crops by name, category, or subcategory..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
            <p className="text-sm text-slate-500 whitespace-nowrap">
              {filteredCrops.length} of {crops.length} crop type{crops.length !== 1 ? 's' : ''}
            </p>
          </div>
          <Button size="sm" onClick={() => { setEditCrop(null); setShowModal(true) }}>
            <Plus size={15} className="mr-1" />
            + Add New Crop
          </Button>
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1E4620] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide ${col.sortable ? 'cursor-pointer select-none hover:bg-[#2D6A31]' : ''}`}
                    onClick={col.sortable ? () => handleSort(col.key) : undefined}
                  >
                    <span className="inline-flex items-center gap-1">
                      {col.label}
                      {col.sortable && sortKey === col.key && (
                        <span className="text-[10px]">{sortAsc ? '▲' : '▼'}</span>
                      )}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {isLoading ? (
                <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-sm text-slate-400">No crop types found.</td></tr>
              ) : (
                rows.map((row, i) => (
                  <tr key={row.id} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                    {COLUMNS.map(col => (
                      <td key={col.key} className="px-4 py-3 text-slate-700">{row[col.key]}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sortedCrops.length)} of {sortedCrops.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-sm font-medium text-slate-700">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-slate-200 p-1.5 text-slate-500 hover:bg-slate-50 disabled:opacity-40"
              >
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        )}
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
    </PageLayout>
  )
}
