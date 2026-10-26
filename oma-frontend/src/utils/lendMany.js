// Reporting that several members borrowed one equipment (the organization's "Lend equipment" form): what is wrong with the choice, and what
// is sent. Pure helpers, so they can be tested without a screen. `picked` is [{ member: person id, quantity: units (a number or typed text) }].

export const unitsPicked = (picked) => (picked || []).reduce((sum, p) => sum + (Number(p.quantity) || 0), 0)

const wholeUnits = (value) => {
  const n = Number(value)
  return Number.isInteger(n) && n >= 1
}

// The sentence to show ('' when the form can be saved). `available` is the units of the chosen equipment that can be lent; dates are
// YYYY-MM-DD, which compare as text.
export function lendManyProblem({ equipment, picked, available, borrowedOn, dueDate, today }) {
  if (!equipment) return 'Choose the equipment.'
  if (!picked || picked.length === 0) return 'Choose at least one member who borrowed it.'
  if (picked.some((p) => !wholeUnits(p.quantity))) return 'Every chosen member needs a whole number of units, 1 or more.'
  const total = unitsPicked(picked)
  if (total > available) return `Only ${available} unit${available === 1 ? '' : 's'} available, but ${total} chosen.`
  if (!borrowedOn) return 'Enter the date borrowed.'
  if (today && borrowedOn > today) return 'The date borrowed cannot be in the future.'
  if (dueDate && dueDate < borrowedOn) return 'The return-by date cannot be before the date borrowed.'
  return ''
}

export const lendManyBody = (picked, { dueDate, borrowedOn }) => ({
  borrowers: picked.map((p) => ({ member: Number(p.member), quantity: Number(p.quantity) })),
  due_date: dueDate || null,
  borrowed_on: borrowedOn || null,
})

// What to tell the organization after it worked: "3 members, 5 units of Hand Tractor recorded as borrowed."
export const lendManySummary = (name, picked) => {
  const people = picked.length
  const units = unitsPicked(picked)
  return `${people} member${people === 1 ? '' : 's'}, ${units} unit${units === 1 ? '' : 's'} of ${name} recorded as borrowed.`
}
