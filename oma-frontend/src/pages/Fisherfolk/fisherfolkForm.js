// The rules of the fisherfolk form. Register Fisherfolk and Edit Fisherfolk are the same form (FisherfolkFormSections.jsx), so the fields,
// what typing does to them, what is refused and what is sent are written once here. No screen and no network: tested alone.
import { guardPhilsys, tidyPhone } from '../../utils/inputGuards.js'
import { isPrefixValidForGender } from '../../utils/prefixOptions.js'

export const EMPTY_FISHERFOLK = {
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
  fishr_number: '',
  philsys_number: '',
  is_pwd: false,
  is_4ps_beneficiary: false,
  is_icc_ip_member: false,
  icc_ip_name: '',
  fisherfolk_type: 'Aquaculture',   // not asked: every fisherfolk is registered as Aquaculture
  is_aquaculture: true,
  is_capture_fishery: false,
  is_mariculture: false,
  is_inland_fishery: false,
  fisherfolk_organization: null,
  has_vessel: true,
  boat_registration_number: '',
  // Capture details: kept on the record, not asked on this form.
  vessel_type: '',
  vessel_material: '',
  vessel_material_other_specify: '',
  vessel_registration_number: '',
  fishing_gear_type: '',
  fishing_ground: '',
  average_catch_per_trip_kg: '',
}

const EDIT_LEAVES_ALONE = ['fisherfolk_organization', 'fisherfolk_type', 'vessel_type', 'vessel_material', 'vessel_material_other_specify',
  'vessel_registration_number', 'fishing_gear_type', 'fishing_ground', 'average_catch_per_trip_kg']
const BOOLEANS = Object.keys(EMPTY_FISHERFOLK).filter((key) => typeof EMPTY_FISHERFOLK[key] === 'boolean')

// The form of a registered fisherfolk: every field of the register form, filled in from the record (nothing left null).
export function fisherfolkFormFrom(record) {
  const form = { ...EMPTY_FISHERFOLK }
  for (const key of Object.keys(EMPTY_FISHERFOLK)) {
    if (!record || !(key in record)) continue   // a field the record does not carry keeps the form's own starting value
    const value = record[key]
    if (BOOLEANS.includes(key)) form[key] = Boolean(value)
    else if (key === 'fisherfolk_organization') form[key] = value ?? null
    else form[key] = value ?? ''                 // an empty box, never the starting value of a NEW fisherfolk (e.g. Single)
  }
  form.contact_number = tidyPhone(form.contact_number || '')
  form.fisherfolk_type = record?.fisherfolk_type || 'Aquaculture'
  return form
}

export function ageOn(birthdate, today = new Date()) {
  if (!birthdate) return null
  const [year, month, day] = String(birthdate).slice(0, 10).split('-').map(Number)
  if (!year || !month || !day) return null
  const before = today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day)
  return today.getFullYear() - year - (before ? 1 : 0)
}

const digits = (value, max) => String(value ?? '').replace(/\D/g, '').slice(0, max)

// What typing in a field does to the form. Returns { form, prefixNote }: the note says a prefix was cleared because it no longer fits the sex.
export function changeFisherfolk(form, field, value) {
  let prefixNote = ''
  const next = { ...form, [field]: value }
  if (field === 'contact_number') next.contact_number = digits(value, 11)
  if (field === 'boat_registration_number') next.boat_registration_number = digits(value, 7)
  if (field === 'philsys_number') next.philsys_number = guardPhilsys(value)
  if (field === 'gender' && form.prefix && !isPrefixValidForGender(form.prefix, value)) {
    next.prefix = ''
    prefixNote = 'Prefix reset — please reselect.'
  }
  if (field === 'has_vessel' && !value) next.boat_registration_number = ''
  if (field === 'is_icc_ip_member' && !value) next.icc_ip_name = ''
  return { form: next, prefixNote }
}

// What is wrong with the form, by field ({} when nothing is). The same messages show under the boxes while typing and stop the save.
export function fisherfolkProblems(form, today = new Date()) {
  const problems = {}
  if (!String(form.rsbsa_number || '').trim()) problems.rsbsa_number = 'RSBSA number is required.'
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
  if (form.has_vessel && form.boat_registration_number && digits(form.boat_registration_number, 99).length !== 7) {
    problems.boat_registration_number = 'Boat Registration Number must be exactly 7 digits.'
  }
  return problems
}

const ORDER = ['rsbsa_number', 'birthdate', 'philsys_number', 'contact_number', 'boat_registration_number']
export function firstFisherfolkProblem(form, today = new Date()) {
  const problems = fisherfolkProblems(form, today)
  const field = ORDER.find((key) => problems[key])
  return field ? problems[field] : ''
}

// What is sent to the server. A fisherfolk's memberships are kept on the organization pages, so editing never sends the organization.
export function fisherfolkPayload(form, { isEdit = false } = {}) {
  const payload = {
    ...form,
    boat_registration_number: form.has_vessel ? form.boat_registration_number : '',
    icc_ip_name: form.is_icc_ip_member ? (form.icc_ip_name || '').trim() : '',
    vessel_material_other_specify: form.vessel_material === 'Other' ? (form.vessel_material_other_specify || '').trim() : '',
  }
  if (payload.average_catch_per_trip_kg === '') delete payload.average_catch_per_trip_kg
  // Editing sends only what this form shows: not the organization, the type or the capture details kept elsewhere on the record.
  if (isEdit) for (const key of EDIT_LEAVES_ALONE) delete payload[key]
  return payload
}
