// The rules of the farmer profile screen (Admin / Focal Person): which classification chips a farmer gets and what they mean, the four totals under the
// name, the age, the place line and the legend of the crop stages. No screen and no network, so they can be tested alone.
import { ageOn } from '../Fisherfolk/fisherfolkForm.js'

// One chip per ticked classification, in this order. `tone` is the colour family, `icon` the name of its picture (FarmerProfileParts.jsx draws it).
const CHIPS = [
  { key: 'pwd', field: 'is_pwd', label: 'Person with Disability (PWD)', meaning: 'Registered as a person with a disability.', tone: 'blue', icon: 'accessibility' },
  { key: 'fourps', field: 'is_4ps_beneficiary', label: '4Ps Beneficiary', meaning: 'A beneficiary of the Pantawid Pamilyang Pilipino Program.', tone: 'green', icon: 'handheart' },
  { key: 'icc_ip', field: 'is_icc_ip_member', label: 'ICC/IP Member', meaning: 'A member of an indigenous cultural community.', tone: 'purple', icon: 'feather' },
  { key: 'senior', field: 'is_senior_citizen', label: 'Senior Citizen', meaning: 'Sixty years old or more.', tone: 'amber', icon: 'hourglass' },
  { key: 'laborer', field: 'is_farm_laborer', label: 'Farm Laborer', meaning: 'Works on farms owned by others.', tone: 'orange', icon: 'wrench' },
]

export function classificationChips(farmer) {
  return CHIPS.filter((c) => farmer?.[c.field]).map(({ key, label, meaning, tone, icon }) => {
    const chip = { key, label, meaning, tone, icon }
    if (chip.key === 'icc_ip' && farmer.icc_ip_name) return { ...chip, label: `${chip.label} — ${farmer.icc_ip_name}` }
    return chip
  })
}

// What a crop grown on a parcel says about itself: [[label, value], ...] ("—" for what was not recorded).
const dash = (value) => (value === undefined || value === null || value === '' ? '—' : String(value))
export const cropGrownName = (crop) => (crop?.crop_name === 'Other' ? crop.crop_name_other : crop?.crop_name) || ''

export function cropGrownRows(crop) {
  const planted = crop.number_of_trees
    ? ['Trees', String(crop.number_of_trees)]
    : ['Seeds', crop.quantity_of_seeds_used ? `${crop.quantity_of_seeds_used} ${crop.seeds_unit || ''}`.trim() : '—']
  return [
    ['Crop', dash(cropGrownName(crop))],
    ['Variety', dash(crop.variety_used)],
    ['Area (ha)', dash(crop.area_hectares)],
    ['Main crop', crop.is_main_crop ? 'Yes' : 'No'],
    planted,
    ['Seed source', dash(crop.seed_source)],
    ['PCIC insurance', crop.has_pcic_insurance ? 'Yes' : 'No'],
  ]
}

// The plantings (crop monitoring records) of a parcel that are of this crop, whatever the capitals.
export function plantingsOf(crop, records) {
  const name = cropGrownName(crop).trim().toLowerCase()
  if (!name) return []
  return (records || []).filter((r) => String(r.crop_type_name || '').trim().toLowerCase() === name)
}

export function ageText(birthdate, today = new Date()) {
  const age = ageOn(birthdate, today)
  return age === null ? '' : `${age} yrs`
}

export const locationText = (farmer) => [farmer?.barangay, farmer?.municipality, farmer?.province].filter(Boolean).join(', ')

// What each colour of a crop's status pill means (the stages the crops windows show), in the order of a crop's life.
export const STATUS_LEGEND = [
  { label: 'Planted', tone: 'green', meaning: 'Growing in the field.' },
  { label: 'Near Harvest', tone: 'amber', meaning: 'The harvest is close.' },
  { label: 'Due Harvest', tone: 'amber', meaning: 'The expected harvest date is still ahead.' },
  { label: 'Ready for Harvest', tone: 'rose', meaning: 'Harvest day, or up to 7 days past it.' },
  { label: 'Overdue', tone: 'rose', meaning: 'More than 7 days past with no harvest recorded.' },
  { label: 'Harvested', tone: 'blue', meaning: 'The harvest is recorded.' },
  { label: 'Total Loss', tone: 'rose', meaning: 'The whole crop was lost.' },
]
