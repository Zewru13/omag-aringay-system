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

// "Me": the logged-in user's name. The position stays empty so the printed report keeps its own default line for the preparer.
export function meSignatory(user) {
  const name = String(user?.full_name || '').trim()
  return name ? { name, position: '' } : null
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
