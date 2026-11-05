// Fisheries Disaster > Log Disaster for several fisherfolk: the rules that need no screen and no network, so they can be tested on their own.
// The Admin picks the fisherfolk in a multi-select, fills in the event once (date, type, description, photos) and, for each fisherfolk, their own
// stocks and ponds/cages with the fingerlings lost (or "not linked to a stock"), the equipment damaged and the volume lost. One request
// (POST /fisheries/disaster-reports/multi/) saves one disaster log per fisherfolk, all or nothing.

export const MAX_FISHERFOLK = 100   // the server's limit (fisheries.views.MultiFisherfolkDisasterCreateView)

// What the form keeps of a fisherfolk from the registry search.
export const pickPerson = (p) => ({
  id: p.id, full_name: p.full_name, barangay: p.barangay, rsbsa_number: p.rsbsa_number || '', fishr_number: p.fishr_number || '',
})

// The multi-select: choosing a fisherfolk adds them (never twice), choosing them again removes them.
export const togglePerson = (list, person) => (list.some((p) => p.id === person.id) ? list.filter((p) => p.id !== person.id) : [...list, pickPerson(person)])
export const removePerson = (list, id) => list.filter((p) => p.id !== id)

// "Ann Cruz · 01-033-02-019-000001 · Samara": the name, the registration number (RSBSA, else FishR) and the barangay.
export const personLine = (p) => [p.full_name, p.rsbsa_number || p.fishr_number, p.barangay].filter(Boolean).join(' · ')

// '' when the shared event can be sent, else the message to show. `today` is the local date (YYYY-MM-DD).
export function eventProblem({ date, type, typeOther, people }, today) {
  if (!people.length) return 'Choose at least one fisherfolk.'
  if (people.length > MAX_FISHERFOLK) return `At most ${MAX_FISHERFOLK} fisherfolk can be logged at once.`
  if (!date) return 'Date of occurrence is required.'
  if (date > today) return 'Date of occurrence cannot be in the future.'
  if (type === 'Other' && !String(typeOther || '').trim()) return 'Please specify the disaster type.'
  return ''
}

// One group per fisherfolk, as the server takes them: `stock_losses` (empty when "not linked to a stock"), and the volume lost and equipment
// damaged only when something was entered. entry: { person, mode: 'stocks' | 'unlinked', stockLosses, volume, equipment }.
export const buildGroups = (entries) => entries.map(({ person, mode, stockLosses, volume, equipment }) => ({
  fisherfolk: person.id,
  stock_losses: mode === 'stocks' ? stockLosses : [],
  ...(volume !== '' && volume !== null && volume !== undefined ? { volume_lost_kg: Number(volume) } : {}),
  ...(equipment ? { equipment_damaged: equipment } : {}),
}))

// The request body: plain JSON, or a form once there are photos (then the groups travel as one JSON string and every photo is its own file).
export function multiPayload({ fields, groups, photos }) {
  if (!photos.length) return { ...fields, fisherfolk_groups: groups }
  const form = new FormData()
  Object.entries(fields).forEach(([key, value]) => { if (value !== null && value !== undefined) form.append(key, value) })
  form.append('fisherfolk_groups', JSON.stringify(groups))
  photos.forEach((p) => form.append('photos', p.file, p.file.name))
  return form
}
