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
