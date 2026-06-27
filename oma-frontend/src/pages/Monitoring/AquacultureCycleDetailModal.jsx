import { useCallback, useEffect, useMemo, useState } from 'react'
import { Plus, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import LoadingSpinner from '../../components/UI/LoadingSpinner.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'
const CYCLE_STATUS_TONES = { Active: 'green', Harvested: 'blue', Failed: 'rose', Abandoned: 'slate' }

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

function CycleInfoTab({ cycle, onRefresh }) {
  const { showToast } = useToast()
  const [editMode, setEditMode] = useState(false)
  const [form, setForm] = useState({
    status: cycle.status,
    actual_harvest_date: cycle.actual_harvest_date || '',
    harvest_volume_kg: cycle.harvest_volume_kg || '',
    area_cage_harvested: cycle.area_cage_harvested || '',
    notes: cycle.notes || '',
  })
  const [isSaving, setIsSaving] = useState(false)

  const Field = ({ label, value }) => (
    <div>
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-0.5 text-sm text-slate-800">{value || '—'}</p>
    </div>
  )

  const handleSave = async (e) => {
    e.preventDefault()
    setIsSaving(true)
    try {
      await api.patch(`/monitoring/aquaculture-cycles/${cycle.id}/`, {
        ...form,
        harvest_volume_kg: form.harvest_volume_kg ? parseFloat(form.harvest_volume_kg) : null,
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
        <Field label="Fisherfolk" value={cycle.fisherfolk_name} />
        <Field label="Cycle Name" value={cycle.cycle_name} />
        <div>
          <p className="text-xs font-medium text-slate-400">Status</p>
          <div className="mt-0.5">
            <StatusPill tone={CYCLE_STATUS_TONES[cycle.status] || 'slate'}>{cycle.status}</StatusPill>
          </div>
        </div>
        <Field label="Species" value={cycle.species_farmed} />
        <Field label="Culture System" value={cycle.culture_system} />
        <Field label="Area" value={cycle.area_sqm ? `${cycle.area_sqm} sqm` : null} />
        <Field label="Stocking Date" value={formatDate(cycle.stocking_date)} />
        <Field label="Stocking Count" value={cycle.stocking_count ? `${Number(cycle.stocking_count).toLocaleString()} pcs` : null} />
        <Field label="Target Harvest" value={formatDate(cycle.target_harvest_date)} />
        <Field label="Actual Harvest" value={formatDate(cycle.actual_harvest_date)} />
        <Field label="Harvest Volume" value={cycle.harvest_volume_kg ? `${Number(cycle.harvest_volume_kg).toLocaleString()} kg` : null} />
        <Field label="Area/Cage Harvested" value={cycle.area_cage_harvested || null} />
        <div className="sm:col-span-3">
          <Field label="Notes" value={cycle.notes} />
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
  const [form, setForm] = useState({ feeding_date: '', feed_type: '', quantity_kg: '', notes: '' })
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
    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/feeding/`, {
        ...form,
        quantity_kg: parseFloat(form.quantity_kg),
      })
      showToast('Feeding log added.', 'success')
      setShowForm(false)
      setForm({ feeding_date: '', feed_type: '', quantity_kg: '', notes: '' })
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
              <input className={baseInputClasses} required value={form.feed_type} onChange={e => setForm(f => ({...f, feed_type: e.target.value}))} placeholder="e.g. Pellets, Natural" />
            </div>
            <div>
              <label className={labelCls}>Quantity (kg) *</label>
              <input type="number" step="0.01" className={baseInputClasses} required value={form.quantity_kg} onChange={e => setForm(f => ({...f, quantity_kg: e.target.value}))} />
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

// ─── Health Log observation templates ────────────────────────────────────────

const HEALTH_OBSERVATIONS = [
  {
    label: 'Lethargy / Reduced Activity',
    treatments: ['Increase aeration', 'Check dissolved oxygen levels', 'Reduce stocking density'],
  },
  {
    label: 'Loss of Appetite',
    treatments: ['Check water quality parameters', 'Reduce feeding rate', 'Check for disease signs', 'Consult veterinarian'],
  },
  {
    label: 'Abnormal Swimming Behavior',
    treatments: ['Check for parasites', 'Test water quality', 'Add salt treatment (1–3 ppt)', 'Consult veterinarian'],
  },
  {
    label: 'Fin / Tail Rot',
    treatments: ['Apply antibiotic (Oxytetracycline)', 'Improve water quality', 'Salt treatment', 'Isolate affected fish'],
  },
  {
    label: 'Skin Lesions / Ulcers',
    treatments: ['Antibiotic treatment', 'Improve biosecurity', 'Reduce stress factors', 'Consult veterinarian'],
  },
  {
    label: 'Gill Discoloration / Swelling',
    treatments: ['Check ammonia and nitrite levels', 'Formalin bath treatment', 'Increase water flow', 'Consult veterinarian'],
  },
  {
    label: 'Bloating / Dropsy',
    treatments: ['Isolate affected fish', 'Antibiotic treatment', 'Reduce feeding', 'Consult veterinarian immediately'],
  },
  {
    label: 'Mortality / Fish Deaths',
    treatments: ['Remove dead fish immediately', 'Test water quality', 'Reduce stocking density', 'Consult veterinarian', 'Submit for necropsy'],
  },
  {
    label: 'Parasites / White Spots (Ich)',
    treatments: ['Malachite green treatment', 'Salt bath (3–5 ppt for 15 min)', 'Formalin treatment', 'Consult veterinarian'],
  },
  {
    label: 'Cloudy / Discolored Water',
    treatments: ['Partial water change (20–30%)', 'Check filtration system', 'Reduce feeding', 'Apply probiotic'],
  },
  {
    label: 'Algae Bloom',
    treatments: ['Reduce nutrient input', 'Increase water exchange', 'Apply algaecide (if approved)', 'Shade pond area'],
  },
]

function HealthLogTab({ cycleId }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [checkedObs, setCheckedObs] = useState([])
  const [form, setForm] = useState({
    log_date: new Date().toISOString().slice(0, 10),
    mortality_count: '0',
    treatment_applied: '',
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

  const toggleObs = (label) => {
    setCheckedObs(prev => prev.includes(label) ? prev.filter(x => x !== label) : [...prev, label])
  }

  const appendTreatment = (t) => {
    setForm(f => ({
      ...f,
      treatment_applied: f.treatment_applied
        ? `${f.treatment_applied}; ${t}`
        : t,
    }))
  }

  const suggestedTreatments = useMemo(() => {
    const all = new Set()
    HEALTH_OBSERVATIONS
      .filter(o => checkedObs.includes(o.label))
      .forEach(o => o.treatments.forEach(t => all.add(t)))
    return Array.from(all)
  }, [checkedObs])

  const handleAdd = async (e) => {
    e.preventDefault()
    if (checkedObs.length === 0) { showToast('Select at least one observation.', 'error'); return }
    if (!form.log_date) { showToast('Date is required.', 'error'); return }
    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/health/`, {
        log_date: form.log_date,
        observation: checkedObs.join('; '),
        mortality_count: parseInt(form.mortality_count) || 0,
        treatment_applied: form.treatment_applied,
        vet_consulted: form.vet_consulted,
        notes: form.notes,
      })
      showToast('Health log added.', 'success')
      setShowForm(false)
      setCheckedObs([])
      setForm({ log_date: new Date().toISOString().slice(0, 10), mortality_count: '0', treatment_applied: '', vet_consulted: false, notes: '' })
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
        <form onSubmit={handleAdd} className="rounded-xl border border-orange-100 bg-orange-50 p-4 space-y-4">
          {/* Date + Mortality */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Date *</label>
              <input type="date" className={baseInputClasses} required value={form.log_date}
                onChange={e => setForm(f => ({ ...f, log_date: e.target.value }))} />
            </div>
            <div>
              <label className={labelCls}>Mortality Count</label>
              <input type="number" min="0" className={baseInputClasses} value={form.mortality_count}
                onChange={e => setForm(f => ({ ...f, mortality_count: e.target.value }))} />
            </div>
          </div>

          {/* Observations checkboxes */}
          <div>
            <label className={labelCls + ' mb-2'}>Observations * (check all that apply)</label>
            <div className="grid gap-1.5 sm:grid-cols-2">
              {HEALTH_OBSERVATIONS.map(o => (
                <label key={o.label} className="flex cursor-pointer items-center gap-2 rounded-lg border border-transparent bg-white px-3 py-2 hover:border-orange-200">
                  <input type="checkbox" className="h-4 w-4 accent-orange-600 shrink-0"
                    checked={checkedObs.includes(o.label)}
                    onChange={() => toggleObs(o.label)} />
                  <span className="text-xs text-slate-700">{o.label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Suggested treatments */}
          {suggestedTreatments.length > 0 && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="mb-2 text-xs font-semibold text-amber-800">Suggested Treatments — click to append:</p>
              <div className="flex flex-wrap gap-1.5">
                {suggestedTreatments.map(t => (
                  <button key={t} type="button" onClick={() => appendTreatment(t)}
                    className="rounded-full border border-amber-300 bg-white px-2.5 py-1 text-[11px] font-medium text-amber-800 hover:bg-amber-100 transition-colors">
                    + {t}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Treatment Applied */}
          <div>
            <label className={labelCls}>Treatment Applied</label>
            <textarea className={baseInputClasses} rows={2} value={form.treatment_applied}
              onChange={e => setForm(f => ({ ...f, treatment_applied: e.target.value }))}
              placeholder="Click suggestions above or type manually..." />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Notes</label>
              <input className={baseInputClasses} value={form.notes}
                onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
            </div>
            <div className="flex items-center gap-2 pt-5">
              <input type="checkbox" id="vet_consulted" className="h-4 w-4 accent-green-600"
                checked={form.vet_consulted}
                onChange={e => setForm(f => ({ ...f, vet_consulted: e.target.checked }))} />
              <label htmlFor="vet_consulted" className={labelCls}>Vet Consulted</label>
            </div>
          </div>

          <div className="flex gap-2 justify-end">
            <Button type="button" size="sm" variant="ghost" onClick={() => { setShowForm(false); setCheckedObs([]) }}>Cancel</Button>
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
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-medium text-slate-800">{l.observation}</span>
                  {l.mortality_count > 0 && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#ffebee', color: '#c62828', fontWeight: 600 }}>
                      {l.mortality_count} dead
                    </span>
                  )}
                  {l.vet_consulted && (
                    <span style={{ fontSize: 10, padding: '1px 7px', borderRadius: 10, background: '#e3f2fd', color: '#1565c0', fontWeight: 600 }}>Vet</span>
                  )}
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

const INPUT_TYPES = ['Feed', 'Fingerlings/Seeds', 'Fertilizer', 'Chemicals', 'Equipment', 'Labor', 'Other']
const INPUT_UNITS = ['kg', 'g', 'L', 'mL', 'pcs', 'bags', 'boxes', 'other']

function InputsTab({ cycleId }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ input_type: 'Feed', item_name: '', quantity: '', unit: 'kg', date_acquired: '', source: '', notes: '' })
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
    setIsSaving(true)
    try {
      await api.post(`/monitoring/aquaculture-cycles/${cycleId}/inputs/`, {
        ...form,
        quantity: parseFloat(form.quantity),
      })
      showToast('Input log added.', 'success')
      setShowForm(false)
      setForm({ input_type: 'Feed', item_name: '', quantity: '', unit: 'kg', date_acquired: '', source: '', notes: '' })
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

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {logs.length} input{logs.length !== 1 ? 's' : ''}
        </span>
        <Button size="sm" icon={Plus} onClick={() => setShowForm(v => !v)}>Log Input</Button>
      </div>

      {showForm && (
        <form onSubmit={handleAdd} className="rounded-xl border border-teal-100 bg-teal-50 p-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={labelCls}>Input Type *</label>
              <select className={baseInputClasses} required value={form.input_type} onChange={e => setForm(f => ({...f, input_type: e.target.value}))}>
                {INPUT_TYPES.map(t => <option key={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Item Name *</label>
              <input className={baseInputClasses} required value={form.item_name} onChange={e => setForm(f => ({...f, item_name: e.target.value}))} placeholder="e.g. Tilapia feed, Lime" />
            </div>
            <div>
              <label className={labelCls}>Quantity *</label>
              <input type="number" step="0.01" min="0" className={baseInputClasses} required value={form.quantity} onChange={e => setForm(f => ({...f, quantity: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Unit *</label>
              <select className={baseInputClasses} required value={form.unit} onChange={e => setForm(f => ({...f, unit: e.target.value}))}>
                {INPUT_UNITS.map(u => <option key={u}>{u}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Date Acquired *</label>
              <input type="date" className={baseInputClasses} required value={form.date_acquired} onChange={e => setForm(f => ({...f, date_acquired: e.target.value}))} />
            </div>
            <div>
              <label className={labelCls}>Source</label>
              <input className={baseInputClasses} value={form.source} onChange={e => setForm(f => ({...f, source: e.target.value}))} placeholder="e.g. BFAR, Local supplier" />
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
                  {` · ${formatDate(l.date_acquired)}`}
                  {l.source && ` · ${l.source}`}
                </p>
                {l.notes && <p className="text-xs text-slate-400">{l.notes}</p>}
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

function AquacultureCycleDetailModal({ cycle, onClose, onRefresh }) {
  const [innerTab, setInnerTab] = useState('info')

  const INNER_TABS = [
    { label: 'Cycle Info',  value: 'info' },
    { label: 'Feeding Log', value: 'feeding' },
    { label: 'Health Log',  value: 'health' },
    { label: 'Inputs',      value: 'inputs' },
  ]

  return (
    <ModalShell title={`Cycle: ${cycle.cycle_name}`} onClose={onClose} maxWidth="max-w-3xl">
      <InnerTabs tabs={INNER_TABS} active={innerTab} onChange={setInnerTab} />

      {innerTab === 'info'    && <CycleInfoTab cycle={cycle} onRefresh={onRefresh} />}
      {innerTab === 'feeding' && <FeedingLogTab cycleId={cycle.id} />}
      {innerTab === 'health'  && <HealthLogTab cycleId={cycle.id} />}
      {innerTab === 'inputs'  && <InputsTab cycleId={cycle.id} />}
    </ModalShell>
  )
}

export default AquacultureCycleDetailModal
