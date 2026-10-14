import { useCallback, useEffect, useMemo, useState } from 'react'
import AddButton from '../../components/UI/AddButton.jsx'
import CardHeader from '../../components/UI/CardHeader.jsx'
import { ChevronLeft, ChevronRight, Pencil, Sprout, Trash2 } from 'lucide-react'
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

const PAGE_SIZE = 10

// Same real-source disagreement this project found for CropType's own
// growth-stage days (2026-09-19 research pass, Corn (Mais)) — the caution
// applies to any crop/variety here too: don't copy a number from a source
// that wasn't checked against this specific variety's real local behavior.
const GROWTH_STAGE_SOURCES_NOTE = (
  <>
    The one crop this project has real sourced research for so far (Corn (Mais)) shows real
    sources disagreeing by variety/region: DA Regional Field Office No. 2 (Cagayan Valley),
    <em> Corn Production Technoguide</em>, Rev. Ed. 2012; Transon et al. (2017),{' '}
    <em>Corn Crops in Bukidnon, Philippines</em> (citing Jamago 2017 &amp; Narreto 2016); and
    Amba et al., <em>Growth and Yield of Open Pollinated Young Corn... with Mykovam® Bio-fertilizer</em>
    {' '}(<em>IJSBAR</em>) gave three different day-ranges for the same crop. The same caution
    applies to this variety's own override — set it deliberately from real local knowledge of
    this specific variety, or leave it blank and let the crop type's own thresholds apply.
  </>
)

const COLUMNS = [
  { key: 'name',           label: 'VARIETY NAME' },
  { key: 'crop_type_disp', label: 'CROP' },
  { key: 'days_to_harvest_disp', label: 'GROWTH DURATION (DAYS)' },
  { key: 'status',         label: 'STATUS' },
  { key: 'actions',        label: 'ACTIONS' },
]

