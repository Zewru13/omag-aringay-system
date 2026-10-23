// Add Farm Parcel is a five-step form: Core Parcel Details, RSBSA Parcel Classification, Crops Grown, Agricultural Machinery,
// then a page to confirm before saving. Pure rules for it (what each step needs, what the confirmation page lists, what is
// sent to the server), with no screen and no network, so they can be tested on their own.
import { isValidIdNumber } from '../../utils/idNumbers.js'

export const STEPS = [
  { key: 'core', label: 'Core Parcel Details' },
  { key: 'classification', label: 'RSBSA Parcel Classification' },
  { key: 'crops', label: 'Crops Grown' },
  { key: 'machinery', label: 'Agricultural Machinery' },
  { key: 'confirm', label: 'Confirm' },
]

export const TAX_DECLARATION_RE = /^\d{2}-\d{3}-\d{5}-\d{4}-\d{4}$/
export const RSBSA_FORMAT_ERROR = 'Invalid RSBSA number. Type the digits only (up to 20); the dashes are added as you type.'

// Tree and perennial crops have no "times per year" cropping schedule.
export const PERENNIAL_CROPS = ['Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Other Fruits']

// The ticked classification names after one is ticked or un-ticked (each name once, in the order they were ticked).
export const toggleClassification = (current, name, on) => {
  const without = (current || []).filter((n) => n !== name)
  return on ? [...without, name] : without
}

export const cropLabel = (crop) => (crop.crop_name === 'Other' ? crop.crop_name_other : crop.crop_name)
export const machineryLabel = (m) => (m.machinery_type === 'Other' ? m.machinery_type_other : m.machinery_type)

export function canSkipSchedule(parcel) {
  const main = (parcel.crops || []).find((c) => c.is_main_crop)
  return Boolean(main && PERENNIAL_CROPS.includes(main.crop_name))
}

// The first thing wrong with a step, as a sentence ('' when the step can be left). Only Core Parcel Details has required
// fields; the crops step stops a crop that was typed but never added, because it would be lost.
export function validateStep(key, parcel) {
  if (key === 'core') {
    if (!parcel.area_hectares) return 'Area is required.'
    if (!parcel.barangay) return 'Barangay is required.'
    const taxDec = (parcel.tax_declaration_number || '').trim()
    if (taxDec && !TAX_DECLARATION_RE.test(taxDec)) return 'Tax declaration number needs all 18 digits: RR-MMM-BBBBB-YYYY-NNNN, e.g. 01-002-00005-2023-0142.'
    if ((parcel.land_ownership === 'Tenant' || parcel.land_ownership === 'Lessee') && !(parcel.land_owner_name || '').trim()) {
      return 'Land Owner Name is required for a Tenant or Lessee parcel.'
    }
    if (parcel.land_owner_rsbsa_number && !isValidIdNumber(parcel.land_owner_rsbsa_number)) return RSBSA_FORMAT_ERROR
    // Same cross-field rule the server enforces: a Tax Declaration Number needs the Parcel Number it belongs to.
    if (taxDec && !parcel.parcel_number) return 'Parcel Number is required when a Tax Declaration Number is provided.'
  }
  if (key === 'crops' && parcel._cropArea) {
    return 'You typed a crop area but did not add the crop. Press "Add Crop to This Parcel", or clear the area.'
  }
  return ''
}

// What is sent to create the parcel (its crops and machinery are saved after it, one request each).
export const parcelPayload = (parcel) => ({
  parcel_number: parcel.parcel_number,
  area_hectares: parseFloat(parcel.area_hectares),
  land_ownership: parcel.land_ownership,
  land_owner_name: parcel.land_owner_name,
  land_owner_rsbsa_number: parcel.land_owner_rsbsa_number,
  tax_declaration_number: parcel.tax_declaration_number,
  barangay: parcel.barangay,
  farm_type: parcel.farm_type,
  classifications: parcel.classifications || [],
  cropping_schedule: parcel.cropping_schedule,
})

// A crop or machinery row as the server takes it: without the form's own bookkeeping (_uid, and the PCIC state, which is
// sent separately).
const without = (row, keys) => Object.fromEntries(Object.entries(row).filter(([key]) => !keys.includes(key)))
export const cropPayload = (crop) => without(crop, ['_uid', 'pcic'])
export const machineryPayload = (machinery) => without(machinery, ['_uid'])

// Crops read from a crops file, added to the crops already on the form. Each gets its own id and no PCIC insurance (the file
// has no PCIC form photo, so that stays something to add by hand); a main crop in the file replaces the one already there.
export function addImportedCrops(existing, imported, firstUid) {
  const importsMain = imported.some((c) => c.is_main_crop)
  const kept = importsMain ? existing.map((c) => ({ ...c, is_main_crop: false })) : existing
  return [...kept, ...imported.map((c, i) => ({ ...c, _uid: firstUid + i, pcic: { insured: false, file: null, url: '' } }))]
}

const dash = (value) => (value === undefined || value === null || value === '' ? '—' : String(value))

// The confirmation page: every section as { title, rows: [[label, value], ...] }.
export function summarizeParcel(parcel) {
  const owner = parcel.land_ownership === 'Tenant' || parcel.land_ownership === 'Lessee'
  const core = [
    ['Parcel number', dash(parcel.parcel_number)],
    ['Area (ha)', dash(parcel.area_hectares)],
    ['Tax declaration number', dash(parcel.tax_declaration_number)],
    ['Barangay', dash(parcel.barangay)],
    ['Land ownership', dash(parcel.land_ownership)],
    ...(owner ? [['Land owner', dash(parcel.land_owner_name)], ['Land owner RSBSA', dash(parcel.land_owner_rsbsa_number)]] : []),
  ]
  const flags = parcel.classifications || []
  const classification = [
    ['Farm type', dash(parcel.farm_type)],
    ['Cropping schedule', canSkipSchedule(parcel) ? 'Not applicable (perennial main crop)' : dash(parcel.cropping_schedule)],
    ['Classification', flags.length ? flags.join(', ') : '—'],
  ]
  const crops = (parcel.crops || []).length
    ? parcel.crops.map((c) => [cropLabel(c), [`${c.area_hectares} ha`, c.is_main_crop && 'Main crop', c.variety_used, c.pcic?.insured && 'PCIC insured'].filter(Boolean).join(' · ')])
    : [['No crops added', '']]
  const machinery = (parcel.machinery || []).length
    ? parcel.machinery.map((m) => [machineryLabel(m), `Qty ${m.quantity} · ${m.ownership}`])
    : [['No machinery added', '']]
  return [
    { title: 'Core Parcel Details', rows: core },
    { title: 'RSBSA Parcel Classification', rows: classification },
    { title: 'Crops Grown', rows: crops },
    { title: 'Agricultural Machinery', rows: machinery },
  ]
}
