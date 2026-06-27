import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Plus, Sprout, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const currentYear = new Date().getFullYear()

function detectSeason(dateStr) {
  if (!dateStr) return 'Wet'
  const month = new Date(dateStr).getMonth() + 1
  return (month >= 6 && month <= 11) ? 'Wet' : 'Dry'
}

const makeRecord = (n) => ({
  _id: n,
  crop_type: '',
  date_planted: '',
  area_planted_ha: '',
  season: detectSeason(''),
  variety_used: '',
  seed_source: '',
  quantity_of_seeds: '',
  seed_quantity_unit: 'kg',
})

function HarvestPreview({ cropTypes, cropTypeId, datePlanted }) {
  const preview = useMemo(() => {
    if (!cropTypeId || !datePlanted) return null
    const ct = cropTypes.find(c => String(c.id) === String(cropTypeId))
    if (!ct) return null
    const planted = new Date(datePlanted)
    const harvest = new Date(planted)
    harvest.setDate(harvest.getDate() + ct.days_to_harvest)
    return {
      date: harvest.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' }),
      days: ct.days_to_harvest,
      yield: ct.yield_per_ha_kg,
    }
  }, [cropTypes, cropTypeId, datePlanted])

  if (!preview) return null
  return (
    <div className="flex items-start gap-2 rounded-xl border border-[#c8e6c9] bg-[#f0f7f0] px-4 py-2.5">
      <AlertTriangle size={14} className="mt-0.5 shrink-0 text-[#1E4620]" />
      <div>
        <p className="text-xs font-semibold text-[#1E4620]">Expected Harvest: {preview.date}</p>
        <p className="text-[11px] text-[#2D6A31]">
          {preview.days} days growing period
          {preview.yield ? ` · Est. yield ref: ${Number(preview.yield).toLocaleString()} kg/ha` : ''}
        </p>
      </div>
    </div>
  )
}

