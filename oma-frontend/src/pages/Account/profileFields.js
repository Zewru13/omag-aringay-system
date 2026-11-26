// The rules of the one profile page of farmer, fisherfolk and organization accounts (AccountProfilePage.jsx draws them): which details
// show, in which section, and what each row's button does. A row's `mode`:
//   'edit'     changed at once (the contact number; the photo or logo is the header's own button)
//   'request'  sent to the office, which approves it first (an organization's change needs an Admin and a Focal Person)
//   'fixed'    cannot be changed here (contact the office)
// A detail with no real value is left out ('' and 'Unspecified' count as none: 'Unspecified' is what an import stores when it did
// not know); the contact number and an organization's requestable details always show, so they can be filled in.
// No screen and no network, so the rules can be tested on their own.
import { formatDate } from '../../utils/dateFormat.js'
import { approvalLines } from '../../utils/approvalStatus.js'
import { agencyLabel } from '../Organizations/agencyOptions.js'

const BLANK = new Set(['', 'Unspecified'])
const hasValue = (v) => v !== null && v !== undefined && !BLANK.has(String(v).trim())
const orNull = (v) => (hasValue(v) ? v : null)

const NAME_FIELDS = ['first_name', 'middle_name', 'last_name']

// { field_name: request } for the requests still waiting (a field holds at most one).
export function pendingByField(requests) {
  return Object.fromEntries((requests || []).filter((r) => r.status === 'PENDING').map((r) => [r.field_name, r]))
}

const fixed = (label, value) => (hasValue(value) ? [{ key: label, label, value, mode: 'fixed' }] : [])

function personSections(kind, record, pending) {
  const fullName = [record.first_name, record.middle_name, record.last_name].filter(Boolean).join(' ') || record.label || null
  const flags = [record.is_pwd && 'PWD', record.is_4ps_beneficiary && '4Ps beneficiary'].filter(Boolean).join(', ')
  const orgs = record.organization_names || []
  return [
    {
      key: 'about',
      title: 'About you',
      rows: [
        { key: 'fullName', label: 'Full name', value: fullName, mode: 'request', fields: NAME_FIELDS, pending: NAME_FIELDS.map((f) => pending[f]).find(Boolean) || null },
        { key: 'barangay', label: 'Barangay', value: orNull(record.barangay), mode: 'request', fields: ['barangay'], pending: pending.barangay || null },
        { key: 'contact', label: 'Contact number', value: orNull(record.contact_number), mode: 'edit' },
      ],
    },
    {
      key: 'record',
      title: 'Your record',
      rows: [
        ...fixed('RSBSA number', record.rsbsa_number),
        ...(kind === 'fisherfolk' ? [...fixed('FishR number', record.fishr_number), ...fixed('Type', record.fisherfolk_type)] : []),
        ...(hasValue(record.birthdate) ? [{ key: 'birthdate', label: 'Date of birth', value: formatDate(record.birthdate), mode: 'fixed' }] : []),
        ...fixed('Civil status', record.civil_status),
        ...fixed('Highest education', record.highest_education),
        // Always shown, even when there is none, so the person knows.
        { key: 'organization', label: 'Cooperative', value: orgs.length ? orgs.join(', ') : 'Not a member of any cooperative', mode: 'fixed' },
        ...fixed('Also listed as', flags),
      ],
    },
  ]
}

const ORG_REQUESTABLE = [
  ['name', 'Cooperative name'],
  ['barangay', 'Barangay'],
  ['street_address', 'Street address'],
  ['email_address', 'Email address'],
  ['contact_person', 'Contact person'],
]

function orgSections(record, pending) {
  return [
    {
      key: 'details',
      title: 'Cooperative details',
      rows: [
        ...ORG_REQUESTABLE.map(([field, label]) => ({
          key: field, label, value: orNull(field === 'name' ? (record.name || record.label) : record[field]), mode: 'request', fields: [field], pending: pending[field] || null,
        })),
        { key: 'contact', label: 'Contact number', value: orNull(record.contact_number), mode: 'edit' },
      ],
    },
    {
      key: 'registration',
      title: 'Registration',
      rows: [
        ...fixed('Registration number', record.registration_number),
        ...fixed('Registration agency', record.registration_agency ? agencyLabel(record.registration_agency) : ''),
        ...(hasValue(record.date_organized) ? [{ key: 'organized', label: 'Date organized', value: formatDate(record.date_organized), mode: 'fixed' }] : []),
        ...(hasValue(record.date_registered) ? [{ key: 'registered', label: 'Date registered', value: formatDate(record.date_registered), mode: 'fixed' }] : []),
      ],
    },
  ]
}

// The sections of the profile. `kind` is 'farmer' | 'fisherfolk' | 'orgFarm' | 'orgFish'; `pending` is pendingByField's answer.
export function profileSections(kind, record, pending = {}) {
  if (!record) return []
  return kind === 'orgFarm' || kind === 'orgFish' ? orgSections(record, pending) : personSections(kind, record, pending)
}

const KIND = { farmer: 'Farmer', fisherfolk: 'Fisherfolk', orgFarm: 'Farmers cooperative', orgFish: 'Fisherfolk cooperative' }

// The header: the name, the kind of account and the number the office knows it by.
export function profileHeader(kind, record) {
  const isOrg = kind === 'orgFarm' || kind === 'orgFish'
  const name = isOrg ? (record?.name || record?.label) : ([record?.first_name, record?.middle_name, record?.last_name].filter(Boolean).join(' ') || record?.label)
  const number = isOrg ? record?.registration_number : record?.rsbsa_number
  return { name: name || 'Account', kind: KIND[kind] || 'Account', id: hasValue(number) ? `${isOrg ? 'Registration' : 'RSBSA'} ${number}` : '' }
}

// Who approved an organization's change and who is still to approve, in words; [] for a change one approval settles.
export function approvalText(request) {
  return approvalLines(request).map((line) => (line.done
    ? `${line.role}: approved ${formatDate(line.at)}${line.by ? ` (${line.by})` : ''}`
    : `${line.role}: still to approve`))
}
