import { useState } from 'react'
import { Sprout } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import FormField, { baseInputClasses } from '../../components/UI/FormField.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'

const labelCls = 'block text-xs font-medium text-slate-600'

const SEED_SOURCE_OPTIONS = ['Own Seeds', 'DA/LGU Provided', 'Commercial', 'Organization', 'Other']
const SEEDS_UNIT_OPTIONS = ['kg', 'bags', 'pcs', 'bundles']

const CROP_OPTIONS = [
  'Palay (Rice)', 'Corn (Mais)', 'Onion', 'Garlic', 'Tomato',
  'Eggplant (Talong)', 'Bitter Gourd (Ampalaya)', 'String Beans (Sitaw)',
  'Pechay', 'Cabbage', 'Mango', 'Cacao (Kakaw)', 'Banana (Saging)',
  'Coffee (Kape)', 'Cassava', 'Sweet Potato (Kamote)',
  'Other Vegetables', 'Other Fruits', 'Other Root Crops', 'Cash Crops', 'Other',
]

const currentYear = new Date().getFullYear()
const yearOptions = []
for (let y = 2022; y <= currentYear; y++) yearOptions.push(y)

function AddPlantingRecordModal({ onClose, onSuccess }) {
  const [searchQuery, setSearchQuery] = useState('')
  const [farmers, setFarmers] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedFarmer, setSelectedFarmer] = useState(null)
  const [parcels, setParcels] = useState([])
  const [isLoadingParcels, setIsLoadingParcels] = useState(false)
  const [selectedParcel, setSelectedParcel] = useState('')
  const [form, setForm] = useState({
    season: 'Dry',
    year: currentYear.toString(),
    crop_name: CROP_OPTIONS[0],
    area_planted_hectares: '',
    date_planted: '',
    seedling_type: '',
    variety_used: '',
    seed_source: '',
    quantity_of_seeds_kg: '',
    remarks: '',
  })
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  const update = (field, value) => setForm((p) => ({ ...p, [field]: value }))

  const handleSearch = async (query) => {
    setSearchQuery(query)
    setSelectedFarmer(null)
    setSelectedParcel('')
    setError('')
    if (!query.trim()) { setFarmers([]); return }
    setIsSearching(true)
    try {
      const response = await api.get(`/farmers/?search=${encodeURIComponent(query)}`)
      setFarmers(Array.isArray(response.data) ? response.data : (response.data?.results || []))
    } catch {
      setError('Unable to search farmers.')
    } finally {
      setIsSearching(false)
    }
  }

  const handleSelectFarmer = async (farmer) => {
    setSelectedFarmer(farmer)
    setSelectedParcel('')
    setFarmers([])
    setSearchQuery('')
    setIsLoadingParcels(true)
    try {
      const res = await api.get(`/farmers/${farmer.id}/`)
      setParcels(res.data.farm_parcels || [])
    } catch {
      setError('Unable to load farm parcels.')
    } finally {
      setIsLoadingParcels(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    if (!selectedFarmer) { setError('Please search and select a farmer.'); return }
    if (!selectedParcel) { setError('Please select a farm parcel.'); return }
    if (!form.crop_name || !form.area_planted_hectares || !form.date_planted) {
      setError('Crop Name, Area Planted, and Date Planted are required.')
      return
    }
    setIsSubmitting(true)
    try {
      await api.post('/production/planting/', {
        farm_parcel: parseInt(selectedParcel),
        season: form.season,
        year: parseInt(form.year),
        crop_name: form.crop_name,
        area_planted_hectares: parseFloat(form.area_planted_hectares),
        date_planted: form.date_planted,
        seedling_type: form.seedling_type,
        variety_used: form.variety_used,
        seed_source: form.seed_source,
        quantity_of_seeds_kg: form.quantity_of_seeds_kg ? parseFloat(form.quantity_of_seeds_kg) : null,
        remarks: form.remarks,
      })
      onSuccess()
    } catch (err) {
      const data = err.response?.data
      if (data) {
        const msgs = Object.values(data).flat().join(' ')
        setError(msgs || 'Failed to save planting record.')
      } else {
        setError('Failed to save planting record.')
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Add Planting Record" subtitle="Record a new crop planting for a farmer" icon={Sprout} onClose={onClose} maxWidth="max-w-2xl">
      <form className="space-y-4" onSubmit={handleSubmit}>
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {/* Farmer Search */}
        <div>
          <label className={labelCls}>Farmer</label>
          {selectedFarmer ? (
            <div className="flex items-center justify-between rounded-lg border border-green-200 bg-[#f0f7f0] px-3 py-2 text-sm">
              <div>
                <p className="font-medium text-slate-800">{selectedFarmer.full_name}</p>
                <p className="text-xs text-slate-500">{selectedFarmer.rsbsa_number} · {selectedFarmer.barangay}</p>
              </div>
              <button
                className="text-xs text-slate-400 hover:text-rose-500"
                type="button"
                onClick={() => { setSelectedFarmer(null); setSelectedParcel(''); setParcels([]) }}
              >
                Change
              </button>
            </div>
          ) : (
            <div className="relative">
              <SearchBar
                onChange={handleSearch}
                placeholder="Search by name, RSBSA, or barangay"
                value={searchQuery}
              />
              {isSearching && (
                <p className="mt-1 text-xs text-slate-400">Searching...</p>
              )}
              {farmers.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-md">
                  {farmers.map((f) => (
                    <li
                      key={f.id}
                      className="cursor-pointer px-3 py-2 text-sm hover:bg-[#f0f7f0]"
                      onClick={() => handleSelectFarmer(f)}
                    >
                      <span className="font-medium">{f.full_name}</span>
                      <span className="ml-2 text-xs text-slate-400">{f.rsbsa_number} · {f.barangay}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Parcel Select */}
        {selectedFarmer && (
          <div>
            <label className={labelCls}>Farm Parcel</label>
            {isLoadingParcels ? (
              <p className="mt-1 text-xs text-slate-400">Loading parcels...</p>
            ) : (
              <>
                <select
                  className={baseInputClasses}
                  required
                  value={selectedParcel}
                  onChange={(e) => setSelectedParcel(e.target.value)}
                >
                  <option value="">-- Select Parcel --</option>
                  {parcels.map((p) => (
                    <option key={p.id} value={p.id}>
                      Parcel {p.parcel_number} — {p.area_hectares} ha — {p.barangay}
                    </option>
                  ))}
                </select>
                {parcels.length === 0 && (
                  <p className="mt-1 text-xs text-amber-600">This farmer has no registered parcels.</p>
                )}
              </>
            )}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>Season</label>
            <select className={baseInputClasses} value={form.season} onChange={(e) => update('season', e.target.value)}>
              <option value="Dry">Dry</option>
              <option value="Wet">Wet</option>
            </select>
          </div>
          <div>
            <label className={labelCls}>Year</label>
            <select className={baseInputClasses} value={form.year} onChange={(e) => update('year', e.target.value)}>
              {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls}>Crop Name</label>
          <select className={baseInputClasses} value={form.crop_name} onChange={(e) => update('crop_name', e.target.value)}>
            {CROP_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Area Planted (ha)" required>
            <input
              className={baseInputClasses}
              min="0"
              step="0.01"
              type="number"
              value={form.area_planted_hectares}
              onChange={(e) => update('area_planted_hectares', e.target.value)}
            />
          </FormField>
          <FormField label="Date Planted" required>
            <input
              className={baseInputClasses}
              type="date"
              value={form.date_planted}
              max={new Date().toISOString().split('T')[0]}
              onChange={(e) => update('date_planted', e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Seedling Type">
          <input
            className={baseInputClasses}
            placeholder="e.g. Certified seeds, Hybrid"
            value={form.seedling_type}
            onChange={(e) => update('seedling_type', e.target.value)}
          />
        </FormField>

        <FormField label="Variety Used (optional)">
          <input
            className={baseInputClasses}
            placeholder="e.g. NSIC Rc222, Malusog"
            value={form.variety_used}
            onChange={(e) => update('variety_used', e.target.value)}
          />
        </FormField>

        <div className="grid grid-cols-2 gap-4">
          <FormField label="Seed Source (optional)">
            <select className={baseInputClasses} value={form.seed_source} onChange={(e) => update('seed_source', e.target.value)}>
              <option value="">— Select —</option>
              {SEED_SOURCE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </FormField>
          <FormField label="Qty of Seeds (kg, optional)">
            <input
              className={baseInputClasses}
              type="number"
              step="0.01"
              min="0"
              value={form.quantity_of_seeds_kg}
              onChange={(e) => update('quantity_of_seeds_kg', e.target.value)}
            />
          </FormField>
        </div>

        <FormField label="Remarks (optional)">
          <textarea
            className={baseInputClasses}
            rows={2}
            value={form.remarks}
            onChange={(e) => update('remarks', e.target.value)}
          />
        </FormField>

        <div className="flex justify-end gap-2 pt-2">
          <Button onClick={onClose} type="button" variant="outline">Cancel</Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            {isSubmitting ? 'Saving...' : 'Save Record'}
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default AddPlantingRecordModal
