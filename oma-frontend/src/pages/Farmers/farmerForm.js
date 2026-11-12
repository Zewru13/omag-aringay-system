// The rules of the farmer form. Register Farmer and Edit Farmer are the same form (FarmerFormSections.jsx), so the fields, what typing does to
// them, what is refused and what is sent are written once here. No screen and no network: tested alone.
import { guardPhilsys, tidyPhone } from '../../utils/inputGuards.js'
import { isPrefixValidForGender } from '../../utils/prefixOptions.js'
import { ageOn } from '../Fisherfolk/fisherfolkForm.js'

export const EMPTY_FARMER = {
  prefix: '',
  first_name: '',
  middle_name: '',
  last_name: '',
  gender: 'Male',
  birthdate: '',
  civil_status: 'Single',
  highest_education: '',
  contact_number: '',
  email: '',
  barangay: '',
  rsbsa_number: '',
  philsys_number: '',
  is_pwd: false,
  is_4ps_beneficiary: false,
  is_icc_ip_member: false,
  icc_ip_name: '',
  farmers_organization: null,
}

const BOOLEANS = Object.keys(EMPTY_FARMER).filter((key) => typeof EMPTY_FARMER[key] === 'boolean')

// The form of a registered farmer: every field of the register form, filled in from the record (nothing left null).
export function farmerFormFrom(record) {
  const form = { ...EMPTY_FARMER }
  for (const key of Object.keys(EMPTY_FARMER)) {
    if (!record || !(key in record)) continue
    const value = record[key]
    if (BOOLEANS.includes(key)) form[key] = Boolean(value)
    else if (key === 'farmers_organization') form[key] = value ?? null
    else form[key] = value ?? ''
  }
  form.contact_number = tidyPhone(form.contact_number || '')
  return form
}

const digits = (value, max) => String(value ?? '').replace(/\D/g, '').slice(0, max)

// What typing in a field does to the form. Returns { form, prefixNote }.
export function changeFarmer(form, field, value) {
  let prefixNote = ''
  const next = { ...form, [field]: value }
  if (field === 'contact_number') next.contact_number = digits(value, 11)
  if (field === 'philsys_number') next.philsys_number = guardPhilsys(value)
  if (field === 'gender' && form.prefix && !isPrefixValidForGender(form.prefix, value)) {
    next.prefix = ''
    prefixNote = 'Prefix reset — please reselect.'
  }
  if (field === 'is_icc_ip_member' && !value) next.icc_ip_name = ''
  return { form: next, prefixNote }
}

// What is wrong with the form, by field ({} when nothing is). The RSBSA number is not part of the edit (it is shown, not changed).
export function farmerProblems(form, today = new Date(), { isEdit = false } = {}) {
  const problems = {}
  if (!isEdit && !String(form.rsbsa_number || '').trim()) problems.rsbsa_number = 'RSBSA number is required.'
  const age = ageOn(form.birthdate, today)
  if (age !== null && age < 10) problems.birthdate = 'Must be at least 10 years old to register.'
  if (form.contact_number) {
    const number = digits(form.contact_number, 99)
    if (number.length !== 11) problems.contact_number = 'Contact number must be exactly 11 digits.'
    else if (!number.startsWith('09')) problems.contact_number = 'Contact number must start with 09.'
  }
  if (form.philsys_number && !/^\d{4}-\d{4}-\d{4}-\d{4}$/.test(form.philsys_number)) {
    problems.philsys_number = 'Format must be NNNN-NNNN-NNNN-NNNN (e.g. 8419-5032-7741-3096).'
  }
  return problems
}

const ORDER = ['rsbsa_number', 'birthdate', 'philsys_number', 'contact_number']
export function firstFarmerProblem(form, today = new Date(), options = {}) {
  const problems = farmerProblems(form, today, options)
  const field = ORDER.find((key) => problems[key])
  return field ? problems[field] : ''
}

// What is sent. A farmer's memberships are kept on the organization pages and the RSBSA number is not edited here, so editing sends neither.
export function farmerPayload(form, { today = new Date(), isEdit = false } = {}) {
  const age = ageOn(form.birthdate, today)
  const payload = {
    ...form,
    icc_ip_name: form.is_icc_ip_member ? (form.icc_ip_name || '').trim() : '',
    is_senior_citizen: age !== null && age >= 60,
  }
  if (isEdit) {
    delete payload.farmers_organization
    delete payload.rsbsa_number
  }
  return payload
}
