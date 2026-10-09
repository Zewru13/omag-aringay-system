// Small pure helpers for the assistance distribution screens and the RSBSA import's duplicate chooser.

const emptySummary = { selected: 0, blocked: 0, willReceive: 0, total: 0 }

// `members` are the dry-run preview rows ({ person_id, status: 'would_create' | 'would_block' }); `selectedIds` is a Set of
// person ids. A blocked member can never be selected.
export const selectionSummary = (members, selectedIds) => {
  if (!Array.isArray(members) || members.length === 0) return { ...emptySummary }
  const ids = selectedIds instanceof Set ? selectedIds : new Set()
  let blocked = 0
  let selected = 0
  members.forEach((m) => {
    if (m.status === 'would_block') blocked += 1
    else if (ids.has(m.person_id)) selected += 1
  })
  return { selected, blocked, willReceive: selected, total: members.length }
}

const DAY_FORMAT = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
const TIME_FORMAT = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' })

// "Oct 9, 2026 · 3:41 PM"; just the date for older records that have no timestamp; "—" when there is no date.
export const formatDateTime = (dateIso, recordedAtIso) => {
  if (!dateIso) return '—'
  const day = new Date(`${dateIso}T00:00:00`)
  if (Number.isNaN(day.getTime())) return '—'
  const dayText = DAY_FORMAT.format(day)
  if (!recordedAtIso) return dayText
  const stamp = new Date(recordedAtIso)
  if (Number.isNaN(stamp.getTime())) return dayText
  return `${dayText} · ${TIME_FORMAT.format(stamp)}`
}

// A duplicate_in_file row commits as whatever it would be on its own.
const effectiveStatus = (r) => (r.status === 'duplicate_in_file' ? r.underlying_status : r.status)
const COMMITTABLE = new Set(['matched_with_changes', 'unmatched', 'classification_mismatch'])

// Groups of preview rows that share one RSBSA number (the first occurrence plus every repeat), in file order.
export const duplicateGroups = (rows) => {
  if (!Array.isArray(rows)) return []
  const repeated = new Set(rows.filter((r) => r.status === 'duplicate_in_file').map((r) => r.rsbsa_number))
  const byNumber = new Map()
  rows.forEach((r) => {
    if (!repeated.has(r.rsbsa_number)) return
    if (!byNumber.has(r.rsbsa_number)) byNumber.set(r.rsbsa_number, [])
    byNumber.get(r.rsbsa_number).push(r)
  })
  return [...byNumber.entries()]
    .filter(([, group]) => group.length > 1)
    .map(([rsbsa, groupRows]) => ({ rsbsa, rows: groupRows }))
}

// A group of rows that already match the registry (or cannot be committed) has nothing to choose.
export const groupNeedsDecision = (group) => Boolean(group?.rows?.some((r) => COMMITTABLE.has(effectiveStatus(r))))

// 'accepted' (exactly one row chosen, or nothing to decide), 'rejected' (the whole group rejected), else 'undecided'.
export const groupDecision = (group, selectedRows, rejectedGroups) => {
  if (!group) return 'undecided'
  if (rejectedGroups?.has(group.rsbsa)) return 'rejected'
  if (!groupNeedsDecision(group)) return 'accepted'
  const chosen = group.rows.filter((r) => selectedRows?.has(r.row_number))
  return chosen.length === 1 ? 'accepted' : 'undecided'
}
