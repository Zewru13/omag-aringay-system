import { useState } from 'react'
import { Plus, Trash2, Map, Upload, ClipboardCheck, Sprout, Settings, Check } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import ComboboxWithOther from '../../components/UI/ComboboxWithOther.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DecimalInput from '../../components/UI/DecimalInput.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import SegmentedIdInput from '../../components/UI/SegmentedIdInput.jsx'
import IdNumberInput from '../../components/UI/IdNumberInput.jsx'
import PcicInsuranceField from '../../components/UI/PcicInsuranceField.jsx'
import StepIndicator from '../../components/UI/StepIndicator.jsx'
import ParcelCropsImportModal from './ParcelCropsImportModal.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { EMPTY_PCIC, pcicError, pcicPayload, uploadPcicForm } from '../../utils/pcic.js'
import { RSBSA_GROUPS, isValidIdNumber } from '../../utils/idNumbers.js'
import {
  STEPS, PERENNIAL_CROPS, TAX_DECLARATION_RE, RSBSA_FORMAT_ERROR, canSkipSchedule, cropLabel, machineryLabel,
  addImportedCrops, cropPayload, machineryPayload, parcelPayload, summarizeParcel, validateStep,
} from './parcelWizard.js'

// Region-Province-Municipality is fixed for every parcel in this LGU-only
// system (01-33-02 = Region I / La Union / Aringay) — same fixed prefix
// already used for RSBSA and FishR numbers elsewhere in the app. Barangay-
// Section-Block-Lot are the only parts that vary per parcel.
// Phone: the added-crop / added-machinery tables stack into labelled cards so the Remove button stays reachable.
const STACK_TABLES = 'max-md:[&_tr]:border-b max-md:[&_tr]:border-[#F0F4F0] max-md:[&_table]:block max-md:[&_tbody]:block max-md:[&_thead]:hidden max-md:[&_tr]:block max-md:[&_tr]:px-3 max-md:[&_tr]:py-2 max-md:[&_td]:block max-md:[&_td]:w-full max-md:[&_td]:px-0 max-md:[&_td]:py-1 max-md:[&_td]:text-left max-md:[&_td[data-label]]:before:mb-0.5 max-md:[&_td[data-label]]:before:block max-md:[&_td[data-label]]:before:text-[11px] max-md:[&_td[data-label]]:before:font-semibold max-md:[&_td[data-label]]:before:uppercase max-md:[&_td[data-label]]:before:tracking-wide max-md:[&_td[data-label]]:before:text-[#7A8E7A] max-md:[&_td[data-label]]:before:content-[attr(data-label)]'

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
// Typed as digits with the dashes added for you, and stopped at 18 digits.
const TAX_DECLARATION_GROUPS = [2, 3, 5, 4]
const TAX_DECLARATION_DIGITS = 18
// Mirrors core.validators.RSBSA_PATTERNS/validate_rsbsa exactly — the land
// owner (Tenant/Lessee parcels) is a different person from the farmer, so
// this can't reuse SegmentedIdInput's fixed-prefix-plus-own-barangay-code
// pattern above (that's locked to the CURRENT farmer's own barangay); a
// plain validated text field is the right shape here, same as
// tax_declaration_number just above.
const isValidRsbsa = isValidIdNumber

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
// Matches FarmParcel.FARM_TYPE_CHOICES on the backend exactly — the DA
// RSBSA Enrollment Form's own Farm Type legend. The previous list
// ('Irrigated Lowland'/'Rainfed Lowland'/'Upland'/'Highland'/'Other') didn't
// match any real backend choice and would have been rejected by the
// serializer's auto-generated ChoiceField on save (confirmed zero real
// parcels had ever hit this — every existing row has farm_type unset).
const FARM_TYPE_OPTIONS = ['Irrigated', 'Rainfed Upland', 'Rainfed Lowland', 'Urban or Peri-Urban']
// Must match FarmParcel.CROPPING_SCHEDULE_CHOICES on the backend exactly —
// the previous list ('Single Crop' / 'Double Crop' / 'Year-Round' /
// 'Seasonal') didn't match any real model choice and silently failed to save.
const CROPPING_SCHEDULE_OPTIONS = ['Single Cropping', 'Double Cropping', 'Triple Cropping']
// Values must match FarmCrop.SEED_SOURCE_CHOICES / SEEDS_UNIT_CHOICES on the backend exactly —
// these are sent as the raw choice value, not just a display label.
const SEED_SOURCE_OPTIONS = ['Certified Seed', 'Farmer-saved Seed', 'Hybrid Seed', 'OPV Seed', 'Other']
const SEEDS_UNIT_OPTIONS = ['kg', 'bag', 'piece']

