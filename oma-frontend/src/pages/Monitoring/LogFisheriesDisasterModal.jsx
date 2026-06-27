import { useState } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const DISASTER_TYPES = [
  'Typhoon', 'Flooding', 'Storm Surge', 'El Nino Drought', 'Red Tide', 'Disease Outbreak', 'Other',
]

function LogFisheriesDisasterModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [ffSearch, setFfSearch] = useState('')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    report_date: new Date().toISOString().slice(0, 10),
    disaster_type: 'Typhoon',
    affected_barangay: '',
    description: '',
    volume_lost_kg: '',
    equipment_damaged: '',
  })

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    if (!q) { setFfResults([]); return }
    try {
      const r = await api.get(`/fisheries/?search=${encodeURIComponent(q)}`)
      setFfResults(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setFfResults([]) }
  }

  const set = (field, value) => setForm(f => ({ ...f, [field]: value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFf) { showToast('Select a fisherfolk.', 'error'); return }
    if (!form.affected_barangay) { showToast('Select the affected barangay.', 'error'); return }
    setIsSubmitting(true)
    try {
      await api.post('/monitoring/disasters/', {
        fisherfolk: selectedFf.id,
        report_date: form.report_date,
        disaster_type: form.disaster_type,
        affected_barangay: form.affected_barangay,
        description: form.description,
        volume_lost_kg: form.volume_lost_kg ? parseFloat(form.volume_lost_kg) : null,
        equipment_damaged: form.equipment_damaged,
      })
      showToast('Disaster report submitted.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Failed to save.'
      showToast(detail, 'error')
    } finally { setIsSubmitting(false) }
  }

  return (
    <ModalShell title="Log Fisheries Disaster Report" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Fisherfolk">
          <SearchBar value={ffSearch} onChange={handleFfSearch} placeholder="Search fisherfolk…" />
          {ffResults.length > 0 && (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {ffResults.map(ff => (
                <li key={ff.id}>
                  <button type="button" className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]"
                    onClick={() => { setSelectedFf(ff); setFfSearch(ff.full_name); setFfResults([]) }}>
                    <span className="font-medium">{ff.full_name}</span>
                    <span className="ml-2 text-slate-400">{ff.fisherfolk_type} · {ff.barangay}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {selectedFf && <p className="mt-1 text-xs text-[#1E4620]">Selected: {selectedFf.full_name} ({selectedFf.fisherfolk_type})</p>}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Report Date" required>
            <input type="date" className={baseInputClasses} required value={form.report_date} onChange={e => set('report_date', e.target.value)} />
          </FormField>
          <FormField label="Disaster Type" required>
            <select className={baseInputClasses} value={form.disaster_type} onChange={e => set('disaster_type', e.target.value)}>
              {DISASTER_TYPES.map(d => <option key={d}>{d}</option>)}
            </select>
          </FormField>
          <FormField label="Affected Barangay" required>
            <BarangaySelect value={form.affected_barangay} onChange={e => set('affected_barangay', e.target.value)} />
          </FormField>
          <FormField label="Volume Lost (kg)">
            <input type="number" step="0.01" className={baseInputClasses} min="0" value={form.volume_lost_kg} onChange={e => set('volume_lost_kg', e.target.value)} />
          </FormField>
          <FormField label="Equipment Damaged">
            <input className={baseInputClasses} value={form.equipment_damaged} onChange={e => set('equipment_damaged', e.target.value)} placeholder="Boat, nets, cages…" />
          </FormField>
          <FormField label="Description" required className="sm:col-span-2">
            <textarea className={baseInputClasses} rows={3} required value={form.description} onChange={e => set('description', e.target.value)} />
          </FormField>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Submit Report</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default LogFisheriesDisasterModal
