// The Add Farm Parcels page: several parcels for one farmer, one table row each, with the crops and machinery of each parcel in
// small tables under it. Pure rules for it (the blank rows, what is wrong with a row, what is sent to the server, how the
// server's answer maps back onto the rows), with no screen and no network, so they can be tested on their own.
import { isValidIdNumber } from '../../utils/idNumbers.js'
import { EMPTY_PCIC, pcicError, pcicPayload } from '../../utils/pcic.js'

export const TAX_DECLARATION_RE = /^\d{2}-\d{3}-\d{5}-\d{4}-\d{4}$/
export const RSBSA_FORMAT_ERROR = 'Invalid RSBSA number. Type the digits only (up to 20); the dashes are added as you type.'
export const MAX_PARCELS = 50

// Tree and perennial crops have no "times per year" cropping schedule.
export const PERENNIAL_CROPS = ['Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Other Fruits']

// Values must match the backend choices exactly (FarmParcel / FarmCrop / FarmMachinery): they are sent as the raw value.
export const CROP_OPTIONS = [
  'Palay (Rice)', 'Corn (Mais)', 'Onion', 'Garlic', 'Tomato', 'Eggplant (Talong)', 'Bitter Gourd (Ampalaya)', 'String Beans (Sitaw)',
  'Pechay', 'Cabbage', 'Mango', 'Cacao (Kakaw)', 'Banana (Saging)', 'Coffee (Kape)', 'Cassava', 'Sweet Potato (Kamote)',
  'Other Vegetables', 'Other Fruits', 'Other Root Crops', 'Cash Crops', 'Other',
]
export const MACHINERY_OPTIONS = ['Hand Tractor', 'Four-Wheel Tractor', 'Thresher', 'Water Pump', 'Sprayer', 'Harvester', 'Rice Mill', 'Other']
export const OWNERSHIP_OPTIONS = ['Owned', 'Borrowed', 'Rented', 'Organization-Owned']
export const LAND_OWNERSHIP_OPTIONS = ['Owner', 'Tenant', 'Lessee']
// The DA RSBSA Enrollment Form's Farm Type legend, and the cropping schedules (FarmParcel.FARM_TYPE_CHOICES / CROPPING_SCHEDULE_CHOICES).
export const FARM_TYPE_OPTIONS = ['Irrigated', 'Rainfed Upland', 'Rainfed Lowland', 'Urban or Peri-Urban']
export const CROPPING_SCHEDULE_OPTIONS = ['Single Cropping', 'Double Cropping', 'Triple Cropping']
export const SEED_SOURCE_OPTIONS = ['Certified Seed', 'Farmer-saved Seed', 'Hybrid Seed', 'OPV Seed', 'Other']
export const SEEDS_UNIT_OPTIONS = ['kg', 'bag', 'piece']

// Parcel number RR-PP-MM-BBB-SSS-LL-NNN (Region-Province-Municipality-Barangay-Section-Block-Lot, e.g. 01-33-02-005-001-02-003): typed as
// digits in one box with the dashes added for you, stopped at 17 digits, like the tax declaration number.
export const PARCEL_NUMBER_GROUPS = [2, 2, 2, 3, 3, 2, 3]
export const PARCEL_NUMBER_DIGITS = 17
export const PARCEL_NUMBER_RE = /^\d{2}-\d{2}-\d{2}-\d{3}-\d{3}-\d{2}-\d{3}$/
export const PARCEL_NUMBER_PLACEHOLDER = '01-33-02-005-001-02-003'
// Tax Declaration Number: typed as digits with the dashes added for you, stopped at 18 digits (RR-MMM-BBBBB-YYYY-NNNN).
export const TAX_DECLARATION_GROUPS = [2, 3, 5, 4]
export const TAX_DECLARATION_DIGITS = 18


export const isTenure = (ownership) => ownership === 'Tenant' || ownership === 'Lessee'
export const cropLabel = (crop) => (crop.crop_name === 'Other' ? crop.crop_name_other : crop.crop_name)
export const machineryLabel = (m) => (m.machinery_type === 'Other' ? m.machinery_type_other : m.machinery_type)

// The ticked classification names after one is ticked or un-ticked (each name once, in the order they were ticked).
export const toggleClassification = (current, name, on) => {
  const without = (current || []).filter((n) => n !== name)
  return on ? [...without, name] : without
}

export function canSkipSchedule(parcel) {
  const main = (parcel.crops || []).find((c) => c.is_main_crop)
  return Boolean(main && PERENNIAL_CROPS.includes(main.crop_name))
}

