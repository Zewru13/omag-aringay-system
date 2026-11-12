// Add New Organization and Edit Organization are ONE form: the same fields in the same table layout, filled in when editing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replaceAll(String.fromCharCode(13), '')
const { EMPTY_ORGANIZATION, organizationFormFrom, changeOrganization, organizationProblems, organizationBody } = await import(here('src/pages/Organizations/organizationForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

const record = {
  id: 4, name: 'Alaska Farmers', barangay: 'Alaska', street_address: null, date_organized: '2010-05-01', date_registered: '2011-02-03', registration_number: 'CN201026622',
  registration_agency: 'CDA', email_address: 'alaska@example.test', contact_person: 'Juan Dela Cruz', contact_number: '0917-123-4567', members: [],
}
const filled = organizationFormFrom(record)
eq(Object.keys(filled).sort(), Object.keys(EMPTY_ORGANIZATION).sort(), 'the edit form holds exactly the fields of the create form')
eq([filled.name, filled.street_address, filled.registration_agency, filled.email_address], ['Alaska Farmers', '', 'CDA', 'alaska@example.test'], 'filled in, nothing left null')
eq(filled.contact_number, '09171234567', 'an older number with dashes opens in the plain format')

eq(changeOrganization(EMPTY_ORGANIZATION, 'contact_number', '0917-123 4567 99').contact_number, '09171234567', 'the contact number keeps 11 digits')
eq(changeOrganization(EMPTY_ORGANIZATION, 'registration_number', 'cn201026622999').registration_number, 'CN201026622999', 'the registration number is capitals')
eq(changeOrganization(EMPTY_ORGANIZATION, 'registration_number', 'cn2010266229999999').registration_number.length, 15, 'at most 15 characters')
const moved = changeOrganization({ ...EMPTY_ORGANIZATION, date_organized: '2010-01-01', date_registered: '2010-06-01' }, 'date_organized', '2011-01-01')
eq([moved.date_organized, moved.date_registered], ['2011-01-01', ''], 'a registered date before the new organized date is cleared')
eq(changeOrganization({ ...EMPTY_ORGANIZATION, date_registered: '2012-06-01' }, 'date_organized', '2011-01-01').date_registered, '2012-06-01', 'a later one stays')

const good = { ...filled }
eq(organizationProblems(good), {}, 'a complete form has no problem')
const empty = organizationProblems(EMPTY_ORGANIZATION)
for (const field of ['name', 'barangay', 'contact_person', 'contact_number', 'date_organized', 'date_registered', 'registration_number', 'registration_agency', 'email_address']) {
  eq(empty[field], 'Required', `${field} is required`)
}
eq(organizationProblems({ ...good, contact_number: '0917' }).contact_number, 'Contact number must be exactly 11 digits.', 'a short number')
eq(organizationProblems({ ...good, contact_number: '19171234567' }).contact_number, 'Contact number must start with 09.', 'not 09')
eq(organizationProblems({ ...good, date_registered: '2009-01-01' }).date_registered, 'Date registered cannot be before the date organized.', 'registered before organized')
eq(organizationProblems({ ...good, date_registered: '2009-01-01' }, { datesChanged: false }).date_registered, undefined, 'an unchanged older record is not refused for it')

const body = organizationBody(good)
eq(Object.keys(body).sort(), ['barangay', 'contact_number', 'contact_person', 'date_organized', 'date_registered', 'email_address', 'name', 'registration_agency', 'registration_number', 'street_address'], 'the fields sent')
eq(organizationBody({ ...good, contact_person: '  Ana Cruz ' }).contact_person, 'Ana Cruz', 'the contact person is trimmed')
const edited = organizationBody({ ...good, name: 'New Name' }, { isEdit: true, original: good })
ok(!('date_organized' in edited) && !('date_registered' in edited), 'editing sends a date only when it changed')
eq(organizationBody({ ...good, date_organized: '2010-06-01' }, { isEdit: true, original: good }).date_organized, '2010-06-01', 'a changed date is sent')

const sections = read('src/pages/Organizations/OrganizationFormSections.jsx')
for (const title of ['Organization Information', 'Registration', 'Contact']) ok(sections.includes(`title="${title}"`), `section ${title}`)
for (const label of ['Organization Name', 'Barangay', 'Street Address', 'Date Organized', 'Date Registered', 'Registration Number', 'Registration Agency', 'Email Address', 'Contact Person Full Name', 'Contact Number']) {
  ok(sections.includes(`label="${label}"`), `field ${label}`)
}
ok(sections.includes("from '../../components/UI/FormTable.jsx'") && /<FormCell /.test(sections), 'the form is the shared table form')
const create = read('src/pages/Organizations/CreateOrganizationModal.jsx')
const edit = read('src/pages/Organizations/EditOrganizationModal.jsx')
for (const [name, src] of [['Add New Organization', create], ['Edit Organization', edit]]) {
  ok(src.includes('<OrganizationFormSections'), `${name} draws the shared form`)
  ok(!/labelCls|<BarangaySelect/.test(src), `${name} has no fields of its own`)
  ok(src.includes('organizationProblems') && src.includes('organizationBody'), `${name} uses the shared rules`)
}
ok(create.includes('EquipmentLinesEditor') && create.includes('MembersEditor'), 'Add keeps its equipment and members steps')
ok(edit.includes('MembersEditor'), 'Edit keeps its members step')

console.log(`organizationForm: ${n} checks passed`)
