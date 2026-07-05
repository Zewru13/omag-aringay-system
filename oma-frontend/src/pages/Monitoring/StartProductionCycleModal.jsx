import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const CULTURE_SYSTEMS = ['Fishpond','Fishcage','Fishpen','Oyster','Mussel','Seaweed','Other']
const CULTURE_PHASE_OPTIONS = [
  'Nursery Phase',
  'Stocking Phase',
  'Grow-out Phase',
  'Harvest Phase',
  'Post-Harvest Phase',
  'Other',
]
const SPECIES_FARMED_OPTIONS = [
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

function StartProductionCycleModal({ onClose, onSuccess, fisherfolk: prefilledFf = null }) {
  const { showToast } = useToast()
  const [ffSearch, setFfSearch] = useState(prefilledFf ? prefilledFf.full_name : '')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(prefilledFf)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    cycle_name: '',
    cycle_name_other: '',
    species_farmed: '',
    species_farmed_other: '',
    culture_system: 'Fishpond',
    stocking_date: '',
    stocking_count: '',
    area_sqm: '',
    target_harvest_date: '',
    seed_cost_php: '',
    notes: '',
  })

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    if (!q) { setFfResults([]); return }
    try {
      const r = await api.get(`/fisheries/?search=${encodeURIComponent(q)}&type=Aquaculture,Mariculture`)
      setFfResults(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setFfResults([]) }
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFf) { showToast('Select an Aquaculture or Mariculture fisherfolk.', 'error'); return }
    setIsSubmitting(true)
    try {
      const normalizedCycleName = form.cycle_name === 'Other'
        ? form.cycle_name_other.trim()
        : form.cycle_name
      const normalizedSpeciesFarmed = form.species_farmed === 'Other'
        ? form.species_farmed_other.trim()
        : form.species_farmed

      await api.post('/monitoring/aquaculture-cycles/', {
        fisherfolk: selectedFf.id,
        cycle_name: normalizedCycleName,
        species_farmed: normalizedSpeciesFarmed,
        culture_system: form.culture_system,
        stocking_date: form.stocking_date,
        stocking_count: form.stocking_count ? parseInt(form.stocking_count) : null,
        area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
        target_harvest_date: form.target_harvest_date || null,
        seed_cost_php: form.seed_cost_php ? parseFloat(form.seed_cost_php) : null,
        notes: form.notes,
      })
      showToast('Production cycle started.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const data = err?.response?.data
      let message = 'Failed to save.'

      if (typeof data === 'string') {
        message = data
      } else if (Array.isArray(data)) {
        message = data.join(' ')
      } else if (data && typeof data === 'object') {
        if (typeof data.detail === 'string') {
          message = data.detail
        } else if (Array.isArray(data.detail)) {
          message = data.detail.join(' ')
        } else {
          const parts = []
          Object.entries(data).forEach(([field, value]) => {
            if (Array.isArray(value)) {
              parts.push(`${field}: ${value.join(' ')}`)
            } else if (typeof value === 'string') {
              parts.push(`${field}: ${value}`)
            }
          })
          if (parts.length > 0) {
            message = parts.join(' | ')
          }
        }
      }

      showToast(message, 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell title="Start Production Cycle" subtitle="Begin a new aquaculture production cycle" icon={Fish} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {prefilledFf ? (
          <FormField label="Fisherfolk">
            <p className="rounded-xl border border-green-200 bg-[#f0f7f0] px-3 py-2 text-sm font-medium text-slate-800">
              {prefilledFf.full_name} <span className="ml-2 text-xs text-slate-400">{prefilledFf.fisherfolk_type}</span>
            </p>
          </FormField>
        ) : (
          <FormField label="Fisherfolk (Aquaculture / Mariculture)">
            <SearchBar value={ffSearch} onChange={handleFfSearch} placeholder="Search aquaculture or mariculture fisherfolk…" />
            {ffResults.length > 0 && (
              <ul className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
                {ffResults.map(ff => (
                  <li key={ff.id}>
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]" onClick={() => { setSelectedFf(ff); setFfSearch(ff.full_name); setFfResults([]) }}>
                      <span className="font-medium">{ff.full_name}</span>
                      <span className="ml-2 text-slate-400">{ff.barangay}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedFf && <p className="mt-1 text-xs text-[#1E4620]">Selected: {selectedFf.full_name}</p>}
          </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Culture Phase" required>
            <select
              className={baseInputClasses}
              required
              value={form.cycle_name}
              onChange={e => {
                const value = e.target.value
                set('cycle_name', value)
                if (value !== 'Other') set('cycle_name_other', '')
              }}
            >
              <option value="">Select Culture Phase</option>
              {CULTURE_PHASE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            {form.cycle_name === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`}
                required
                value={form.cycle_name_other}
                onChange={e => set('cycle_name_other', e.target.value)}
                placeholder="Specify Culture Phase"
              />
            )}
          </FormField>
          <FormField label="Species Farmed" required>
            <select
              className={baseInputClasses}
              required
              value={form.species_farmed}
              onChange={e => {
                const value = e.target.value
                set('species_farmed', value)
                if (value !== 'Other') set('species_farmed_other', '')
              }}
            >
              <option value="">Select Species</option>
              {SPECIES_FARMED_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
            </select>
            {form.species_farmed === 'Other' && (
              <input
                className={`${baseInputClasses} mt-2`}
                required
                value={form.species_farmed_other}
                onChange={e => set('species_farmed_other', e.target.value)}
                placeholder="Specify Species"
              />
            )}
          </FormField>
          <FormField label="Culture System">
            <select className={baseInputClasses} value={form.culture_system} onChange={e => set('culture_system', e.target.value)}>
              {CULTURE_SYSTEMS.map(s => <option key={s}>{s}</option>)}
            </select>
          </FormField>
          <FormField label="Stocking Date" required>
            <input type="date" className={baseInputClasses} required value={form.stocking_date} onChange={e => set('stocking_date', e.target.value)} />
          </FormField>
          <FormField label="Stocking Count (pieces)">
            <input type="number" className={baseInputClasses} min="0" value={form.stocking_count} onChange={e => set('stocking_count', e.target.value)} />
          </FormField>
          <FormField label="Area (sq.m.)">
            <input type="number" step="0.01" className={baseInputClasses} min="0" value={form.area_sqm} onChange={e => set('area_sqm', e.target.value)} />
          </FormField>
          <FormField label="Target Harvest Date">
            <input type="date" className={baseInputClasses} value={form.target_harvest_date} onChange={e => set('target_harvest_date', e.target.value)} />
          </FormField>
          <FormField label="Seed/Fingerling Cost (₱)">
            <input type="number" step="0.01" className={baseInputClasses} min="0" value={form.seed_cost_php} onChange={e => set('seed_cost_php', e.target.value)} />
          </FormField>
          <FormField label="Notes" className="sm:col-span-2">
            <textarea className={baseInputClasses} rows={2} value={form.notes} onChange={e => set('notes', e.target.value)} />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Start Cycle</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default StartProductionCycleModal