// ── blank rows
export const makeParcelRow = (id) => ({
  _id: id,
  parcel_number: '',
  area_hectares: '',
  land_ownership: 'Owner',
  land_owner_name: '',
  land_owner_rsbsa_number: '',
  tax_declaration_number: '',
  barangay: '',
  farm_type: '',
  cropping_schedule: '',
  classifications: [],
  crops: [],
  machinery: [],
})

export const makeCropRow = (uid) => ({
  _uid: uid,
  crop_name: 'Palay (Rice)',
  crop_name_other: '',
  area_hectares: '',
  is_main_crop: false,
  variety_used: '',
  seed_source: 'Certified Seed',
  quantity_of_seeds_used: '',
  seeds_unit: 'kg',
  number_of_trees: '',
  pcic: { ...EMPTY_PCIC },
})

export const makeMachineryRow = (uid) => ({ _uid: uid, machinery_type: 'Hand Tractor', machinery_type_other: '', quantity: '1', ownership: 'Owned' })

// Crops read from a crops file, added to the crops already on the row. Each gets its own id and no PCIC insurance (the file has
// no PCIC form photo, so that stays something to add by hand); a main crop in the file replaces the one already there.
export function addImportedCrops(existing, imported, firstUid) {
  const importsMain = imported.some((c) => c.is_main_crop)
  const kept = importsMain ? existing.map((c) => ({ ...c, is_main_crop: false })) : existing
  return [...kept, ...imported.map((c, i) => ({
    ...makeCropRow(firstUid + i),
    ...c,
    area_hectares: c.area_hectares === undefined || c.area_hectares === null ? '' : String(c.area_hectares),
    quantity_of_seeds_used: c.quantity_of_seeds_used === undefined || c.quantity_of_seeds_used === null ? '' : String(c.quantity_of_seeds_used),
    number_of_trees: c.number_of_trees === undefined || c.number_of_trees === null ? '' : String(c.number_of_trees),
    _uid: firstUid + i,
    pcic: { ...EMPTY_PCIC },
  }))]
}

// ── what is wrong with a row ('' when nothing is)
const positive = (value) => Number(value) > 0

export function cropProblem(crop) {
  if (!crop.crop_name) return 'choose the crop'
  if (crop.crop_name === 'Other' && !(crop.crop_name_other || '').trim()) return 'type the crop name'
  if (!positive(crop.area_hectares)) return 'enter the crop area'
  if (crop.number_of_trees !== '' && crop.number_of_trees !== null && crop.number_of_trees !== undefined && !(Number(crop.number_of_trees) >= 0)) return 'the number of trees cannot be negative'
  return pcicError(crop.pcic)
}

export function machineryProblem(m) {
  if (!m.machinery_type) return 'choose the machinery'
  if (m.machinery_type === 'Other' && !(m.machinery_type_other || '').trim()) return 'type the machinery name'
  if (!(Number(m.quantity) >= 1)) return 'enter a quantity of at least 1'
  return ''
}

// ── how much land the crops may use (mirrors farmers/area_rules.py; the server is the one that enforces it)
// One crop can never be bigger than its parcel; all the crops together cannot be more than the parcel, except that a Double or
// Triple Cropping parcel may declare up to 2 or 3 times its area.
export const SCHEDULE_TIMES = { 'Double Cropping': 2, 'Triple Cropping': 3 }
const round4 = (value) => Math.round((Number(value) || 0) * 10000) / 10000
export const fmtHa = (value) => String(round4(value))

export function cropCapacity(row) {
  const schedule = canSkipSchedule(row) ? '' : row.cropping_schedule
  return round4(Number(row.area_hectares) * (SCHEDULE_TIMES[schedule] || 1))
}

export const cropsAreaUsed = (row) => round4((row.crops || []).reduce((sum, c) => sum + (Number(c.area_hectares) || 0), 0))

// One message ('' when fine) per crop of the row: too big for the parcel, or the one that tips the total over what the parcel allows.
export function cropAreaProblems(row) {
  const area = round4(row.area_hectares)
  if (!(area > 0)) return (row.crops || []).map(() => '')
  const limit = cropCapacity(row)
  let running = 0
  return (row.crops || []).map((c) => {
    const cropArea = round4(c.area_hectares)
    running = round4(running + cropArea)
    if (cropArea > area) return `a crop cannot be bigger than its parcel (${fmtHa(cropArea)} ha crop, ${fmtHa(area)} ha parcel)`
    if (running > limit) return `the crops would come to ${fmtHa(running)} ha, more than the ${fmtHa(limit)} ha this parcel allows`
    return ''
  })
}

