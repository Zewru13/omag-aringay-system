// The rules behind Assistance Settings > Assistance Types: its rows, what the Details column says, and the Add Assistance form. No screen and no
// network, so they can be tested alone.

export const DOMAIN_LABELS = { crop: 'Crop', fisheries: 'Fisheries' }
export const DOMAIN_CHOICES = [
  { value: 'crop', label: 'Crop assistance (farmers)' },
  { value: 'fisheries', label: 'Fisheries assistance (fisherfolk)' },
  { value: 'both', label: 'Both' },
]

// The lists of items behind the assistance types that offer an item dropdown (Seeds: the types of seed): the list of Assistance Settings (an
// AssistanceOption `kind`), its titles and what to call its names ("12 types of seed").
const LIST = (kind, title, singular, noun, example) => ({ kind, title, singular, noun, example })
export const TYPE_LISTS = {
  crop: {
    Seeds: LIST('seed', 'Types of Seed', 'Type of Seed', 'seed', 'Hybrid Rice Seed'),
    Fertilizer: LIST('fertilizer', 'Types of Fertilizer', 'Type of Fertilizer', 'fertilizer', 'Complete Fertilizer (14-14-14)'),
    Equipment: LIST('equipment', 'Types of Equipment', 'Type of Equipment', 'equipment', 'Hand Tractor'),
    Training: LIST('training', 'Types of Training', 'Type of Training', 'training', 'Rice Production Training'),
  },
  fisheries: {
    'Fishing Gear': LIST('gear', 'Types of Fishing Gear', 'Type of Fishing Gear', 'fishing gear', 'Gill Net'),
    'Fingerlings/Seeds': LIST('fingerling', 'Types of Fingerlings', 'Type of Fingerlings', 'fingerlings', 'Tilapia Fingerlings'),
    Feed: LIST('feed', 'Types of Feed', 'Type of Feed', 'feed', 'Starter Feed'),
    Equipment: LIST('equipment', 'Types of Equipment', 'Type of Equipment', 'equipment', 'Aerator'),
    Training: LIST('training', 'Types of Training', 'Type of Training', 'training', 'Tilapia Production'),
  },
}

// One row for every type of one domain that has a setting: the types with a unit box (units: the answer of
// /interventions/assistance-type-units/ per domain), a Training row, and the types added with Add Assistance (custom: the answer of
// /interventions/assistance-types/, so a row can be renamed and deleted). A built-in type that offers an item dropdown carries its `list`
// (see TYPE_LISTS) with how many names it holds (lists: { crop: { seed: 12, ... }, fisheries: { ... } }), so the row can open it.
// Crop first, then fisheries; Training after the built-in types; the added ones last.
export function assistanceTypeRows({ units = {}, custom = [], lists = {} }) {
  const customIds = new Map(custom.map((c) => [`${c.domain}:${c.name}`, c.id]))
  const listOf = (domain, type) => {
    const meta = TYPE_LISTS[domain]?.[type]
    return meta ? { ...meta, count: lists[domain]?.[meta.kind] ?? 0 } : null
  }
  const rows = []
  for (const domain of ['crop', 'fisheries']) {
    const mine = (units[domain] || []).map((row) => {
      const customId = customIds.get(`${domain}:${row.assistance_type}`)
      return { ...row, id: `${domain}-${row.assistance_type}`, kind: customId === undefined ? 'builtin' : 'custom', customId, list: customId === undefined ? listOf(domain, row.assistance_type) : null }
    })
    rows.push(
      ...mine.filter((r) => r.kind === 'builtin'),
      { id: `${domain}-Training`, domain, assistance_type: 'Training', kind: 'training', list: listOf(domain, 'Training') },
      ...mine.filter((r) => r.kind === 'custom'),
    )
  }
  return rows
}

// The Details column: the units of a type with a quantity box, and how many names its list of items holds.
export function detailsText(row) {
  const list = row.list
  const count = list?.count ?? 0
  const names = !list ? '' : count === 0 ? `no types of ${list.noun} yet` : `${count} type${count === 1 ? '' : 's'} of ${list.noun}`
  if (row.kind === 'training') return count === 0 ? 'No types of training yet' : names
  return [(row.units || []).join(', '), names].filter(Boolean).join(' · ')
}

const tidy = (value) => String(value || '').split(/\s+/).filter(Boolean).join(' ')

// What is wrong with the Add Assistance form ('' when nothing).
export function addAssistanceProblem({ name, domain, units }) {
  const text = tidy(name)
  if (!text) return 'Enter the name of the assistance.'
  if (text.length > 30) return 'The name can be at most 30 characters.'
  if (!DOMAIN_CHOICES.some((c) => c.value === domain)) return 'Choose what it applies to.'
  if (!units || units.length === 0) return 'Choose at least one unit.'
  return ''
}

// The request of Add Assistance (POST /interventions/assistance-types/): "Both" is the two domains.
export function addAssistanceBody({ name, domain, units }) {
  return { name: tidy(name), domains: domain === 'both' ? ['crop', 'fisheries'] : [domain], units: [...units] }
}
