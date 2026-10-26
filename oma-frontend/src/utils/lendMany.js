// Reporting that members borrowed equipment (the organization's "Lend equipment" form): what is wrong with the choice, and what is sent. A form
// holds one or more kinds of equipment, each with the members who borrowed it, so one member can borrow several kinds. Pure helpers, so they
// can be tested without a screen.
//   a kind: { equipment: line id, name, picked: [{ member: person id, quantity: units (a number or typed text) }], available: units that can be lent }

export const unitsPicked = (picked) => (picked || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)

// Units of the equipment not yet given to anyone in the form.
export const unitsLeft = (available, picked) => Math.max(0, available - unitsPicked(picked))

// Every member needs at least 1 unit, so another member can be chosen only while a unit is left (with 1 unit and 1 member chosen, nobody else can be).
export const canPickMore = (available, picked) => unitsLeft(available, picked) >= 1

// The most units one chosen member can take: everything not given to the others.
export const maxUnitsFor = (available, picked, member) => Math.max(1, available - unitsPicked((picked || []).filter((p) => String(p.member) !== String(member))))

const wholeUnits = (value) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1
}

const label = (kind, kinds) => (kinds.length > 1 && kind.name ? `${kind.name}: ` : '')

// The sentence to show ('' when the form can be saved). Dates are YYYY-MM-DD, which compare as text.
export function lendProblem({ kinds, borrowedOn, today }) {
  if (!kinds || kinds.length === 0) return 'Choose the equipment.'
  if (kinds.some((k) => !k.equipment)) return 'Choose the equipment for every section.'
  const ids = kinds.map((k) => String(k.equipment))
  if (new Set(ids).size !== ids.length) return 'Each equipment can be chosen only once.'
  for (const kind of kinds) {
    if (!kind.picked || kind.picked.length === 0) return `${label(kind, kinds)}choose at least one member who borrowed it.`.replace(/^./, (c) => c.toUpperCase())
    if (kind.picked.some((p) => !wholeUnits(p.quantity))) return `${label(kind, kinds)}every chosen member needs a whole number of units, 1 or more.`.replace(/^./, (c) => c.toUpperCase())
    const total = unitsPicked(kind.picked)
    if (total > kind.available) return `${label(kind, kinds)}only ${kind.available} unit${kind.available === 1 ? '' : 's'} available, but ${total} chosen.`.replace(/^./, (c) => c.toUpperCase())
  }
  if (!borrowedOn) return 'Enter the date borrowed.'
  if (today && borrowedOn > today) return 'The date borrowed cannot be in the future.'
  return ''
}

export const lendBody = (kinds, { borrowedOn }) => ({
  items: kinds.map((k) => ({
    equipment: Number(k.equipment),
    borrowers: k.picked.map((p) => ({ member: Number(p.member), quantity: Number(p.quantity) })),
  })),
  borrowed_on: borrowedOn || null,
})

// What to tell the organization after it worked: "3 items recorded as borrowed by 2 members."
export function lendSummary(kinds) {
  const items = kinds.reduce((sum, k) => sum + k.picked.length, 0)
  const people = new Set(kinds.flatMap((k) => k.picked.map((p) => String(p.member)))).size
  return `${items} item${items === 1 ? '' : 's'} recorded as borrowed by ${people} member${people === 1 ? '' : 's'}.`
}
