// Register Fisherfolk and Edit Fisherfolk are ONE form: the same fields in the same table layout, filled in when editing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const { EMPTY_FISHERFOLK, fisherfolkFormFrom, changeFisherfolk, fisherfolkProblems, firstFisherfolkProblem, fisherfolkPayload, ageOn } = await import(here('src/pages/Fisherfolk/fisherfolkForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// --- the edit form has every field the register form has
const record = {
  id: 7, prefix: 'Mr.', first_name: 'Danilo', middle_name: null, last_name: 'Mercado', gender: 'Male', birthdate: '1980-05-02', civil_status: 'Married',
  highest_education: 'High School', contact_number: '0917-123-4567', email: 'dan@example.test', barangay: 'Alaska', rsbsa_number: '01-33-02-014-058212',
  fishr_number: null, philsys_number: '8419-5032-7741-3096', is_pwd: true, is_4ps_beneficiary: false, is_icc_ip_member: true, icc_ip_name: 'Kankanaey',
  is_aquaculture: true, is_capture_fishery: true, is_mariculture: false, is_inland_fishery: false, has_vessel: true, boat_registration_number: '1234567',
  fisherfolk_organization: 3, organization_names: ['Alaska Growers'], full_name: 'Danilo Mercado', citizen_account: {},
}
const filled = fisherfolkFormFrom(record)
eq(Object.keys(filled).sort(), Object.keys(EMPTY_FISHERFOLK).sort(), 'the edit form holds exactly the fields of the register form')
eq(filled.civil_status, 'Married', 'civil status is filled in')
eq(filled.highest_education, 'High School', 'education is filled in')
eq(filled.philsys_number, '8419-5032-7741-3096', 'PhilSys is filled in')
eq([filled.is_pwd, filled.is_icc_ip_member, filled.icc_ip_name], [true, true, 'Kankanaey'], 'classification is filled in')
eq(filled.email, 'dan@example.test', 'email is filled in')
eq(filled.contact_number, '09171234567', 'an older number with dashes opens in the plain format')
eq([filled.middle_name, filled.fishr_number], ['', ''], 'nothing is left null')
eq(filled.boat_registration_number, '1234567', 'the boat registration number is filled in')
ok('boat_registration_number' in EMPTY_FISHERFOLK && 'has_vessel' in EMPTY_FISHERFOLK, 'the register form has the vessel fields too')
eq(EMPTY_FISHERFOLK.fisherfolk_type, 'Aquaculture', 'a new fisherfolk is Aquaculture')

// --- typing
eq(changeFisherfolk(EMPTY_FISHERFOLK, 'contact_number', '0917-123 4567 99').form.contact_number, '09171234567', 'the contact number keeps 11 digits')
eq(changeFisherfolk(EMPTY_FISHERFOLK, 'boat_registration_number', '12a34567890').form.boat_registration_number, '1234567', 'the boat number keeps 7 digits')
eq(changeFisherfolk(EMPTY_FISHERFOLK, 'philsys_number', '8419503277413096').form.philsys_number, '8419-5032-7741-3096', 'PhilSys gets its dashes')
const reset = changeFisherfolk({ ...EMPTY_FISHERFOLK, gender: 'Male', prefix: 'Mr.' }, 'gender', 'Female')
eq([reset.form.gender, reset.form.prefix, reset.prefixNote], ['Female', '', 'Prefix reset — please reselect.'], 'a prefix that does not fit the new sex is cleared, and said so')
eq(changeFisherfolk({ ...EMPTY_FISHERFOLK, prefix: 'Dr.' }, 'gender', 'Female').form.prefix, 'Dr.', 'a prefix that fits both stays')
eq(changeFisherfolk(EMPTY_FISHERFOLK, 'has_vessel', false).form.boat_registration_number, '', 'no vessel, no boat number')
eq(changeFisherfolk({ ...EMPTY_FISHERFOLK, is_icc_ip_member: true, icc_ip_name: 'X' }, 'is_icc_ip_member', false).form.icc_ip_name, '', 'not a member, no group name')
eq(changeFisherfolk(EMPTY_FISHERFOLK, 'first_name', 'Ana').form.first_name, 'Ana', 'any other field is just set')

