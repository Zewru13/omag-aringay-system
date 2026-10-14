import { useCallback, useEffect, useMemo, useState } from 'react'
import AddButton from '../../components/UI/AddButton.jsx'
import { ChevronLeft, ChevronRight, Fish, Pencil, Trash2, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const PAGE_SIZE = 10

const PRIORITY_BADGE = {
  HIGH:   'bg-rose-500 text-white',
  MEDIUM: 'bg-amber-500 text-white',
  LOW:    'bg-[#2D7A4F] text-white',
}

const COLUMNS = [
  { key: 'species_name',              label: 'SPECIES',                  sortable: true },
  { key: 'category_name',             label: 'CATEGORY',                 sortable: true },
  { key: 'culture_environment',       label: 'ENVIRONMENT',              sortable: true },
  { key: 'culture_duration_days',     label: 'CULTURE DURATION (DAYS)',  sortable: true },
  { key: 'default_survival_rate_pct', label: 'SURVIVAL %',               sortable: true },
  { key: 'default_avg_body_weight_kg',label: 'AVG WEIGHT (KG)',          sortable: true },
  { key: 'actions',                   label: 'ACTIONS',                  sortable: false },
]

const EMPTY_FORM = {
  species_name:               '',
  category:                   '',
  culture_environment:        'Freshwater',
  culture_duration_days:      '',
  default_survival_rate_pct:  '',
  default_avg_body_weight_kg: '',
  fingerling_start_day:       '',
  juvenile_start_day:         '',
  adult_start_day:            '',
}

// ── Day Chip Input ────────────────────────────────────────────────────────────

function DayChipInput({ days, onChange }) {
  const [input, setInput] = useState('')

  const addDay = () => {
    const num = parseInt(input.trim())
    if (!num || num < 0) { setInput(''); return }
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
          min="0"
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

// ── Activity Suggestions Section ──────────────────────────────────────────────

function SuggestionsSection({ speciesId }) {
  const { showToast } = useToast()
  const [stages,      setStages]      = useState([])
  const [isLoading,   setIsLoading]   = useState(true)
  const [stageForm,   setStageForm]   = useState({ activity_name: '', priority: 'MEDIUM', recommendation: '' })
  const [appDays,     setAppDays]     = useState([])
  const [stageError,  setStageError]  = useState('')
  const [addingStage, setAddingStage] = useState(false)

  const fetchStages = useCallback(async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/fisheries/species/${speciesId}/stages/`)
      setStages(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { showToast('Failed to load stages.', 'error') }
    finally { setIsLoading(false) }
  }, [speciesId])

  useEffect(() => { fetchStages() }, [fetchStages])

  const handleAddStage = async () => {
    if (!stageForm.activity_name.trim()) { setStageError('Activity name is required.'); return }
    if (appDays.length === 0)            { setStageError('At least one day is required.'); return }
    setAddingStage(true); setStageError('')
    try {
      const res = await api.post(`/fisheries/species/${speciesId}/stages/`, {
        activity_name:    stageForm.activity_name.trim(),
        priority:         stageForm.priority,
        recommendation:   stageForm.recommendation.trim(),
        application_days: appDays,
      })
      setStages(prev => [...prev, res.data])
      setStageForm({ activity_name: '', priority: 'MEDIUM', recommendation: '' })
      setAppDays([])
    } catch {
      setStageError('Failed to add suggestion. Please try again.')
    } finally {
      setAddingStage(false)
    }
  }

  const handleDeleteStage = async (id) => {
    try {
      await api.delete(`/fisheries/species/stages/${id}/`)
      setStages(prev => prev.filter(s => s.id !== id))
    } catch { showToast('Failed to delete stage.', 'error') }
  }

  return (
    <div className="border-t border-[#F0F4F0] pt-4 mt-4">
      <p className="text-[13px] font-semibold text-[#1A2B1A] mb-1">Activity Suggestions</p>
      <p className="text-[12px] text-[#7A8E7A] mb-3">
        These appear in the Get Suggestions panel when staff monitors this species.
      </p>

      {isLoading ? (
        <p className="text-[12px] text-[#7A8E7A]">Loading…</p>
      ) : stages.length > 0 ? (
        <div className="space-y-2 mb-3">
          {stages.map(stage => {
            const days = stage.application_days?.length ? stage.application_days : [stage.day_after_stocking]
            return (
              <div key={stage.id}
                className="flex items-center justify-between bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg px-3 py-2">
                <div className="flex items-center flex-wrap gap-2 flex-1">
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${PRIORITY_BADGE[stage.priority] ?? 'bg-[#F1F5F9] text-[#4A5E4A]'}`}>
                    {stage.priority}
                  </span>
                  <span className="text-[13px] text-[#1A2B1A] font-medium">{stage.activity_name}</span>
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

      <div className="bg-[#F9FAF9] border border-[#E2E8E2] rounded-lg p-3 space-y-2">
        <input
          type="text"
          value={stageForm.activity_name}
          onChange={e => setStageForm(prev => ({ ...prev, activity_name: e.target.value }))}
          placeholder="Activity Name (e.g. Water Quality Check)"
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

// ── Species Modal ─────────────────────────────────────────────────────────────

function SpeciesModal({ species, categories, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(species)
  const originalForm = isEdit
    ? {
        species_name:               species.species_name               || '',
        category:                   species.category                   || '',
        culture_environment:        species.culture_environment        || 'Freshwater',
        culture_duration_days:      species.culture_duration_days      || '',
        default_survival_rate_pct:  species.default_survival_rate_pct  || '',
        default_avg_body_weight_kg: species.default_avg_body_weight_kg || '',
        fingerling_start_day:       species.fingerling_start_day ?? '',
        juvenile_start_day:         species.juvenile_start_day   ?? '',
        adult_start_day:            species.adult_start_day      ?? '',
      }
    : EMPTY_FORM
  const [form,         setForm]         = useState(originalForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [nameError,    setNameError]    = useState('')
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(originalForm)

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'species_name') setNameError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.species_name.trim())    { showToast('Species name is required.', 'error'); return }
    if (!form.culture_duration_days)  { showToast('Culture duration is required.', 'error'); return }
    const stageDays = [form.fingerling_start_day, form.juvenile_start_day, form.adult_start_day]
    const stageDaysSet = stageDays.filter(d => d !== '')
    if (stageDaysSet.length > 0 && stageDaysSet.length < 3) {
      showToast('Set all three growth-stage days, or leave all three blank.', 'error'); return
    }
    if (stageDaysSet.length === 3) {
      const [fing, juv, adult] = stageDaysSet.map(Number)
      if (!(fing < juv && juv < adult)) {
        showToast('Growth-stage days must increase: Fingerling < Juvenile < Adult.', 'error'); return
      }
    }
    setPendingPayload({
      ...form,
      category:                   form.category || null,
      default_survival_rate_pct:  form.default_survival_rate_pct  || null,
      default_avg_body_weight_kg: form.default_avg_body_weight_kg || null,
      fingerling_start_day:       form.fingerling_start_day === '' ? null : form.fingerling_start_day,
      juvenile_start_day:         form.juvenile_start_day   === '' ? null : form.juvenile_start_day,
      adult_start_day:            form.adult_start_day      === '' ? null : form.adult_start_day,
    })
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      if (isEdit) {
        await api.patch(`/fisheries/species/${species.id}/`, pendingPayload)
      } else {
        await api.post('/fisheries/species/', pendingPayload)
      }
      showToast(`Species ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      const nameErr = err?.response?.data?.species_name?.[0]
      if (nameErr) {
        setNameError(nameErr)
      } else {
        showToast(err?.response?.data?.detail || 'Failed to save species.', 'error')
      }
    } finally {
      setIsSubmitting(false)
      setPendingPayload(null)
    }
  }

  return (
    <>
      <ModalShell
        title={isEdit ? 'Edit Species' : 'Add New Species'}
        subtitle={isEdit ? `Update details for ${species.species_name}` : 'Enter species information below'}
        icon={Fish}
        onClose={onClose}
        maxWidth="max-w-md"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="species-option-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
              {isEdit ? 'Update Species' : '+ Add Species'}
            </Button>
          </>
        }
      >
        <form id="species-option-form" onSubmit={handleSubmit} className="space-y-3">
          <FormField label="Species Name" required error={nameError}>
            <input
              className={baseInputClasses}
              placeholder="e.g. Tilapia"
              value={form.species_name}
              onChange={e => set('species_name', e.target.value)}
              autoFocus
            />
          </FormField>
          <FormField label="Category">
            <select
              className={baseInputClasses}
              value={form.category}
              onChange={e => set('category', e.target.value)}
            >
              <option value="">— None —</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </FormField>
          <FormField label="Culture Environment" required>
            <select
              className={baseInputClasses}
              value={form.culture_environment}
              onChange={e => set('culture_environment', e.target.value)}
            >
              <option value="Freshwater">Freshwater</option>
              <option value="Brackishwater">Brackishwater</option>
              <option value="Marine">Marine</option>
            </select>
          </FormField>
          <FormField label="Culture Duration (days)" required>
            <input
              type="number"
              min="1"
              className={baseInputClasses}
              placeholder="e.g. 120"
              value={form.culture_duration_days}
              onChange={e => set('culture_duration_days', e.target.value)}
            />
          </FormField>
          <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
            <p className="mb-1 text-[12px] font-semibold text-[#1A2B1A]">Growth Stage Days (for feed recommendation)</p>
            <p className="mb-2 text-[11px] text-[#7A8E7A]">
              Day after stocking each stage begins. Leave all three blank if not yet known — growth-stage feed recommendation just won't be offered for this species until they're set.
            </p>
            <div className="grid grid-cols-3 gap-2">
              <FormField label="Fingerling">
                <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 15"
                  value={form.fingerling_start_day} onChange={e => set('fingerling_start_day', e.target.value)} />
              </FormField>
              <FormField label="Juvenile">
                <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 45"
                  value={form.juvenile_start_day} onChange={e => set('juvenile_start_day', e.target.value)} />
              </FormField>
              <FormField label="Adult">
                <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 90"
                  value={form.adult_start_day} onChange={e => set('adult_start_day', e.target.value)} />
              </FormField>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Default Survival Rate (%)">
              <input
                type="number"
                min="0"
                max="100"
                step="0.01"
                className={baseInputClasses}
                placeholder="e.g. 80.00"
                value={form.default_survival_rate_pct}
                onChange={e => set('default_survival_rate_pct', e.target.value)}
              />
            </FormField>
            <FormField label="Default Avg Body Weight (kg)">
              <input
                type="number"
                min="0"
                step="0.001"
                className={baseInputClasses}
                placeholder="e.g. 0.250"
                value={form.default_avg_body_weight_kg}
                onChange={e => set('default_avg_body_weight_kg', e.target.value)}
              />
            </FormField>
          </div>

        </form>

        {isEdit && <SuggestionsSection speciesId={species.id} />}
      </ModalShell>

      {pendingPayload && (
        <ConfirmDialog
          title="Confirm Action"
          message={isEdit ? `Save changes to "${pendingPayload.species_name}"?` : `Add "${pendingPayload.species_name}" as a new species?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirm}
          onCancel={() => setPendingPayload(null)}
        />
      )}
    </>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function SpeciesOptionPage({ asTab = false }) {
  const { showToast } = useToast()
  const [species,       setSpecies]       = useState([])
  const [categories,    setCategories]    = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState('')
  const [search,        setSearch]        = useState('')
  const [showModal,     setShowModal]     = useState(false)
  const [editSpecies,   setEditSpecies]   = useState(null)
  const [deletingSpec,  setDeletingSpec]  = useState(null)
  // No default sort key — see CropOptionPage.jsx's identical fix. Until
  // staff click a column header, the table shows the backend's own order
  // (newest-first); defaulting this to 'species_name' used to force
  // alphabetical order on every load, silently defeating that.
  const [sortKey,       setSortKey]       = useState(null)
  const [sortAsc,       setSortAsc]       = useState(true)
  const [page,          setPage]          = useState(1)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const [specRes, catRes] = await Promise.all([
        api.get('/fisheries/species/'),
        api.get('/fisheries/species-categories/'),
      ])
      setSpecies(Array.isArray(specRes.data) ? specRes.data : (specRes.data.results || []))
      setCategories(Array.isArray(catRes.data) ? catRes.data : (catRes.data.results || []))
    } catch {
      setError('Failed to load species options.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const handleSort = (key) => {
    if (sortKey === key) { setSortAsc(a => !a) } else { setSortKey(key); setSortAsc(true) }
    setPage(1)
  }

  const filtered = useMemo(() => {
    const q = search.toLowerCase()
    let list = species.filter(s =>
      !q || s.species_name?.toLowerCase().includes(q) || s.category_name?.toLowerCase().includes(q)
    )
    if (sortKey) {
      list = [...list].sort((a, b) => {
        const av = a[sortKey] ?? ''
        const bv = b[sortKey] ?? ''
        if (av < bv) return sortAsc ? -1 : 1
        if (av > bv) return sortAsc ? 1 : -1
        return 0
      })
    }
    return list
  }, [species, search, sortKey, sortAsc])

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE)
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const innerContent = (
    <div className="space-y-3">
      {error && <ErrorMessage message={error} />}


      <FilterPanel
        className=""
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search species..."
        actions={<AddButton onClick={() => { setEditSpecies(null); setShowModal(true) }}>Add Species</AddButton>}
      />

      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <table className="min-w-full text-sm">
          <thead className="bg-[#1B4D2E] text-white">
            <tr>
              {COLUMNS.map(col => (
                <th
                  key={col.key}
                  onClick={() => col.sortable && handleSort(col.key)}
                  className={`px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] ${col.sortable ? 'cursor-pointer hover:bg-[#235E38] select-none' : ''}`}
                >
                  <span className="flex items-center gap-1">
                    {col.label}
                    {col.sortable && sortKey === col.key && (
                      sortAsc ? <ChevronRight size={12} className="rotate-90" /> : <ChevronLeft size={12} className="-rotate-90" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#F0F4F0] animate-pulse">
                  {COLUMNS.map(col => <td key={col.key} className="px-4 py-[13px]"><div className="h-4 bg-[#E8EEE8] rounded w-3/4" /></td>)}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-[13px] text-[#7A8E7A] italic">
                  No species found.
                </td>
              </tr>
            ) : (
              paginated.map(s => (
                <tr key={s.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors">
                  <td className="px-4 py-[11px] text-[13px] text-[#1A2B1A] font-medium">{s.species_name}</td>
                  <td className="px-4 py-[11px] text-[13px] text-[#4A5E4A]">{s.category_name || '—'}</td>
                  <td className="px-4 py-[11px] text-[13px] text-[#4A5E4A]">{s.culture_environment}</td>
                  <td className="px-4 py-[11px] text-[13px] text-[#4A5E4A]">{s.culture_duration_days}</td>
                  <td className="px-4 py-[11px] text-[13px] text-[#4A5E4A]">
                    {s.default_survival_rate_pct ? `${Number(s.default_survival_rate_pct).toFixed(1)}%` : '—'}
                  </td>
                  <td className="px-4 py-[11px] text-[13px] text-[#4A5E4A]">
                    {s.default_avg_body_weight_kg ? Number(s.default_avg_body_weight_kg).toFixed(3) : '—'}
                  </td>
                  <td className="px-4 py-[11px]">
                    <RowActions actions={[
                      { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditSpecies(s); setShowModal(true) } },
                      { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingSpec(s), tone: 'rose' },
                    ]} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between px-1">
          <p className="text-[12px] text-[#7A8E7A]">
            Showing {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filtered.length)} of {filtered.length}
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page === 1}
              className="p-1.5 rounded-lg border border-[#E2E8E2] disabled:opacity-40 hover:bg-[#F5F7F5] transition-colors"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="px-2 text-[13px] text-[#4A5E4A]">{page} / {totalPages}</span>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page === totalPages}
              className="p-1.5 rounded-lg border border-[#E2E8E2] disabled:opacity-40 hover:bg-[#F5F7F5] transition-colors"
            >
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <SpeciesModal
          species={editSpecies}
          categories={categories}
          onClose={() => { setShowModal(false); setEditSpecies(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingSpec && (
        <ConfirmDialog
          title="Delete Species"
          message={`Delete "${deletingSpec.species_name}"? This may affect existing stocking records.`}
          confirmLabel="Delete"
          variant="danger"
          onConfirm={async () => {
            try {
              await api.delete(`/fisheries/species/${deletingSpec.id}/`)
              showToast(`"${deletingSpec.species_name}" deleted.`, 'success')
              setDeletingSpec(null); fetchAll()
            } catch {
              showToast('Failed to delete. It may be in use.', 'error')
              setDeletingSpec(null)
            }
          }}
          onCancel={() => setDeletingSpec(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Species Management"
      subtitle="Manage aquaculture species options and activity suggestions."
    >
      {innerContent}
    </PageLayout>
  )
}
