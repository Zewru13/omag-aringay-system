// The members of an organization, as entered on its registration form (picked from the registry, or imported from a file after it is saved):
// the lines, what is wrong with a line, what is sent to add a member, and how the result is reported. No screen and no network, so it can be
// tested on its own. The organization does not exist while the form is open, so its members are added one by one once it is saved,
// through the same endpoint (and rules) as the Add Member window of its page.

export const MEMBER_POSITIONS = ['Member', 'President', 'Chairperson', 'Vice President', 'Vice Chairperson', 'Secretary', 'Treasurer', 'Auditor', 'Board Member', 'Manager']

const personKey = (type) => (type === 'farmers' ? 'farmer' : 'fisherfolk')

// A person found in the registry, as a line of the table: a position of Member, and the date joined left blank (the organization's date
// registered is used until another is typed).
export const makeMemberLine = (person, uid, position = 'Member') => ({
  _uid: uid, person_id: person.id, name: person.full_name || '', rsbsa: person.rsbsa_number || '', position: MEMBER_POSITIONS.includes(position) ? position : 'Member', date_joined: '',
})

// The line list with this person added, unless they are already on it.
export const addMemberLine = (lines, person, uid, position = 'Member') => (lines.some((l) => l.person_id === person.id) ? lines : [...lines, makeMemberLine(person, uid, position)])

// The date a line joins on: the one typed, else the organization's date registered, else today.
export const joinedOn = (line, registered, today) => line.date_joined || registered || today

// What is wrong with one line ('' when nothing). `today` is YYYY-MM-DD.
export function memberLineProblem(line, registered, today) {
  if (!MEMBER_POSITIONS.includes(line.position)) return 'choose the position'
  const date = joinedOn(line, registered, today)
  if (date > today) return 'the date joined cannot be in the future'
  return ''
}

export function memberLinesProblem(lines, registered, today) {
  for (let i = 0; i < lines.length; i += 1) {
    const problem = memberLineProblem(lines[i], registered, today)
    if (problem) return `Member ${i + 1} (${lines[i].name}): ${problem}.`
  }
  return ''
}

// One line as the add-member endpoint takes it.
export const memberPayload = (line, type, registered, today) => ({
  [personKey(type)]: line.person_id, position: line.position, date_joined: joinedOn(line, registered, today),
})

// Why the server refused one member, as a sentence.
export function memberRefusal(data) {
  if (data?.main_choice_required) return 'is already in other organizations with no main one: add them from the organization page to choose it'
  const first = (v) => (Array.isArray(v) ? v[0] : v)
  return first(data?.detail) || first(data?.date_joined) || first(data?.position) || first(data?.non_field_errors) || 'could not be added'
}

// After the organization is saved: what to tell the person about the members. `failures` is [{ name, reason }].
export function memberOutcome(total, failures) {
  if (total === 0) return { kind: 'none', text: '' }
  const added = total - failures.length
  if (failures.length === 0) return { kind: 'ok', text: `${total} member${total === 1 ? '' : 's'} added.` }
  const list = failures.map((f) => `${f.name} ${f.reason}`).join('; ')
  return { kind: 'partial', text: `${added} of ${total} members added. Not added: ${list}.` }
}