// --- what the form refuses
const today = new Date(2026, 10, 12)
eq(ageOn('1966-11-12', today), 60, 'age on the birthday')
eq(ageOn('1966-11-13', today), 59, 'age the day before the birthday')
eq(ageOn('', today), null, 'no birthdate, no age')
const good = { ...EMPTY_FISHERFOLK, first_name: 'Ana', last_name: 'Cruz', birthdate: '1990-01-01', barangay: 'Alaska', rsbsa_number: '01-33-02-014-058212' }
eq(fisherfolkProblems(good, today), {}, 'a complete form has no problem')
eq(firstFisherfolkProblem(good, today), '', 'so nothing stops the save')
eq(fisherfolkProblems({ ...good, rsbsa_number: '' }, today).rsbsa_number, 'RSBSA number is required.', 'RSBSA is required')
eq(fisherfolkProblems({ ...good, birthdate: '2020-01-01' }, today).birthdate, 'Must be at least 10 years old to register.', 'too young')
eq(fisherfolkProblems({ ...good, contact_number: '0917' }, today).contact_number, 'Contact number must be exactly 11 digits.', 'a short number')
eq(fisherfolkProblems({ ...good, contact_number: '19171234567' }, today).contact_number, 'Contact number must start with 09.', 'a number not starting with 09')
eq(fisherfolkProblems({ ...good, philsys_number: '8419-5032' }, today).philsys_number, 'Format must be NNNN-NNNN-NNNN-NNNN (e.g. 8419-5032-7741-3096).', 'a short PhilSys number')
eq(fisherfolkProblems({ ...good, boat_registration_number: '123' }, today).boat_registration_number, 'Boat Registration Number must be exactly 7 digits.', 'a short boat number')
eq(fisherfolkProblems({ ...good, has_vessel: false, boat_registration_number: '123' }, today).boat_registration_number, undefined, 'no vessel: the boat number is not checked')
eq(firstFisherfolkProblem({ ...good, rsbsa_number: '', contact_number: '0917' }, today), 'RSBSA number is required.', 'the first problem is the one shown')

// --- what is sent
const sent = fisherfolkPayload({ ...good, has_vessel: false, boat_registration_number: '1234567', is_icc_ip_member: false, icc_ip_name: 'X', average_catch_per_trip_kg: '', vessel_material: 'Wood', vessel_material_other_specify: 'x' })
eq([sent.boat_registration_number, sent.icc_ip_name, sent.vessel_material_other_specify], ['', '', ''], 'values of unticked boxes are cleared')
ok(!('average_catch_per_trip_kg' in sent), 'an empty catch figure is not sent')
ok(!('fisherfolk_organization' in fisherfolkPayload(good, { isEdit: true })), 'editing does not touch the organization: membership is kept on the organization pages')
ok('fisherfolk_organization' in fisherfolkPayload(good), 'registering sends the chosen organization')
const edited = fisherfolkPayload(good, { isEdit: true })
ok(!('fisherfolk_type' in edited) && !('vessel_type' in edited) && !('fishing_ground' in edited), 'editing sends only what the form shows')
ok('civil_status' in edited && 'email' in edited && 'philsys_number' in edited && 'is_pwd' in edited, 'including the fields the old edit form lacked')
eq(fisherfolkFormFrom({ id: 1, civil_status: null, gender: 'Female' }).civil_status, '', 'a record with no civil status opens with none chosen, not Single')

// --- both windows draw the one shared form, in the table layout
const sections = read('src/pages/Fisherfolk/FisherfolkFormSections.jsx')
for (const title of ['Personal Information', 'Contact Information', 'Government Information', 'Fisheries Information', 'Vessel Information']) ok(sections.includes(`title="${title}"`), `section ${title}`)
for (const label of ['Prefix', 'First Name', 'Middle Name', 'Last Name', 'Sex', 'Birthdate', 'Civil Status', 'Highest Education', 'Contact Number', 'Barangay', 'Email',
  'RSBSA Number', 'FishR Number', 'PhilSys / National ID No.', 'Classification', 'Type of Fishery Activity', 'Fisherfolk Organization', 'Boat Registration Number (Boat-R)']) {
  ok(sections.includes(`label="${label}"`), `field ${label}`)
}
ok(sections.includes("from '../../components/UI/FormTable.jsx'") && /<FormCell /.test(sections), 'the form is the shared table form')
ok(sections.includes('fisherfolk-type-note'), 'it still says every fisherfolk is Aquaculture')
ok(!/id="fisherfolk_type"/.test(sections), 'and asks for no type')
const add = read('src/pages/Fisherfolk/AddFisherfolkModal.jsx')
const edit = read('src/pages/Fisheries/EditFisherfolkModal.jsx')
for (const [name, src] of [['Register Fisherfolk', add], ['Edit Fisherfolk', edit]]) {
  ok(src.includes('<FisherfolkFormSections'), `${name} draws the shared form`)
  ok(!/<FormLabel|className="grid /.test(src), `${name} has no fields of its own`)
  ok(src.includes('firstFisherfolkProblem') && src.includes('fisherfolkPayload'), `${name} uses the shared rules`)
}
ok(add.includes("fisherfolk_type: 'Aquaculture'") || read('src/pages/Fisherfolk/fisherfolkForm.js').includes("fisherfolk_type: 'Aquaculture'"), 'the form still saves Aquaculture')

console.log(`fisherfolkForm: ${n} checks passed`)
