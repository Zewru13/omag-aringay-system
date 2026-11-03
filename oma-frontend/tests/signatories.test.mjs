import assert from 'node:assert/strict'

const { SIGNATORY_ROLES, roleLabel, signatoryError } = await import(new URL('../src/utils/signatories.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// The four signing roles, in the order they sign.
eq(SIGNATORY_ROLES, [
  { value: 'prepared', label: 'Prepared by' },
  { value: 'checked', label: 'Checked by' },
  { value: 'noted', label: 'Noted by' },
  { value: 'approved', label: 'Approved by' },
], 'roles in signing order')
eq(roleLabel('checked'), 'Checked by', 'a role label')
eq(roleLabel('boss'), '', 'an unknown role has no label')
eq(roleLabel(undefined), '', 'no role has no label')

// The form's own check before it asks the server.
eq(signatoryError({ name: '', role: 'noted' }), 'Enter the name.', 'blank name')
eq(signatoryError({ name: '   ', role: 'noted' }), 'Enter the name.', 'whitespace name')
eq(signatoryError({ name: 'Ana Cruz', role: '' }), 'Choose the signing role.', 'no role')
eq(signatoryError({ name: 'Ana Cruz', role: 'boss' }), 'Choose the signing role.', 'unknown role')
eq(signatoryError({ name: 'Ana Cruz', role: 'noted' }), '', 'a valid form')

console.log(`signatories: ${n} checks passed`)
