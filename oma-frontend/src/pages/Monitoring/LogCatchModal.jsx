import { useState, useCallback, useEffect, useMemo } from 'react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const FISHING_GROUND_OPTIONS = [
  'Beach',
  'Municipal Waters',
  'Coastal Waters',
  'Nearshore Waters',
  'Offshore Waters',
  'Open Sea',
  'River',
  'Lake',
  'Fishpond',
  'Fish Cage Area',
  'Fish Pen Area',
  'Mangrove Area',
  'Estuary',
  'Brackish Water',
  'Freshwater Area',
  'Irrigation Canal',
  'Reservoir',
  'Other',
]

const GEAR_USED_OPTIONS = [
  'Hook and Line',
  'Gill Net',
  'Cast Net',
  'Fish Trap',
  'Crab Trap',
  'Spear Fishing',
  'Long Line',
  'Seine Net',
  'Lift Net',
  'Handline',
  'Multiple Hook and Line',
  'Net',
  'Other',
]

const SPECIES_NAME_OPTIONS = [
  'Bangus',
  'Tilapia',
  'Galunggong',
  'Tamban',
  'Tulingan',
  'Maya-maya',
  'Lapu-lapu',
  'Dalagang Bukid',
  'Alumahan',
  'Bisugo',
  'Hito',
  'Dalag',
  'Hipon',
  'Alimango',
  'Tahong',
  'Talaba',
  'Squid',
  'Other',
]

const emptySpeciesRow = () => ({
  species_name: '',
  species_name_other: '',
  volume_kg: '',
  estimated_value_php: '',
  notes: '',
})

function LogCatchModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [ffSearch, setFfSearch] = useState('')
  const [ffResults, setFfResults] = useState([])
  const [selectedFf, setSelectedFf] = useState(null)
  const [isDropdownOpen, setIsDropdownOpen] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [form, setForm] = useState({
    trip_date: '',
    return_date: '',
    fishing_ground: '',
    fishing_ground_other: '',
    gear_used: '',
    gear_used_other: '',
    remarks: '',
  })
  const [speciesRows, setSpeciesRows] = useState([emptySpeciesRow()])

  useEffect(() => {
    let mounted = true
    const loadFisherfolk = async () => {
      try {
        const r = await api.get('/fisheries/fisherfolk/')
        const rows = Array.isArray(r.data) ? r.data : (r.data.results || [])
        if (mounted) {
          setFfResults(rows.filter((ff) => ff.fisherfolk_type === 'Capture' || ff.fisherfolk_type === 'Inland'))
        }
      } catch {
        if (mounted) {
          setFfResults([])
        }
      }
    }
    loadFisherfolk()
    return () => { mounted = false }
  }, [])

  const filteredFisherfolk = useMemo(() => {
    const q = ffSearch.trim().toLowerCase()
    if (!q) return ffResults
    return ffResults.filter((ff) => {
      const fullName = (ff.full_name || '').toLowerCase()
      const firstName = (ff.first_name || '').toLowerCase()
      const middleName = (ff.middle_name || '').toLowerCase()
      const lastName = (ff.last_name || '').toLowerCase()
      const lgu = (ff.lgu_registration_number || '').toLowerCase()
      return (
        fullName.includes(q)
        || firstName.includes(q)
        || middleName.includes(q)
        || lastName.includes(q)
        || `${firstName} ${middleName} ${lastName}`.replace(/\s+/g, ' ').trim().includes(q)
        || `${firstName} ${lastName}`.trim().includes(q)
        || `${lastName} ${firstName}`.trim().includes(q)
        || lgu.includes(q)
      )
    })
  }, [ffResults, ffSearch])

  const handleFfSearch = async (q) => {
    setFfSearch(q)
    setIsDropdownOpen(true)
    const normalized = q.trim()
    try {
      const endpoint = normalized
        ? `/fisheries/fisherfolk/?search=${encodeURIComponent(normalized)}`
        : '/fisheries/fisherfolk/'
      const r = await api.get(endpoint)
      const rows = Array.isArray(r.data) ? r.data : (r.data.results || [])
      setFfResults(rows.filter((ff) => ff.fisherfolk_type === 'Capture' || ff.fisherfolk_type === 'Inland'))
    } catch {
      setFfResults([])
    }
  }

  const handleSelectFf = (ff) => {
    setSelectedFf(ff)
    setFfSearch(ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim())
    setIsDropdownOpen(false)
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const updateSpeciesRow = useCallback((index, field, value) => {
    setSpeciesRows((rows) => rows.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }, [])

  const addSpeciesRow = () => setSpeciesRows((rows) => [...rows, emptySpeciesRow()])

  const removeSpeciesRow = (index) => {
    setSpeciesRows((rows) => rows.filter((_, i) => i !== index))
  }

  const totalCatch = speciesRows.reduce((sum, r) => sum + (parseFloat(r.volume_kg) || 0), 0)
  const totalValue = speciesRows.reduce((sum, r) => sum + (parseFloat(r.estimated_value_php) || 0), 0)
  const validSpeciesRows = speciesRows.filter((r) => {
    const speciesName = r.species_name === 'Other' ? r.species_name_other.trim() : r.species_name.trim()
    const volume = parseFloat(r.volume_kg)
    return Boolean(speciesName) && Number.isFinite(volume) && volume > 0
  })

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!selectedFf) { showToast('Select a fisherfolk.', 'error'); return }
    if (!form.trip_date || !form.fishing_ground || !form.gear_used) {
      showToast('Fill in all required fields.', 'error'); return
    }

    if (form.fishing_ground === 'Other' && !form.fishing_ground_other.trim()) {
      showToast('Specify Fishing Ground.', 'error'); return
    }

    if (form.gear_used === 'Other' && !form.gear_used_other.trim()) {
      showToast('Specify Gear Used.', 'error'); return
    }
    if (validSpeciesRows.length === 0) {
      showToast('Add at least one species entry.', 'error'); return
    }
    setIsSubmitting(true)
    try {
      const tripRes = await api.post('/fisheries/fishing-trips/', {
        fisherfolk: selectedFf.id,
        trip_date: form.trip_date,
        return_date: form.return_date || null,
        fishing_ground: form.fishing_ground === 'Other'
          ? form.fishing_ground_other.trim()
          : form.fishing_ground,
        gear_used: form.gear_used === 'Other'
          ? form.gear_used_other.trim()
          : form.gear_used,
        remarks: form.remarks,
      })
      const tripId = tripRes.data.id

      await Promise.all(
        validSpeciesRows.map((row) => {
          const speciesName = row.species_name === 'Other'
            ? row.species_name_other.trim()
            : row.species_name.trim()

          return api.post(`/fisheries/fishing-trips/${tripId}/species/`, {
            species_name: speciesName,
            volume_kg: row.volume_kg,
            estimated_value_php: row.estimated_value_php || null,
            notes: row.notes || '',
          })
        }),
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
          {isDropdownOpen && (
            <ul className="mt-1 max-h-44 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {filteredFisherfolk.length > 0 ? (
                filteredFisherfolk.map((ff) => (
                  <li key={ff.id}>
                    <button
                      type="button"
                      className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]"
                      onClick={() => handleSelectFf(ff)}
                    >
                      <span className="font-medium">{ff.full_name || `${ff.first_name || ''} ${ff.last_name || ''}`.trim()}</span>
                      <span className="ml-2 text-slate-400">({ff.lgu_registration_number})</span>
                      <span className="ml-2 text-slate-400">{ff.fisherfolk_type}</span>
                    </button>
                  </li>
                ))
              ) : (
                <li className="px-4 py-2.5 text-sm text-slate-500">No fisherfolk found</li>
              )}
            </ul>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Trip Date" required>
            <input
              type="date"
              className={baseInputClasses}
              value={form.trip_date}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => set('trip_date', e.target.value)}
            />
          </FormField>
          <FormField label="Return Date">
            <input
              type="date"
              className={baseInputClasses}
              value={form.return_date}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => set('return_date', e.target.value)}
            />
          </FormField>
          <FormField label="Fishing Ground" required>
            <ComboboxWithOther
              options={FISHING_GROUND_OPTIONS.filter(o => o !== 'Other')}
              value={form.fishing_ground}
              otherValue={form.fishing_ground_other}
              onChange={(v) => set('fishing_ground', v)}
              onOtherChange={(v) => set('fishing_ground_other', v)}
              placeholder="Select Fishing Ground"
            />
          </FormField>
          <FormField label="Gear Used" required>
            <ComboboxWithOther
              options={GEAR_USED_OPTIONS.filter(o => o !== 'Other')}
              value={form.gear_used}
              otherValue={form.gear_used_other}
              onChange={(v) => set('gear_used', v)}
              onOtherChange={(v) => set('gear_used_other', v)}
              placeholder="Select Gear Used"
            />
          </FormField>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-semibold text-slate-700">Species Breakdown *</span>
            {totalCatch > 0 && (
              <span className="text-xs text-slate-500">
                Total: <b>{totalCatch.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</b>
                {totalValue > 0 && <> | ₱<b>{totalValue.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></>}
              </span>
            )}
          </div>

          <div className="space-y-2">
            {speciesRows.map((row, i) => (
              <div key={i} className="grid gap-2 items-end" style={{ gridTemplateColumns: '2fr 1fr 1fr auto' }}>
                <div>
                  {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Species Name</label>}
                  <ComboboxWithOther
                    options={SPECIES_NAME_OPTIONS.filter(o => o !== 'Other')}
                    value={row.species_name}
                    otherValue={row.species_name_other || ''}
                    onChange={(v) => updateSpeciesRow(i, 'species_name', v)}
                    onOtherChange={(v) => updateSpeciesRow(i, 'species_name_other', v)}
                    placeholder="Select Species"
                  />
                </div>
                <div>
                  {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Volume (kg)</label>}
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className={baseInputClasses}
                    placeholder="0.00"
                    value={row.volume_kg}
                    onChange={(e) => updateSpeciesRow(i, 'volume_kg', e.target.value)}
                  />
                </div>
                <div>
                  {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Est. Value (₱)</label>}
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    className={baseInputClasses}
                    placeholder="Optional"
                    value={row.estimated_value_php}
                    onChange={(e) => updateSpeciesRow(i, 'estimated_value_php', e.target.value)}
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
            className="mt-2 text-sm text-[#1E4620] hover:text-green-900 font-medium"
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
