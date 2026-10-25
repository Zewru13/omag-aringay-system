// Ownership of an aquaculture production cycle (Start Production Cycle, Cycle Info, the Aquaculture Monitoring table).
// Pure rules, no screen and no network, so they can be tested on their own.
//
//   Tenant          -> the owner's name and RSBSA / FishR number are required
//   Lease / Owner   -> nothing more; any owner details are cleared
// The registration number is kept as text (leading zeros matter).

export const OWNERSHIP_OPTIONS = ['Tenant', 'Lease', 'Owner']
export const OWNERSHIP_NOT_SPECIFIED = 'Not specified'
export const EMPTY_OWNERSHIP = { ownership: '', ownerName: '', ownerNo: '' }

export const needsOwnerDetails = (ownership) => ownership === 'Tenant'

// What a cycle (or a table row carrying its cycle's ownership) shows: the saved value, else a fallback for older cycles.
export const ownershipLabel = (value) => (OWNERSHIP_OPTIONS.includes(value) ? value : OWNERSHIP_NOT_SPECIFIED)

// The form state for a saved cycle.
export function ownershipFrom(cycle) {
  if (!cycle) return { ...EMPTY_OWNERSHIP }
  return {
    ownership: OWNERSHIP_OPTIONS.includes(cycle.ownership) ? cycle.ownership : '',
    ownerName: cycle.owner_name || '',
    ownerNo: cycle.owner_registration_number || '',
  }
}

// Picking another ownership: anything but Tenant clears the owner details so outdated ones can never be saved.
export function chooseOwnership(state, next) {
  return needsOwnerDetails(next) ? { ...state, ownership: next } : { ownership: next || '', ownerName: '', ownerNo: '' }
}

// Why the form cannot be saved yet ('' when it can).
export function ownershipProblem({ ownership, ownerName, ownerNo }) {
  if (!OWNERSHIP_OPTIONS.includes(ownership)) return 'Choose the ownership.'
  if (needsOwnerDetails(ownership)) {
    if (!(ownerName || '').trim()) return "Enter the owner's name."
    if (!(ownerNo || '').trim()) return "Enter the owner's RSBSA / FishR number."
  }
  return ''
}

// What is sent to the server. Owner sends blanks, so a cycle that used to be Tenant or Lease loses its old owner details.
export function ownershipPayload({ ownership, ownerName, ownerNo }) {
  if (!ownership) return {}
  if (!needsOwnerDetails(ownership)) return { ownership, owner_name: '', owner_registration_number: '' }
  return { ownership, owner_name: (ownerName || '').trim(), owner_registration_number: (ownerNo || '').trim() }
}

// Has the ownership part of the form changed since the cycle was loaded? An edit that leaves it alone does not send it.
export function ownershipChanged(state, cycle) {
  const saved = ownershipFrom(cycle)
  return state.ownership !== saved.ownership || state.ownerName.trim() !== saved.ownerName.trim() || state.ownerNo.trim() !== saved.ownerNo.trim()
}

// Cycle Details rows: Tenant also shows the owner and the registration number. Owner shows only the ownership; so does Lease, unless
// an older Lease cycle still carries owner details (they are shown, not hidden, until the cycle is next saved).
export function ownershipRows(cycle) {
  const rows = [['Ownership', ownershipLabel(cycle?.ownership)]]
  const olderLease = cycle?.ownership === 'Lease' && Boolean(cycle.owner_name || cycle.owner_registration_number)
  if (needsOwnerDetails(cycle?.ownership) || olderLease) {
    rows.push(['Owner Name', cycle.owner_name || '—'], ['RSBSA / FishR No. of Owner', cycle.owner_registration_number || '—'])
  }
  return rows
}
