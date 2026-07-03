import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Leaf, Pencil, Plus, Trash2, X } from 'lucide-react'
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
  LOW:    'bg-[#2D7A4F] text-white',
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

function DayChipInput({ days, onChange }) {
  const [input, setInput] = useState('')

  const addDay = () => {
    const num = parseInt(input.trim())
    if (!num || num < 1) { setInput(''); return }
    if (!days.includes(num)) onChange([...days, num].sort((a, b) => a - b))
    setInput('')
  }

  const removeDay = (day) => onChange(days.filter(d => d !== day))

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5 min-h-[32px]">
        {days.map(d => (
          <span key={d} className="inline-flex items-center gap-1 bg-[#EBF5EE] text-[#1B4D2E] text-[12px] font-medium px-2 py-0.5 rounded-full">
            Day {d}
            <button type="button" onClick={() => removeDay(d)} className="hover:text-rose-600 ml-0.5">
              <X className="w-3 h-3" />
            </button>
          </span>
        ))}
        {days.length === 0 && <span className="text-[12px] text-[#A8BCA8] italic self-center">No days added yet</span>}
      </div>
      <div className="flex gap-2">
        <input
          type="number"
          min="1"
          placeholder="Day # (e.g. 10)"
          className={`${baseInputClasses} flex-1`}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === ',' || e.key === 'Tab') { e.preventDefault(); addDay() } }}
        />
        <button
          type="button"
          onClick={addDay}
          className="px-3 py-1.5 text-[12px] font-medium bg-[#EBF5EE] text-[#1B4D2E] rounded-lg hover:bg-[#D4EDDA] transition-colors"
        >
          Add
        </button>
      </div>
      <p className="text-[11px] text-[#A8BCA8]">Type a day number and press Enter or click Add. At least one day required.</p>
    </div>
  )
}

