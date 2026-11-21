import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const { SIGNATORY_ROLES, roleLabel, signatoryError, signatoryOptions, meSignatory, resolvePick, signatureParams, defaultPositionFor, signerRows, editSigner, pickSavedSigner, savedChoiceOf, signerSummary } = await import(new URL('../src/utils/signatories.js', import.meta.url).href)

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

// ── The Signatories window: one row per role, the position filled in by the kind of account and editable ────────────────────────────────
eq([defaultPositionFor({ role: 'ADMIN' }), defaultPositionFor({ role: 'EVALUATOR' }), defaultPositionFor({ role: 'CITIZEN' }), defaultPositionFor(null)], ['Administrator', 'Focal Person', '', ''], 'the default position follows the account type')
eq(meSignatory({ full_name: 'Hajay Salazar', role: 'ADMIN' }), { name: 'Hajay Salazar', position: 'Administrator' }, 'an Admin prepares as Administrator')
eq(meSignatory({ full_name: 'Ana Cruz', role: 'EVALUATOR' }), { name: 'Ana Cruz', position: 'Focal Person' }, 'a Focal Person prepares as Focal Person')

const admin = { full_name: 'Hajay Salazar', role: 'ADMIN' }
eq(signerRows(admin, {}), {
  prepared: { name: 'Hajay Salazar', position: 'Administrator' }, checked: { name: '', position: '' },
  noted: { name: '', position: '' }, approved: { name: '', position: '' },
}, 'Prepared by starts as the logged-in user with the default position; the others are empty')
eq(signerRows(null, {}).prepared, { name: '', position: '' }, 'no user yet: an empty Prepared by')

// editing a box changes only that box; the other keeps its default
let edits = editSigner({}, 'prepared', 'position', 'Records Officer')
eq(signerRows(admin, edits).prepared, { name: 'Hajay Salazar', position: 'Records Officer' }, 'the default position can be edited')
edits = editSigner(edits, 'prepared', 'name', 'Dee Lim')
eq(signerRows(admin, edits).prepared, { name: 'Dee Lim', position: 'Records Officer' }, 'and so can the name')
eq(signerRows(admin, editSigner({}, 'prepared', 'position', '')).prepared.position, '', 'a position cleared on purpose stays empty (the printout then uses its own default line)')
eq(signerRows(admin, editSigner({}, 'noted', 'name', 'Ana Cruz')).noted, { name: 'Ana Cruz', position: '' }, 'typing a name for another role')
eq(editSigner({ noted: { name: 'x' } }, 'prepared', 'name', 'y').noted, { name: 'x' }, 'editing one role leaves the others')

// picking a saved signer fills both boxes (still editable); picking nothing / me goes back to the default
edits = pickSavedSigner({}, 'noted', list, '1')
eq(signerRows(admin, edits).noted, { name: 'Ana Cruz', position: 'Municipal Agriculturist' }, 'a saved signer fills the name and the position')
eq(signerRows(admin, editSigner(edits, 'noted', 'position', 'Acting Agriculturist')).noted, { name: 'Ana Cruz', position: 'Acting Agriculturist' }, 'the picked position can still be edited')
eq(signerRows(admin, pickSavedSigner(edits, 'noted', list, '')).noted, { name: '', position: '' }, 'choosing none empties the row')
eq(signerRows(admin, pickSavedSigner(editSigner({}, 'prepared', 'name', 'Dee Lim'), 'prepared', list, 'me', admin)).prepared, { name: 'Hajay Salazar', position: 'Administrator' }, 'me puts the logged-in user and the default position back')
eq(signerRows(admin, pickSavedSigner({}, 'noted', list, '999')).noted, { name: '', position: '' }, 'a row that is not in the list picks nothing')

// which saved signer a row matches (for the dropdown), and the one-line summary
eq(savedChoiceOf({ name: 'Ana Cruz', position: 'Municipal Agriculturist' }, list, 'noted', admin), '1', 'a row equal to a saved signer shows that signer')
eq(savedChoiceOf({ name: 'Ana Cruz', position: 'Someone else' }, list, 'noted', admin), '', 'an edited row is no longer that signer')
eq(savedChoiceOf({ name: 'Hajay Salazar', position: 'Administrator' }, list, 'prepared', admin), 'me', 'the default Prepared by shows as me')
eq(signerSummary({ name: 'Ana Cruz', position: 'Municipal Agriculturist' }), 'Ana Cruz, Municipal Agriculturist', 'a summary of a row')
eq(signerSummary({ name: 'Ana Cruz', position: '' }), 'Ana Cruz', 'a name without a position')
eq(signerSummary({ name: '', position: 'x' }), '', 'no name, no signer')

// the printout's parameters follow the rows
eq(signatureParams(signerRows(admin, edits)), { prepared_by: 'Hajay Salazar', prepared_role: 'Administrator', noted_by: 'Ana Cruz', noted_role: 'Municipal Agriculturist' }, 'the parameters come from the rows')

// no Order: a role's names are listed alphabetically, and the table and the form have no Order box
const page = readFileSync(new URL('../src/pages/Signatories/SignatoriesPage.jsx', import.meta.url), 'utf8').replace(/\r\n/g, '\n')
eq(/sort_order|ORDER|label="Order"|aria-label="Order"/.test(page), false, 'the Signatories page has no Order column, box or field')
eq(page.includes("{ key: 'role', label: 'SIGNING ROLE' }") && page.includes("{ key: 'active', label: 'ACTIVE' }"), true, 'the other columns stay')

console.log(`signatories: ${n} checks passed`)
