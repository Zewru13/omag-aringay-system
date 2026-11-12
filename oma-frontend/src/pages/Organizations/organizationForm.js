// The rules of the organization form. Add New Organization and Edit Organization are the same form (OrganizationFormSections.jsx), so the fields,
// what typing does to them, what is refused and what is sent are written once here. No screen and no network: tested alone.
import { tidyPhone } from '../../utils/inputGuards.js'
import { contactFullName } from './organizationContact.js'

export const EMPTY_ORGANIZATION = {
  name: '',
  barangay: '',
  street_address: '',
  date_organized: '',
  date_registered: '',
  registration_number: '',
  registration_agency: '',
  email_address: '',
  contact_person: '',
  contact_number: '',
}

// The form of a registered organization: every field of the create form, filled in (nothing left null).
export function organizationFormFrom(organization) {
  const form = { ...EMPTY_ORGANIZATION }
  for (const key of Object.keys(EMPTY_ORGANIZATION)) form[key] = organization?.[key] ?? ''
  form.contact_person = contactFullName(organization?.contact_person)
  form.contact_number = tidyPhone(form.contact_number || '')   // an older number with dashes opens in the plain format
  return form
}

// What typing in a field does to the form.
export function changeOrganization(form, field, value) {
  const next = { ...form, [field]: value }
  if (field === 'contact_number') next.contact_number = String(value ?? '').replace(/\D/g, '').slice(0, 11)
  if (field === 'registration_number') next.registration_number = String(value ?? '').toUpperCase().slice(0, 15)
  // a registered date earlier than the new organized date is no longer valid, so it is cleared
  if (field === 'date_organized' && value && form.date_registered && form.date_registered < value) next.date_registered = ''
  return next
}

// What is wrong with the form, by field ({} when nothing is). `datesChanged` false (an edit that left both dates alone) does not refuse an
// older record whose dates were saved in the other order.
export function organizationProblems(form, { datesChanged = true } = {}) {
  const problems = {}
  for (const field of ['name', 'barangay', 'contact_person', 'contact_number', 'date_organized', 'date_registered', 'registration_number', 'registration_agency', 'email_address']) {
    if (!String(form[field] ?? '').trim()) problems[field] = 'Required'
  }
  if (form.contact_number) {
    const digits = String(form.contact_number).replace(/\D/g, '')
    if (digits.length !== 11) problems.contact_number = 'Contact number must be exactly 11 digits.'
    else if (!digits.startsWith('09')) problems.contact_number = 'Contact number must start with 09.'
  }
  if (!problems.date_registered && datesChanged && form.date_organized && form.date_registered < form.date_organized) {
    problems.date_registered = 'Date registered cannot be before the date organized.'
  }
  return problems
}

// What is sent. Editing sends a date only when it changed (an unchanged older date is not sent back for the server to re-check).
export function organizationBody(form, { isEdit = false, original = null } = {}) {
  const body = {
    name: form.name,
    barangay: form.barangay,
    street_address: form.street_address,
    registration_number: form.registration_number,
    registration_agency: form.registration_agency,
    email_address: form.email_address,
    contact_person: form.contact_person.trim(),
    contact_number: form.contact_number,
  }
  for (const field of ['date_organized', 'date_registered']) {
    if (!isEdit || form[field] !== original?.[field]) body[field] = form[field] || null
  }
  return body
}
