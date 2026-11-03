import assert from 'node:assert/strict'

const { OFFICER_POSITIONS, heldPositions, holdersByPerson, takenForLine, firstFreeOfficerPosition, positionLabel } =
  await import(new URL('../src/pages/Organizations/positionRules.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const officers = [{ position: 'President', farmer_id: 1 }, { position: 'Secretary', farmer_id: 2, is_active: true }, { position: 'Auditor', farmer_id: 3, is_active: false }]
const members = [
  { farmer: 4, position: 'Treasurer', is_active: true }, { farmer: 5, position: 'Member', is_active: true },
  { farmer: 6, position: 'Manager', is_active: false }, { farmer: 7, position: 'Chairperson' },
]

// taken = active officers + active members with a position other than Member
eq([...heldPositions(officers, members)].sort(), ['Chairperson', 'President', 'Secretary', 'Treasurer'], 'who holds what')
eq([...heldPositions()], [], 'nothing held')
eq(heldPositions([], [{ position: 'Member' }]).has('Member'), false, 'Member is never taken')

// who already has a position (one role per person), for officers of either domain
eq([...holdersByPerson(officers, members, 'farmers')].sort(), [[1, 'President'], [2, 'Secretary'], [4, 'Treasurer'], [7, 'Chairperson']], 'people with a position (farmers)')
eq(holdersByPerson([{ position: 'Manager', fisherfolk_id: 9 }], [{ fisherfolk: 8, position: 'Auditor', is_active: true }], 'fisherfolk').get(9), 'Manager', 'fisherfolk officer')
eq(holdersByPerson([], [{ fisherfolk: 8, position: 'Auditor', is_active: true }], 'fisherfolk').get(8), 'Auditor', 'fisherfolk member')

// in a table of lines being added, another line's position is taken too, this line's own is not
const lines = [{ _uid: 1, position: 'Vice President' }, { _uid: 2, position: 'Member' }, { _uid: 3, position: 'Auditor' }]
eq([...takenForLine(new Set(['President']), lines, 1)].sort(), ['Auditor', 'President'], 'line 1 sees the held position and line 3')
eq([...takenForLine(new Set(['President']), lines, 2)].sort(), ['Auditor', 'President', 'Vice President'], 'line 2 sees both other lines')

// the first officer position nobody holds
eq(firstFreeOfficerPosition(new Set(['President', 'Vice President'])), 'Secretary', 'first free')
eq(firstFreeOfficerPosition(new Set(OFFICER_POSITIONS)), '', 'every position taken')

eq(positionLabel('President', new Set(['President'])), 'President (taken)', 'taken label')
eq(positionLabel('Member', new Set(['Member'])), 'Member', 'Member never says taken')
eq(positionLabel('Auditor', new Set()), 'Auditor', 'free label')

console.log(`positionRules: ${n} checks passed`)
