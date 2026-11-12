// The rules of the Add User and Edit User windows, kept out of the components so both windows (and their tests) share them.
import { isPhoneComplete } from '../../utils/inputGuards.js'

export const SUFFIX_OPTIONS = ['Jr.', 'Sr.', 'II', 'III', 'IV']

export const ROLE_OPTIONS = [
  { value: 'ADMIN', label: 'ADMIN', desc: 'Full system access: manage users, view all reports, and configure system settings.' },
  { value: 'EVALUATOR', label: 'FOCAL PERSON', desc: 'OMAg staff for daily data entry, crop monitoring, and record management.' },
]

// An account keeps one full name, written "Last, First" (the suffix is kept in its own field and added after the first name).
export const composeFullName = (lastName, firstName, suffix = '') =>
  `${String(lastName ?? '').trim()}, ${String(firstName ?? '').trim()}${suffix ? ` ${suffix}` : ''}`

// The full name read back into its parts, for opening an existing account. A name saved without a comma ("Juan Dela Cruz") reads
// its last word as the last name; the suffix is dropped from the end of the first name when it was written there.
export function splitFullName(fullName, suffix = '') {
  const text = String(fullName ?? '').trim()
  if (!text) return { lastName: '', firstName: '' }
  const comma = text.indexOf(',')
  if (comma === -1) {
    const words = text.split(/\s+/)
    return { lastName: words.pop(), firstName: words.join(' ') }
  }
  let first = text.slice(comma + 1).trim()
  if (suffix && first.endsWith(` ${suffix}`)) first = first.slice(0, -(suffix.length + 1)).trim()
  return { lastName: text.slice(0, comma).trim(), firstName: first }
}

// What is missing or wrong, by field ({} when the form can be saved).
export function validateUserForm({ lastName, firstName, email, contact }) {
  const errors = {}
  if (!String(lastName ?? '').trim()) errors.lastName = 'Last name is required.'
  if (!String(firstName ?? '').trim()) errors.firstName = 'First name is required.'
  if (!String(email ?? '').trim()) errors.email = 'Email is required.'
  if (contact && !isPhoneComplete(contact)) errors.contact = 'Mobile number must be 11 digits and start with 09.'
  return errors
}
