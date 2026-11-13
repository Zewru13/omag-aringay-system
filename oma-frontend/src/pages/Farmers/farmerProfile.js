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

// The hectares of a list of parcels, added without float noise ("0.10" + "0.20" is "0.30"); '0' when there is none.
export function areaText(parcels) {
  const hundredths = (parcels || []).reduce((sum, p) => {
    const value = Number.parseFloat(p?.area_hectares)
    return Number.isFinite(value) ? sum + Math.round(value * 100) : sum
  }, 0)
  if (hundredths === 0) return '0'
  return (hundredths / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

// The four totals under the name. `cropTotal` is undefined until it has loaded (shown as a dash); organizations count only the active memberships.
export function profileStats({ parcels, cropTotal, organizations }) {
  const list = parcels || []
  return [
    { key: 'parcels', label: 'Farm Parcels', value: String(list.length), icon: 'mappin' },
    { key: 'area', label: 'Total Area', value: areaText(list), unit: 'ha', icon: 'ruler' },
    { key: 'crops', label: 'Crop Records', value: cropTotal === undefined ? '—' : Number(cropTotal).toLocaleString('en-US'), icon: 'sprout' },
    { key: 'organizations', label: 'Organizations', value: String((organizations || []).filter((o) => o.is_active).length), icon: 'users' },
  ]
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
