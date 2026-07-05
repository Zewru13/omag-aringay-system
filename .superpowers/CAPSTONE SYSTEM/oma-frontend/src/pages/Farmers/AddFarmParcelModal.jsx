import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'

const CROP_OPTIONS = [
  'Palay (Rice)',
  'Corn (Mais)',
  'Onion',
  'Garlic',
  'Tomato',
  'Eggplant (Talong)',
  'Bitter Gourd (Ampalaya)',
  'String Beans (Sitaw)',
  'Pechay',
  'Cabbage',
  'Mango',
  'Cacao (Kakaw)',
  'Banana (Saging)',
  'Coffee (Kape)',
  'Cassava',
  'Sweet Potato (Kamote)',
  'Other Vegetables',
  'Other Fruits',
  'Other Root Crops',
  'Cash Crops',
  'Other',
]

const MACHINERY_OPTIONS = [
  'Hand Tractor',
  'Four-Wheel Tractor',
  'Thresher',
  'Water Pump',
  'Sprayer',
  'Harvester',
  'Rice Mill',
  'Other',
]

const OWNERSHIP_OPTIONS = ['Owned', 'Borrowed', 'Rented', 'Association-Owned']

const PERENNIAL_CROPS = ['Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Other Fruits']
const FARM_TYPE_OPTIONS = ['Irrigated Lowland', 'Rainfed Lowland', 'Upland', 'Highland', 'Other']
const CROPPING_SCHEDULE_OPTIONS = ['Single Crop', 'Double Crop', 'Year-Round', 'Seasonal']
const SEED_SOURCE_OPTIONS = ['Certified Seeds', 'Farm Saved Seeds', 'Hybrid Seeds', 'Open Pollinated', 'Other']
const SEEDS_UNIT_OPTIONS = ['kg', 'g', 'bag', 'pack', 'piece']

const initialParcelForm = {
  parcel_number: '',
  area_hectares: '',
  land_ownership: 'Owner',
  tax_declaration_number: '',
  farm_status: 'Active',
  barangay: '',
  farm_type: '',
  is_organic: false,
  within_ancestral_domain: false,
  is_agrarian_reform_beneficiary: false,
  cropping_schedule: '',
}

const labelCls = 'block text-xs font-medium text-slate-600'
const errorCls = 'mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700'

function getPrimaryCommodity(crops) {
  if (!crops.length) return null
  return crops.reduce((max, c) =>
    parseFloat(c.area_hectares) > parseFloat(max.area_hectares) ? c : max,
  )
}

