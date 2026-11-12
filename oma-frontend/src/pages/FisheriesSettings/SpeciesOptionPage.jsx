import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Fish, Pencil, Trash2, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { AddRowFooter, DraftActions, DraftInput, DraftSelect, useAddRow } from '../../components/UI/InlineAddRow.jsx'
import { newestFirst } from '../../utils/listOrder.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { SettingsFields, SettingsField, SettingsCell, FormRow } from '../../components/UI/SettingsFormTable.jsx'
import RowActions from '../../components/UI/RowActions.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

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
        <Button type="button" onClick={handleAddStage} disabled={addingStage} variant="primary" className="w-full">
          {addingStage ? 'Adding...' : '+ Add Stage'}
        </Button>
        {stageError && (
          <p className="text-xs text-rose-600">{stageError}</p>
        )}
      </div>
    </div>
  )
}

// ── Species Modal ─────────────────────────────────────────────────────────────

// Edit Species (all its details and activity suggestions). A new species is added in the table itself (the Add button under it) with
// the columns of the table; the growth-stage days can be set afterwards with Edit.
function SpeciesModal({ species, categories, onClose, onSaved }) {
  const { showToast } = useToast()
  const originalForm = {
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
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`species-edit:${species?.id}`)
  const [form,         setForm]         = useDraftField(draft, 'form', originalForm)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [pendingPayload, setPendingPayload] = useState(null)
  const [nameError,    setNameError]    = useState('')
  const hasChanges = JSON.stringify(form) !== JSON.stringify(originalForm)

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'species_name') setNameError('')
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (!form.species_name.trim())    { showToast('Species name is required.', 'error'); return }
    if (!form.culture_duration_days)  { showToast('Culture duration is required.', 'error'); return }
    // The server requires these three too (they used to be labelled optional, and saving without them failed with no reason).
    if (!form.category)                   { showToast('Choose a category.', 'error'); return }
    if (form.default_survival_rate_pct === '') { showToast('Default survival rate is required.', 'error'); return }
    if (form.default_avg_body_weight_kg === '') { showToast('Default average body weight is required.', 'error'); return }
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
      category:                   form.category,
      default_survival_rate_pct:  form.default_survival_rate_pct,
      default_avg_body_weight_kg: form.default_avg_body_weight_kg,
      fingerling_start_day:       form.fingerling_start_day === '' ? null : form.fingerling_start_day,
      juvenile_start_day:         form.juvenile_start_day   === '' ? null : form.juvenile_start_day,
      adult_start_day:            form.adult_start_day      === '' ? null : form.adult_start_day,
    })
  }

  const handleConfirm = async () => {
    setIsSubmitting(true)
    try {
      await api.patch(`/fisheries/species/${species.id}/`, pendingPayload)
      showToast('Species updated.', 'success')
      draft.clear()
      onSaved(); onClose()
    } catch (err) {
      const nameErr = err?.response?.data?.species_name?.[0]
      if (nameErr) {
        setNameError(nameErr)
      } else {
        // Say what the server refused instead of a bare "Failed": its detail, or the first field it named.
        const data = err?.response?.data
        const field = data && typeof data === 'object' ? Object.entries(data).find(([, v]) => Array.isArray(v) && v[0]) : null
        showToast(data?.detail || (field ? `${field[0].replace(/_/g, ' ')}: ${field[1][0]}` : 'Failed to save species.'), 'error')
      }
    } finally {
      setIsSubmitting(false)
      setPendingPayload(null)
    }
  }

  return (
    <>
      <ModalShell
        title="Edit Species"
        subtitle={`Update details for ${species.species_name}`}
        icon={Fish}
        onClose={onClose}
        maxWidth="max-w-xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" form="species-option-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
              Update Species
            </Button>
          </>
        }
      >
        <form id="species-option-form" onSubmit={handleSubmit} className="space-y-3">
          <DraftBanner draft={draft} />
          <SettingsFields title="Species">
            <SettingsField label="Species Name" required error={nameError}>
              <input
                className={baseInputClasses}
                placeholder="e.g. Tilapia"
                value={form.species_name}
                onChange={e => set('species_name', e.target.value)}
                autoFocus
              />
            </SettingsField>
            <FormRow>
              <SettingsCell label="Category" required>
                <select
                  className={baseInputClasses}
                  aria-label="Category"
                  value={form.category}
                  onChange={e => set('category', e.target.value)}
                >
                  <option value="" disabled>Select category…</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </SettingsCell>
              <SettingsCell label="Culture Environment" required>
                <select
                  className={baseInputClasses}
                  aria-label="Culture Environment"
                  value={form.culture_environment}
                  onChange={e => set('culture_environment', e.target.value)}
                >
                  <option value="Freshwater">Freshwater</option>
                  <option value="Brackishwater">Brackishwater</option>
                  <option value="Marine">Marine</option>
                </select>
              </SettingsCell>
            </FormRow>
            <FormRow>
              <SettingsCell label="Culture Duration (days)" required>
                <input
                  type="number"
                  min="1"
                  className={baseInputClasses}
                  aria-label="Culture Duration (days)"
                  placeholder="e.g. 120"
                  value={form.culture_duration_days}
                  onChange={e => set('culture_duration_days', e.target.value)}
                />
              </SettingsCell>
            </FormRow>
            <FormRow>
              <SettingsCell label="Default Survival Rate (%)" required>
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  className={baseInputClasses}
                  aria-label="Default Survival Rate (%)"
                  placeholder="e.g. 80.00"
                  value={form.default_survival_rate_pct}
                  onChange={e => set('default_survival_rate_pct', e.target.value)}
                />
              </SettingsCell>
              <SettingsCell label="Default Avg Body Weight (kg)" required>
                <input
                  type="number"
                  min="0"
                  step="0.001"
                  className={baseInputClasses}
                  aria-label="Default Avg Body Weight (kg)"
                  placeholder="e.g. 0.250"
                  value={form.default_avg_body_weight_kg}
                  onChange={e => set('default_avg_body_weight_kg', e.target.value)}
                />
              </SettingsCell>
            </FormRow>
          </SettingsFields>

          <SettingsFields
            title="Growth Stage Days"
            note={<p>Day after stocking each stage begins (used for the feed recommendation). Leave all three blank if not yet known — growth-stage feed recommendation just won't be offered for this species until they're set.</p>}
          >
            <FormRow>
              <SettingsCell label="Fingerling">
                <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 15" aria-label="Fingerling"
                  value={form.fingerling_start_day} onChange={e => set('fingerling_start_day', e.target.value)} />
              </SettingsCell>
              <SettingsCell label="Juvenile">
                <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 45" aria-label="Juvenile"
                  value={form.juvenile_start_day} onChange={e => set('juvenile_start_day', e.target.value)} />
              </SettingsCell>
            </FormRow>
            <FormRow>
              <SettingsCell label="Adult">
                <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 90" aria-label="Adult"
                  value={form.adult_start_day} onChange={e => set('adult_start_day', e.target.value)} />
              </SettingsCell>
            </FormRow>
          </SettingsFields>
        </form>

        <SuggestionsSection speciesId={species.id} />
      </ModalShell>

      {pendingPayload && (
        <ConfirmDialog variant="primary"
          title="Confirm Action"
          message={`Save changes to "${pendingPayload.species_name}"?`}
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
  const [editSpecies,   setEditSpecies]   = useState(null)
  const add = useAddRow({ species_name: '', category: '', culture_environment: 'Freshwater', culture_duration_days: '', default_survival_rate_pct: '', default_avg_body_weight_kg: '' }, 'species')
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
    if (!sortKey) list = newestFirst(list)
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

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated  = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const saveDraft = async () => {
    const d = add.draft
    if (!d.species_name.trim()) { showToast('Type the species name first.', 'error'); return }
    if (!d.category) { showToast('Choose a category.', 'error'); return }
    if (!d.culture_duration_days) { showToast('Culture duration is required.', 'error'); return }
    if (d.default_survival_rate_pct === '') { showToast('Default survival rate is required.', 'error'); return }
    if (d.default_avg_body_weight_kg === '') { showToast('Default average body weight is required.', 'error'); return }
    add.setIsSaving(true)
    try {
      await api.post('/fisheries/species/', {
        ...EMPTY_FORM, ...d, species_name: d.species_name.trim(),
        fingerling_start_day: null, juvenile_start_day: null, adult_start_day: null,
      })
      showToast('Species added.', 'success')
      add.close()
      await fetchAll()
    } catch (err) {
      const data = err?.response?.data
      const field = data && typeof data === 'object' ? Object.entries(data).find(([, v]) => Array.isArray(v) && v[0]) : null
      showToast(data?.detail || (field ? `${field[0].replace(/_/g, ' ')}: ${field[1][0]}` : 'Failed to save species.'), 'error')
    } finally {
      add.setIsSaving(false)
    }
  }
  const startRow = () => { setPage(1); add.open() }

  const innerContent = (
    <div className="space-y-3">
      {error && <ErrorMessage message={error} />}


      <FilterPanel
        className=""
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1) }}
        searchPlaceholder="Search species..."
      />

      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <table className="min-w-full text-sm max-md:block">
          <thead className="bg-[#1B4D2E] text-white max-md:hidden">
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
          <tbody className="max-md:block">
            {/* The new row sits at the top of the table, on the first page (newest first). */}
            {!isLoading && add.isOpen && page === 1 && (
              <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9] max-md:block max-md:px-3 max-md:py-2">
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftInput value={add.draft.species_name} aria-label="New species name" placeholder="e.g. Tilapia"
                    onChange={e => add.change({ species_name: e.target.value })} onSave={saveDraft} onCancel={add.close} />
                </td>
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftSelect value={add.draft.category} aria-label="Category" onChange={e => add.change({ category: e.target.value })}>
                    <option value="">— Select —</option>
                    {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </DraftSelect>
                </td>
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftSelect value={add.draft.culture_environment} aria-label="Environment" onChange={e => add.change({ culture_environment: e.target.value })}>
                    <option value="Freshwater">Freshwater</option>
                    <option value="Brackishwater">Brackishwater</option>
                    <option value="Marine">Marine</option>
                  </DraftSelect>
                </td>
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftInput type="number" min="1" value={add.draft.culture_duration_days} aria-label="Culture duration in days" placeholder="e.g. 120"
                    onChange={e => add.change({ culture_duration_days: e.target.value })} onSave={saveDraft} onCancel={add.close} />
                </td>
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftInput type="number" min="0" max="100" step="any" value={add.draft.default_survival_rate_pct} aria-label="Survival rate in percent" placeholder="e.g. 80"
                    onChange={e => add.change({ default_survival_rate_pct: e.target.value })} onSave={saveDraft} onCancel={add.close} />
                </td>
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftInput type="number" min="0" step="any" value={add.draft.default_avg_body_weight_kg} aria-label="Average weight in kg" placeholder="e.g. 0.25"
                    onChange={e => add.change({ default_avg_body_weight_kg: e.target.value })} onSave={saveDraft} onCancel={add.close} />
                </td>
                <td className="px-4 py-[11px] max-md:block max-md:w-full max-md:px-0 max-md:py-1">
                  <DraftActions onSave={saveDraft} onCancel={add.close} isSaving={add.isSaving} />
                </td>
              </tr>
            )}
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-[#F0F4F0] animate-pulse">
                  {COLUMNS.map(col => <td key={col.key} className="px-4 py-[13px]"><div className="h-4 bg-[#E8EEE8] rounded w-3/4" /></td>)}
                </tr>
              ))
            ) : paginated.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length} className="max-md:block py-10 text-center text-[13px] text-[#7A8E7A] italic">
                  No species found.
                </td>
              </tr>
            ) : (
              paginated.map(s => (
                <tr key={s.id} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] transition-colors max-md:block max-md:px-3 max-md:py-2">
                  <td className="px-4 py-[11px] text-[13px] text-[#1A2B1A] font-medium max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] ">{s.species_name}</td>
                  <td data-label="Category" className="px-4 py-[11px] text-[13px] text-[#4A5E4A] max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]">{s.category_name || '—'}</td>
                  <td data-label="Environment" className="px-4 py-[11px] text-[13px] text-[#4A5E4A] max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]">{s.culture_environment}</td>
                  <td data-label="Culture duration (days)" className="px-4 py-[11px] text-[13px] text-[#4A5E4A] max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]">{s.culture_duration_days}</td>
                  <td data-label="Survival %" className="px-4 py-[11px] text-[13px] text-[#4A5E4A] max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]">
                    {s.default_survival_rate_pct ? `${Number(s.default_survival_rate_pct).toFixed(1)}%` : '—'}
                  </td>
                  <td data-label="Avg weight (kg)" className="px-4 py-[11px] text-[13px] text-[#4A5E4A] max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]">
                    {s.default_avg_body_weight_kg ? Number(s.default_avg_body_weight_kg).toFixed(3) : '—'}
                  </td>
                  <td className="px-4 py-[11px] max-md:block max-md:px-0 max-md:py-1">
                    <RowActions actions={[
                      { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => setEditSpecies(s) },
                      { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingSpec(s), tone: 'rose' },
                    ]} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        {!isLoading && <AddRowFooter onClick={startRow} disabled={add.isOpen} label="Add Species" />}
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

      {editSpecies && (
        <SpeciesModal
          species={editSpecies}
          categories={categories}
          onClose={() => setEditSpecies(null)}
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
