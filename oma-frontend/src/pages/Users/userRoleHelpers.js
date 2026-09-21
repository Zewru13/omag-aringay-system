// Shared with EditUserModal.jsx (kept out of UserManagementPage.jsx so that
// file can export components only — see react-refresh/only-export-components).

// Every account shares one User table, but role alone can't tell Admin/
// Focal Person apart from Farmer/Fisherfolk/Organization — all three of
// the latter share role=CITIZEN, distinguished by linked_record_type
// (UserSerializer already resolves this from the account's active
// UserLinkedRecord — see accounts/views.py's UserListView docstring).
// FARMERS_ORG and FISHERFOLK_ORG both collapse to plain "Organization",
// matching the single filter option this screen offers for either.
export function describeRole(u) {
  if (u.role === 'ADMIN') return { label: 'Admin', tone: 'green' }
  if (u.role === 'EVALUATOR') return { label: 'Focal Person', tone: 'teal' }
  if (u.linked_record_type === 'FARMER') return { label: 'Farmer', tone: 'amber' }
  if (u.linked_record_type === 'FISHERFOLK') return { label: 'Fisherfolk', tone: 'slate' }
  if (u.linked_record_type === 'FARMERS_ORG' || u.linked_record_type === 'FISHERFOLK_ORG') {
    return { label: 'Organization', tone: 'rose' }
  }
  // Real edge case in the data: a CITIZEN account with no active linked
  // record at all (e.g. leftover test accounts) — honest fallback rather
  // than a silent mislabel.
  return { label: u.role, tone: 'slate' }
}
