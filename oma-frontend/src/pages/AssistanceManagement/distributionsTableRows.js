import { agencyChipSummary } from './assistanceFieldHelpers.js'

// What the staff Assistance table calls one distribution: the organization that gave it, or (given to selected people with no organization)
// "Individual farmers (5)". Pure, so it can be tested on its own.
export function distributionRowLabel(group, noun) {
  if (group.organization_name) return group.organization_name
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
