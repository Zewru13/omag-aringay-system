// What Home of a farmer, fisherfolk or organization account loads and shows besides the to-do list (todoRules.js): the parts it asks
// for, the summary strip, the active records and the greeting. A part that failed to load is null: its figures are unknown (shown as
// a dash), never zero. No screen and no network here, so the rules can be tested on their own.

// The parts Home loads for an account. A farmer or fisherfolk outside any organization has no loans to ask for.
export function homeSources(kind, { isMember = false } = {}) {
  if (kind === 'farmer') return ['assistance', 'crops', 'parcels', ...(isMember ? ['loans'] : [])]
  if (kind === 'fisherfolk') return ['assistance', 'cycles', ...(isMember ? ['loans'] : [])]
  if (kind === 'orgFarm' || kind === 'orgFish') return ['members', 'confirmables', 'loans']
  return []
}

const ACTIVE_CROP = ['Planted', 'Near Harvest']
const ENDED_CYCLE = ['Harvested', 'Total Loss']
const isActiveCycle = (cycle) => !ENDED_CYCLE.includes(cycle.status)

// The crops or cycles still in the field or the water. An organization has no such list on Home.
export function homeActive(kind, data) {
  if (kind === 'farmer') return (data.crops || []).filter((crop) => ACTIVE_CROP.includes(crop.status))
  if (kind === 'fisherfolk') return (data.cycles || []).filter(isActiveCycle)
  return []
}

const sum = (rows, key) => rows.reduce((total, row) => total + (Number(row[key]) || 0), 0)
const hectares = (value) => `${value % 1 === 0 ? value : value.toFixed(1)} ha`
// `source` is the loaded list or null; the figure is only worked out when the list is known.
const figure = (label, source, work) => ({ label, value: source ? work(source) : null })

// The three figures under the lists. `isActive(member)` is the organization domain's own rule for an active member.
export function homeSummary(kind, data, { isActive = (member) => member.is_active !== false } = {}) {
  if (kind === 'farmer') {
    const active = data.crops ? homeActive(kind, data) : null
    return [
      figure('Active crops', active, (rows) => rows.length),
      figure('Total area', active, (rows) => hectares(Math.round(sum(rows, 'area_planted_ha') * 100) / 100)),
      figure('Farm parcels', data.parcels, (rows) => rows.length),
    ]
  }
  if (kind === 'fisherfolk') {
    const active = data.cycles ? homeActive(kind, data) : null
    return [
      figure('Active cycles', active, (rows) => rows.length),
      figure('Ponds and cages', active, (rows) => sum(rows, 'number_of_units')),
      figure('Harvested cycles', data.cycles, (rows) => rows.filter((cycle) => cycle.status === 'Harvested').length),
    ]
  }
  return [
    figure('Active members', data.members, (rows) => rows.filter(isActive).length),
    figure('Equipment on loan', data.loans, (rows) => rows.filter((loan) => loan.status === 'BORROWED' || loan.status === 'RETURN_PENDING').length),
    figure('Borrow requests', data.loans, (rows) => rows.filter((loan) => loan.status === 'REQUESTED').length),
  ]
}

const ACCOUNT_LINE = {
  farmer: 'Farmer account',
  fisherfolk: 'Fisherfolk account',
  orgFarm: 'Farmers cooperative account',
  orgFish: 'Fisherfolk cooperative account',
}

export function greeting(kind, label) {
  return { title: label ? `Hello, ${label}` : 'Hello', line: ACCOUNT_LINE[kind] || 'Account' }
}

const PART_NAME = {
  assistance: 'your assistance',
  crops: 'your crops',
  parcels: 'your farm parcels',
  cycles: 'your cycles',
  loans: 'your equipment loans',
  members: 'your members',
  confirmables: 'the confirmations waiting',
  suggestions: 'the activities that are due',
}

// The parts that could not be loaded, in plain words: "your assistance, your cycles and your equipment loans".
export function failedText(failed) {
  const names = failed.map((part) => PART_NAME[part] || part)
  if (names.length <= 1) return names[0] || ''
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`
}