const labelCls = 'text-[13px] font-medium text-[#4A5E4A] mb-1.5 block'

function SectionHeader({ icon: Icon, title, subtitle }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-[#EBF5EE]">
        <Icon size={17} className="text-[#1B4D2E]" aria-hidden="true" />
      </div>
      <div className="min-w-0">
        <p className="text-[14px] font-bold text-[#1A2B1A]">{title}</p>
        {subtitle && <p className="text-[12px] text-[#7A8E7A]">{subtitle}</p>}
      </div>
    </div>
  )
}

const makeParcel = () => ({
  parcel_number: '',
  area_hectares: '',
  land_ownership: 'Owner',
  land_owner_name: '',
  land_owner_rsbsa_number: '',
  tax_declaration_number: '',
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
  _cropPcic: { ...EMPTY_PCIC },
  _cropPcicError: '',
  // machinery form state
  _machineryType: 'Hand Tractor',
  _machineryTypeOther: '',
  _machineryQty: '1',
  _machineryOwnership: 'Owned',
})

// ─── Step 1: Core Parcel Details ──────────────────────────────────────────────

function CoreStep({ parcel, set, onImportParcels }) {
  // Cross-field rule: Parcel Number becomes required the moment a Tax Declaration Number is on the form — reactive to
  // every keystroke, not just checked on Next. No reverse rule (Tax Dec stays optional regardless of Parcel Number).
  const taxDecFilled = Boolean(parcel.tax_declaration_number && parcel.tax_declaration_number.trim())
  const parcelNumberMissing = taxDecFilled && !parcel.parcel_number

  return (
    <div>
      <SectionHeader icon={Map} title="Core Parcel Details" subtitle="Required information for this land parcel" />
      {onImportParcels && (
        <button type="button" onClick={onImportParcels} className="mt-3 inline-flex min-h-[36px] items-center gap-1.5 text-[12.5px] font-medium text-[#1B4D2E] hover:underline">
          <Upload size={13} aria-hidden="true" /> Have many parcels in a file? Import farm parcels instead
        </button>
      )}
      <div className="mt-4 space-y-3">
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
              {taxDecFilled ? 'Required — a Tax Declaration Number is on file.' : 'Barangay code · Section · Block · Lot — fill only the 4 segments'}
            </p>
          )}
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Area (ha) *</label>
            <DecimalInput decimals={2} className={baseInputClasses}
              placeholder="0.00"
              value={parcel.area_hectares} onChange={v => set('area_hectares', v)} />
          </div>
          <div>
            <label className={labelCls}>Tax Dec Number</label>
            <IdNumberInput groups={TAX_DECLARATION_GROUPS} maxDigits={TAX_DECLARATION_DIGITS}
              value={parcel.tax_declaration_number} placeholder="01-002-00005-2023-0142"
              onChange={v => set('tax_declaration_number', v)} />
            {parcel.tax_declaration_number && !TAX_DECLARATION_RE.test(parcel.tax_declaration_number) ? (
              <p className="mt-1 text-[11px] text-rose-500">Needs all 18 digits: RR-MMM-BBBBB-YYYY-NNNN, e.g. 01-002-00005-2023-0142.</p>
            ) : (
              <p className="mt-1 text-[11px] text-[#A8BCA8]">Optional — but Parcel Number is required if you provide this.</p>
            )}
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Land Ownership</label>
            <select className={baseInputClasses} value={parcel.land_ownership}
              onChange={e => {
                const next = e.target.value
                set('land_ownership', next)
                // RSBSA form only asks for the land owner when the farmer isn't the registered owner — clear stale
                // values the moment ownership switches back to Owner so a leftover name/RSBSA from a prior Tenant/Lessee
                // selection never gets submitted.
                if (next !== 'Tenant' && next !== 'Lessee') {
                  set('land_owner_name', '')
                  set('land_owner_rsbsa_number', '')
                }
              }}>
              <option value="Owner">Owner</option>
              <option value="Tenant">Tenant</option>
              <option value="Lessee">Lessee</option>
            </select>
          </div>
        </div>

        {(parcel.land_ownership === 'Tenant' || parcel.land_ownership === 'Lessee') && (
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <label className={labelCls}>Land Owner Name *</label>
              <input className={baseInputClasses} value={parcel.land_owner_name}
                placeholder="First Middle Last"
                onChange={e => set('land_owner_name', e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Land Owner RSBSA Number</label>
              <IdNumberInput
                groups={RSBSA_GROUPS}
                value={parcel.land_owner_rsbsa_number}
                placeholder="01-33-02-014-058212"
                onChange={value => set('land_owner_rsbsa_number', value)} />
              {parcel.land_owner_rsbsa_number && !isValidRsbsa(parcel.land_owner_rsbsa_number) ? (
                <p className="mt-1 text-[11px] text-rose-500">{RSBSA_FORMAT_ERROR}</p>
              ) : (
                <p className="mt-1 text-[11px] text-[#A8BCA8]">Optional — if the land owner is also RSBSA-registered.</p>
              )}
            </div>
          </div>
        )}

        <BarangaySelect label="Barangay" value={parcel.barangay}
          onChange={e => set('barangay', e.target.value)} required />
      </div>
    </div>
  )
}