function CropVarietyModal({ variety, cropTypes, onClose, onSaved }) {
  const { showToast } = useToast()
  const isEdit = Boolean(variety)
  const original = {
    name: variety?.name || '',
    crop_type: variety?.crop_type || '',
    is_active: variety?.is_active ?? true,
    days_to_harvest: variety?.days_to_harvest ?? '',
    vegetative_start_day: variety?.vegetative_start_day ?? '',
    flowering_start_day:  variety?.flowering_start_day  ?? '',
    fruiting_start_day:   variety?.fruiting_start_day   ?? '',
    maturity_start_day:   variety?.maturity_start_day   ?? '',
  }
  const [form, setForm] = useState(original)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [nameError, setNameError] = useState('')
  const hasChanges = !isEdit || JSON.stringify(form) !== JSON.stringify(original)

  const set = (field, value) => {
    setForm(f => ({ ...f, [field]: value }))
    if (field === 'name' || field === 'crop_type') setNameError('')
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) { showToast('Variety name is required.', 'error'); return }
    const stageDays = [form.vegetative_start_day, form.flowering_start_day, form.fruiting_start_day, form.maturity_start_day]
    const stageDaysSet = stageDays.filter(d => d !== '')
    if (stageDaysSet.length > 0 && stageDaysSet.length < 4) {
      showToast('Set all four growth-stage days, or leave all four blank.', 'error'); return
    }
    if (stageDaysSet.length === 4) {
      const [veg, flo, fru, mat] = stageDaysSet.map(Number)
      if (!(veg < flo && flo < fru && fru < mat)) {
        showToast('Growth-stage days must increase: Vegetative < Flowering < Fruiting < Maturity.', 'error'); return
      }
    }
    setIsSubmitting(true)
    try {
      const payload = {
        ...form,
        crop_type: form.crop_type || null,
        days_to_harvest: form.days_to_harvest === '' ? null : parseInt(form.days_to_harvest, 10),
        vegetative_start_day: form.vegetative_start_day === '' ? null : form.vegetative_start_day,
        flowering_start_day:  form.flowering_start_day  === '' ? null : form.flowering_start_day,
        fruiting_start_day:   form.fruiting_start_day   === '' ? null : form.fruiting_start_day,
        maturity_start_day:   form.maturity_start_day   === '' ? null : form.maturity_start_day,
      }
      if (isEdit) {
        await api.patch(`/production/varieties/${variety.id}/`, payload)
      } else {
        await api.post('/production/varieties/', payload)
      }
      showToast(`Variety ${isEdit ? 'updated' : 'added'}.`, 'success')
      onSaved(); onClose()
    } catch (err) {
      const nameErr = err?.response?.data?.name?.[0]
      if (nameErr) {
        setNameError(nameErr)
      } else {
        showToast('Failed to save.', 'error')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell
      title={isEdit ? 'Edit Variety' : 'Add New Variety'}
      subtitle={isEdit ? `Update details for ${variety.name}` : 'Enter variety information below'}
      icon={Sprout}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="crop-variety-form" isLoading={isSubmitting} disabled={isSubmitting || !hasChanges}>
            {isEdit ? 'Update Variety' : '+ Add Variety'}
          </Button>
        </>
      }
    >
      <form id="crop-variety-form" onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Variety Name" required error={nameError}>
          <input
            className={baseInputClasses}
            value={form.name}
            onChange={e => set('name', e.target.value)}
            autoFocus
            placeholder="e.g. NSIC Rc222"
          />
        </FormField>
        <FormField label="Crop">
          <select className={baseInputClasses} value={form.crop_type} onChange={e => set('crop_type', e.target.value)}>
            <option value="">— General (not crop-specific) —</option>
            {cropTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </FormField>
        <FormField
          label="Growth Duration Override (Days)"
          hint="Leave blank to use the crop's own growth duration unchanged. Only set this when this specific variety genuinely matures faster or slower."
        >
          <input
            className={baseInputClasses}
            type="number"
            min="1"
            value={form.days_to_harvest}
            onChange={e => set('days_to_harvest', e.target.value)}
            placeholder="e.g. 70"
          />
        </FormField>

        <div className="rounded-xl border border-[#E2E8E2] bg-[#F9FAF9] p-3">
          <p className="mb-1 text-[12px] font-semibold text-[#1A2B1A]">Growth Stage Days Override (for input recommendation)</p>
          <p className="mb-2 text-[11px] text-[#7A8E7A]">
            Overrides the crop type's own growth-stage days for this variety. Leave all four blank to use the
            crop type's own thresholds unchanged.
          </p>
          <p className="mb-2 text-[11px] leading-[1.5] text-[#7A8E7A] italic">
            {GROWTH_STAGE_SOURCES_NOTE}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <FormField label="Vegetative">
              <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 10"
                value={form.vegetative_start_day} onChange={e => set('vegetative_start_day', e.target.value)} />
            </FormField>
            <FormField label="Flowering">
              <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 40"
                value={form.flowering_start_day} onChange={e => set('flowering_start_day', e.target.value)} />
            </FormField>
            <FormField label="Fruiting">
              <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 60"
                value={form.fruiting_start_day} onChange={e => set('fruiting_start_day', e.target.value)} />
            </FormField>
            <FormField label="Maturity">
              <input type="number" min="0" className={baseInputClasses} placeholder="e.g. 80"
                value={form.maturity_start_day} onChange={e => set('maturity_start_day', e.target.value)} />
            </FormField>
          </div>
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 accent-[#1B4D2E]"
            checked={form.is_active}
            onChange={e => set('is_active', e.target.checked)}
          />
          <span className="text-[13px] text-[#1A2B1A]">Active (visible in Add Crop dropdown)</span>
        </label>
      </form>
    </ModalShell>
  )
}

export default function CropVarietyPage({ asTab = false }) {
  const { showToast } = useToast()
  const [varieties,    setVarieties]    = useState([])
  const [cropTypes,    setCropTypes]    = useState([])
  const [isLoading,    setIsLoading]    = useState(true)
  const [error,        setError]        = useState('')
  const [showModal,    setShowModal]    = useState(false)
  const [editVariety,  setEditVariety]  = useState(null)
  const [deletingVariety, setDeletingVariety] = useState(null)
  const [page,         setPage]         = useState(1)

  const fetchAll = useCallback(async () => {
    setIsLoading(true); setError('')
    try {
      const [varRes, cropRes] = await Promise.all([
        api.get('/production/varieties/'),
        // is_active=true: this crop-types list only ever feeds the Add/Edit
        // Variety modal's crop-type select (a real choice for new/ongoing
        // work) — never a display or filter list — so a retired crop type
        // shouldn't be offered here.
        api.get('/production/crop-types/', { params: { is_active: 'true' } }),
      ])
      setVarieties(Array.isArray(varRes.data) ? varRes.data : (varRes.data.results || []))
      setCropTypes(Array.isArray(cropRes.data) ? cropRes.data : (cropRes.data.results || []))
    } catch {
      setError('Failed to load varieties.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchAll() }, [fetchAll])

  const totalPages = Math.max(1, Math.ceil(varieties.length / PAGE_SIZE))
  const paginated = useMemo(
    () => varieties.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [varieties, page],
  )

  const rows = paginated.map(v => ({
    ...v,
    crop_type_disp: v.crop_type_name || '— General —',
    days_to_harvest_disp: v.days_to_harvest != null
      ? <span className="font-medium text-[#1A2B1A]">{v.days_to_harvest}</span>
      : <span className="text-[#A8BCA8]">— (uses crop's own)</span>,
    status: (
      <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-medium ${
        v.is_active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'
      }`}>
        {v.is_active ? 'Active' : 'Inactive'}
      </span>
    ),
    actions: (
      <RowActions actions={[
        { key: 'edit', label: 'Edit', icon: Pencil, onClick: () => { setEditVariety(v); setShowModal(true) } },
        { key: 'delete', label: 'Delete', icon: Trash2, onClick: () => setDeletingVariety(v), tone: 'rose' },
      ]} />
    ),
  }))

  const actionBtn = <AddButton onClick={() => { setEditVariety(null); setShowModal(true) }}>Add Variety</AddButton>

  const innerContent = (
    <div className="space-y-4">
      {error && <ErrorMessage message={error} />}

      <div className="bg-white rounded-xl border border-[#E2E8E2] shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
        <CardHeader title="Varieties" count={varieties.length} action={actionBtn} />
        <DataTable bare columns={COLUMNS} data={rows} isLoading={isLoading} />
      </div>

      {!isLoading && totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-[12px] text-[#7A8E7A]">
            Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, varieties.length)} of {varieties.length}
          </p>
          <div className="flex items-center gap-1">
            <button type="button" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
              className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronLeft size={16} />
            </button>
            <span className="px-3 text-[13px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
            <button type="button" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}
              className="rounded-lg border border-[#E2E8E2] p-1.5 text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>
      )}

      {showModal && (
        <CropVarietyModal
          variety={editVariety}
          cropTypes={cropTypes}
          onClose={() => { setShowModal(false); setEditVariety(null) }}
          onSaved={fetchAll}
        />
      )}

      {deletingVariety && (
        <ConfirmDialog
          title="Delete Variety"
          message={`Delete "${deletingVariety.name}"? This will remove it from the Add Crop dropdown.`}
          confirmLabel="Delete"
          variant="danger"
          requireTypedConfirmation
          typedConfirmationText="DELETE"
          onConfirm={async () => {
            try {
              await api.delete(`/production/varieties/${deletingVariety.id}/`)
              showToast(`"${deletingVariety.name}" deleted.`, 'success')
              setDeletingVariety(null); fetchAll()
            } catch {
              showToast('Failed to delete variety.', 'error')
              setDeletingVariety(null)
            }
          }}
          onCancel={() => setDeletingVariety(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Crop Variety Management"
      subtitle="Manage crop varieties used across the system."
    >
      {innerContent}
    </PageLayout>
  )
}
