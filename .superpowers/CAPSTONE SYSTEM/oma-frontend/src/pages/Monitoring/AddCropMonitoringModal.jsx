import { useEffect, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const SEASON_OPTIONS = ['Dry', 'Wet']

function AddCropMonitoringModal({ onClose, onSuccess }) {
  const { showToast } = useToast()
  const [cropTypes, setCropTypes] = useState([])
  const [farmerSearch, setFarmerSearch] = useState('')
  const [farmerResults, setFarmerResults] = useState([])
  const [selectedFarmer, setSelectedFarmer] = useState(null)
  const [parcels, setParcels] = useState([])
  const [isLoadingParcels, setIsLoadingParcels] = useState(false)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [errors, setErrors] = useState({})

  const [form, setForm] = useState({
    farm_parcel: '',
    crop_type: '',
    season: 'Dry',
    year: new Date().getFullYear(),
    date_planted: '',
    area_planted_ha: '',
    notes: '',
  })

  useEffect(() => {
    api.get('/production/crop-types/').then((r) => setCropTypes(r.data))
  }, [])

  const handleFarmerSearch = async (q) => {
    setFarmerSearch(q)
    if (!q) { setFarmerResults([]); return }
    try {
      const r = await api.get(`/farmers/?search=${encodeURIComponent(q)}`)
      setFarmerResults(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setFarmerResults([]) }
  }

  const handleSelectFarmer = async (farmer) => {
    setSelectedFarmer(farmer)
    setFarmerResults([])
    setFarmerSearch(farmer.full_name || `${farmer.first_name} ${farmer.last_name}`)
    setForm((f) => ({ ...f, farm_parcel: '' }))
    setIsLoadingParcels(true)
    try {
      const r = await api.get(`/farmers/${farmer.id}/`)
      setParcels(r.data.farm_parcels || [])
    } catch { setParcels([]) }
    finally { setIsLoadingParcels(false) }
  }

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }))

  const validate = () => {
    const e = {}
    if (!form.farm_parcel) e.farm_parcel = 'Select a farm parcel'
    if (!form.crop_type) e.crop_type = 'Select a crop type'
    if (!form.date_planted) e.date_planted = 'Date planted is required'
    if (!form.area_planted_ha) e.area_planted_ha = 'Area is required'
    return e
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    const errs = validate()
    if (Object.keys(errs).length) { setErrors(errs); return }
    setIsSubmitting(true)
    try {
      await api.post('/production/monitoring/', {
        ...form,
        year: Number(form.year),
        area_planted_ha: form.area_planted_ha,
      })
      showToast('Crop monitoring record added.', 'success')
      onSuccess()
      onClose()
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to save record.', 'error')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Add Crop Monitoring Record" onClose={onClose} maxWidth="max-w-2xl">
      <form onSubmit={handleSubmit} className="space-y-4">
        <FormField label="Search Farmer">
          <SearchBar
            value={farmerSearch}
            onChange={handleFarmerSearch}
            placeholder="Search by name or RSBSA…"
          />
          {farmerResults.length > 0 && (
            <ul className="mt-1 max-h-40 overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-lg">
              {farmerResults.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="w-full px-4 py-2.5 text-left text-sm hover:bg-[#f0f7f0]"
                    onClick={() => handleSelectFarmer(f)}
                  >
                    <span className="font-medium">{f.full_name}</span>
                    <span className="ml-2 text-slate-400">{f.barangay}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Farm Parcel" required error={errors.farm_parcel}>
            <select
              className={baseInputClasses}
              value={form.farm_parcel}
              onChange={(e) => set('farm_parcel', e.target.value)}
              disabled={!parcels.length}
            >
              <option value="">Select parcel…</option>
              {parcels.map((p) => (
                <option key={p.id} value={p.id}>
                  Parcel {p.parcel_number} — {p.area_hectares} ha
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Crop Type" required error={errors.crop_type}>
            <select
              className={baseInputClasses}
              value={form.crop_type}
              onChange={(e) => set('crop_type', e.target.value)}
            >
              <option value="">Select crop type…</option>
              {cropTypes.map((ct) => (
                <option key={ct.id} value={ct.id}>
                  {ct.name} ({ct.days_to_harvest}d)
                </option>
              ))}
            </select>
          </FormField>

          <FormField label="Season" required>
            <select className={baseInputClasses} value={form.season} onChange={(e) => set('season', e.target.value)}>
              {SEASON_OPTIONS.map((s) => <option key={s}>{s}</option>)}
            </select>
          </FormField>

          <FormField label="Year" required>
            <input
              type="number"
              className={baseInputClasses}
              value={form.year}
              onChange={(e) => set('year', e.target.value)}
              min={2000}
              max={2100}
            />
          </FormField>

          <FormField label="Date Planted" required error={errors.date_planted}>
            <input
              type="date"
              className={baseInputClasses}
              value={form.date_planted}
              onChange={(e) => set('date_planted', e.target.value)}
            />
          </FormField>

          <FormField label="Area Planted (ha)" required error={errors.area_planted_ha}>
            <input
              type="number"
              step="0.01"
              min="0"
              className={baseInputClasses}
              value={form.area_planted_ha}
              onChange={(e) => set('area_planted_ha', e.target.value)}
            />
          </FormField>
        </div>

        {selectedFarmer && !isLoadingParcels && parcels.length === 0 && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
            <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-500" />
            <span>
              This farmer has no registered farm parcels. Please{' '}
              <strong>add a farm parcel</strong> to their profile before creating a monitoring record.
            </span>
          </div>
        )}

        <FormField label="Notes">
          <textarea
            className={baseInputClasses}
            rows={2}
            value={form.notes}
            onChange={(e) => set('notes', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="submit" isLoading={isSubmitting} disabled={isSubmitting || (selectedFarmer && !isLoadingParcels && parcels.length === 0)}>Save Record</Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddCropMonitoringModal
