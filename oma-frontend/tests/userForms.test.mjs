// Add User and Edit User are one table-form window each, built from the same sections; Edit offers every field Add does.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replaceAll(String.fromCharCode(13), '')
const { splitFullName, composeFullName, validateUserForm, ROLE_OPTIONS, SUFFIX_OPTIONS } = await import(here('src/pages/Users/userForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── a name is kept as "Last, First Suffix" and read back into its parts
eq(composeFullName('Dela Cruz', 'Juan', ''), 'Dela Cruz, Juan', 'no suffix')
eq(composeFullName('Dela Cruz', 'Juan', 'Jr.'), 'Dela Cruz, Juan Jr.', 'with suffix')
eq(composeFullName('  Dela Cruz ', ' Juan ', ''), 'Dela Cruz, Juan', 'spaces trimmed')
eq(splitFullName('Dela Cruz, Juan', ''), { lastName: 'Dela Cruz', firstName: 'Juan' }, 'split plain')
eq(splitFullName('Dela Cruz, Juan Jr.', 'Jr.'), { lastName: 'Dela Cruz', firstName: 'Juan' }, 'the suffix is not part of the first name')
eq(splitFullName('Juan Dela Cruz', ''), { lastName: 'Cruz', firstName: 'Juan Dela' }, 'no comma: the last word is the last name')
eq(splitFullName('Madonna', ''), { lastName: 'Madonna', firstName: '' }, 'one word')
eq(splitFullName('', ''), { lastName: '', firstName: '' }, 'empty')
eq(splitFullName(null, null), { lastName: '', firstName: '' }, 'missing')

// ── what the window accepts
const good = { lastName: 'Cruz', firstName: 'Ana', email: 'ana@example.com', contact: '09171234567' }
eq(validateUserForm(good), {}, 'a complete form has no errors')
eq(validateUserForm({ ...good, contact: '' }), {}, 'the mobile number is optional')
eq(validateUserForm({ ...good, lastName: ' ' }).lastName, 'Last name is required.', 'last name')
eq(validateUserForm({ ...good, firstName: '' }).firstName, 'First name is required.', 'first name')
eq(validateUserForm({ ...good, email: '' }).email, 'Email is required.', 'email')
eq(validateUserForm({ ...good, contact: '0917' }).contact, 'Mobile number must be 11 digits and start with 09.', 'short number')
eq(validateUserForm({ ...good, contact: '12345678901' }).contact, 'Mobile number must be 11 digits and start with 09.', 'wrong start')

eq(ROLE_OPTIONS.map((o) => o.value), ['ADMIN', 'EVALUATOR'], 'two staff roles')
eq(ROLE_OPTIONS.map((o) => o.label), ['ADMIN', 'FOCAL PERSON'], 'role labels')
eq(SUFFIX_OPTIONS, ['Jr.', 'Sr.', 'II', 'III', 'IV'], 'suffixes')

// ── the windows
const sections = read('src/pages/Users/UserFormSections.jsx')
ok(sections.includes('FormSection') && sections.includes('FormCell'), 'shared sections use the table form')
ok(sections.includes('Last Name') && sections.includes('First Name') && sections.includes('Suffix') && sections.includes('Email Address') && sections.includes('Mobile Number'), 'every field')
for (const file of ['CreateUserModal.jsx', 'EditUserModal.jsx']) {
  const src = read(`src/pages/Users/${file}`)
  ok(src.includes('UserFormSections.jsx'), `${file}: uses the shared sections`)
  ok(src.includes('validateUserForm'), `${file}: validates the same way`)
  ok(src.includes('composeFullName'), `${file}: saves the name the same way`)
  ok(!/<label className=\{labelCls\}/.test(src) && !src.includes('const labelCls'), `${file}: no hand-made labels`)
  ok(!/<button\b/.test(src), `${file}: buttons are the shared Button`)
}
const edit = read('src/pages/Users/EditUserModal.jsx')
ok(edit.includes('splitFullName'), 'Edit opens with the name in parts')
ok(edit.includes("maxWidth=\"max-w-3xl\"") || edit.includes('max-w-3xl') || edit.includes('max-w-2xl'), 'Edit window is wide enough for two columns')
const create = read('src/pages/Users/CreateUserModal.jsx')
ok(!/Step 1 of 3|StepRole|StepDetails|StepReview/.test(create), 'Add User is one window, not three steps')
ok(read('src/pages/Users/TemporaryPasswordModal.jsx').includes('CopyLine'), 'the one-time password window still copies lines')

console.log(`userForms: ${n} checks passed`)
