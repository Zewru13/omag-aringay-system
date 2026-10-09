import assert from 'node:assert/strict'

const { selectionSummary, formatDateTime, formatStamp, duplicateGroups, groupDecision, groupNeedsDecision } = await import(
  new URL('../src/utils/distributionHelpers.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── selectionSummary ────────────────────────────────────────────────────────
const members = [
  { person_id: 1, status: 'would_create' }, { person_id: 2, status: 'would_create' }, { person_id: 3, status: 'would_create' },
  { person_id: 4, status: 'would_block' }, { person_id: 5, status: 'would_create' },
]
eq(selectionSummary(members, new Set([1, 2, 5])), { selected: 3, blocked: 1, willReceive: 3, total: 5 }, 'three selected, one blocked')
eq(selectionSummary(members, new Set([1, 4])), { selected: 1, blocked: 1, willReceive: 1, total: 5 }, 'a blocked id is never selected')
eq(selectionSummary(members, new Set()), { selected: 0, blocked: 1, willReceive: 0, total: 5 }, 'nothing selected')
eq(selectionSummary([], new Set([1])), { selected: 0, blocked: 0, willReceive: 0, total: 0 }, 'no members')
eq(selectionSummary(undefined, undefined), { selected: 0, blocked: 0, willReceive: 0, total: 0 }, 'missing input tolerated')

// ── formatDateTime ──────────────────────────────────────────────────────────
const stamp = '2026-10-09T07:41:00Z'
const dayPart = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date('2026-10-09T00:00:00'))
const timePart = new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(new Date(stamp))
eq(formatDateTime('2026-10-09', stamp), `${dayPart} · ${timePart}`, 'date and time')
eq(formatDateTime('2026-10-09', null), dayPart, 'date only when there is no timestamp (older records)')
eq(formatDateTime('2026-10-09', ''), dayPart, 'blank timestamp treated as none')
eq(formatDateTime(null, stamp), '—', 'no date')
eq(formatDateTime('not-a-date', null), '—', 'bad date')

// ── formatStamp: one timestamp, so the date and the time always agree (local time) ──
const late = '2026-10-09T20:00:00Z'  // 04:00 on Oct 10 in the Philippines
const lateLocal = new Date(late)
const lateText = formatStamp(late)
eq(lateText.includes(`Oct ${lateLocal.getDate()},`), true, 'date part is the local date, not the UTC date')
eq(lateText.includes(new Intl.DateTimeFormat('en-US', { hour: 'numeric', minute: '2-digit' }).format(lateLocal)), true, 'time part is local time')
eq(formatStamp(null), '—', 'no timestamp')
eq(formatStamp('garbage'), '—', 'bad timestamp')

// ── duplicateGroups ─────────────────────────────────────────────────────────
const row = (row_number, rsbsa_number, status, extra = {}) => ({ row_number, rsbsa_number, status, ...extra })
const rows = [
  row(2, 'A-1', 'matched_with_changes'),
  row(3, 'B-1', 'unmatched'),
  row(4, 'A-1', 'duplicate_in_file', { underlying_status: 'matched_with_changes' }),
  row(5, 'C-1', 'matched_no_changes'),
  row(6, 'A-1', 'duplicate_in_file', { underlying_status: 'unmatched' }),
  row(7, 'B-1', 'duplicate_in_file', { underlying_status: 'unmatched' }),
]
const groups = duplicateGroups(rows)
eq(groups.map((g) => [g.rsbsa, g.rows.map((r) => r.row_number)]), [['A-1', [2, 4, 6]], ['B-1', [3, 7]]], 'groups keep file order, first row leads')
eq(duplicateGroups([row(1, 'X', 'unmatched'), row(2, 'Y', 'unmatched')]), [], 'no duplicates, no groups')
eq(duplicateGroups(undefined), [], 'missing rows tolerated')

// ── groupNeedsDecision ──────────────────────────────────────────────────────
eq(groupNeedsDecision(groups[0]), true, 'a group with committable rows needs a decision')
const noChange = { rsbsa: 'N', rows: [row(1, 'N', 'matched_no_changes'), row(2, 'N', 'duplicate_in_file', { underlying_status: 'matched_no_changes' })] }
eq(groupNeedsDecision(noChange), false, 'all rows already match: nothing to decide')
const mixed = { rsbsa: 'M', rows: [row(1, 'M', 'matched_with_changes'), row(2, 'M', 'duplicate_in_file', { underlying_status: 'unmatched' }), row(3, 'M', 'duplicate_in_file', { underlying_status: 'matched_no_changes' })] }
eq(groupNeedsDecision(mixed), true, 'different underlying statuses, three rows')

// ── groupDecision ───────────────────────────────────────────────────────────
const g = groups[0]
eq(groupDecision(g, new Set(), new Set()), 'undecided', 'nothing chosen')
eq(groupDecision(g, new Set([4]), new Set()), 'accepted', 'one row accepted')
eq(groupDecision(g, new Set([2, 4]), new Set()), 'undecided', 'two rows selected is not a valid choice')
eq(groupDecision(g, new Set(), new Set(['A-1'])), 'rejected', 'rejected group')
eq(groupDecision(g, new Set([6]), new Set(['A-1'])), 'rejected', 'reject wins over a stale selection')
eq(groupDecision(mixed, new Set([2]), new Set()), 'accepted', 'three-row group, one accepted')
eq(groupDecision(noChange, new Set(), new Set()), 'accepted', 'a group that needs no decision counts as settled')
eq(groupDecision(undefined, new Set(), new Set()), 'undecided', 'missing group tolerated')

console.log(`ok - ${n} assertions`)
