// Register Farmer and Edit Farmer are ONE form: the same fields in the same table layout, filled in when editing.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const { EMPTY_FARMER, farmerFormFrom, changeFarmer, farmerProblems, firstFarmerProblem, farmerPayload } = await import(here('src/pages/Farmers/farmerForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

const record = {
  id: 7, prefix: 'Mr.', first_name: 'Eli', middle_name: null, last_name: 'Sabado', gender: 'Male', birthdate: '1958-05-02', civil_status: 'Married',
  highest_education: 'High School', contact_number: '0917-123-4567', email: 'eli@example.test', barangay: 'Alaska', rsbsa_number: '01-033-02-005-960001',
  philsys_number: '8419-5032-7741-3096', is_pwd: true, is_4ps_beneficiary: false, is_icc_ip_member: true, icc_ip_name: 'Kankanaey',
  organizations: [{ membership_id: 1, organization_name: 'Alaska Farmers', is_active: true, is_main: true }], citizen_account: {},
}
const filled = farmerFormFrom(record)
eq(Object.keys(filled).sort(), Object.keys(EMPTY_FARMER).sort(), 'the edit form holds exactly the fields of the register form')
eq([filled.civil_status, filled.highest_education, filled.email, filled.philsys_number], ['Married', 'High School', 'eli@example.test', '8419-5032-7741-3096'], 'filled in, email too')
eq([filled.is_pwd, filled.is_icc_ip_member, filled.icc_ip_name], [true, true, 'Kankanaey'], 'classification is filled in')
eq(filled.contact_number, '09171234567', 'an older number with dashes opens in the plain format')
eq(filled.middle_name, '', 'nothing is left null')
eq(farmerFormFrom({ id: 1, civil_status: null }).civil_status, '', 'a record with no civil status opens with none chosen')
eq(EMPTY_FARMER.civil_status, 'Single', 'a new farmer starts Single')

eq(changeFarmer(EMPTY_FARMER, 'contact_number', '0917-123 4567 99').form.contact_number, '09171234567', 'the contact number keeps 11 digits')
eq(changeFarmer(EMPTY_FARMER, 'philsys_number', '8419503277413096').form.philsys_number, '8419-5032-7741-3096', 'PhilSys gets its dashes')
const reset = changeFarmer({ ...EMPTY_FARMER, prefix: 'Mr.' }, 'gender', 'Female')
eq([reset.form.prefix, reset.prefixNote], ['', 'Prefix reset — please reselect.'], 'a prefix that does not fit the new sex is cleared, and said so')
eq(changeFarmer({ ...EMPTY_FARMER, is_icc_ip_member: true, icc_ip_name: 'X' }, 'is_icc_ip_member', false).form.icc_ip_name, '', 'not a member, no group name')

const today = new Date(2026, 10, 12)
const good = { ...EMPTY_FARMER, first_name: 'Ana', last_name: 'Cruz', birthdate: '1990-01-01', barangay: 'Alaska', rsbsa_number: '01-033-02-005-960002' }
eq(farmerProblems(good, today), {}, 'a complete form has no problem')
eq(farmerProblems({ ...good, rsbsa_number: '' }, today).rsbsa_number, 'RSBSA number is required.', 'RSBSA is required')
eq(farmerProblems({ ...good, birthdate: '2020-01-01' }, today).birthdate, 'Must be at least 10 years old to register.', 'too young')
eq(farmerProblems({ ...good, contact_number: '0917' }, today).contact_number, 'Contact number must be exactly 11 digits.', 'a short number')
eq(farmerProblems({ ...good, contact_number: '19171234567' }, today).contact_number, 'Contact number must start with 09.', 'not 09')
eq(farmerProblems({ ...good, philsys_number: '8419' }, today).philsys_number, 'Format must be NNNN-NNNN-NNNN-NNNN (e.g. 8419-5032-7741-3096).', 'a short PhilSys number')
eq(farmerProblems({ ...good, rsbsa_number: '' }, today, { isEdit: true }).rsbsa_number, undefined, 'editing does not ask for the RSBSA number: it is not part of the edit')
eq(firstFarmerProblem({ ...good, rsbsa_number: '', contact_number: '0917' }, today), 'RSBSA number is required.', 'the first problem is the one shown')

const sent = farmerPayload({ ...good, is_icc_ip_member: false, icc_ip_name: 'X', birthdate: '1958-05-02' }, { today })
eq([sent.icc_ip_name, sent.is_senior_citizen], ['', true], 'values of unticked boxes are cleared; senior citizen comes from the birthdate')
ok('farmers_organization' in farmerPayload(good, { today }), 'registering sends the chosen organization')
const edited = farmerPayload(good, { today, isEdit: true })
ok(!('farmers_organization' in edited) && !('rsbsa_number' in edited), 'editing sends neither the organization nor the RSBSA number')
ok('civil_status' in edited && 'email' in edited && 'philsys_number' in edited && 'is_pwd' in edited, 'but every other field of the form')

const sections = read('src/pages/Farmers/FarmerFormSections.jsx')
for (const title of ['Personal Information', 'Contact Information', 'Government Information']) ok(sections.includes(`title="${title}"`), `section ${title}`)
for (const label of ['Prefix', 'First Name', 'Middle Name', 'Last Name', 'Sex', 'Birthdate', 'Civil Status', 'Highest Education', 'Contact Number', 'Barangay', 'Email',
  'RSBSA Number', 'PhilSys / National ID No.', 'RSBSA Classification', 'Farmer Organization']) ok(sections.includes(`label="${label}"`), `field ${label}`)
ok(sections.includes("from '../../components/UI/FormTable.jsx'") && /<FormCell /.test(sections), 'the form is the shared table form')
const add = read('src/pages/Farmers/AddFarmerModal.jsx')
const edit = read('src/pages/Farmers/EditFarmerModal.jsx')
for (const [name, src] of [['Register Farmer', add], ['Edit Farmer', edit]]) {
  ok(src.includes('<FarmerFormSections'), `${name} draws the shared form`)
  ok(!/<FormLabel|className="grid /.test(src), `${name} has no fields of its own`)
  ok(src.includes('firstFarmerProblem') && src.includes('farmerPayload'), `${name} uses the shared rules`)
}
ok(add.includes('MachineryEditor') && add.includes('Save Farmer &amp; Add Farm Parcels'), 'Register keeps its machinery and parcels steps')

console.log(`farmerForm: ${n} checks passed`)
