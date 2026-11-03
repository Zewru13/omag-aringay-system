import { agencyChipSummary } from './assistanceFieldHelpers.js'

// What the staff Assistance table calls one distribution: the organization that gave it, or (given to selected people with no organization)
// the people it went to: one name, up to three names, or two names and how many more. A distribution whose answer carries no names is
// "Individual farmers (5)". Pure, so it can be tested on its own.
export function distributionRowLabel(group, noun) {
  if (group.organization_name) return group.organization_name
  const names = (group.members || []).map((m) => String(m.name || '').trim()).filter(Boolean)
  if (names.length === 1) return names[0]
  if (names.length > 1 && names.length <= 3) return names.join(', ')
  if (names.length > 3) return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`
  const people = noun || 'people'
  const count = Number(group.member_count) || 0
  const word = count === 1 ? people.replace(/s$/, '') : people
  return `Individual ${word} (${count})`
}

// The source agencies of a distribution: the first three, then "Others", so a long list never bulks the table.
export function agenciesText(agencies) {
  const { shown, more } = agencyChipSummary(agencies, 3)
  if (shown.length === 0) return '—'
  return more > 0 ? `${shown.join(', ')}, Others` : shown.join(', ')
}