function AddFarmParcelModal({ farmerId, onClose, onSuccess }) {
  // Step 1: parcel info form
  const [parcelForm, setParcelForm] = useState(initialParcelForm)
  const [parcelError, setParcelError] = useState('')
  const [isSubmittingParcel, setIsSubmittingParcel] = useState(false)

  // Step 2: new parcel id and sub-resource lists
  const [parcelId, setParcelId] = useState(null)
  const [crops, setCrops] = useState([])
  const [machinery, setMachinery] = useState([])

  // Crop form
  const [cropName, setCropName] = useState('Rice')
  const [cropNameOther, setCropNameOther] = useState('')
  const [cropArea, setCropArea] = useState('')
  const [cropIsMain, setCropIsMain] = useState(false)
  const [cropVariety, setCropVariety] = useState('')
  const [cropSeedSource, setCropSeedSource] = useState('Certified Seeds')
  const [cropQtySeeds, setCropQtySeeds] = useState('')
  const [cropSeedsUnit, setCropSeedsUnit] = useState('kg')
  const [cropNumberOfTrees, setCropNumberOfTrees] = useState('')
  const [cropError, setCropError] = useState('')
  const [isAddingCrop, setIsAddingCrop] = useState(false)

  // Machinery form
  const [machineryType, setMachineryType] = useState('Hand Tractor')
  const [machineryTypeOther, setMachineryTypeOther] = useState('')
  const [machineryQty, setMachineryQty] = useState('1')
  const [machineryOwnership, setMachineryOwnership] = useState('Owned')
  const [machineryError, setMachineryError] = useState('')
  const [isAddingMachinery, setIsAddingMachinery] = useState(false)

  const updateParcelField = (field, value) => {
    setParcelForm((current) => ({ ...current, [field]: value }))
  }

  // ── Step 1: Create parcel ──────────────────────────────────────────────────
  const handleParcelSubmit = async (event) => {
    event.preventDefault()
    setParcelError('')
    setIsSubmittingParcel(true)

    try {
      const response = await api.post(`/farmers/${farmerId}/parcels/`, parcelForm)
      setParcelId(response.data.id)
    } catch {
      setParcelError('Unable to add farm parcel. Please check the form and try again.')
    } finally {
      setIsSubmittingParcel(false)
    }
  }

  // ── Crops ──────────────────────────────────────────────────────────────────
  const handleAddCrop = async () => {
    setCropError('')
    if (!cropArea) {
      setCropError('Please enter the area.')
      return
    }
    if (cropName === 'Other' && !cropNameOther.trim()) {
      setCropError('Please specify the crop name.')
      return
    }
    setIsAddingCrop(true)
    try {
      const response = await api.post(`/farmers/parcels/${parcelId}/crops/`, {
        crop_name: cropName,
        crop_name_other: cropName === 'Other' ? cropNameOther : '',
        area_hectares: parseFloat(cropArea),
        is_main_crop: cropIsMain,
        variety_used: cropVariety || null,
        seed_source: cropSeedSource,
        quantity_of_seeds_used: cropQtySeeds ? parseFloat(cropQtySeeds) : null,
        seeds_unit: cropSeedsUnit,
        number_of_trees: (PERENNIAL_CROPS.includes(cropName) && cropNumberOfTrees) ? parseInt(cropNumberOfTrees) : null,
      })
      if (cropIsMain) {
        setCrops((prev) => prev.map((c) => ({ ...c, is_main_crop: false })))
      }
      setCrops((prev) => [...prev, response.data])
      setCropArea('')
      setCropNameOther('')
      setCropIsMain(false)
      setCropVariety('')
      setCropQtySeeds('')
      setCropNumberOfTrees('')
    } catch {
      setCropError('Unable to add crop.')
    } finally {
      setIsAddingCrop(false)
    }
  }

  const handleDeleteCrop = async (id) => {
    try {
      await api.delete(`/farmers/crops/${id}/`)
      setCrops((prev) => prev.filter((c) => c.id !== id))
    } catch {
      setCropError('Unable to remove crop.')
    }
  }

  // ── Machinery ──────────────────────────────────────────────────────────────
  const handleAddMachinery = async () => {
    setMachineryError('')
    if (machineryType === 'Other' && !machineryTypeOther.trim()) {
      setMachineryError('Please specify the machinery type.')
      return
    }
    setIsAddingMachinery(true)
    try {
      const response = await api.post(`/farmers/parcels/${parcelId}/machinery/`, {
        machinery_type: machineryType,
        machinery_type_other: machineryType === 'Other' ? machineryTypeOther : '',
        quantity: parseInt(machineryQty) || 1,
        ownership: machineryOwnership,
      })
      setMachinery((prev) => [...prev, response.data])
      setMachineryQty('1')
      setMachineryTypeOther('')
    } catch {
      setMachineryError('Unable to add machinery.')
    } finally {
      setIsAddingMachinery(false)
    }
  }

  const handleDeleteMachinery = async (id) => {
    try {
      await api.delete(`/farmers/machinery/${id}/`)
      setMachinery((prev) => prev.filter((m) => m.id !== id))
    } catch {
      setMachineryError('Unable to remove machinery.')
    }
  }

  const handleDone = () => {
    onSuccess()
    onClose()
  }

  const primaryCrop = getPrimaryCommodity(crops)

  // ── Step 1 render ──────────────────────────────────────────────────────────
  if (!parcelId) {
    return (
      <ModalShell title="Add Farm Parcel" onClose={onClose} maxWidth="max-w-2xl">
        <form onSubmit={handleParcelSubmit} className="space-y-5">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className={labelCls} htmlFor="parcel_number">Parcel Number</label>
              <input
                className={baseInputClasses}
                id="parcel_number"
                onChange={(e) => updateParcelField('parcel_number', e.target.value)}
                required
                value={parcelForm.parcel_number}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="area_hectares">Area (ha)</label>
              <input
                className={baseInputClasses}
                id="area_hectares"
                min="0"
                onChange={(e) => updateParcelField('area_hectares', e.target.value)}
                required
                step="0.01"
                type="number"
                value={parcelForm.area_hectares}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="land_ownership">Land Ownership</label>
              <select
                className={baseInputClasses}
                id="land_ownership"
                onChange={(e) => updateParcelField('land_ownership', e.target.value)}
                value={parcelForm.land_ownership}
              >
                <option value="Owner">Owner</option>
                <option value="Tenant">Tenant</option>
                <option value="Lessee">Lessee</option>
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="tax_declaration_number">Tax Dec Number</label>
              <input
                className={baseInputClasses}
                id="tax_declaration_number"
                onChange={(e) => updateParcelField('tax_declaration_number', e.target.value)}
                value={parcelForm.tax_declaration_number}
              />
            </div>

            <div>
              <label className={labelCls} htmlFor="farm_status">Farm Status</label>
              <select
                className={baseInputClasses}
                id="farm_status"
                onChange={(e) => updateParcelField('farm_status', e.target.value)}
                value={parcelForm.farm_status}
              >
                <option value="Active">Active</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <BarangaySelect
              id="barangay"
              label="Barangay"
              value={parcelForm.barangay}
              onChange={(e) => updateParcelField('barangay', e.target.value)}
              required
            />

            <div>
              <label className={labelCls} htmlFor="farm_type">Farm Type</label>
              <select className={baseInputClasses} id="farm_type" value={parcelForm.farm_type} onChange={(e) => updateParcelField('farm_type', e.target.value)}>
                <option value="">— Select —</option>
                {FARM_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls} htmlFor="cropping_schedule">Cropping Schedule</label>
              <select className={baseInputClasses} id="cropping_schedule" value={parcelForm.cropping_schedule} onChange={(e) => updateParcelField('cropping_schedule', e.target.value)}>
                <option value="">— Select —</option>
                {CROPPING_SCHEDULE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>

          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
            <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">RSBSA Parcel Classification</p>
            <div className="flex flex-wrap gap-4">
              {[
                ['is_organic', 'Organic Farm'],
                ['within_ancestral_domain', 'Within Ancestral Domain'],
                ['is_agrarian_reform_beneficiary', 'Agrarian Reform Beneficiary'],
              ].map(([field, label]) => (
                <label key={field} className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-green-600"
                    checked={parcelForm[field]}
                    onChange={(e) => updateParcelField(field, e.target.checked)}
                  />
                  <span className="text-sm text-slate-700">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {parcelError && <p className={errorCls}>{parcelError}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <Button onClick={onClose} type="button" variant="ghost">Cancel</Button>
            <Button isLoading={isSubmittingParcel} type="submit" variant="primary">
              Next: Add Details
            </Button>
          </div>
        </form>
      </ModalShell>
    )
  }

  // ── Step 2 render ──────────────────────────────────────────────────────────
  return (
    <ModalShell title="Add Farm Parcel — Details" onClose={onClose} maxWidth="max-w-2xl">
      <div className="space-y-6">
        <p className="text-sm text-slate-500">Parcel saved. Add crops and machinery below.</p>

        {/* ── Section A: Crops ── */}
        <section>
          <p className="mb-3 text-base font-bold text-slate-800">A. Crops Grown</p>

          <div className="grid gap-3 md:grid-cols-3">
            <div>
              <label className={labelCls}>Crop Name</label>
              <select className={baseInputClasses} value={cropName} onChange={(e) => setCropName(e.target.value)}>
                {CROP_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {cropName === 'Other' && (
              <div>
                <label className={labelCls}>Specify</label>
                <input className={baseInputClasses} placeholder="Enter crop name" value={cropNameOther} onChange={(e) => setCropNameOther(e.target.value)} />
              </div>
            )}

            <div>
              <label className={labelCls}>Area (ha)</label>
              <input className={baseInputClasses} min="0" step="0.0001" type="number" value={cropArea} onChange={(e) => setCropArea(e.target.value)} />
            </div>

            {PERENNIAL_CROPS.includes(cropName) && (
              <div>
                <label className={labelCls}>No. of Trees / Stands</label>
                <input className={baseInputClasses} min="0" type="number" placeholder="Count" value={cropNumberOfTrees} onChange={(e) => setCropNumberOfTrees(e.target.value)} />
              </div>
            )}

            <div>
              <label className={labelCls}>Variety Used</label>
              <input className={baseInputClasses} placeholder="e.g. NSIC Rc222" value={cropVariety} onChange={(e) => setCropVariety(e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Seed Source</label>
              <select className={baseInputClasses} value={cropSeedSource} onChange={(e) => setCropSeedSource(e.target.value)}>
                {SEED_SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div>
              <label className={labelCls}>Qty of Seeds Used</label>
              <input className={baseInputClasses} min="0" step="0.01" type="number" value={cropQtySeeds} onChange={(e) => setCropQtySeeds(e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Seeds Unit</label>
              <select className={baseInputClasses} value={cropSeedsUnit} onChange={(e) => setCropSeedsUnit(e.target.value)}>
                {SEEDS_UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-5">
              <input
                checked={cropIsMain}
                className="h-4 w-4 accent-green-600"
                id="crop_is_main"
                type="checkbox"
                onChange={(e) => setCropIsMain(e.target.checked)}
              />
              <label className={labelCls} htmlFor="crop_is_main">Main Crop</label>
            </div>

            <div className="flex items-end">
              <Button isLoading={isAddingCrop} onClick={handleAddCrop} size="sm" type="button" variant="primary">
                {isAddingCrop ? 'Adding...' : 'Add Crop'}
              </Button>
            </div>
          </div>

          {cropError && <p className={errorCls}>{cropError}</p>}

          {crops.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-md border border-green-100">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-green-800">
                  <tr>
                    <th className="px-4 py-2 text-left">Crop</th>
                    <th className="px-4 py-2 text-left">Variety</th>
                    <th className="px-4 py-2 text-left">Area (ha)</th>
                    <th className="px-4 py-2 text-left">Main</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-50">
                  {crops.map((c) => (
                    <tr key={c.id} className="bg-white">
                      <td className="px-4 py-2 text-slate-700">
                        {c.crop_name === 'Other' ? c.crop_name_other : c.crop_name}
                      </td>
                      <td className="px-4 py-2 text-slate-500 text-xs">{c.variety_used || '—'}</td>
                      <td className="px-4 py-2 text-slate-700">{c.area_hectares}</td>
                      <td className="px-4 py-2">
                        {c.is_main_crop && (
                          <span className="inline-block rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-[#1E4620]">Main</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right">
                        <button className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => handleDeleteCrop(c.id)} type="button">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {primaryCrop && (
            <p className="mt-2 text-sm font-medium text-[#1E4620]">
              Primary Commodity:{' '}
              {primaryCrop.crop_name === 'Other' ? primaryCrop.crop_name_other : primaryCrop.crop_name}
              {' '}({primaryCrop.area_hectares} ha)
            </p>
          )}
        </section>

        <hr className="border-green-100" />

        {/* ── Section B: Machinery ── */}
        <section>
          <p className="mb-3 text-base font-bold text-slate-800">B. Agricultural Machinery</p>

          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>Machinery Type</label>
              <select className={baseInputClasses} value={machineryType} onChange={(e) => setMachineryType(e.target.value)}>
                {MACHINERY_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {machineryType === 'Other' && (
              <div>
                <label className={labelCls}>Specify</label>
                <input className={baseInputClasses} placeholder="Enter machinery type" value={machineryTypeOther} onChange={(e) => setMachineryTypeOther(e.target.value)} />
              </div>
            )}

            <div>
              <label className={labelCls}>Quantity</label>
              <input className={baseInputClasses} min="1" type="number" value={machineryQty} onChange={(e) => setMachineryQty(e.target.value)} />
            </div>

            <div>
              <label className={labelCls}>Ownership</label>
              <select className={baseInputClasses} value={machineryOwnership} onChange={(e) => setMachineryOwnership(e.target.value)}>
                {OWNERSHIP_OPTIONS.map((o) => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div className="flex items-end">
              <Button isLoading={isAddingMachinery} onClick={handleAddMachinery} size="sm" type="button" variant="primary">
                {isAddingMachinery ? 'Adding...' : 'Add Machinery'}
              </Button>
            </div>
          </div>

          {machineryError && <p className={errorCls}>{machineryError}</p>}

          {machinery.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-md border border-green-100">
              <table className="min-w-full text-sm">
                <thead className="bg-[#f0f7f0] text-xs font-semibold uppercase tracking-wide text-green-800">
                  <tr>
                    <th className="px-4 py-2 text-left">Type</th>
                    <th className="px-4 py-2 text-left">Qty</th>
                    <th className="px-4 py-2 text-left">Ownership</th>
                    <th className="px-4 py-2" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-green-50">
                  {machinery.map((m) => (
                    <tr key={m.id} className="bg-white">
                      <td className="px-4 py-2 text-slate-700">
                        {m.machinery_type === 'Other' ? m.machinery_type_other : m.machinery_type}
                      </td>
                      <td className="px-4 py-2 text-slate-700">{m.quantity}</td>
                      <td className="px-4 py-2 text-slate-700">{m.ownership}</td>
                      <td className="px-4 py-2 text-right">
                        <button className="rounded p-1 text-red-500 hover:bg-red-50" onClick={() => handleDeleteMachinery(m.id)} type="button">
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="flex justify-end border-t border-slate-100 pt-4">
          <Button onClick={handleDone} type="button" variant="primary">Done</Button>
        </div>
      </div>
    </ModalShell>
  )
}

export default AddFarmParcelModal
