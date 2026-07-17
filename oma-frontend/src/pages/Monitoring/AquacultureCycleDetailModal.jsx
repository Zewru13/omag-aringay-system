import { useEffect, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'
const CYCLE_STATUS_TONES = { Active: 'green', Harvested: 'blue', Failed: 'rose', Abandoned: 'slate' }
const FEED_TYPE_OPTIONS = [
  'Commercial Pellets',
  'Floating Pellets',
  'Sinking Pellets',
  'Starter Feed',
  'Grower Feed',
  'Finisher Feed',
  'Rice Bran (Darak)',
  'Corn Bran',
  'Copra Meal',
  'Azolla',
  'Duckweed',
  'Fresh Fish',
  'Trash Fish',
  'Homemade Feed',
  'Mixed Feed',
  'Other',
]

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function InnerTabs({ tabs, active, onChange }) {
  return (
    <div className="flex gap-0 border-b border-slate-100 mb-4">
      {tabs.map(t => (
        <button
          key={t.value}
          type="button"
          onClick={() => onChange(t.value)}
          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
            active === t.value
              ? 'border-[#1E4620] text-[#1E4620]'
              : 'border-transparent text-slate-500 hover:text-slate-700'
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

function InfoField({ label, value }) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || '—'}</p>
    </div>
  )
}

function CycleInfoTab({ cycle, onRefresh }) {
  const { showToast } = useToast()
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    status: cycle.status,
    actual_harvest_date: cycle.actual_harvest_date || '',
    harvest_volume_kg: cycle.harvest_volume_kg || '',
    price_per_kg: cycle.price_per_kg || '',
    area_cage_harvested: cycle.area_cage_harvested || '',
    notes: cycle.notes || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await api.patch(`/monitoring/aquaculture-cycles/${cycle.id}/`, {
        ...form,
        harvest_volume_kg: form.harvest_volume_kg ? parseFloat(form.harvest_volume_kg) : null,
        price_per_kg: form.price_per_kg ? parseFloat(form.price_per_kg) : null,
        actual_harvest_date: form.actual_harvest_date || null,
        area_cage_harvested: form.area_cage_harvested || '',
      })
      showToast('Cycle updated.', 'success')
      setEditMode(false)
      onRefresh()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  if (editMode) {
    return (
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Status</label>
            <select className={baseInputClasses} value={form.status} onChange={e => setForm(f => ({...f, status: e.target.value}))}>
              {['Active','Harvested','Failed','Abandoned'].map(s => <option key={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Actual Harvest Date</label>
            <input type="date" className={baseInputClasses} value={form.actual_harvest_date} onChange={e => setForm(f => ({...f, actual_harvest_date: e.target.value}))} />
          </div>
          <div>
            <label className={labelCls}>Harvest Volume (kg)</label>
            <input type="number" step="0.01" className={baseInputClasses} value={form.harvest_volume_kg} onChange={e => setForm(f => ({...f, harvest_volume_kg: e.target.value}))} />
          </div>
          <div>
            <label className={labelCls}>Price per kg (₱)</label>
            <input type="number" step="0.01" className={baseInputClasses} value={form.price_per_kg} onChange={e => setForm(f => ({...f, price_per_kg: e.target.value}))} />
          </div>
          <div>
            <label className={labelCls}>Area / Cage Harvested</label>
            <input className={baseInputClasses} value={form.area_cage_harvested} onChange={e => setForm(f => ({...f, area_cage_harvested: e.target.value}))} placeholder="e.g. Pond 1 & 2, Cage A" />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Notes</label>
            <textarea className={baseInputClasses} rows={2} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <Button type="button" size="sm" variant="ghost" onClick={() => setEditMode(false)}>Cancel</Button>
          <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
        </div>
      </form>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button size="sm" variant="outline" onClick={() => setEditMode(true)}>Edit</Button>
      </div>
      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-3">
        <InfoField label="Fisherfolk" value={cycle.fisherfolk_name} />
        <InfoField label="Cycle Name" value={cycle.cycle_name} />
        <div>
          <p className="text-xs font-medium text-slate-400">Status</p>
          <div className="mt-0.5">
            <StatusPill tone={CYCLE_STATUS_TONES[cycle.status] || 'slate'}>{cycle.status}</StatusPill>
          </div>
        </div>
        <InfoField label="Species" value={cycle.species_display || cycle.species_farmed} />
        <InfoField label="Culture System" value={cycle.culture_system} />
        <InfoField label="Area" value={cycle.area_sqm ? `${cycle.area_sqm} sqm` : null} />
        <InfoField label="Stocking Date" value={formatDate(cycle.stocking_date)} />
        <InfoField label="Stocking Count" value={cycle.stocking_count ? `${Number(cycle.stocking_count).toLocaleString()} pcs` : null} />
        <InfoField label="Target Harvest" value={formatDate(cycle.target_harvest_date)} />
        <InfoField label="Actual Harvest" value={formatDate(cycle.actual_harvest_date)} />
        <InfoField label="Harvest Volume" value={cycle.harvest_volume_kg ? `${Number(cycle.harvest_volume_kg).toLocaleString()} kg` : null} />
        <InfoField label="Price/kg" value={cycle.price_per_kg ? `₱${Number(cycle.price_per_kg).toLocaleString()}` : null} />
        <InfoField label="Area/Cage Harvested" value={cycle.area_cage_harvested || null} />
        <div className="sm:col-span-3">
          <InfoField label="Notes" value={cycle.notes} />
        </div>
      </div>
    </div>
  )
}

function FeedingLogTab({ cycleId }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ feeding_date: '', feed_type: '', feed_type_other: '', quantity_kg: '', notes: '' })
  const [isSaving, setIsSaving] = useState(false)

  const fetch = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycleId}/feeding/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [cycleId])

  const handleAdd = async (e) => {
    e.preventDefault()

    if (!form.feeding_date) {
      showToast('Date is required.', 'error')
      return
    }

    if (!form.feed_type) {
      showToast('Feed Type is required.', 'error')
      return
    }

    if (form.feed_type === 'Other' && !form.feed_type_other.trim()) {
      showToast('Specify Feed Type is required.', 'error')
      return
    }

    if (!form.quantity_kg || Number(form.quantity_kg) <= 0) {
      showToast('Quantity (kg) must be greater than 0.', 'error')
      return
    }

    const normalizedFeedType = form.feed_type === 'Other'
      ? form.feed_type_other.trim()
      : form.feed_type

    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/feeding/`, {
        feeding_date: form.feeding_date,
        feed_type: normalizedFeedType,
        quantity_kg: parseFloat(form.quantity_kg),
        notes: form.notes,
      })
      showToast('Feeding log added.', 'success')
      setShowForm(false)
      setForm({ feeding_date: '', feed_type: '', feed_type_other: '', quantity_kg: '', notes: '' })
      fetch()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return
    try {
      await api.delete(`/monitoring/aquaculture-cycles/feeding/${id}/`)
      showToast('Deleted.', 'success')
      fetch()
    } catch { showToast('Failed.', 'error') }
  }

  const totalFeed = logs.reduce((s, l) => s + (parseFloat(l.quantity_kg) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} log{logs.length !== 1 ? 's' : ''}
          {totalFeed > 0 && ` · Total: ${totalFeed.toFixed(2)} kg`}
        </span>
        <Button size="sm" icon={Plus} onClick={() => setShowForm(v => !v)}>Log Feeding</Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-blue-100 bg-blue-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={baseInputClasses} required value={form.feeding_date} onChange={e => setForm(f => ({...f, feeding_date: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Feed Type *</label>
              <select
                className={baseInputClasses}
                required
                value={form.feed_type}
                onChange={e => {
                  const value = e.target.value
                  setForm(f => ({
                    ...f,
                    feed_type: value,
                    feed_type_other: value === 'Other' ? f.feed_type_other : '',
                  }))
                }}
              >
                <option value="">Select Feed Type</option>
                {FEED_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              {form.feed_type === 'Other' && (
                <input
                  className={`${baseInputClasses} mt-2`}
                  required
                  value={form.feed_type_other}
                  onChange={e => setForm(f => ({ ...f, feed_type_other: e.target.value }))}
                  placeholder="Specify Feed Type"
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Quantity (kg) *</label>
              <input type="number" step="0.01" min="0.01" className={baseInputClasses} required value={form.quantity_kg} onChange={e => setForm(f => ({...f, quantity_kg: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Notes</label>
              <input className={baseInputClasses} value={form.notes} onChange={e => setForm(f => ({...f, notes: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-400">No feeding logs.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {logs.map(l => (
            <li key={l.id} className="flex items-center justify-between gap-2 px-4 py-2.5">
              <div>
                <span className="text-sm font-medium text-slate-800">{l.feed_type}</span>
                <span className="ml-2 text-sm text-slate-600">{l.quantity_kg} kg</span>
                <span className="ml-2 text-xs text-slate-400">{formatDate(l.feeding_date)}</span>
                {l.notes && <span className="ml-2 text-xs text-slate-400">— {l.notes}</span>}
              </div>
              <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => handleDelete(l.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function HealthLogTab({ cycleId }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    log_date: '',
    observation: '',
    observation_other: '',
    mortality_count: '0',
    treatment_applied: '',
    treatment_applied_other: '',
    vet_consulted: false,
    notes: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const fetch = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycleId}/health/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [cycleId])

  const handleAdd = async (e) => {
    e.preventDefault()

    if (!form.observation) {
      showToast('Observation is required.', 'error')
      return
    }

    if (form.observation === 'Other' && !form.observation_other.trim()) {
      showToast('Specify Observation is required.', 'error')
      return
    }

    const isMortality = form.observation === 'Fish Mortality'
    if (isMortality && (!form.mortality_count || Number(form.mortality_count) <= 0)) {
      showToast('Mortality Count is required for Fish Mortality.', 'error')
      return
    }

    if (!isMortality && !form.treatment_applied) {
      showToast('Treatment is required for the selected observation.', 'error')
      return
    }

    const normalizedObservation = form.observation === 'Other'
      ? form.observation_other.trim()
      : form.observation

    const normalizedTreatmentApplied = isMortality
      ? 'Remove dead fish and disinfect pond'
      : form.treatment_applied

    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/health/`, {
        log_date: form.log_date,
        observation: normalizedObservation,
        mortality_count: isMortality ? (parseInt(form.mortality_count) || 0) : 0,
        treatment_applied: normalizedTreatmentApplied,
        vet_consulted: form.vet_consulted,
        notes: form.notes,
      })
      showToast('Health log added.', 'success')
      setShowForm(false)
      setForm({
        log_date: '',
        observation: '',
        observation_other: '',
        mortality_count: '0',
        treatment_applied: '',
        treatment_applied_other: '',
        vet_consulted: false,
        notes: '',
      })
      fetch()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return
    try {
      await api.delete(`/monitoring/aquaculture-cycles/health/${id}/`)
      showToast('Deleted.', 'success')
      fetch()
    } catch { showToast('Failed.', 'error') }
  }

  const totalMortality = logs.reduce((s, l) => s + (l.mortality_count || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} log{logs.length !== 1 ? 's' : ''}
          {totalMortality > 0 && <span style={{ color: '#c62828' }}> · {totalMortality} total mortality</span>}
        </span>
        <Button size="sm" icon={Plus} onClick={() => setShowForm(v => !v)}>Log Health</Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={baseInputClasses} required value={form.log_date} onChange={e => setForm(f => ({...f, log_date: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Observation *</label>
              <select
                className={baseInputClasses}
                required
                value={form.observation}
                onChange={e => {
                  const selectedObservation = e.target.value
                  const recommended = HEALTH_RECOMMENDED_TREATMENT[selectedObservation] || ''
                  const isMortality = selectedObservation === 'Fish Mortality'
                  setForm(f => ({
                    ...f,
                    observation: selectedObservation,
                    observation_other: selectedObservation === 'Other' ? f.observation_other : '',
                    mortality_count: isMortality ? (f.mortality_count && Number(f.mortality_count) > 0 ? f.mortality_count : '1') : '0',
                    treatment_applied: isMortality ? 'Remove dead fish and disinfect pond' : recommended,
                    treatment_applied_other: '',
                  }))
                }}
              >
                <option value="">Select Observation</option>
                {HEALTH_OBSERVATION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              {form.observation === 'Other' && (
                <input
                  className={`${baseInputClasses} mt-2`}
                  required
                  value={form.observation_other}
                  onChange={e => setForm(f => ({ ...f, observation_other: e.target.value }))}
                  placeholder="Specify Observation"
                />
              )}
            </div>
            {form.observation === 'Fish Mortality' && (
              <div>
                <label className={labelCls}>Mortality Count *</label>
                <input
                  type="number"
                  min="1"
                  className={baseInputClasses}
                  required
                  value={form.mortality_count}
                  onChange={e => setForm(f => ({ ...f, mortality_count: e.target.value }))}
                />
              </div>
            )}
            {form.observation && form.observation !== 'Fish Mortality' && (
              <div>
                <label className={labelCls}>Treatment *</label>
                <select
                  className={baseInputClasses}
                  value={form.treatment_applied}
                  required
                  onChange={e => setForm(f => ({ ...f, treatment_applied: e.target.value }))}
                >
                  <option value="">Select Treatment</option>
                  {HEALTH_TREATMENT_OPTIONS.map(option => (
                    <option key={option} value={option}>{option}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="flex items-center gap-2 pt-4">
              <input type="checkbox" id="vet" className="h-4 w-4 accent-green-600" checked={form.vet_consulted} onChange={e => setForm(f => ({...f, vet_consulted: e.target.checked}))} />
              <label htmlFor="vet" className={labelCls}>Vet Consulted</label>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-400">No health logs.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {logs.map(l => (
            <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{l.observation}</span>
                  {l.mortality_count > 0 && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#ffebee', color: '#c62828', fontWeight: 600 }}>
                      {l.mortality_count} dead
                    </span>
                  )}
                  {l.vet_consulted && <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#e3f2fd', color: '#1565c0', fontWeight: 600 }}>Vet</span>}
                </div>
                <p className="text-xs text-slate-500">{formatDate(l.log_date)}{l.treatment_applied && ` · ${l.treatment_applied}`}</p>
              </div>
              <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => handleDelete(l.id)}>
                <Trash2 size={14} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const HEALTH_OBSERVATION_OPTIONS = [
  'Fish Mortality',
  'Bacterial Infection',
  'Fungal Infection',
  'Fin Rot',
  'Gill Disease',
  'White Spot (Ich)',
  'Parasites',
  'Poor Water Quality',
  'Low Dissolved Oxygen',
  'Weak Swimming',
  'Feeding Issue',
  'Injury',
  'Predator Attack',
  'Other',
]

const HEALTH_RECOMMENDED_TREATMENT = {
  'Fish Mortality': 'Remove dead fish and disinfect pond',
  'Bacterial Infection': 'Oxytetracycline',
  'Fungal Infection': 'Salt Bath',
  'Fin Rot': 'Oxytetracycline',
  'Gill Disease': 'Improve water quality',
  'White Spot (Ich)': 'Salt Treatment',
  Parasites: 'Formalin Bath',
  'Poor Water Quality': 'Water Exchange',
  'Low Dissolved Oxygen': 'Increase Aeration',
  'Weak Swimming': 'Improve water quality, increase aeration, and closely observe affected fish.',
  'Feeding Issue': 'Adjust Feeding Schedule',
  Injury: 'Isolate Injured Fish',
  'Predator Attack': 'Install Protective Netting',
  Other: 'Manual Input',
}

const HEALTH_TREATMENT_OPTIONS = [
  'Oxytetracycline',
  'Salt Bath',
  'Improve water quality',
  'Salt Treatment',
  'Formalin Bath',
  'Water Exchange',
  'Increase Aeration',
  'Improve water quality, increase aeration, and closely observe affected fish.',
  'Adjust Feeding Schedule',
  'Isolate Injured Fish',
  'Install Protective Netting',
  'Manual Input',
]

/* const INPUT_TYPE_OPTIONS = [
  'Feed',
  'Fingerlings',
  'Fertilizer',
  'Lime',
  'Salt',
  'Probiotics',
  'Vitamins',
  'Water Treatment',
  'Medicine',
  'Disinfectant',
  'Fuel',
  'Electricity',
  'Equipment',
  'Labor',
  'Packaging Materials',
  'Ice',
  'Other',
]

const INPUT_ITEM_OPTIONS_BY_TYPE = {
  Feed: [
    'Commercial Pellets',
    'Floating Pellets',
    'Sinking Pellets',
    'Starter Feed',
    'Grower Feed',
    'Finisher Feed',
    'Rice Bran (Darak)',
    'Corn Bran',
    'Copra Meal',
    'Azolla',
    'Duckweed',
    'Homemade Feed',
    'Mixed Feed',
    'Other',
  ],
  Fingerlings: [
    'Tilapia Fingerlings',
    'Bangus Fry',
    'Catfish Fingerlings',
    'Carp Fingerlings',
    'Shrimp Post Larvae',
    'Mud Crab Juveniles',
    'Oyster Spat',
    'Mussel Seed',
    'Other',
  ],
  Fertilizer: ['Organic Fertilizer', 'Chicken Manure', 'Urea', 'Complete Fertilizer', 'Other'],
  Lime: ['Agricultural Lime', 'Hydrated Lime', 'Dolomite Lime', 'Other'],
  Salt: ['Rock Salt', 'Iodized Salt', 'Marine Salt', 'Other'],
  Probiotics: ['Pond Probiotics', 'Water Probiotics', 'Other'],
  Vitamins: ['Vitamin C', 'Multivitamins', 'Growth Enhancer', 'Other'],
  'Water Treatment': ['Zeolite', 'Water Conditioner', 'Chlorine', 'Other'],
  Medicine: ['Oxytetracycline', 'Amoxicillin', 'Antifungal Treatment', 'Antiparasitic Treatment', 'Other'],
  Disinfectant: ['Iodine', 'Bleaching Powder', 'Chlorine', 'Other'],
  Fuel: ['Diesel', 'Gasoline', 'Other'],
  Electricity: ['Electric Bill', 'Generator Power', 'Other'],
  Equipment: ['Aerator', 'Water Pump', 'Nets', 'Buckets', 'Hoses', 'Paddle', 'Other'],
  Labor: ['Pond Preparation', 'Feeding', 'Harvesting', 'Maintenance', 'Other'],
  'Packaging Materials': ['Plastic Bags', 'Styrofoam Box', 'Carton Box', 'Ice Box', 'Other'],
  Ice: ['Crushed Ice', 'Ice Block', 'Other'],
  Other: [],
}

const INPUT_UNIT_OPTIONS = [
  'kg',
  'g',
  'L',
  'mL',
  'sacks',
  'bags',
  'packs',
  'bottles',
  'boxes',
  'pieces',
  'sets',
  'rolls',
  'trays',
  'units',
  'gallons',
  'liters',
  'hours',
  'days',
  'Other',
]

const SUPPLIER_OPTIONS = [
  'BFAR',
  'LGU Aringay',
  'Department of Agriculture (DA)',
  'Provincial Government of La Union',
  'Local Agricultural Supply Store',
  'Local Feed Store',
  'Aquaculture Supply Store',
  'Fisheries Cooperative',
  'Fisherfolk Association',
  'Private Supplier',
  'Local Hatchery',
  'Commercial Hatchery',
  'Feed Distributor',
  'Veterinary Supply Store',
  'Online Supplier',
  'Self-Produced',
  'Other',
]

function InputsTab({ cycleId }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({
    input_type: '',
    input_type_other: '',
    item_name: '',
    item_name_other: '',
    quantity: '',
    unit: '',
    unit_other: '',
    date_acquired: '',
    cost: '',
    supplier: '',
    supplier_other: '',
    remarks: '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const fetch = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycleId}/inputs/`)
      setLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setLogs([]) } finally { setIsLoading(false) }
  }

  useEffect(() => { fetch() }, [cycleId])

  const handleAdd = async (e) => {
    e.preventDefault()

    if (!form.input_type) {
      showToast('Input Type is required.', 'error')
      return
    }
    if (form.input_type === 'Other' && !form.input_type_other.trim()) {
      showToast('Specify Input Type is required.', 'error')
      return
    }

    if (!form.item_name) {
      showToast('Item Name is required.', 'error')
      return
    }
    if (form.item_name === 'Other' && !form.item_name_other.trim()) {
      showToast('Specify Item Name is required.', 'error')
      return
    }

    if (!form.quantity || Number(form.quantity) <= 0) {
      showToast('Quantity must be greater than 0.', 'error')
      return
    }

    if (!form.unit) {
      showToast('Unit is required.', 'error')
      return
    }
    if (form.unit === 'Other' && !form.unit_other.trim()) {
      showToast('Specify Unit is required.', 'error')
      return
    }

    if (!form.date_acquired) {
      showToast('Date Acquired is required.', 'error')
      return
    }

    if (form.supplier === 'Other' && !form.supplier_other.trim()) {
      showToast('Specify Supplier is required.', 'error')
      return
    }

    if (form.cost !== '' && Number(form.cost) < 0) {
      showToast('Cost must not be negative.', 'error')
      return
    }

    const normalizedInputType = form.input_type === 'Other' ? form.input_type_other.trim() : form.input_type
    const normalizedItemName = form.item_name === 'Other' ? form.item_name_other.trim() : form.item_name
    const normalizedUnit = form.unit === 'Other' ? form.unit_other.trim() : form.unit
    const normalizedSupplier = form.supplier === 'Other' ? form.supplier_other.trim() : form.supplier

    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/inputs/`, {
        input_type: normalizedInputType,
        item_name: normalizedItemName,
        quantity: parseFloat(form.quantity),
        unit: normalizedUnit,
        date_acquired: form.date_acquired,
        cost: form.cost !== '' ? parseFloat(form.cost) : null,
        supplier: normalizedSupplier,
        remarks: form.remarks,
      })
      showToast('Input log added.', 'success')
      setShowForm(false)
      setForm({
        input_type: '',
        input_type_other: '',
        item_name: '',
        item_name_other: '',
        quantity: '',
        unit: '',
        unit_other: '',
        date_acquired: '',
        cost: '',
        supplier: '',
        supplier_other: '',
        remarks: '',
      })
      fetch()
    } catch { showToast('Failed to save.', 'error') }
    finally { setIsSaving(false) }
  }

  const handleDelete = async (id) => {
    if (!window.confirm('Delete?')) return
    try {
      await api.delete(`/monitoring/aquaculture-inputs/${id}/`)
      showToast('Deleted.', 'success')
      fetch()
    } catch { showToast('Failed.', 'error') }
  }

  const totalCost = logs.reduce((s, l) => s + (parseFloat(l.cost_php) || 0), 0)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} input{logs.length !== 1 ? 's' : ''}
          {totalCost > 0 && ` · Total cost: ₱${totalCost.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
        </span>
        <Button size="sm" icon={Plus} onClick={() => setShowForm(v => !v)}>Log Input</Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-teal-100 bg-teal-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Input Type *</label>
              <select
                className={baseInputClasses}
                required
                value={form.input_type}
                onChange={e => {
                  const nextInputType = e.target.value
                  setForm(f => ({
                    ...f,
                    input_type: nextInputType,
                    input_type_other: nextInputType === 'Other' ? f.input_type_other : '',
                    item_name: '',
                    item_name_other: '',
                  }))
                }}
              >
                <option value="">Select Input Type</option>
                {INPUT_TYPE_OPTIONS.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              {form.input_type === 'Other' && (
                <input
                  className={`${baseInputClasses} mt-2`}
                  required
                  value={form.input_type_other}
                  onChange={e => setForm(f => ({ ...f, input_type_other: e.target.value }))}
                  placeholder="Specify Input Type"
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Item Name *</label>
              <select
                className={baseInputClasses}
                required
                value={form.item_name}
                disabled={!form.input_type}
                onChange={e => {
                  const nextItemName = e.target.value
                  setForm(f => ({
                    ...f,
                    item_name: nextItemName,
                    item_name_other: nextItemName === 'Other' ? f.item_name_other : '',
                  }))
                }}
              >
                <option value="">{form.input_type ? 'Select Item Name' : 'Select Input Type first'}</option>
                {(INPUT_ITEM_OPTIONS_BY_TYPE[form.input_type] || []).map(option => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
              {form.item_name === 'Other' && (
                <input
                  className={`${baseInputClasses} mt-2`}
                  required
                  value={form.item_name_other}
                  onChange={e => setForm(f => ({ ...f, item_name_other: e.target.value }))}
                  placeholder="Specify Item Name"
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Quantity *</label>
              <input type="number" step="0.01" min="0.01" className={baseInputClasses} required value={form.quantity} onChange={e => setForm(f => ({...f, quantity: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Unit *</label>
              <select
                className={baseInputClasses}
                required
                value={form.unit}
                onChange={e => {
                  const nextUnit = e.target.value
                  setForm(f => ({
                    ...f,
                    unit: nextUnit,
                    unit_other: nextUnit === 'Other' ? f.unit_other : '',
                  }))
                }}
              >
                <option value="">Select Unit</option>
                {INPUT_UNIT_OPTIONS.map(u => <option key={u} value={u}>{u}</option>)}
              </select>
              {form.unit === 'Other' && (
                <input
                  className={`${baseInputClasses} mt-2`}
                  required
                  value={form.unit_other}
                  onChange={e => setForm(f => ({ ...f, unit_other: e.target.value }))}
                  placeholder="Specify Unit"
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Date Acquired *</label>
              <input type="date" className={baseInputClasses} required value={form.date_acquired} onChange={e => setForm(f => ({...f, date_acquired: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Cost (₱)</label>
              <input type="number" step="0.01" min="0" className={baseInputClasses} value={form.cost} onChange={e => setForm(f => ({...f, cost: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Supplier</label>
              <select
                className={baseInputClasses}
                value={form.supplier}
                onChange={e => {
                  const value = e.target.value
                  setForm(f => ({
                    ...f,
                    supplier: value,
                    supplier_other: value === 'Other' ? f.supplier_other : '',
                  }))
                }}
              >
                <option value="">Select Supplier (Optional)</option>
                {SUPPLIER_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
              {form.supplier === 'Other' && (
                <input
                  className={`${baseInputClasses} mt-2`}
                  required
                  value={form.supplier_other}
                  onChange={e => setForm(f => ({ ...f, supplier_other: e.target.value }))}
                  placeholder="Specify Supplier"
                />
              )}
            </div>
            <div>
              <label className={labelCls}>Remarks</label>
              <input className={baseInputClasses} value={form.remarks} onChange={e => setForm(f => ({...f, remarks: e.target.value}))} />
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => setShowForm(false)}>Cancel</Button>
            <Button type="submit" size="sm" isLoading={isSaving}>Save</Button>
          </div>
        </form>
      )}

      {isLoading ? <LoadingSpinner /> : logs.length === 0 ? (
        <p className="py-3 text-center text-sm italic text-slate-400">No input logs recorded.</p>
      ) : (
        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
          {logs.map(l => (
            <li key={l.id} className="flex items-start justify-between gap-2 px-4 py-2.5">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{l.item_name}</span>
                  <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#e0f2f1', color: '#00695c', fontWeight: 600 }}>{l.input_type}</span>
                </div>
                <p className="text-xs text-slate-500">
                  {l.quantity} {l.unit}
                  {(l.cost ?? l.cost_php) != null && (l.cost ?? l.cost_php) !== '' && ` · ₱${Number(l.cost ?? l.cost_php).toLocaleString()}`}
                  {` · ${formatDate(l.date_acquired)}`}
                  {(l.supplier || l.source) && ` · ${l.supplier || l.source}`}
                </p>
                {(l.remarks || l.notes) && <p className="text-xs text-slate-400">{l.remarks || l.notes}</p>}
              </div>
              <button type="button" className="text-slate-400 hover:text-rose-500" onClick={() => handleDelete(l.id)}>
                <Trash2 size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const SPECIES_SOLD_OPTIONS = [
  'Tilapia',
  'Bangus',
  'Catfish',
  'Carp',
  'Shrimp',
  'Prawn',
  'Mud Crab',
  'Oyster',
  'Mussel',
  'Seaweed',
  'Other',
]

function EconomicsTab({ cycle, onRefresh }) {
  const { showToast } = useToast()
  const [inputLogs, setInputLogs] = useState([])
  const [isLoadingInputs, setIsLoadingInputs] = useState(true)
  const [isSavingSales, setIsSavingSales] = useState(false)
  const [salesForm, setSalesForm] = useState({
    harvest_date: cycle.actual_harvest_date || '',
    species_sold: cycle.species_farmed || '',
    species_sold_other: '',
    quantity_sold_kg: cycle.harvest_volume_kg ? String(cycle.harvest_volume_kg) : '',
    price_per_kg: cycle.price_per_kg ? String(cycle.price_per_kg) : '',
  })

  useEffect(() => {
    setSalesForm({
      harvest_date: cycle.actual_harvest_date || '',
      species_sold: cycle.species_farmed || '',
      species_sold_other: '',
      quantity_sold_kg: cycle.harvest_volume_kg ? String(cycle.harvest_volume_kg) : '',
      price_per_kg: cycle.price_per_kg ? String(cycle.price_per_kg) : '',
    })
  }, [cycle])

  const fetchInputs = async () => {
    setIsLoadingInputs(true)
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${cycle.id}/inputs/`)
      setInputLogs(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch {
      setInputLogs([])
    } finally {
      setIsLoadingInputs(false)
    }
  }

  useEffect(() => { fetchInputs() }, [cycle.id])

  const quantity = parseFloat(salesForm.quantity_sold_kg)
  const price = parseFloat(salesForm.price_per_kg)
  const totalRevenueComputed = Number.isFinite(quantity) && Number.isFinite(price)
    ? quantity * price
    : 0

  const addCost = (a, b) => a + b
  const getLogCost = (l) => {
    const raw = l.cost ?? l.cost_php
    const n = parseFloat(raw)
    return Number.isFinite(n) ? n : 0
  }

  const costByCategory = inputLogs.reduce((acc, log) => {
    const type = (log.input_type || '').toLowerCase()
    const cost = getLogCost(log)

    if (type.includes('feed')) acc.feed += cost
    else if (type.includes('fingerling')) acc.fingerlings += cost
    else if (type.includes('medicine') || type.includes('medic')) acc.medicine += cost
    else if (type.includes('fertilizer') || type.includes('lime')) acc.fertilizer_lime += cost
    else if (type.includes('labor')) acc.labor += cost
    else if (type.includes('equipment')) acc.equipment += cost
    else acc.other += cost

    return acc
  }, {
    feed: 0,
    fingerlings: 0,
    medicine: 0,
    fertilizer_lime: 0,
    labor: 0,
    equipment: 0,
    other: 0,
  })

  const totalCost = Object.values(costByCategory).reduce(addCost, 0)
  const totalRevenue = totalRevenueComputed > 0
    ? totalRevenueComputed
    : (cycle.revenue_php != null ? Number(cycle.revenue_php) : 0)
  const netIncome = totalRevenue - totalCost
  const roi = totalCost > 0 ? (netIncome / totalCost) * 100 : null

  const costRows = [
    ['Feed cost', costByCategory.feed],
    ['Fingerlings cost', costByCategory.fingerlings],
    ['Medicine cost', costByCategory.medicine],
    ['Fertilizer/Lime cost', costByCategory.fertilizer_lime],
    ['Labor cost', costByCategory.labor],
    ['Equipment cost', costByCategory.equipment],
    ['Other input costs', costByCategory.other],
  ]

  const salesRows = (salesForm.harvest_date && salesForm.quantity_sold_kg && salesForm.price_per_kg)
    ? [{
        harvest_date: salesForm.harvest_date,
        species_sold: salesForm.species_sold || cycle.species_farmed || '—',
        quantity_sold_kg: Number(salesForm.quantity_sold_kg),
        price_per_kg: Number(salesForm.price_per_kg),
        total_revenue: totalRevenueComputed,
      }]
    : (cycle.actual_harvest_date && cycle.harvest_volume_kg && cycle.price_per_kg)
      ? [{
          harvest_date: cycle.actual_harvest_date,
          species_sold: cycle.species_farmed || '—',
          quantity_sold_kg: Number(cycle.harvest_volume_kg),
          price_per_kg: Number(cycle.price_per_kg),
          total_revenue: Number(cycle.revenue_php || (Number(cycle.harvest_volume_kg) * Number(cycle.price_per_kg))),
        }]
      : []

  const handleSaveSales = async (e) => {
    e.preventDefault()

    if (!salesForm.harvest_date) {
      showToast('Harvest Date is required.', 'error')
      return
    }

    if (!salesForm.species_sold) {
      showToast('Species Sold is required.', 'error')
      return
    }

    if (salesForm.species_sold === 'Other' && !salesForm.species_sold_other.trim()) {
      showToast('Specify Species Sold is required.', 'error')
      return
    }

    if (!salesForm.quantity_sold_kg || Number(salesForm.quantity_sold_kg) <= 0) {
      showToast('Quantity Sold must be greater than 0.', 'error')
      return
    }

    if (!salesForm.price_per_kg || Number(salesForm.price_per_kg) <= 0) {
      showToast('Price per kg must be greater than 0.', 'error')
      return
    }

    const normalizedSpeciesSold = salesForm.species_sold === 'Other'
      ? salesForm.species_sold_other.trim()
      : salesForm.species_sold

    setIsSavingSales(true)
    try {
      await api.patch(`/monitoring/aquaculture-cycles/${cycle.id}/`, {
        actual_harvest_date: salesForm.harvest_date,
        species_sold: normalizedSpeciesSold,
        harvest_volume_kg: parseFloat(salesForm.quantity_sold_kg),
        price_per_kg: parseFloat(salesForm.price_per_kg),
        revenue_php: totalRevenueComputed,
      })
      showToast('Economics sales data saved.', 'success')
      onRefresh()
    } catch {
      showToast('Failed to save economics data.', 'error')
    } finally {
      setIsSavingSales(false)
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={handleSaveSales} className="rounded-xl border border-emerald-100 bg-emerald-50 p-4 space-y-3">
        <p className="text-sm font-semibold text-emerald-800">Revenue / Sales</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Harvest Date *</label>
            <input
              type="date"
              className={baseInputClasses}
              required
              value={salesForm.harvest_date}
              onChange={e => setSalesForm(f => ({ ...f, harvest_date: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Species Sold *</label>
            <select
              className={baseInputClasses}
              required
              value={salesForm.species_sold}
              onChange={e => {
                const value = e.target.value
                setSalesForm(f => ({
                  ...f,
                  species_sold: value,
                  species_sold_other: value === 'Other' ? f.species_sold_other : '',
                }))
              }}
            >
              <option value="">Select Species Sold</option>
              {SPECIES_SOLD_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            {salesForm.species_sold === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`}
                required
                value={salesForm.species_sold_other}
                onChange={e => setSalesForm(f => ({ ...f, species_sold_other: e.target.value }))}
                placeholder="Specify Species Sold"
              />
            )}
          </div>
          <div>
            <label className={labelCls}>Quantity Sold (kg) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className={baseInputClasses}
              required
              value={salesForm.quantity_sold_kg}
              onChange={e => setSalesForm(f => ({ ...f, quantity_sold_kg: e.target.value }))}
            />
          </div>
          <div>
            <label className={labelCls}>Price per kg (₱) *</label>
            <input
              type="number"
              step="0.01"
              min="0.01"
              className={baseInputClasses}
              required
              value={salesForm.price_per_kg}
              onChange={e => setSalesForm(f => ({ ...f, price_per_kg: e.target.value }))}
            />
          </div>
          <div className="sm:col-span-2">
            <label className={labelCls}>Total Revenue (auto-computed)</label>
            <input
              className={baseInputClasses}
              value={totalRevenueComputed > 0 ? `₱${totalRevenueComputed.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : '—'}
              readOnly
            />
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" isLoading={isSavingSales}>Save Sales</Button>
        </div>
      </form>

      <div className="grid gap-3 rounded-xl bg-slate-50 p-4 sm:grid-cols-2">
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Total Revenue</p>
          <p className="text-xl font-bold text-[#1E4620]">
            {totalRevenue > 0 ? `₱${Number(totalRevenue).toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Total Cost</p>
          <p className="text-xl font-bold text-slate-800">
            {totalCost > 0 ? `₱${Number(totalCost).toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">Net Income</p>
          <p className={`text-xl font-bold ${totalRevenue > 0 || totalCost > 0 ? (netIncome >= 0 ? 'text-[#1E4620]' : 'text-rose-600') : 'text-slate-400'}`}>
            {totalRevenue > 0 || totalCost > 0 ? `₱${Number(netIncome).toLocaleString()}` : '—'}
          </p>
        </div>
        <div>
          <p className="text-xs font-medium text-slate-400 mb-2">ROI %</p>
          <p className={`text-xl font-bold ${roi != null ? (roi >= 0 ? 'text-[#1E4620]' : 'text-rose-600') : 'text-slate-400'}`}>
            {roi != null ? `${roi.toFixed(1)}%` : '—'}
          </p>
        </div>
      </div>

      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">Cost Breakdown</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Cost Item</th>
              <th className="px-4 py-2 text-right">Amount</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {costRows.map(([label, val]) => (
              <tr key={label}>
                <td className="px-4 py-2 text-slate-700">{label}</td>
                <td className="px-4 py-2 text-right text-slate-700">₱{Number(val).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
              </tr>
            ))}
            <tr className="bg-slate-50">
              <td className="px-4 py-2 font-semibold text-slate-800">Total</td>
              <td className="px-4 py-2 text-right font-semibold text-slate-800">₱{Number(totalCost).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-slate-100 overflow-hidden">
        <div className="bg-slate-50 px-4 py-2 text-xs font-semibold uppercase text-slate-500">Sales Table</div>
        <table className="min-w-full text-sm">
          <thead className="bg-white text-xs font-semibold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-2 text-left">Harvest Date</th>
              <th className="px-4 py-2 text-left">Species</th>
              <th className="px-4 py-2 text-right">Quantity Sold</th>
              <th className="px-4 py-2 text-right">Price per kg</th>
              <th className="px-4 py-2 text-right">Total Revenue</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-50">
            {salesRows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-4 text-center text-sm italic text-slate-400">No sales records yet.</td>
              </tr>
            ) : (
              salesRows.map((row, idx) => (
                <tr key={`${row.harvest_date}-${idx}`}>
                  <td className="px-4 py-2 text-slate-700">{formatDate(row.harvest_date)}</td>
                  <td className="px-4 py-2 text-slate-700">{row.species_sold}</td>
                  <td className="px-4 py-2 text-right text-slate-700">{Number(row.quantity_sold_kg).toLocaleString()} kg</td>
                  <td className="px-4 py-2 text-right text-slate-700">₱{Number(row.price_per_kg).toLocaleString()}</td>
                  <td className="px-4 py-2 text-right font-medium text-slate-800">₱{Number(row.total_revenue).toLocaleString(undefined, { maximumFractionDigits: 2 })}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {isLoadingInputs && <LoadingSpinner />}
    </div>
  )
} */

function AquacultureCycleDetailModal({ cycle, onClose, onRefresh }) {
  const [innerTab, setInnerTab] = useState('info')

  const INNER_TABS = [
    { label: 'Cycle Info', value: 'info' },
    { label: 'Feeding Log', value: 'feeding' },
    { label: 'Health Log', value: 'health' },
  ]

  return (
    <ModalShell title={`Cycle: ${cycle.cycle_name}`} onClose={onClose} maxWidth="max-w-3xl">
      <InnerTabs tabs={INNER_TABS} active={innerTab} onChange={setInnerTab} />

      {innerTab === 'info' && <CycleInfoTab cycle={cycle} onRefresh={onRefresh} />}
      {innerTab === 'feeding' && <FeedingLogTab cycleId={cycle.id} />}
      {innerTab === 'health' && <HealthLogTab cycleId={cycle.id} />}
    </ModalShell>
  )
}

export default AquacultureCycleDetailModal
