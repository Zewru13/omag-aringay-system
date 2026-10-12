// An organization's "Confirm for Members" list: pick the members whose assistance reached them (one by one, or all at
// once), send one set of proof photos for the whole pick. Pure helpers, so the picking and the messages can be tested.

// The organization vouches for these members, so it must show proof: at least this many photos, sent once for everyone.
export const PROOF_MIN = 2

// A request an older flow is still holding for OMAg review cannot be picked again; a rejected one can be sent again.
export const isSelectable = (record) => record.latest_request_status !== 'PENDING'
export const selectableIds = (records) => (Array.isArray(records) ? records.filter(isSelectable).map((r) => r.id) : [])

export const toggleId = (selected, id) => {
  const next = new Set(selected)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  return next
}

export const allSelected = (selected, records) => {
  const ids = selectableIds(records)
  return ids.length > 0 && ids.every((id) => selected.has(id))
}

// Everything picked -> nothing picked; otherwise pick every row that can be picked.
export const toggleAll = (selected, records) => (allSelected(selected, records) ? new Set() : new Set(selectableIds(records)))

// After the list reloads (members were confirmed), keep only the picks that are still on the list and still pickable.
export const keepValid = (selected, records) => {
  const valid = new Set(selectableIds(records))
  return new Set([...selected].filter((id) => valid.has(id)))
}

export const confirmButtonLabel = (count) => (count === 0 ? 'Confirm for members' : `Confirm ${count} member${count === 1 ? '' : 's'}`)
export const selectionSummary = (count, total) => (count === 0 ? 'None selected' : `${count} of ${total} selected`)

export const namesPreview = (names, max = 3) => {
  if (names.length <= max) return names.length > 1 ? `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}` : (names[0] || '')
  return `${names.slice(0, max).join(', ')} and ${names.length - max} more`
}

// Why the confirmation cannot be sent yet ('' when it can).
export const confirmProblem = (memberCount, photoCount) => {
  if (memberCount < 1) return 'Pick at least one member.'
  if (photoCount < PROOF_MIN) return `Add at least ${PROOF_MIN} photos as proof.`
  return ''
}
