// One position per person, one person per position, in an organization (the server enforces it; these helpers let the screens grey out what
// the server would refuse). A position is held by an active officer, or by an active member whose position is anything but "Member".
// No screen and no network, so it can be tested on its own.

// The officer positions an officer term can be for (OrganizationOfficer / FisherfolkOrganizationOfficer.POSITION_CHOICES).
export const OFFICER_POSITIONS = ['President', 'Vice President', 'Secretary', 'Treasurer', 'Auditor', 'Board Member', 'Manager']

const PLAIN = 'Member'
const live = (row) => row.is_active !== false
const personOf = (type) => (type === 'farmers' ? 'farmer' : 'fisherfolk')

// The positions held right now. officers: current officer rows; members: membership rows.
export function heldPositions(officers = [], members = []) {
  const held = new Set()
  officers.filter(live).forEach((o) => { if (o.position && o.position !== PLAIN) held.add(o.position) })
  members.filter(live).forEach((m) => { if (m.position && m.position !== PLAIN) held.add(m.position) })
  return held
}

// Who already has a position: person id -> the position, so nobody is offered a second one.
export function holdersByPerson(officers = [], members = [], type = 'farmers') {
  const key = personOf(type)
  const who = new Map()
  officers.filter(live).forEach((o) => { const id = o[`${key}_id`]; if (id != null && o.position) who.set(id, o.position) })
  members.filter(live).forEach((m) => { if (m[key] != null && m.position && m.position !== PLAIN && !who.has(m[key])) who.set(m[key], m.position) })
  return who
}

// The positions a line of a table of members still to be added cannot choose: the held ones, and what the other lines chose.
export function takenForLine(held, lines, uid) {
  const taken = new Set(held)
  lines.forEach((l) => { if (l._uid !== uid && l.position && l.position !== PLAIN) taken.add(l.position) })
  return taken
}

// The first officer position nobody holds ('' when every one is taken).
export const firstFreeOfficerPosition = (taken) => OFFICER_POSITIONS.find((p) => !taken.has(p)) || ''

// The text of a position in a dropdown.
export const positionLabel = (position, taken) => (position !== PLAIN && taken.has(position) ? `${position} (taken)` : position)
