import assert from 'node:assert/strict'

const { SIGNATORY_ROLES, roleLabel, signatoryError, signatoryOptions, meSignatory, resolvePick, signatureParams } = await import(new URL('../src/utils/signatories.js', import.meta.url).href)

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

// ── The Reports pages' picker ──────────────────────────────────────────────────
const list = [
  { id: 1, name: 'Ana Cruz', position: 'Municipal Agriculturist', role: 'noted', is_active: true },
  { id: 2, name: 'Ben Reyes', position: '', role: 'approved', is_active: true },
  { id: 3, name: 'Cy Diaz', position: 'Section Head', role: 'checked', is_active: true },
  { id: 4, name: 'Dee Lim', position: 'Clerk', role: 'prepared', is_active: true },
  { id: 5, name: 'Old Noted', position: 'Former', role: 'noted', is_active: false },
  { id: 6, name: 'Eli Tan', position: 'Deputy', role: 'noted', is_active: true },
]
eq(signatoryOptions(list, 'noted').map((s) => s.name), ['Ana Cruz', 'Eli Tan'], 'only the active rows of that role, in list order')
eq(signatoryOptions(list, 'checked').map((s) => s.name), ['Cy Diaz'], 'one checker')
eq(signatoryOptions([], 'noted'), [], 'an empty list offers nothing')
eq(signatoryOptions(undefined, 'noted'), [], 'a list that did not load offers nothing')

eq(meSignatory({ full_name: '  Hajay Salazar ' }), { name: 'Hajay Salazar', position: '' }, 'me is the logged-in name with no position')
eq(meSignatory({}), null, 'no name, no me')
eq(meSignatory(null), null, 'no user, no me')

// resolvePick turns the dropdown's value into the pick: '' none, 'me' the user, otherwise a saved row by id (as text)
const user = { full_name: 'Hajay Salazar' }
eq(resolvePick('', list, user), null, 'none')
eq(resolvePick('me', list, user), { name: 'Hajay Salazar', position: '' }, 'me')
eq(resolvePick('1', list, user), { name: 'Ana Cruz', position: 'Municipal Agriculturist' }, 'a saved row')
eq(resolvePick('999', list, user), null, 'a row that is not in the list')
eq(resolvePick('me', list, {}), null, 'me without a name')

// signatureParams: only set slots, the checked slot travels as reviewed_*, an empty position is left out
eq(signatureParams({}), {}, 'nothing picked')
eq(signatureParams({ prepared: { name: 'Hajay Salazar', position: '' } }), { prepared_by: 'Hajay Salazar' }, 'only me')
eq(signatureParams({
  prepared: { name: 'Dee Lim', position: 'Clerk' }, checked: { name: 'Cy Diaz', position: 'Section Head' },
  noted: { name: 'Ana Cruz', position: 'Municipal Agriculturist' }, approved: { name: 'Ben Reyes', position: '' },
}), {
  prepared_by: 'Dee Lim', prepared_role: 'Clerk', reviewed_by: 'Cy Diaz', reviewed_role: 'Section Head',
  noted_by: 'Ana Cruz', noted_role: 'Municipal Agriculturist', approved_by: 'Ben Reyes',
}, 'all four')
eq(Object.keys(signatureParams({ noted: { id: 1, name: 'Ana Cruz', position: '' } })), ['noted_by'], 'picks carry names, never ids')
eq(new URLSearchParams(signatureParams({ noted: { name: 'R&D <Chief>', position: '' } })).get('noted_by'), 'R&D <Chief>', 'special characters survive the query string')
eq(signatureParams({ noted: { name: '   ', position: 'x' } }), {}, 'a blank name is no signer')

console.log(`signatories: ${n} checks passed`)
