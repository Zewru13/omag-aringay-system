// The Add Member window of an organization's page lets several registered people be picked (search one, pick, search another, pick) and added in
// one step. These are the helpers behind it: the picking, and sending the pick to the server one person at a time (the server judges each person
// on their own). No screen and no network of their own, so they can be tested alone.
import { memberOutcome, memberRefusal } from './registrationMembers.js'

export const isChosen = (chosen, id) => chosen.some((c) => c.person.id === id)

// A click on a person: picked, or taken off again if they were already picked. Everyone starts as a plain Member.
export const toggleChosen = (chosen, person) => (isChosen(chosen, person.id)
  ? chosen.filter((c) => c.person.id !== person.id)
  : [...chosen, { person, position: 'Member' }])

export const setChosenPosition = (chosen, id, position) => chosen.map((c) => (c.person.id === id ? { ...c, position } : c))

// The picked people as the lines positionRules.takenForLine reads, so a position another picked person chose is greyed out.
export const positionLines = (chosen) => chosen.map((c) => ({ _uid: c.person.id, position: c.position }))

export const addButtonLabel = (count) => (count === 0 ? 'Add Members' : `Add ${count} Member${count === 1 ? '' : 's'}`)

// The server's own sentence ("This farmer is already a member of this organization.") as the end of "<name> could not be added (...)".
const refusalReason = (data) => {
  const said = memberRefusal(data)
  return said === 'could not be added' ? said : `could not be added (${String(said).replace(/\.+$/, '')})`
}

// Sends every picked person (body(entry) is what the server takes for one). Returns who was added, who was refused (with the reason) and who the
// server holds back until staff say whether this organization is their main one (an organization account cannot answer that: for it, it is a refusal).
export async function addBatch({ chosen, post, body, own = false }) {
  const added = []
  const failed = []
  const needMain = []
  for (const entry of chosen) {
    try {
      await post(body(entry))
      added.push(entry)
    } catch (err) {
      const data = err?.response?.data
      if (data?.main_choice_required && !own) {
        needMain.push({ entry, otherNames: (data.other_organizations || []).map((o) => o.organization_name) })
      } else if (data?.main_choice_required) {
        failed.push({ entry, name: entry.person.full_name, reason: 'is already in another organization and has no main one yet. Ask OMAg staff to set it first.' })
      } else {
        failed.push({ entry, name: entry.person.full_name, reason: refusalReason(data) })
      }
    }
  }
  return { added, failed, needMain }
}

// What to tell the person once the pick has been sent (the same sentences as the registration form). `failures` is [{ name, reason }].
export const batchMessage = memberOutcome