// ─── Step 2: RSBSA Parcel Classification ──────────────────────────────────────

function ClassificationStep({ parcel, set }) {
  return (
    <div className="space-y-5">
      <SectionHeader icon={ClipboardCheck} title="RSBSA Parcel Classification" subtitle="Optional — how the RSBSA enrollment form classifies this parcel" />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>Farm Type</label>
          <select className={baseInputClasses} value={parcel.farm_type}
            onChange={e => set('farm_type', e.target.value)}>
            <option value="">Select type...</option>
            {FARM_TYPE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div>
          <label className={labelCls}>Cropping Schedule</label>
          <select className={baseInputClasses} value={parcel.cropping_schedule}
            onChange={e => set('cropping_schedule', e.target.value)}>
            <option value="">Select schedule...</option>
            {CROPPING_SCHEDULE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
          <p className="mt-1 text-[11px] text-[#A8BCA8]">Left out automatically if the main crop you add later is a perennial (tree) crop.</p>
        </div>
      </div>
      <div className="rounded-xl bg-[#EBF5EE]/60 p-4">
        <p className="text-[13px] font-medium text-[#4A5E4A]">Check all that apply to this parcel</p>
        <div className="mt-3 flex flex-wrap gap-4">
          {[
            ['is_organic', 'Organic Farm'],
            ['within_ancestral_domain', 'Within Ancestral Domain'],
            ['is_agrarian_reform_beneficiary', 'Agrarian Reform Beneficiary'],
          ].map(([field, label]) => (
            <label key={field} className="flex min-h-[40px] cursor-pointer items-center gap-2">
              <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]"
                checked={parcel[field]} onChange={e => set(field, e.target.checked)} />
              <span className="text-[13px] text-[#1A2B1A]">{label}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}

// ─── Step 3: Crops Grown ──────────────────────────────────────────────────────

function CropsStep({ parcel, set }) {
  const [showImport, setShowImport] = useState(false)

  const addImported = (crops) => {
    const next = addImportedCrops(parcel.crops, crops, Date.now())
    set('crops', next)
    if (canSkipSchedule({ crops: next })) set('cropping_schedule', '')
    setShowImport(false)
  }

  const addCrop = () => {
    if (!parcel._cropArea) return
    if (parcel._cropName === 'Other' && !parcel._cropNameOther.trim()) return
    const pcicProblem = pcicError(parcel._cropPcic)
    if (pcicProblem) { set('_cropPcicError', pcicProblem); return }
    const entry = {
      pcic: parcel._cropPcic,
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
    set('crops', updatedCrops)
    // A perennial main crop has no cropping schedule.
    if (canSkipSchedule({ crops: updatedCrops })) set('cropping_schedule', '')
    set('_cropArea', '')
    set('_cropNameOther', '')
    set('_cropIsMain', false)
    set('_cropVariety', '')
    set('_cropQtySeeds', '')
    set('_cropTrees', '')
    set('_cropPcic', { ...EMPTY_PCIC })
    set('_cropPcicError', '')
  }

  const removeCrop = (uid) => set('crops', parcel.crops.filter(c => c._uid !== uid))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <SectionHeader icon={Sprout} title="Crops Grown" subtitle="Add one crop at a time, or import many from a file — optional step" />
        <button type="button" onClick={() => setShowImport(true)}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[13px] font-semibold text-[#1B4D2E] transition hover:bg-[#EBF5EE]">
          <Upload size={14} aria-hidden="true" /> Import crops
        </button>
      </div>
      {showImport && <ParcelCropsImportModal onClose={() => setShowImport(false)} onCrops={addImported} />}
      <p className="text-[11px] text-[#7A8E7A]">
        This records what grows on this land. To track a season's planting, activities, and harvest, use Crop Monitoring.
      </p>
      <div className="grid gap-3 md:grid-cols-3">
        <div>
          <label className={labelCls}>Crop Name</label>
          <ComboboxWithOther
            options={CROP_OPTIONS.filter(o => o !== 'Other')}
            value={parcel._cropName}
            otherValue={parcel._cropNameOther}
            placeholder="Select crop..."
            onChange={(v) => set('_cropName', v)}
            onOtherChange={(v) => set('_cropNameOther', v)}
          />
        </div>
        <div>
          <label className={labelCls}>Crop Area (ha)</label>
          <DecimalInput decimals={4} className={baseInputClasses} placeholder="0.00"
            value={parcel._cropArea} onChange={v => set('_cropArea', v)} />
        </div>
        <div>
          <label className={labelCls}>Variety Used</label>
          <input className={baseInputClasses} placeholder="e.g. NSIC Rc 222" value={parcel._cropVariety}
            onChange={e => set('_cropVariety', e.target.value)} />
        </div>
        {PERENNIAL_CROPS.includes(parcel._cropName) && (
          <div>
            <label className={labelCls}>No. of Trees</label>
            <input type="number" min="0" className={baseInputClasses}
              value={parcel._cropTrees} onChange={e => set('_cropTrees', e.target.value)} />
          </div>
        )}
        <div>
          <label className={labelCls}>Seed Source</label>
          <select className={baseInputClasses} value={parcel._cropSeedSource}
            onChange={e => set('_cropSeedSource', e.target.value)}>
            {SEED_SOURCE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
          </select>
        </div>
        <div className="flex gap-2">
          <div className="flex-1">
            <label className={labelCls}>Qty of Seeds</label>
            <input type="number" min="0" step="0.01" className={baseInputClasses} placeholder="0.00"
              value={parcel._cropQtySeeds} onChange={e => set('_cropQtySeeds', e.target.value)} />
          </div>
          <div className="w-20 flex-shrink-0">
            <label className={labelCls}>Unit</label>
            <select className={baseInputClasses} value={parcel._cropSeedsUnit}
              onChange={e => set('_cropSeedsUnit', e.target.value)}>
              {SEEDS_UNIT_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
        </div>
      </div>

      <PcicInsuranceField
        value={parcel._cropPcic}
        error={parcel._cropPcicError}
        subject="crop"
        onChange={(next) => { set('_cropPcic', next); set('_cropPcicError', '') }}
      />

      <div className="flex items-center justify-between gap-3 pt-1">
        <label className="flex min-h-[40px] cursor-pointer items-center gap-2">
          <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]"
            checked={parcel._cropIsMain} onChange={e => set('_cropIsMain', e.target.checked)} />
          <span className="text-[13px] text-[#1A2B1A]">Main Crop</span>
        </label>
        <button type="button" onClick={addCrop}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-4 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#235E38]">
          <Plus size={15} /> Add Crop to This Parcel
        </button>
      </div>

      {parcel.crops.length > 0 && (
        <div className={`overflow-hidden rounded-lg border border-[#E2E8E2] ${STACK_TABLES}`}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#EBF5EE] text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">
              <tr>
                <th className="px-3 py-2 text-left">Crop</th>
                <th className="px-3 py-2 text-left">Variety</th>
                <th className="px-3 py-2 text-left">Area (ha)</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {parcel.crops.map(c => (
                <tr key={c._uid} className="bg-white hover:bg-[#F9FAF9]">
                  <td data-label="Crop" className="px-3 py-2 text-[13px] text-[#1A2B1A]">
                    {cropLabel(c)}
                    {c.is_main_crop && <span className="ml-1.5 rounded-full bg-[#EBF5EE] px-2 py-0.5 text-[10px] font-semibold text-[#1B4D2E]">Main</span>}
                    {c.pcic?.insured && <span className="ml-1.5 rounded-full bg-[#E8F0FE] px-2 py-0.5 text-[10px] font-semibold text-[#1A4FA0]">PCIC</span>}
                  </td>
                  <td data-label="Variety" className="px-3 py-2 text-[12px] text-[#7A8E7A]">{c.variety_used || '—'}</td>
                  <td data-label="Area (ha)" className="px-3 py-2 text-[13px] text-[#1A2B1A]">{c.area_hectares}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeCrop(c._uid)} aria-label="Remove crop" className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-600 max-md:min-h-[40px] max-md:rounded-lg max-md:border max-md:border-rose-200 max-md:px-4 max-md:text-[13px] max-md:font-medium max-md:text-rose-600">
                      <Trash2 size={13} /><span className="md:hidden">Remove</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Step 4: Agricultural Machinery ───────────────────────────────────────────

function MachineryStep({ parcel, set }) {
  const addMachinery = () => {
    if (parcel._machineryType === 'Other' && !parcel._machineryTypeOther.trim()) return
    const entry = {
      _uid: Date.now(),
      machinery_type: parcel._machineryType,
      machinery_type_other: parcel._machineryType === 'Other' ? parcel._machineryTypeOther : '',
      quantity: parseInt(parcel._machineryQty) || 1,
      ownership: parcel._machineryOwnership,
    }
    set('machinery', [...parcel.machinery, entry])
    set('_machineryTypeOther', '')
    set('_machineryQty', '1')
  }

  const removeMachinery = (uid) => set('machinery', parcel.machinery.filter(m => m._uid !== uid))

  return (
    <div className="space-y-3">
      <SectionHeader icon={Settings} title="Agricultural Machinery" subtitle="Equipment used on this parcel — optional step" />
      <div className="grid gap-3 md:grid-cols-2">
        <div>
          <label className={labelCls}>Machinery Type</label>
          <ComboboxWithOther
            options={MACHINERY_OPTIONS.filter(o => o !== 'Other')}
            value={parcel._machineryType}
            otherValue={parcel._machineryTypeOther}
            placeholder="Select machinery..."
            onChange={(v) => set('_machineryType', v)}
            onOtherChange={(v) => set('_machineryTypeOther', v)}
          />
        </div>
        <div>
          <label className={labelCls}>Quantity</label>
          <input type="number" min="1" className={baseInputClasses}
            value={parcel._machineryQty} onChange={e => set('_machineryQty', e.target.value)} />
        </div>
      </div>

      <div>
        <label className={labelCls}>Equipment Ownership</label>
        <p className="-mt-1 mb-1.5 text-[11px] text-[#7A8E7A]">Who owns this equipment (not the land)</p>
        <select className={baseInputClasses} value={parcel._machineryOwnership}
          onChange={e => set('_machineryOwnership', e.target.value)}>
          {OWNERSHIP_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      </div>

      <div className="flex justify-end">
        <button type="button" onClick={addMachinery}
          className="flex min-h-[40px] items-center gap-1.5 rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-4 py-2.5 text-[13px] font-semibold text-[#1B4D2E] transition hover:bg-[#EBF5EE]">
          <Plus size={15} /> Add Machinery to This Parcel
        </button>
      </div>

      {parcel.machinery.length > 0 && (
        <div className={`overflow-hidden rounded-lg border border-[#E2E8E2] ${STACK_TABLES}`}>
          <table className="min-w-full text-sm">
            <thead className="bg-[#EBF5EE] text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">
              <tr>
                <th className="px-3 py-2 text-left">Machinery</th>
                <th className="px-3 py-2 text-left">Qty</th>
                <th className="px-3 py-2 text-left">Ownership</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#F0F4F0]">
              {parcel.machinery.map(m => (
                <tr key={m._uid} className="bg-white hover:bg-[#F9FAF9]">
                  <td data-label="Machinery" className="px-3 py-2 text-[13px] text-[#1A2B1A]">{machineryLabel(m)}</td>
                  <td data-label="Qty" className="px-3 py-2 text-[13px] text-[#1A2B1A]">{m.quantity}</td>
                  <td data-label="Ownership" className="px-3 py-2 text-[13px] text-[#1A2B1A]">{m.ownership}</td>
                  <td className="px-3 py-2 text-right">
                    <button type="button" onClick={() => removeMachinery(m._uid)} aria-label="Remove machinery" className="inline-flex items-center gap-1.5 text-rose-400 hover:text-rose-600 max-md:min-h-[40px] max-md:rounded-lg max-md:border max-md:border-rose-200 max-md:px-4 max-md:text-[13px] max-md:font-medium max-md:text-rose-600">
                      <Trash2 size={13} /><span className="md:hidden">Remove</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Step 5: Confirm ──────────────────────────────────────────────────────────

function ConfirmStep({ parcel, onEdit }) {
  const sections = summarizeParcel(parcel)
  const stepOf = ['core', 'classification', 'crops', 'machinery']
  return (
    <div className="space-y-4">
      <SectionHeader icon={Check} title="Confirm" subtitle="Check everything below. Nothing is saved until you press Save Parcel." />
      {sections.map((section, i) => (
        <div key={section.title} className="overflow-hidden rounded-xl border border-[#E2E8E2]">
          <div className="flex items-center justify-between bg-[#EBF5EE]/60 px-4 py-2.5">
            <p className="text-[13px] font-bold text-[#1A2B1A]">{section.title}</p>
            <button type="button" onClick={() => onEdit(stepOf[i])} className="min-h-[36px] text-[12px] font-semibold text-[#1B4D2E] hover:underline">
              Edit
            </button>
          </div>
          <dl className="divide-y divide-[#F0F4F0]">
            {section.rows.map(([label, value], j) => (
              <div key={`${label}-${j}`} className="flex flex-wrap justify-between gap-x-4 gap-y-0.5 px-4 py-2 text-[13px]">
                <dt className="text-[#7A8E7A]">{label}</dt>
                <dd className="min-w-0 break-words text-right font-medium text-[#1A2B1A]">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  )
}

// ─── Main Modal ───────────────────────────────────────────────────────────────

function AddFarmParcelModal({ farmerId, onClose, onSuccess, onImportParcels }) {
  const { showToast } = useToast()
  const [parcel, setParcel] = useState(makeParcel)
  const [stepIndex, setStepIndex] = useState(0)
  const [isSaving, setIsSaving] = useState(false)
  const [error, setError] = useState('')
  // The parcel was created but a crop or machinery row after it failed: saving again would make a second parcel.
  const [partial, setPartial] = useState(false)
  // Reference-UI success state: shown in place of the form after a save completes, instead of closing the modal
  // immediately — onSuccess() still fires right away so the parent list refreshes in the background.
  const [showSuccess, setShowSuccess] = useState(false)

  const step = STEPS[stepIndex].key
  const isLast = stepIndex === STEPS.length - 1

  const set = (field, value) => setParcel(p => ({ ...p, [field]: value }))

  const goTo = (key) => {
    setError('')
    setStepIndex(STEPS.findIndex(s => s.key === key))
  }

  const next = () => {
    const problem = validateStep(step, parcel)
    if (problem) { setError(problem); return }
    setError('')
    setStepIndex(i => i + 1)
  }

  const back = () => {
    setError('')
    setStepIndex(i => Math.max(0, i - 1))
  }

  const handleSave = async () => {
    // Every earlier step must still be fine (the confirmation page links back to them, so they can change after Next).
    for (const s of STEPS.slice(0, -1)) {
      const problem = validateStep(s.key, parcel)
      if (problem) { goTo(s.key); setError(problem); return }
    }
    setIsSaving(true)
    setError('')
    const photoFailures = []
    let created = null
    try {
      const { data } = await api.post(`/farmers/${farmerId}/parcels/`, parcelPayload(parcel))
      created = data

      for (const crop of parcel.crops) {
        const { data: savedCrop } = await api.post(`/farmers/parcels/${created.id}/crops/`, { ...cropPayload(crop), ...pcicPayload(crop.pcic) })
        try {
          await uploadPcicForm(api, 'crop', savedCrop.id, crop.pcic)
        } catch {
          photoFailures.push(cropLabel(crop))
        }
      }

      for (const mach of parcel.machinery) {
        await api.post(`/farmers/parcels/${created.id}/machinery/`, machineryPayload(mach))
      }
      if (photoFailures.length) {
        showToast(`Saved, but the PCIC form photo could not be uploaded for: ${photoFailures.join(', ')}. Tell your administrator to add it later.`, 'error')
      }
      onSuccess()
      setShowSuccess(true)
    } catch {
      if (created) {
        setPartial(true)
        onSuccess()
        setError('The parcel was saved, but not all of its crops or machinery were. Close this window and add the rest from the farmer’s profile.')
      } else {
        setError('Failed to save the parcel. Please check all fields.')
      }
    } finally {
      setIsSaving(false)
    }
  }

  const handleSubmit = (e) => {
    e.preventDefault()
    if (isSaving || partial) return
    if (isLast) handleSave()
    else next()
  }

  // "Add More Parcels" on the success screen — back to step 1 with a blank parcel, keeping the modal open.
  const handleAddMore = () => {
    setShowSuccess(false)
    setParcel(makeParcel())
    setStepIndex(0)
    setError('')
  }

  const fields = { core: CoreStep, classification: ClassificationStep, crops: CropsStep, machinery: MachineryStep }
  const StepFields = fields[step]

  return (
    <ModalShell
      title="Add Farm Parcel"
      subtitle="OMAg Aringay — Farm Registration"
      icon={Map}
      onClose={onClose}
      maxWidth="max-w-3xl"
      footer={showSuccess ? null : (
        <>
          <Button type="button" variant="ghost" onClick={partial ? onClose : (stepIndex === 0 ? onClose : back)}>
            {partial ? 'Close' : (stepIndex === 0 ? 'Cancel' : 'Back')}
          </Button>
          {!partial && (
            <Button type="submit" form="add-farm-parcel-form" isLoading={isSaving}>
              {isLast ? 'Save Parcel' : 'Next'}
            </Button>
          )}
        </>
      )}
    >
      {showSuccess ? (
        <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[#1B4D2E]">
            <Check size={30} className="text-white" strokeWidth={3} aria-hidden="true" />
          </div>
          <p className="mt-4 text-[17px] font-bold text-[#1A2B1A]">Parcel saved successfully!</p>
          <p className="mt-1 text-[13px] text-[#7A8E7A]">Farm record updated in OMAg Aringay</p>
          <button type="button" onClick={handleAddMore}
            className="mt-6 rounded-lg bg-[#1B4D2E] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#235E38]">
            Add More Parcels
          </button>
        </div>
      ) : (
        <form id="add-farm-parcel-form" onSubmit={handleSubmit} className="space-y-5" noValidate>
          <StepIndicator steps={STEPS} currentIndex={stepIndex} />

          {step === 'confirm'
            ? <ConfirmStep parcel={parcel} onEdit={goTo} />
            : <StepFields parcel={parcel} set={set} onImportParcels={onImportParcels} />}

          {error && (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13px] font-medium text-red-700">{error}</p>
          )}
        </form>
      )}
    </ModalShell>
  )
}

export default AddFarmParcelModal
