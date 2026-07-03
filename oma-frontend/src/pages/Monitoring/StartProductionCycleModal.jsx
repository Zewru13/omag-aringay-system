import { useState } from 'react'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const CULTURE_SYSTEMS = ['Fishpond','Fishcage','Fishpen','Oyster','Mussel','Seaweed','Other']

function StartProductionCycleModal({ onClose, onSuccess, fisherfolk: prefilledFf = null }) {
  const { showToast } = useToast()
  const [ffSearch, setFfSearch] = useState(prefilledFf ? prefilledFf.full_name : '')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(prefilledFf)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    cycle_name: '',
    species_farmed: '',
    culture_system: 'Fishpond',
    stocking_date: '',
    stocking_count: '',
    area_sqm: '',
    target_harvest_date: '',
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
      await api.post('/monitoring/aquaculture-cycles/', {
        fisherfolk: selectedFf.id,
        cycle_name: form.cycle_name,
        species_farmed: form.species_farmed,
        culture_system: form.culture_system,
        stocking_date: form.stocking_date,
        stocking_count: form.stocking_count ? parseInt(form.stocking_count) : null,
        area_sqm: form.area_sqm ? parseFloat(form.area_sqm) : null,
        target_harvest_date: form.target_harvest_date || null,
        notes: form.notes,
      })
      showToast('Production cycle started.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Failed to save.'
      showToast(detail, 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell title="Start Production Cycle" subtitle="Begin a new aquaculture production cycle" icon={Fish} onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        {prefilledFf ? (
          <FormField label="Fisherfolk">
            <p className="rounded-xl border border-[#C8E6D0] bg-[#EBF5EE] px-3 py-2 text-sm font-medium text-slate-800">
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
                    <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#EBF5EE]" onClick={() => { setSelectedFf(ff); setFfSearch(ff.full_name); setFfResults([]) }}>
                      <span className="font-medium">{ff.full_name}</span>
                      <span className="ml-2 text-slate-400">{ff.barangay}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {selectedFf && <p className="mt-1 text-xs text-[#1B4D2E]">Selected: {selectedFf.full_name}</p>}
          </FormField>
        )}

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Cycle Name" required>
            <input className={baseInputClasses} required value={form.cycle_name} onChange={e => set('cycle_name', e.target.value)} placeholder="e.g. Tilapia Cycle 2026-Q1" />
          </FormField>
          <FormField label="Species Farmed" required>
            <input className={baseInputClasses} required value={form.species_farmed} onChange={e => set('species_farmed', e.target.value)} />
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
