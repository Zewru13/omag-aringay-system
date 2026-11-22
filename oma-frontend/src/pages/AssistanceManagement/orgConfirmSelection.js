// An organization's "Confirm for Members" list: pick the members whose assistance reached them (one by one, or all at
// once), send one set of proof photos for the whole pick. Pure helpers, so the picking and the messages can be tested.
import { formatDate } from '../../utils/dateFormat.js'
import { matchesSearch } from '../../utils/searchMatch.js'
import { selectionState } from '../Account/recordList.js'
import { formatAssistanceQuantity } from './assistanceFieldHelpers.js'

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

// The list is shown assistance by assistance: what was given (type, date, quantity, agency), then the members it can be confirmed for. The
// records carry no distribution id, so records that agree on all four belong together. Groups keep the order the server sent them in.
export const assistanceKey = (r) => JSON.stringify([r.assistance_type || '', r.date_given || '', r.quantity ?? '', Array.isArray(r.source_agencies) ? r.source_agencies : []])

export function assistanceGroups(records) {
  const groups = []
  const byKey = new Map()
  ;(Array.isArray(records) ? records : []).forEach((r) => {
    const agencies = Array.isArray(r.source_agencies) ? r.source_agencies : []
    const key = assistanceKey(r)
    let group = byKey.get(key)
    if (!group) {
      group = { key, title: r.assistance_type || 'Assistance', assistance_type: r.assistance_type || '', date_given: r.date_given || '', quantity: r.quantity ?? '', source_agencies: agencies, records: [] }
      byKey.set(key, group)
      groups.push(group)
    }
    group.records.push(r)
  })
  return groups
}

// The line under an assistance's title: "Nov 20, 2026 · 5 kg · DA · 3 members".
const detailParts = (group) => [
  group.date_given ? formatDate(group.date_given) : '',
  formatAssistanceQuantity(group.assistance_type, group.quantity),
  group.source_agencies.join(', '),
]
export const groupDetails = (group) => [...detailParts(group), `${group.records.length} member${group.records.length === 1 ? '' : 's'}`].filter(Boolean).join(' · ')

// The heading of an assistance's block: its type and what was given ("Seeds · Nov 20, 2026 · 5 kg · DA"); the list adds how many members.
export const groupLabel = (group) => [group.title, ...detailParts(group)].filter(Boolean).join(' · ')

// The search box of the list: every word typed must be found in the member's name, barangay or the assistance, in any order.
export const filterConfirmRecords = (records, query, nameOf) => records.filter((r) => matchesSearch(
  [nameOf(r), r.farmer_barangay, r.fisherfolk_barangay, r.assistance_type, r.date_given].filter(Boolean).join(' '), query,
))

// A click on that box: everyone pickable in the assistance becomes picked, or (when all already were) unpicked; other assistance is left alone.
export function toggleGroup(selected, groupRecords) {
  const ids = selectableIds(groupRecords)
  const next = new Set(selected)
  if (selectionState(groupRecords, selected, isSelectable).all) ids.forEach((id) => next.delete(id))
  else ids.forEach((id) => next.add(id))
  return next
}
