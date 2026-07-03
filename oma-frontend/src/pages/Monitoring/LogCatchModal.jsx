import { useState, useCallback } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const emptySpeciesRow = () => ({ species_name: '', volume_kg: '', notes: '' })

function LogCatchModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [ffSearch, setFfSearch] = useState('')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    trip_date: '',
    return_date: '',
    fishing_ground: '',
    gear_used: '',
    remarks: '',
  })
  const [speciesRows, setSpeciesRows] = useState([emptySpeciesRow()])

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    if (!q) { setFfResults([]); return }
    try {
      const r = await api.get(`/fisheries/?search=${encodeURIComponent(q)}&type=Capture,Inland`)
      setFfResults(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setFfResults([]) }
  }

  const handleSelectFf = (ff) => {
    setSelectedFf(ff)
    setFfResults([])
    setFfSearch(ff.full_name)
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const updateSpeciesRow = useCallback((index, field, value) => {
    setSpeciesRows(rows => rows.map((r, i) => i === index ? { ...r, [field]: value } : r))
  }, [])

  const addSpeciesRow = () => setSpeciesRows(rows => [...rows, emptySpeciesRow()])

  const removeSpeciesRow = (index) => {
    setSpeciesRows(rows => rows.filter((_, i) => i !== index))
  }

  const totalCatch = speciesRows.reduce((sum, r) => sum + (parseFloat(r.volume_kg) || 0), 0)
  const validSpeciesRows = speciesRows.filter(r => r.species_name.trim() && r.volume_kg)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFf) { showToast('Select a fisherfolk.', 'error'); return }
    if (!form.trip_date || !form.fishing_ground || !form.gear_used) {
      showToast('Fill in all required fields.', 'error'); return
    }
    if (validSpeciesRows.length === 0) {
      showToast('Add at least one species entry.', 'error'); return
    }
    setIsSubmitting(true)
    try {
      // Create the trip (total_catch_kg will be set by species entries)
      const tripRes = await api.post('/monitoring/fishing-trips/', {
        fisherfolk: selectedFf.id,
        ...form,
        return_date: form.return_date || null,
      })
      const tripId = tripRes.data.id

      // Post each species entry
      await Promise.all(
        validSpeciesRows.map(row =>
          api.post(`/monitoring/fishing-trips/${tripId}/species/`, {
            species_name: row.species_name.trim(),
            volume_kg: row.volume_kg,
            notes: row.notes || '',
          })
        )
      )

      showToast('Catch log saved.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      const detail = err?.response?.data?.detail || err?.response?.data?.non_field_errors?.[0] || 'Failed to save.'
      showToast(detail, 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Log Fishing Trip / Catch" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Fisherfolk (Capture / Inland Fishery)">
          <SearchBar
            value={ffSearch}
            onChange={handleFfSearch}
            placeholder="Search by name or LGU number…"
          />
          {ffResults.length > 0 && (
            <ul className="mt-1 max-h-36 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {ffResults.map((ff) => (
                <li key={ff.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#EBF5EE]"
                    onClick={() => handleSelectFf(ff)}
                  >
                    <span className="font-medium">{ff.full_name}</span>
                    <span className="ml-2 text-slate-400">{ff.fisherfolk_type}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Trip Date" required>
            <input
              type="date"
              className={baseInputClasses}
              value={form.trip_date}
              onChange={(e) => set('trip_date', e.target.value)}
            />
          </FormField>
          <FormField label="Return Date">
            <input
              type="date"
              className={baseInputClasses}
              value={form.return_date}
              onChange={(e) => set('return_date', e.target.value)}
            />
          </FormField>
          <FormField label="Fishing Ground" required>
            <input
              type="text"
              className={baseInputClasses}
              value={form.fishing_ground}
              onChange={(e) => set('fishing_ground', e.target.value)}
            />
          </FormField>
          <FormField label="Gear Used" required>
            <input
              type="text"
              className={baseInputClasses}
              value={form.gear_used}
              onChange={(e) => set('gear_used', e.target.value)}
            />
          </FormField>
        </div>

        {/* Species Breakdown */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Species Breakdown *</span>
            {totalCatch > 0 && (
              <span className="text-xs text-slate-500">
                Total: <b>{totalCatch.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</b>
              </span>
            )}
          </div>

          <div className="space-y-2">
            {speciesRows.map((row, i) => (
              <div key={i} className="grid gap-2 items-end" style={{ gridTemplateColumns: '2fr 1fr auto' }}>
                <div>
                  {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Species Name</label>}
                  <input
                    type="text"
                    className={baseInputClasses}
                    placeholder="e.g. Bangus, Tilapia"
                    value={row.species_name}
                    onChange={e => updateSpeciesRow(i, 'species_name', e.target.value)}
                  />
                </div>
                <div>
                  {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Volume (kg)</label>}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={baseInputClasses}
                    placeholder="0.00"
                    value={row.volume_kg}
                    onChange={e => updateSpeciesRow(i, 'volume_kg', e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeSpeciesRow(i)}
                  disabled={speciesRows.length === 1}
                  className="text-slate-400 hover:text-red-500 disabled:opacity-30 pb-1 px-1"
                  title="Remove row"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={addSpeciesRow}
            className="mt-2 text-sm text-[#1B4D2E] hover:text-green-900 font-medium"
          >
            + Add Species
          </button>
        </div>

        <FormField label="Remarks">
          <textarea
            className={baseInputClasses}
            rows={2}
            value={form.remarks}
            onChange={(e) => set('remarks', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting}>Save Log</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default LogCatchModal
