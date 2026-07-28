import { useEffect, useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'

// Region-Province-Municipality is fixed for every parcel in this LGU-only
// system (01-33-02 = Region I / La Union / Aringay) — same fixed prefix
// already used for RSBSA and FishR numbers elsewhere in the app. Barangay-
// Section-Block-Lot are the only parts that vary per parcel.
const PARCEL_NUMBER_PARTS = [
  { type: 'text', value: '01-33-02-' },
  { type: 'input', key: 'barangay', length: 3, placeholder: '000' },
  { type: 'text', value: '-' },
  { type: 'input', key: 'section', length: 3, placeholder: '000' },
  { type: 'text', value: '-' },
  { type: 'input', key: 'block', length: 2, placeholder: '00' },
  { type: 'text', value: '-' },
  { type: 'input', key: 'lot', length: 3, placeholder: '000' },
]
// Tax Declaration Number uses a different numbering authority (the
// Provincial/Municipal Assessor, not the RSBSA/FishR registry) with a
// different barangay-code digit count (5 vs. Parcel Number's 3) — a real,
// confirmed mismatch between the two formats, not a bug to reconcile. Since
// only the format (not a confirmed fixed prefix) is known, this stays a
// plain validated text field rather than a segmented input.
const TAX_DECLARATION_RE = /^\d{2}-\d{3}-\d{5}-\d{4}-\d{4}$/

const CROP_OPTIONS = [
  'Palay (Rice)', 'Corn (Mais)', 'Onion', 'Garlic', 'Tomato',
  'Eggplant (Talong)', 'Bitter Gourd (Ampalaya)', 'String Beans (Sitaw)',
  'Pechay', 'Cabbage', 'Mango', 'Cacao (Kakaw)', 'Banana (Saging)',
  'Coffee (Kape)', 'Cassava', 'Sweet Potato (Kamote)',
  'Other Vegetables', 'Other Fruits', 'Other Root Crops', 'Cash Crops', 'Other',
]
const MACHINERY_OPTIONS = [
  'Hand Tractor', 'Four-Wheel Tractor', 'Thresher', 'Water Pump',
  'Sprayer', 'Harvester', 'Rice Mill', 'Other',
]
const OWNERSHIP_OPTIONS = ['Owned', 'Borrowed', 'Rented', 'Organization-Owned']
// PROVISIONAL agronomic classification, pending OMAg confirmation — same
// caveat status as the crop variety data. Tree/perennial crops (no "times
// per year" cropping cycle) vs. seasonal/annual crops (where Single/Double/
// Triple Cropping genuinely applies). Also drives the Cropping Schedule
// field's smart-filtering below (Batch F) — was already used here for the
// "No. of Trees" field.
const PERENNIAL_CROPS = ['Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Other Fruits']
const FARM_TYPE_OPTIONS = ['Irrigated Lowland', 'Rainfed Lowland', 'Upland', 'Highland', 'Other']
// Must match FarmParcel.CROPPING_SCHEDULE_CHOICES on the backend exactly —
// the previous list ('Single Crop' / 'Double Crop' / 'Year-Round' /
// 'Seasonal') didn't match any real model choice and silently failed to save.
const CROPPING_SCHEDULE_OPTIONS = ['Single Cropping', 'Double Cropping', 'Triple Cropping']
// Values must match FarmCrop.SEED_SOURCE_CHOICES / SEEDS_UNIT_CHOICES on the backend exactly —
// these are sent as the raw choice value, not just a display label.
const SEED_SOURCE_OPTIONS = ['Certified Seed', 'Farmer-saved Seed', 'Hybrid Seed', 'OPV Seed', 'Other']
const SEEDS_UNIT_OPTIONS = ['kg', 'bag', 'piece']

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

const makeParcel = (n) => ({
  _id: n,
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
  crops: [],
  machinery: [],
  // crop form state
  _cropName: 'Palay (Rice)',
  _cropNameOther: '',
  _cropArea: '',
  _cropVariety: '',
  _cropSeedSource: 'Certified Seed',
  _cropQtySeeds: '',
  _cropSeedsUnit: 'kg',
  _cropIsMain: false,
  _cropTrees: '',
  // machinery form state
  _machineryType: 'Hand Tractor',
  _machineryTypeOther: '',
  _machineryQty: '1',
  _machineryOwnership: 'Owned',
})

function ParcelSection({ parcel, index, total, onUpdate, onRemove }) {
  const set = (field, value) => onUpdate(parcel._id, field, value)

  // Smart-filtering (Batch F, Part B): the parcel's main crop — if perennial,
  // "times per year" cropping schedule doesn't apply. No main crop set yet ->
  // treated as seasonal (don't block the form on crop-entry order).
  const mainCrop = parcel.crops.find(c => c.is_main_crop)
  const mainCropLabel = mainCrop ? (mainCrop.crop_name === 'Other' ? mainCrop.crop_name_other : mainCrop.crop_name) : ''
  const isPerennialMain = Boolean(mainCrop && PERENNIAL_CROPS.includes(mainCrop.crop_name))

  // Cross-field rule (this batch): Parcel Number becomes required the moment
  // a Tax Declaration Number is on the form — reactive to every keystroke,
  // not just checked at submit. No reverse rule (Tax Dec stays optional
  // regardless of Parcel Number).
  const taxDecFilled = Boolean(parcel.tax_declaration_number && parcel.tax_declaration_number.trim())
  const parcelNumberMissing = taxDecFilled && !parcel.parcel_number

  useEffect(() => {
    if (isPerennialMain && parcel.cropping_schedule) set('cropping_schedule', '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPerennialMain])

  const addCrop = () => {
    if (!parcel._cropArea) return
    if (parcel._cropName === 'Other' && !parcel._cropNameOther.trim()) return
    const entry = {
      _uid: Date.now(),
      crop_name: parcel._cropName,
      crop_name_other: parcel._cropName === 'Other' ? parcel._cropNameOther : '',
      area_hectares: parseFloat(parcel._cropArea),
      is_main_crop: parcel._cropIsMain,
      variety_used: parcel._cropVariety || '',
      seed_source: parcel._cropSeedSource,
      quantity_of_seeds_used: parcel._cropQtySeeds ? parseFloat(parcel._cropQtySeeds) : null,
      seeds_unit: parcel._cropSeedsUnit,
      number_of_trees: PERENNIAL_CROPS.includes(parcel._cropName) && parcel._cropTrees
        ? parseInt(parcel._cropTrees) : null,
    }
    const updatedCrops = parcel._cropIsMain
      ? [...parcel.crops.map(c => ({ ...c, is_main_crop: false })), entry]
      : [...parcel.crops, entry]
    onUpdate(parcel._id, 'crops', updatedCrops)
    onUpdate(parcel._id, '_cropArea', '')
    onUpdate(parcel._id, '_cropNameOther', '')
    onUpdate(parcel._id, '_cropIsMain', false)
    onUpdate(parcel._id, '_cropVariety', '')
    onUpdate(parcel._id, '_cropQtySeeds', '')
    onUpdate(parcel._id, '_cropTrees', '')
  }

  const removeCrop = (uid) => onUpdate(parcel._id, 'crops', parcel.crops.filter(c => c._uid !== uid))

  const addMachinery = () => {
    if (parcel._machineryType === 'Other' && !parcel._machineryTypeOther.trim()) return
    const entry = {
      _uid: Date.now(),
      machinery_type: parcel._machineryType,
      machinery_type_other: parcel._machineryType === 'Other' ? parcel._machineryTypeOther : '',
      quantity: parseInt(parcel._machineryQty) || 1,
      ownership: parcel._machineryOwnership,
    }
    onUpdate(parcel._id, 'machinery', [...parcel.machinery, entry])
    onUpdate(parcel._id, '_machineryTypeOther', '')
    onUpdate(parcel._id, '_machineryQty', '1')
  }

  const removeMachinery = (uid) => onUpdate(parcel._id, 'machinery', parcel.machinery.filter(m => m._uid !== uid))

  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-white p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Parcel {index + 1}</p>
        {total > 1 && (
          <button type="button" onClick={() => onRemove(parcel._id)}
            className="flex items-center gap-1 text-[12px] font-medium text-rose-500 hover:text-rose-700">
            <X size={13} /> Remove
          </button>
        )}
      </div>

      {/* Parcel fields */}
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>Parcel Number{taxDecFilled && <span className="text-rose-500"> *</span>}</label>
          <SegmentedIdInput
            parts={PARCEL_NUMBER_PARTS}
            value={parcel.parcel_number}
            onChange={value => set('parcel_number', value)}
          />
          {parcelNumberMissing ? (
            <p className="mt-1 text-[11px] text-rose-500">Required when a Tax Declaration Number is provided.</p>
          ) : (
            <p className="mt-1 text-[11px] text-[#A8BCA8]">
              {taxDecFilled ? 'Required — a Tax Declaration Number is on file.' : 'Optional — leave blank if not yet documented.'}
            </p>
          )}
        </div>
        <div>
          <label className={labelCls}>Area (ha) *</label>
          <input type="number" min="0" step="0.01" className={baseInputClasses} required
            value={parcel.area_hectares} onChange={e => set('area_hectares', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Land Ownership</label>
          <select className={baseInputClasses} value={parcel.land_ownership}
            onChange={e => set('land_ownership', e.target.value)}>
            <option value="Owner">Owner</option>
            <option value="Tenant">Tenant</option>
            <option value="Lessee">Lessee</option>
          </select>
        </div>
        <div>
          <label className={labelCls}>Tax Dec Number</label>
          <input className={baseInputClasses} value={parcel.tax_declaration_number}
            placeholder="01-002-00005-2023-0142"
            onChange={e => set('tax_declaration_number', e.target.value)} />
          {parcel.tax_declaration_number && !TAX_DECLARATION_RE.test(parcel.tax_declaration_number) ? (
            <p className="mt-1 text-[11px] text-rose-500">Format: RR-MMM-BBBBB-YYYY-NNNN, e.g. 01-002-00005-2023-0142.</p>
          ) : (
            <p className="mt-1 text-[11px] text-[#A8BCA8]">Optional — but Parcel Number is required if you provide this.</p>
          )}
        </div>
        <div>
          <label className={labelCls}>Farm Status</label>
          <select className={baseInputClasses} value={parcel.farm_status}
            onChange={e => set('farm_status', e.target.value)}>
            <option value="Active">Active</option>
            <option value="Inactive">Inactive</option>
          </select>
        </div>
        <BarangaySelect label="Barangay" value={parcel.barangay}
          onChange={e => set('barangay', e.target.value)} required />
        <div>
          <label className={labelCls}>Farm Type</label>
          <select className={baseInputClasses} value={parcel.farm_type}
            onChange={e => set('farm_type', e.target.value)}>
            <option value="">— Select —</option>
            {FARM_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cropping Schedule</label>
          <select className={`${baseInputClasses} ${isPerennialMain ? 'cursor-not-allowed bg-slate-50 text-slate-400' : ''}`}
            value={parcel.cropping_schedule} disabled={isPerennialMain}
            onChange={e => set('cropping_schedule', e.target.value)}>
            <option value="">— Select —</option>
            {CROPPING_SCHEDULE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          {isPerennialMain && (
            <p className="mt-1 text-[11px] text-[#A8BCA8]">Not applicable — {mainCropLabel} is a perennial crop.</p>
          )}
        </div>
      </div>

      {/* RSBSA Parcel Classification */}
      <div className="rounded-xl border border-[#E2E8E2] bg-[#EBF5EE]/20 p-3">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-[#7A8E7A]">RSBSA Parcel Classification</p>
        <div className="flex flex-wrap gap-4">
          {[
            ['is_organic', 'Organic Farm'],
            ['within_ancestral_domain', 'Within Ancestral Domain'],
            ['is_agrarian_reform_beneficiary', 'Agrarian Reform Beneficiary'],
          ].map(([field, label]) => (
            <label key={field} className="flex cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]"
                checked={parcel[field]} onChange={e => set(field, e.target.checked)} />
              <span className="text-[13px] text-[#1A2B1A]">{label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Crops section */}
      <div>
        <p className="mb-1 text-[12px] font-semibold text-[#1A2B1A]">Crops Grown</p>
        <p className="mb-2 text-[11px] text-[#7A8E7A]">
          This records what grows on this land. To track a season's planting, activities, and harvest, use Crop Monitoring.
        </p>
        <div className="grid gap-2 md:grid-cols-3">
          <div>
            <label className={labelCls}>Crop Name</label>
            <ComboboxWithOther
              options={CROP_OPTIONS.filter(o => o !== 'Other')}
              value={parcel._cropName}
              otherValue={parcel._cropNameOther}
              onChange={(v) => set('_cropName', v)}
              onOtherChange={(v) => set('_cropNameOther', v)}
            />
          </div>
          <div>
            <label className={labelCls}>Crop Area (ha)</label>
            <input type="number" min="0" step="0.0001" className={baseInputClasses}
              value={parcel._cropArea} onChange={e => set('_cropArea', e.target.value)} />
          </div>
          {PERENNIAL_CROPS.includes(parcel._cropName) && (
            <div>
              <label className={labelCls}>No. of Trees</label>
              <input type="number" min="0" className={baseInputClasses}
                value={parcel._cropTrees} onChange={e => set('_cropTrees', e.target.value)} />
            </div>
          )}
          <div>
            <label className={labelCls}>Variety Used</label>
            <input className={baseInputClasses} value={parcel._cropVariety}
              onChange={e => set('_cropVariety', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Seed Source</label>
            <select className={baseInputClasses} value={parcel._cropSeedSource}
              onChange={e => set('_cropSeedSource', e.target.value)}>
              {SEED_SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Qty of Seeds</label>
            <input type="number" min="0" step="0.01" className={baseInputClasses}
              value={parcel._cropQtySeeds} onChange={e => set('_cropQtySeeds', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Seeds Unit</label>
            <select className={baseInputClasses} value={parcel._cropSeedsUnit}
              onChange={e => set('_cropSeedsUnit', e.target.value)}>
              {SEEDS_UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-2 pt-5">
            <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]"
              checked={parcel._cropIsMain} onChange={e => set('_cropIsMain', e.target.checked)} />
            <label className={labelCls}>Main Crop</label>
          </div>
          <div className="flex items-end">
            <Button size="sm" type="button" onClick={addCrop}>Add Crop to This Parcel</Button>
          </div>
        </div>

        {parcel.crops.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg border border-[#E2E8E2]">
            <table className="min-w-full text-sm">
              <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Crop</th>
                  <th className="px-3 py-2 text-left">Variety</th>
                  <th className="px-3 py-2 text-left">Area</th>
                  <th className="px-3 py-2 text-left">Main</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F0]">
                {parcel.crops.map(c => (
                  <tr key={c._uid} className="bg-white hover:bg-[#F9FAF9]">
                    <td className="px-3 py-2 text-[13px] text-[#1A2B1A]">{c.crop_name === 'Other' ? c.crop_name_other : c.crop_name}</td>
                    <td className="px-3 py-2 text-[12px] text-[#7A8E7A]">{c.variety_used || '—'}</td>
                    <td className="px-3 py-2 text-[13px] text-[#1A2B1A]">{c.area_hectares} ha</td>
                    <td className="px-3 py-2">
                      {c.is_main_crop && <span className="rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[10px] font-semibold text-[#1B4D2E]">Main</span>}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeCrop(c._uid)} className="text-rose-400 hover:text-rose-600">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Machinery section */}
      <div>
        <p className="mb-2 text-[12px] font-semibold text-[#1A2B1A]">Agricultural Machinery</p>
        <div className="grid gap-2 md:grid-cols-2">
          <div>
            <label className={labelCls}>Machinery Type</label>
            <ComboboxWithOther
              options={MACHINERY_OPTIONS.filter(o => o !== 'Other')}
              value={parcel._machineryType}
              otherValue={parcel._machineryTypeOther}
              onChange={(v) => set('_machineryType', v)}
              onOtherChange={(v) => set('_machineryTypeOther', v)}
            />
          </div>
          <div>
            <label className={labelCls}>Quantity</label>
            <input type="number" min="1" className={baseInputClasses}
              value={parcel._machineryQty} onChange={e => set('_machineryQty', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Ownership</label>
            <select className={baseInputClasses} value={parcel._machineryOwnership}
              onChange={e => set('_machineryOwnership', e.target.value)}>
              {OWNERSHIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="flex items-end">
            <Button size="sm" type="button" onClick={addMachinery}>Add Machinery</Button>
          </div>
        </div>

        {parcel.machinery.length > 0 && (
          <div className="mt-2 overflow-hidden rounded-lg border border-[#E2E8E2]">
            <table className="min-w-full text-sm">
              <thead className="bg-[#1B4D2E] text-xs font-semibold uppercase tracking-wide text-white">
                <tr>
                  <th className="px-3 py-2 text-left">Type</th>
                  <th className="px-3 py-2 text-left">Qty</th>
                  <th className="px-3 py-2 text-left">Ownership</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F4F0]">
                {parcel.machinery.map(m => (
                  <tr key={m._uid} className="bg-white hover:bg-[#F9FAF9]">
                    <td className="px-3 py-2 text-[13px] text-[#1A2B1A]">{m.machinery_type === 'Other' ? m.machinery_type_other : m.machinery_type}</td>
                    <td className="px-3 py-2 text-[13px] text-[#1A2B1A]">{m.quantity}</td>
                    <td className="px-3 py-2 text-[13px] text-[#1A2B1A]">{m.ownership}</td>
                    <td className="px-3 py-2 text-right">
                      <button type="button" onClick={() => removeMachinery(m._uid)} className="text-rose-400 hover:text-rose-600">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

function AddFarmParcelModal({ farmerId, onClose, onSuccess }) {
  const [parcels, setParcels] = useState([makeParcel(1)])
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  const [showConfirm, setShowConfirm] = useState(false)
  const [nextId, setNextId] = useState(2)

  const addParcel = () => {
    setParcels(p => [...p, makeParcel(nextId)])
    setNextId(n => n + 1)
  }

  const removeParcel = (id) => {
    setParcels(p => p.filter(x => x._id !== id))
  }

  const updateParcel = (id, field, value) => {
    setParcels(p => p.map(x => x._id === id ? { ...x, [field]: value } : x))
  }

  const validate = () => {
    for (const p of parcels) {
      if (!p.area_hectares) { setError(`Parcel ${parcels.indexOf(p) + 1}: Area is required.`); return false }
      if (!p.barangay)      { setError(`Parcel ${parcels.indexOf(p) + 1}: Barangay is required.`); return false }
      if (p.tax_declaration_number && !TAX_DECLARATION_RE.test(p.tax_declaration_number)) {
        setError(`Parcel ${parcels.indexOf(p) + 1}: Tax declaration number format is invalid.`)
        return false
      }
      // Cross-field rule: Parcel Number required once Tax Declaration Number
      // is provided (no reverse rule) — same check the backend enforces.
      if (p.tax_declaration_number.trim() && !p.parcel_number) {
        setError(`Parcel ${parcels.indexOf(p) + 1}: Parcel Number is required when a Tax Declaration Number is provided.`)
        return false
      }
    }
    return true
  }

  const handleSave = async () => {
    setShowConfirm(false)
    setIsSaving(true)
    setError('')
    try {
      for (const parcel of parcels) {
        const { data: created } = await api.post(`/farmers/${farmerId}/parcels/`, {
          parcel_number: parcel.parcel_number,
          area_hectares: parseFloat(parcel.area_hectares),
          land_ownership: parcel.land_ownership,
          tax_declaration_number: parcel.tax_declaration_number,
          farm_status: parcel.farm_status,
          barangay: parcel.barangay,
          farm_type: parcel.farm_type,
          is_organic: parcel.is_organic,
          within_ancestral_domain: parcel.within_ancestral_domain,
          is_agrarian_reform_beneficiary: parcel.is_agrarian_reform_beneficiary,
          cropping_schedule: parcel.cropping_schedule,
        })

        for (const crop of parcel.crops) {
          const { _uid, ...cropPayload } = crop
          await api.post(`/farmers/parcels/${created.id}/crops/`, cropPayload)
        }

        for (const mach of parcel.machinery) {
          const { _uid, ...machPayload } = mach
          await api.post(`/farmers/parcels/${created.id}/machinery/`, machPayload)
        }
      }
      onSuccess()
      onClose()
    } catch {
      setError('Failed to save one or more parcels. Please check all fields.')
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return
    setShowConfirm(true)
  }

  return (
    <>
      <ModalShell title="Add Farm Parcel(s)" subtitle="Add one or more parcels in a single submission" onClose={onClose} maxWidth="max-w-2xl">
        <form onSubmit={handleSubmit} className="space-y-5">
          {parcels.map((p, i) => (
            <ParcelSection
              key={p._id}
              parcel={p}
              index={i}
              total={parcels.length}
              onUpdate={updateParcel}
              onRemove={removeParcel}
            />
          ))}

          <button type="button" onClick={addParcel}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-[#1B4D2E]/30 py-2.5 text-[13px] font-medium text-[#1B4D2E] transition hover:border-[#1B4D2E]/60 hover:bg-[#EBF5EE]/30">
            <Plus size={15} />
            Add Another Parcel
          </button>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{error}</p>
          )}

          <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
            <Button type="button" variant="ghost" onClick={onClose}>Cancel</Button>
            <Button type="submit" isLoading={isSaving}>
              Save {parcels.length} Parcel{parcels.length > 1 ? 's' : ''}
            </Button>
          </div>
        </form>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Save"
          message={`Save ${parcels.length} parcel${parcels.length > 1 ? 's' : ''} for this farmer?`}
          confirmLabel="Save"
          onConfirm={handleSave}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}

export default AddFarmParcelModal