function RecordSection({ rec, index, total, cropTypes, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(rec._id, field, value)

  const handleDatePlantedChange = (dateStr) => {
    set('date_planted', dateStr)
    set('season', detectSeason(dateStr))
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700">Crop Record {index + 1}</p>
        {total > 1 && (
          <button type="button" onClick={() => onRemove(rec._id)}
            className="flex items-center gap-1 text-xs font-medium text-rose-500 hover:text-rose-700">
            <Trash2 size={12} /> Remove
          </button>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Crop Type" required>
          <select className={baseInputClasses} value={rec.crop_type}
            onChange={e => set('crop_type', e.target.value)}>
            <option value="">Select crop type…</option>
            {cropTypes.map(ct => (
              <option key={ct.id} value={ct.id}>{ct.name} ({ct.days_to_harvest}d)</option>
            ))}
          </select>
        </FormField>

        <FormField label="Date Planted" required>
          <input type="date" className={baseInputClasses} value={rec.date_planted}
            onChange={e => handleDatePlantedChange(e.target.value)} />
        </FormField>

        <FormField label="Area Planted (ha)" required>
          <input type="number" step="0.01" min="0" className={baseInputClasses}
            placeholder="0.00"
            value={rec.area_planted_ha}
            onChange={e => set('area_planted_ha', e.target.value)} />
        </FormField>

        <FormField label="Cropping Season *">
          <select className={baseInputClasses} value={rec.season}
            onChange={e => set('season', e.target.value)}>
            <option value="Wet">Wet Season (Jun–Nov)</option>
            <option value="Dry">Dry Season (Dec–May)</option>
          </select>
        </FormField>
      </div>

      <HarvestPreview cropTypes={cropTypes} cropTypeId={rec.crop_type} datePlanted={rec.date_planted} />

      {/* Optional planting detail fields */}
      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Variety Used (optional)">
          <input type="text" className={baseInputClasses}
            placeholder="e.g. NSIC Rc222, F1 Hybrid"
            value={rec.variety_used}
            onChange={e => set('variety_used', e.target.value)} />
        </FormField>

        <FormField label="Seed Source (optional)">
          <select className={baseInputClasses} value={rec.seed_source}
            onChange={e => set('seed_source', e.target.value)}>
            <option value="">Select source</option>
            <option value="Own Seeds">Own Seeds</option>
            <option value="DA/LGU Provided">DA / LGU Provided</option>
            <option value="Commercial">Commercial</option>
            <option value="Association">Association</option>
            <option value="Other">Other</option>
          </select>
        </FormField>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField label="Quantity of Seeds (optional)">
          <input type="number" step="0.01" min="0" className={baseInputClasses}
            placeholder="e.g. 25"
            value={rec.quantity_of_seeds}
            onChange={e => set('quantity_of_seeds', e.target.value)} />
        </FormField>

        <FormField label="Unit">
          <select className={baseInputClasses} value={rec.seed_quantity_unit}
            onChange={e => set('seed_quantity_unit', e.target.value)}>
            <option value="kg">kg</option>
            <option value="bags">bags</option>
            <option value="pcs">pcs</option>
            <option value="bundles">bundles</option>
          </select>
        </FormField>
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

function AddCropMonitoringModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [cropTypes,    setCropTypes]    = useState([])
  const [associations, setAssociations] = useState([])
  const [association,  setAssociation]  = useState('')
  const [records,      setRecords]      = useState([makeRecord(1)])
  const [nextId,       setNextId]       = useState(2)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)
  const [error,        setError]        = useState('')

  useEffect(() => {
    api.get('/production/crop-types/').then(r => setCropTypes(Array.isArray(r.data) ? r.data : (r.data.results || [])))
    api.get('/associations/farmers/').then(r => setAssociations(Array.isArray(r.data) ? r.data : (r.data.results || [])))
  }, [])

  const addRecord = () => {
    setRecords(r => [...r, makeRecord(nextId)])
    setNextId(n => n + 1)
  }

  const removeRecord = (id) => setRecords(r => r.filter(x => x._id !== id))

  const updateRecord = (id, field, value) => {
    setRecords(r => r.map(x => x._id === id ? { ...x, [field]: value } : x))
  }

  const validate = () => {
    if (!association) { setError('Please select an association.'); return false }
    for (const rec of records) {
      const i = records.indexOf(rec) + 1
      if (!rec.crop_type)       { setError(`Record ${i}: Crop type is required.`); return false }
      if (!rec.date_planted)    { setError(`Record ${i}: Date planted is required.`); return false }
      if (!rec.area_planted_ha) { setError(`Record ${i}: Area planted is required.`); return false }
    }
    return true
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  const selectedAssoc = associations.find(a => String(a.id) === String(association))

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      for (const rec of records) {
        const datePlanted = new Date(rec.date_planted)
        const year = datePlanted.getFullYear()
        await api.post('/production/monitoring/', {
          farmers_association: association,
          crop_type:           rec.crop_type,
          season:              rec.season,
          year,
          date_planted:        rec.date_planted,
          area_planted_ha:     rec.area_planted_ha,
          variety_used:        rec.variety_used || '',
          seed_source:         rec.seed_source || '',
          quantity_of_seeds:   rec.quantity_of_seeds ? parseFloat(rec.quantity_of_seeds) : null,
          seed_quantity_unit:  rec.seed_quantity_unit || 'kg',
        })
      }
      showToast(`${records.length} crop monitoring record${records.length > 1 ? 's' : ''} added.`, 'success')
      onSuccess()
      onClose()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to save one or more records.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell title="Add New Crop" subtitle="Enter crop information below." icon={Sprout} onClose={onClose} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <FormField label="Farmer Association" required>
            <select className={baseInputClasses} value={association}
              onChange={e => setAssociation(e.target.value)}>
              <option value="">Select association…</option>
              {associations.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </FormField>

          {records.map((rec, i) => (
            <RecordSection
              key={rec._id}
              rec={rec}
              index={i}
              total={records.length}
              cropTypes={cropTypes}
              onUpdate={updateRecord}
              onRemove={removeRecord}
            />
          ))}

          <button type="button" onClick={addRecord}
            className="flex w-full items-center justify-center gap-1 rounded-xl border-2 border-dashed border-[#1E4620]/30 py-2.5 text-sm font-medium text-[#1E4620] transition hover:border-[#1E4620]/60">
            <Plus size={14} />
            + Add Another Crop Record
          </button>

          {error && (
            <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting}>
              Save {records.length} Record{records.length > 1 ? 's' : ''}
            </Button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message={`Are you sure you want to save ${records.length} crop record${records.length > 1 ? 's' : ''} for ${selectedAssoc?.name || 'selected association'}?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

export default AddCropMonitoringModal
