// The columns of a "Group by" row. A grouped list used to show only a name (and barangay) on each group row; now each row has the same kind of
// columns the ordinary table has: the personal facts of a farmer group (RSBSA No., Barangay, Contact No.) and the group's counts. Pure helpers,
// no screen and no network, so the rules can be tested on their own.
//   kind: 'parcels:farmer' | 'parcels:barangay' | 'parcels:ownership'   Crop Records (GET /farmers/parcels/directory/groups/)
//         'monitoring:crop' | 'monitoring:farmer'                       Crop Monitoring (GET /production/monitoring/groups/)

const SPEC = {
  'parcels:farmer': {
    labels: ['Farmer', 'RSBSA No.', 'Barangay', 'Contact No.', 'Parcels', 'Area (ha)', 'Crops'],
    grid: 'sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_5.5rem_4rem_2rem]',
  },
  'parcels:barangay': {
    labels: ['Barangay', 'Farmers', 'Parcels', 'Area (ha)', 'Crops'],
    grid: 'sm:grid-cols-[minmax(0,2fr)_5rem_5rem_6rem_5rem_2rem]',
  },
  'parcels:ownership': {
    labels: ['Land ownership', 'Farmers', 'Parcels', 'Area (ha)', 'Crops'],
    grid: 'sm:grid-cols-[minmax(0,2fr)_5rem_5rem_6rem_5rem_2rem]',
  },
  'monitoring:crop': {
    labels: ['Crop', 'Farmers', 'Records', 'Area planted (ha)', 'Near harvest'],
    grid: 'sm:grid-cols-[minmax(0,2fr)_5rem_5rem_8rem_6.5rem_2rem]',
  },
  'monitoring:farmer': {
    labels: ['Farmer', 'RSBSA No.', 'Barangay', 'Contact No.', 'Records', 'Area planted (ha)', 'Near harvest'],
    grid: 'sm:grid-cols-[minmax(0,1.5fr)_minmax(0,1.3fr)_minmax(0,1fr)_minmax(0,1fr)_4.5rem_8rem_6.5rem_2rem]',
  },
}

export const GROUP_KINDS = Object.keys(SPEC)
export const groupColumnLabels = (kind) => SPEC[kind].labels
// The grid of a row on a wide screen (a phone stacks the same facts instead). Written out whole so Tailwind can see the classes.
export const groupGridClass = (kind) => SPEC[kind].grid
// The class list for the button that holds one group row (phone: stacked lines and the chevron; wide screen: the columns).
export const groupRowButtonClass = (kind) =>
  `grid min-h-[56px] w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F7F5] focus-visible:bg-[#F5F7F5] focus-visible:outline-none disabled:cursor-default ${SPEC[kind].grid}`

const dash = (value) => (value === undefined || value === null || value === '' ? '—' : String(value))
const hectares = (value) => (Number.isFinite(Number(value)) ? Number(value).toFixed(2) : '0.00')
const whole = (value) => String(Number(value) || 0)

// What each column of one group row holds, in the order of groupColumnLabels(kind).
export function groupCells(kind, group) {
  const person = [dash(group.rsbsa_number), dash(group.barangay), dash(group.contact_number)]
  switch (kind) {
    case 'parcels:farmer': return [group.name, ...person, whole(group.parcels), hectares(group.area_hectares), whole(group.crops)]
    case 'parcels:barangay':
    case 'parcels:ownership': return [group.name, whole(group.farmers), whole(group.parcels), hectares(group.area_hectares), whole(group.crops)]
    case 'monitoring:crop': return [group.name, whole(group.farmers), whole(group.count), hectares(group.area_planted_ha), whole(group.near_harvest)]
    case 'monitoring:farmer': return [group.name, ...person, whole(group.count), hectares(group.area_planted_ha), whole(group.near_harvest)]
    default: return [group.name]
  }
}

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`
const roundedHa = (value) => Math.round((Number(value) || 0) * 100) / 100

// A phone has no room for columns: the same facts, stacked. identity = the person's RSBSA No. / Barangay / Contact No. (only those that exist).
export function groupPhoneLines(kind, group) {
  const identity = ['rsbsa_number', 'barangay', 'contact_number'].map((k) => group[k]).filter(Boolean)
  const ha = roundedHa(kind.startsWith('monitoring') ? group.area_planted_ha : group.area_hectares)
  const area = ha > 0 ? [`${ha} ha`] : []
  const isPerson = kind === 'parcels:farmer' || kind === 'monitoring:farmer'
  let counts
  if (kind === 'parcels:farmer') counts = [plural(group.parcels, 'parcel'), ...area, plural(group.crops, 'crop')]
  else if (kind === 'monitoring:farmer') counts = [plural(group.count, 'record'), ...area, ...(group.near_harvest > 0 ? [`${group.near_harvest} near harvest`] : [])]
  else if (kind === 'monitoring:crop') counts = [plural(group.farmers, 'farmer'), plural(group.count, 'record'), ...area, ...(group.near_harvest > 0 ? [`${group.near_harvest} near harvest`] : [])]
  else counts = [plural(group.farmers, 'farmer'), plural(group.parcels, 'parcel'), ...area, plural(group.crops, 'crop')]
  return { title: group.name, identity: isPerson ? identity.join(' · ') : '', counts: counts.join(' · ') }
}

// Forecasting groups its records by person; the person's own facts are on every record, so the group takes them from the first record that has each.
export function personFacts(records) {
  const first = (key) => records.map((r) => r[key]).find(Boolean) || ''
  return { rsbsa: first('personRsbsa'), barangay: first('personBarangay'), contact: first('personContact') }
}
