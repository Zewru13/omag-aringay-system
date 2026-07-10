export const MALE_ONLY_PREFIXES = ['Mr.']
export const FEMALE_ONLY_PREFIXES = ['Mrs.', 'Ms.', 'Miss']
export const NEUTRAL_PREFIXES = ['Dr.', 'Engr.', 'Atty.', 'Hon.']

export function getPrefixOptions(gender) {
  if (gender === 'Male') return ['', ...MALE_ONLY_PREFIXES, ...NEUTRAL_PREFIXES]
  if (gender === 'Female') return ['', ...FEMALE_ONLY_PREFIXES, ...NEUTRAL_PREFIXES]
  return ['', ...MALE_ONLY_PREFIXES, ...FEMALE_ONLY_PREFIXES, ...NEUTRAL_PREFIXES]
}

export function isPrefixValidForGender(prefix, gender) {
  if (!prefix) return true
  if (MALE_ONLY_PREFIXES.includes(prefix)) return gender === 'Male'
  if (FEMALE_ONLY_PREFIXES.includes(prefix)) return gender === 'Female'
  return true
}
