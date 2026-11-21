// The rules behind Assistance Settings > Assistance Types: its rows, what the Details column says, and the Add Assistance form. No screen and no
// network, so they can be tested alone.

export const DOMAIN_LABELS = { crop: 'Crop', fisheries: 'Fisheries' }
export const DOMAIN_CHOICES = [
  { value: 'crop', label: 'Crop assistance (farmers)' },
  { value: 'fisheries', label: 'Fisheries assistance (fisherfolk)' },
  { value: 'both', label: 'Both' },
]

// One row for every type of one domain that has a setting: the types with a unit box (units: the answer of
// /interventions/assistance-type-units/ per domain), a Training row (how many types of training it has: training: { crop, fisheries }) and
// the types added with Add Assistance (custom: the answer of /interventions/assistance-types/, so a row can be renamed and deleted).
// Crop first, then fisheries; Training after the built-in types; the added ones last.
export function assistanceTypeRows({ units = {}, custom = [], training = {} }) {
  const customIds = new Map(custom.map((c) => [`${c.domain}:${c.name}`, c.id]))
  const rows = []
  for (const domain of ['crop', 'fisheries']) {
    const mine = (units[domain] || []).map((row) => {
      const customId = customIds.get(`${domain}:${row.assistance_type}`)
      return { ...row, id: `${domain}-${row.assistance_type}`, kind: customId === undefined ? 'builtin' : 'custom', customId }
    })
    rows.push(
      ...mine.filter((r) => r.kind === 'builtin'),
      { id: `${domain}-Training`, domain, assistance_type: 'Training', kind: 'training', trainingCount: training[domain] ?? 0 },
      ...mine.filter((r) => r.kind === 'custom'),
    )
  }
  return rows
}

// The Details column: the units of a type with a quantity box, or how many types of training Training offers.
export function detailsText(row) {
  if (row.kind === 'training') {
    const count = row.trainingCount ?? 0
    return count === 0 ? 'No types of training yet' : `${count} type${count === 1 ? '' : 's'} of training`
  }
  return (row.units || []).join(', ')
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