export function rowProblem(row) {
  if (!positive(row.area_hectares)) return 'enter the area (ha)'
  if (!row.barangay) return 'choose the barangay'
  if (row.parcel_number && !PARCEL_NUMBER_RE.test(row.parcel_number)) return `the parcel number needs all ${PARCEL_NUMBER_DIGITS} digits: RR-PP-MM-BBB-SSS-LL-NNN, e.g. ${PARCEL_NUMBER_PLACEHOLDER}`
  const taxDec = (row.tax_declaration_number || '').trim()
  if (taxDec && !TAX_DECLARATION_RE.test(taxDec)) return 'the tax declaration number needs all 18 digits: RR-MMM-BBBBB-YYYY-NNNN, e.g. 01-002-00005-2023-0142'
  if (taxDec && !row.parcel_number) return 'a parcel number is required when a tax declaration number is given'
  if (isTenure(row.land_ownership) && !(row.land_owner_name || '').trim()) return 'enter the land owner name for a tenant or lessee parcel'
  if (row.land_owner_rsbsa_number && !isValidIdNumber(row.land_owner_rsbsa_number)) return 'the land owner RSBSA number is not valid (digits only, up to 20; the dashes are added as you type)'
  for (let i = 0; i < row.crops.length; i += 1) {
    const problem = cropProblem(row.crops[i])
    if (problem) return `crop ${i + 1}: ${problem}`
  }
  if (row.crops.filter((c) => c.is_main_crop).length > 1) return 'only one crop can be the main crop'
  const tooBig = cropAreaProblems(row)
  for (let i = 0; i < tooBig.length; i += 1) {
    if (tooBig[i]) return `crop ${i + 1}: ${tooBig[i]}`
  }
  for (let i = 0; i < row.machinery.length; i += 1) {
    const problem = machineryProblem(row.machinery[i])
    if (problem) return `machinery ${i + 1}: ${problem}`
  }
  return ''
}

// The same parcel number twice in one form (the server also refuses one the farmer already has).
export function duplicateNumberProblems(rows) {
  const seen = new Map()
  const found = {}
  rows.forEach((row) => {
    const number = row.parcel_number
    if (!number) return
    if (seen.has(number)) found[row._id] = `parcel number ${number} is already used by parcel ${seen.get(number)}`
    else seen.set(number, rows.indexOf(row) + 1)
  })
  return found
}

// { [row._id]: 'Parcel 2: ...' } for every row that cannot be saved yet; {} when all are fine.
export function validateRows(rows) {
  const duplicates = duplicateNumberProblems(rows)
  const problems = {}
  rows.forEach((row, i) => {
    const problem = rowProblem(row) || duplicates[row._id] || ''
    if (problem) problems[row._id] = `Parcel ${i + 1}: ${problem}.`
  })
  return problems
}

// ── what is sent
const numberOrNull = (value) => (value === '' || value === null || value === undefined ? null : Number(value))

export function cropPayload(crop) {
  return {
    crop_name: crop.crop_name,
    crop_name_other: crop.crop_name === 'Other' ? crop.crop_name_other : '',
    area_hectares: Number(crop.area_hectares),
    is_main_crop: Boolean(crop.is_main_crop),
    variety_used: crop.variety_used || '',
    seed_source: crop.seed_source || '',
    quantity_of_seeds_used: numberOrNull(crop.quantity_of_seeds_used),
    seeds_unit: crop.seeds_unit || 'kg',
    number_of_trees: PERENNIAL_CROPS.includes(crop.crop_name) ? numberOrNull(crop.number_of_trees) : null,
    ...pcicPayload(crop.pcic),
  }
}

export const machineryPayload = (m) => ({
  machinery_type: m.machinery_type,
  machinery_type_other: m.machinery_type === 'Other' ? m.machinery_type_other : '',
  quantity: parseInt(m.quantity, 10) || 1,
  ownership: m.ownership,
})

export function parcelPayload(row) {
  return {
    parcel_number: row.parcel_number,
    area_hectares: Number(row.area_hectares),
    land_ownership: row.land_ownership,
    land_owner_name: isTenure(row.land_ownership) ? row.land_owner_name : '',
    land_owner_rsbsa_number: isTenure(row.land_ownership) ? row.land_owner_rsbsa_number : '',
    tax_declaration_number: row.tax_declaration_number,
    barangay: row.barangay,
    farm_type: row.farm_type,
    classifications: row.classifications || [],
    // A perennial (tree) main crop has no cropping schedule.
    cropping_schedule: canSkipSchedule(row) ? '' : row.cropping_schedule,
    crops: row.crops.map(cropPayload),
    machinery: row.machinery.map(machineryPayload),
  }
}