function SuggestionsSection({ cropId }) {
  const { showToast } = useToast()
  const [stages,      setStages]      = useState([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [stageForm,   setStageForm]   = useState({ stage_name: '', priority: 'MEDIUM', recommendation: '' })
  const [appDays,     setAppDays]     = useState([])
  const [stageError,  setStageError]  = useState('')
  const [addingStage, setAddingStage] = useState(false)

  const fetchStages = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/production/crop-types/${cropId}/stages/`)
      setStages(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { showToast('Failed to load stages.', 'error') }
    finally { setIsLoading(false) }
  }, [cropId])

  useEffect(() => { fetchStages() }, [fetchStages])

  const handleAddStage = async () => {
    if (!stageForm.stage_name.trim()) { setStageError('Activity name is required.'); return }
    if (appDays.length === 0)         { setStageError('At least one day is required.'); return }
    setAddingStage(true)
    setStageError('')
    try {
      const res = await api.post(`/production/crop-types/${cropId}/stages/`, {
        stage_name:      stageForm.stage_name.trim(),
        priority:        stageForm.priority,
        recommendation:  stageForm.recommendation.trim(),
        application_days: appDays,
      })
      setStages(prev => [...prev, res.data])
      setStageForm({ stage_name: '', priority: 'MEDIUM', recommendation: '' })
      setAppDays([])
    } catch {
      setStageError('Failed to add suggestion. Please try again.')
    } finally {
      setAddingStage(false)
    }
  }

  const handleDeleteStage = async (id) => {
    try {
      await api.delete(`/production/stages/${id}/`)
      setStages(prev => prev.filter(s => s.id !== id))
    } catch { showToast('Failed to delete stage.', 'error') }
  }

  return (
    <div className="border-t border-[#F0F4F0] pt-4 mt-4">
      <p className="text-[13px] font-semibold text-[#1A2B1A] mb-1">Activity Suggestions</p>
      <p className="text-[12px] text-[#7A8E7A] mb-3">
        These appear in the Get Suggestions panel when staff monitors this crop.
      </p>

      {isLoading ? (
        <p className="text-[12px] text-[#7A8E7A]">Loading…</p>
      ) : stages.length > 0 ? (
        <div className="space-y-2 mb-3">
          {stages.map(stage => {
            const days = stage.application_days?.length ? stage.application_days : [stage.day_after_planting]
            return (
              <div key={stage.id}
                className="flex items-center justify-between bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg px-3 py-2">
                <div className="flex items-center flex-wrap gap-2 flex-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[stage.priority] ?? 'bg-[#F1F5F9] text-[#4A5E4A]'}`}>
                    {stage.priority}
                  </span>
                  <span className="text-[13px] text-[#1A2B1A] font-medium">{stage.stage_name}</span>
                  <span className="flex gap-1 flex-wrap">
                    {days.map(d => (
                      <span key={d} className="text-[11px] bg-[#EBF5EE] text-[#1B4D2E] px-2 py-0.5 rounded-full">
                        Day {d}
                      </span>
                    ))}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => handleDeleteStage(stage.id)}
                  className="text-[#A8BCA8] hover:text-[#C0392B] p-1 rounded-lg hover:bg-[#FEE2E2] transition-colors flex-shrink-0 ml-2">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )
          })}
        </div>
      ) : (
        <p className="text-[12px] text-[#7A8E7A] italic mb-3">No suggestions yet. Add one below.</p>
      )}

      {/* Inline add form */}
      <div className="bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg p-3 space-y-2">
        <input
          type="text"
          value={stageForm.stage_name}
          onChange={e => setStageForm(prev => ({ ...prev, stage_name: e.target.value }))}
          placeholder="Activity Name (e.g. Apply Basal Fertilizer)"
          className={baseInputClasses}
        />
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A] mb-1">Application Days</p>
          <DayChipInput days={appDays} onChange={setAppDays} />
        </div>
        <select
          value={stageForm.priority}
          onChange={e => setStageForm(prev => ({ ...prev, priority: e.target.value }))}
          className={baseInputClasses}
        >
          <option value="HIGH">High Priority</option>
          <option value="MEDIUM">Medium Priority</option>
          <option value="LOW">Low Priority</option>
        </select>
        <textarea
          value={stageForm.recommendation}
          onChange={e => setStageForm(prev => ({ ...prev, recommendation: e.target.value }))}
          placeholder="Recommendation text (optional)"
          rows={2}
          className={`${baseInputClasses} resize-none`}
        />
        <button
          type="button"
          onClick={handleAddStage}
          disabled={addingStage}
          className="w-full bg-[#1B4D2E] hover:bg-[#235E38] text-white text-sm font-medium px-4 py-2.5 rounded-xl disabled:opacity-50 transition-colors"
        >
          {addingStage ? 'Adding...' : '+ Add Stage'}
        </button>
        {stageError && (
          <p className="text-xs text-rose-600">{stageError}</p>
        )}
      </div>
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
  const [deletingCrop,  setDeletingCrop]  = useState(null)
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
      <span className="flex items-center gap-1">
        <button
          type="button"
          className="text-[#1B4D2E] p-1.5 rounded-lg hover:bg-[#EBF5EE] transition-colors"
          onClick={() => { setEditCrop(c); setShowModal(true) }}
          title="Edit"
        >
          <Pencil size={14} />
        </button>
        <button
          type="button"
          className="text-rose-500 p-1.5 rounded-lg hover:bg-rose-50 transition-colors"
          onClick={() => setDeletingCrop(c)}
          title="Delete"
        >
          <Trash2 size={14} />
        </button>
      </span>
    ),
  }))

  return (
    <PageLayout
      title="Crop Option Management"
      subtitle="Add, edit, or remove crops and their details used across the system."
      action={
        <Button size="sm" onClick={() => { setEditCrop(null); setShowModal(true) }}>
          <Plus size={15} />
          Add New Crop
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="flex items-center gap-3 bg-white border border-[#E2E8E2] rounded-lg px-4 py-2.5">
          <div className="relative flex-1">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A8BCA8]">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input
              className="w-full border-none bg-transparent pl-8 pr-2 text-[13px] text-[#1A2B1A] placeholder-[#A8BCA8] focus:outline-none"
              placeholder="Search crops by name, category, or subcategory..."
              value={search}
              onChange={e => { setSearch(e.target.value); setPage(1) }}
            />
          </div>
          {filteredCrops.length !== crops.length && (
            <span className="text-[12px] text-[#7A8E7A] whitespace-nowrap">
              {filteredCrops.length} of {crops.length}
            </span>
          )}
        </div>

        {error && <ErrorMessage message={error} />}

        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {COLUMNS.map(col => (
                  <th
                    key={col.key}
                    className={`px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] ${col.sortable ? 'cursor-pointer select-none hover:bg-[#235E38]' : ''}`}
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
            <tbody>
              {isLoading ? (
                <tr><td colSpan={COLUMNS.length} className="py-10 text-center text-[13px] text-[#7A8E7A]">Loading…</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={COLUMNS.length} className="py-12 text-center">
                  <div className="flex flex-col items-center gap-2 text-[#C8D5C8]">
                    <svg width="48" height="48" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24"><path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm0 4v4m0 4h.01"/></svg>
                    <p className="text-[14px] font-medium text-[#4A5E4A]">No crop types found</p>
                    <p className="text-[13px] text-[#7A8E7A]">Add your first crop type to get started</p>
                  </div>
                </td></tr>
              ) : (
                rows.map((row) => (
                  <tr key={row.id} className="border-b border-[#F0F4F0] transition-colors hover:bg-[#F9FAF9]">
                    {COLUMNS.map(col => (
                      <td key={col.key} className="px-4 py-[13px] text-[13px] text-[#1A2B1A] align-middle">{row[col.key]}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {!isLoading && totalPages > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-[12px] text-[#7A8E7A]">
              Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, sortedCrops.length)} of {sortedCrops.length}
            </p>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="px-3 text-[13px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
              <button
                type="button"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page === totalPages}
                className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40"
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

      {deletingCrop && (
        <ConfirmDialog
          title="Delete Crop Option"
          message={`Are you sure you want to delete "${deletingCrop.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/production/crop-types/${deletingCrop.id}/`)
              showToast(`"${deletingCrop.name}" deleted.`, 'success')
              setDeletingCrop(null)
              fetchAll()
            } catch {
              showToast('Failed to delete crop. It may be in use.', 'error')
              setDeletingCrop(null)
            }
          }}
          onCancel={() => setDeletingCrop(null)}
        />
      )}
    </PageLayout>
  )
}
