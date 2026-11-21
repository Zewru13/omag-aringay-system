// The saved report signers (Admin > Signatories): the four signing roles and the form's own check. The Reports pages pick their
// Prepared / Checked / Noted / Approved by from this list.

// In the order they sign. `value` is what the server stores; `label` is what the screens and the printed report say.
export const SIGNATORY_ROLES = [
  { value: 'prepared', label: 'Prepared by' },
  { value: 'checked', label: 'Checked by' },
  { value: 'noted', label: 'Noted by' },
  { value: 'approved', label: 'Approved by' },
]

export const roleLabel = (value) => SIGNATORY_ROLES.find((r) => r.value === value)?.label || ''

// '' when the form can be sent, otherwise the message to show.
export function signatoryError({ name, role }) {
  if (!String(name || '').trim()) return 'Enter the name.'
  if (!SIGNATORY_ROLES.some((r) => r.value === role)) return 'Choose the signing role.'
  return ''
}

// ── The Reports pages' picker ─────────────────────────────────────────────────────────────────────────────────────────────────

// The saved signers a dropdown offers: the active rows of one role, in the order the server sent them.
export const signatoryOptions = (list, role) => (list || []).filter((s) => s.role === role && s.is_active !== false)

// The position the Prepared by line starts with, by the kind of account that is logged in. The person can edit it in the Signatories window.
export const ACCOUNT_POSITIONS = { ADMIN: 'Administrator', EVALUATOR: 'Focal Person' }
export const defaultPositionFor = (user) => ACCOUNT_POSITIONS[user?.role] || ''

// "Me": the logged-in user's name and the default position of their kind of account.
export function meSignatory(user) {
  const name = String(user?.full_name || '').trim()
  return name ? { name, position: defaultPositionFor(user) } : null
}

// A dropdown's value becomes the pick: '' is none, 'me' is the user, anything else is a saved row's id (as text). A pick keeps the
// name and position, not the id, so a printout still carries them if the row is edited or deleted while the page is open.
export function resolvePick(value, list, user) {
  if (!value) return null
  if (value === 'me') return meSignatory(user)
  const row = (list || []).find((s) => String(s.id) === String(value))
  return row ? { name: row.name, position: row.position || '' } : null
}

// The query parameters the report endpoints read for the signature block. The Checked by slot travels as reviewed_*; a blank name
// is no signer, and an empty position is left out so the report prints its own default.
const PARAM_NAMES = { prepared: ['prepared_by', 'prepared_role'], checked: ['reviewed_by', 'reviewed_role'], noted: ['noted_by', 'noted_role'], approved: ['approved_by', 'approved_role'] }
export function signatureParams(selection) {
  const params = {}
  Object.entries(PARAM_NAMES).forEach(([role, [nameKey, positionKey]]) => {
    const pick = selection?.[role]
    const name = String(pick?.name || '').trim()
    if (!name) return
    params[nameKey] = name
    const position = String(pick.position || '').trim()
    if (position) params[positionKey] = position
  })
  return params
}

// ── The Signatories window ─────────────────────────────────────────────────────────────

// What the window shows: one { name, position } per role. Prepared by starts as the logged-in user with the position of their kind of
// account; the other three start empty. `edits` holds only what the person changed ({ role: { name?, position? } }), so a box they did
// not touch keeps its default.
const EMPTY = { name: '', position: '' }

export function signerRows(user, edits) {
  const me = meSignatory(user)
  const rows = {}
  SIGNATORY_ROLES.forEach(({ value }) => {
    const start = value === 'prepared' && me ? me : EMPTY
    const edit = edits?.[value] || {}
    rows[value] = {
      name: edit.name !== undefined ? edit.name : start.name,
      position: edit.position !== undefined ? edit.position : start.position,
    }
  })
  return rows
}

// Typing in one box of one row.
export const editSigner = (edits, role, field, value) => ({ ...edits, [role]: { ...(edits?.[role] || {}), [field]: value } })

// The saved-signer dropdown of a row: '' empties the row, 'me' goes back to the default (the logged-in user for Prepared by), a saved row's
// id fills the name and the position (both can still be edited). An id that is not in the list changes nothing.
export function pickSavedSigner(edits, role, list, value) {
  if (!value) return { ...edits, [role]: { ...EMPTY } }
  if (value === 'me') {
    const next = { ...edits }
    delete next[role]
    return next
  }
  const row = signatoryOptions(list, role).find((s) => String(s.id) === String(value))
  return row ? { ...edits, [role]: { name: row.name, position: row.position || '' } } : edits
}

// What the dropdown shows for a row now: 'me' while it is the default Prepared by, a saved signer's id while it equals that signer, otherwise
// '' (typed by hand, or empty).
export function savedChoiceOf(row, list, role, user) {
  const same = (a) => String(a?.name || '').trim() === String(row?.name || '').trim() && String(a?.position || '') === String(row?.position || '')
  if (role === 'prepared' && same(meSignatory(user))) return 'me'
  const found = signatoryOptions(list, role).find(same)
  return found ? String(found.id) : ''
}

// "Name, position" for the line under the buttons; empty when nobody signs that line.
export function signerSummary(row) {
  const name = String(row?.name || '').trim()
  if (!name) return ''
  const position = String(row?.position || '').trim()
  return position ? `${name}, ${position}` : name
}