export const buildPayload = (rows) => rows.map(parcelPayload)

// The PCIC form photos to upload once the parcels are saved: [{ cropId, pcic, label }], pairing each crop that has a photo with
// the id the server gave it (`created[i].crop_ids[j]`, in the order the crops were sent).
export function pcicUploads(rows, created) {
  const uploads = []
  rows.forEach((row, i) => {
    row.crops.forEach((crop, j) => {
      const cropId = created?.[i]?.crop_ids?.[j]
      if (cropId && crop.pcic?.insured && crop.pcic.file) uploads.push({ cropId, pcic: crop.pcic, label: cropLabel(crop) })
    })
  })
  return uploads
}

// ── what the server says
const words = (key) => key.replace(/_/g, ' ')
const firstMessage = (value) => (Array.isArray(value) ? String(value[0]) : String(value))

// The server's `errors` (one entry per parcel sent: {} or {field: [messages], crops: [...], machinery: [...]}) as { [row._id]:
// 'Parcel 2: area hectares: ...' }.
export function serverErrorsToMessages(errors, rows) {
  const messages = {}
  ;(errors || []).forEach((problems, i) => {
    if (!problems || !rows[i]) return
    const parts = []
    Object.entries(problems).forEach(([field, value]) => {
      if ((field === 'crops' || field === 'machinery') && Array.isArray(value)) {
        value.forEach((nested, n) => {
          if (nested && typeof nested === 'object') {
            Object.entries(nested).forEach(([key, msg]) => parts.push(`${field === 'crops' ? 'crop' : 'machinery'} ${n + 1} ${words(key)}: ${firstMessage(msg)}`))
          }
        })
      } else if (field === 'non_field_errors') {
        parts.push(firstMessage(value))
      } else {
        parts.push(`${words(field)}: ${firstMessage(value)}`)
      }
    })
    if (parts.length) messages[rows[i]._id] = `Parcel ${i + 1}: ${parts.join(' · ')}`
  })
  return messages
}

// ── editing one parcel that exists (the Edit Parcel window on the farmer profile)
const EDIT_FIELDS = ['parcel_number', 'barangay', 'land_ownership', 'land_owner_name', 'land_owner_rsbsa_number', 'tax_declaration_number', 'farm_type', 'cropping_schedule']

// The window's form values, from the parcel as the server sent it.
export function parcelToForm(parcel) {
  const form = { area_hectares: String(parseFloat(parcel.area_hectares)), classifications: [...(parcel.classifications || [])] }
  EDIT_FIELDS.forEach((field) => { form[field] = parcel[field] || '' })
  return form
}

// Whether the main crop already declared on the parcel is a tree crop (then it has no cropping schedule).
export const parcelSkipsSchedule = (parcel) => canSkipSchedule({ crops: parcel.crops || [] })

// What is wrong with the edit form ('' when nothing). The server still decides whether the area and schedule fit the crops.
export function editProblem(form) {
  return rowProblem({ ...form, crops: [], machinery: [] })
}

// The PATCH body: only what this window edits, with a tenant's land owner dropped for an owner parcel.
export function editPayload(form, parcel) {
  const body = {
    parcel_number: form.parcel_number,
    area_hectares: Number(form.area_hectares),
    land_ownership: form.land_ownership,
    land_owner_name: isTenure(form.land_ownership) ? form.land_owner_name : '',
    land_owner_rsbsa_number: isTenure(form.land_ownership) ? form.land_owner_rsbsa_number : '',
    tax_declaration_number: form.tax_declaration_number,
    barangay: form.barangay,
    farm_type: form.farm_type,
    classifications: form.classifications || [],
    cropping_schedule: parcelSkipsSchedule(parcel) ? '' : form.cropping_schedule,
  }
  return body
}

// The server's field errors ({ field: [messages] }) as { field: 'first message' }, plus a `general` one for anything else.
export function editServerErrors(data) {
  const errors = {}
  Object.entries(data || {}).forEach(([field, value]) => {
    const message = firstMessage(value)
    if (EDIT_FIELDS.includes(field) || field === 'area_hectares' || field === 'classifications') errors[field] = message
    else if (field === 'detail' || field === 'non_field_errors') errors.general = message
  })
  return errors
}
