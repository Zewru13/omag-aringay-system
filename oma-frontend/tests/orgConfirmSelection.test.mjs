import assert from 'node:assert/strict'

const sel = await import(new URL('../src/pages/AssistanceManagement/orgConfirmSelection.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const rec = (id, extra = {}) => ({ id, farmer_full_name: `Member ${id}`, ...extra })
const records = [rec(1), rec(2), rec(3, { latest_request_status: 'PENDING' }), rec(4, { latest_request_status: 'REJECTED' })]

// who can be picked: not the ones an older request is still holding for OMAg review
eq(records.map(sel.isSelectable), [true, true, false, true], 'a request still waiting for review cannot be picked again')
eq(sel.selectableIds(records), [1, 2, 4], 'the pickable ids (a rejected one can be sent again)')

// picking and unpicking one
eq([...sel.toggleId(new Set(), 2)], [2], 'pick one')
eq([...sel.toggleId(new Set([2]), 2)], [], 'unpick it again')
eq([...sel.toggleId(new Set([1]), 2)].sort(), [1, 2], 'picks add up')

// select all / unselect all
eq([...sel.toggleAll(new Set(), records)].sort(), [1, 2, 4], 'select all picks every pickable row')
eq([...sel.toggleAll(new Set([1, 2, 4]), records)], [], 'select all again unselects everything')
eq([...sel.toggleAll(new Set([1]), records)].sort(), [1, 2, 4], 'with some picked, select all picks the rest')
eq(sel.allSelected(new Set([1, 2, 4]), records), true, 'all picked')
eq(sel.allSelected(new Set([1, 2]), records), false, 'not all picked')
eq(sel.allSelected(new Set(), []), false, 'nothing to pick is not "all"')

// after the list reloads (some were confirmed), only what is still there stays picked
eq([...sel.keepValid(new Set([1, 2, 4, 99]), [rec(2), rec(4)])].sort(), [2, 4], 'confirmed or vanished rows drop out of the selection')
eq([...sel.keepValid(new Set([3]), records)], [], 'a row that became pending drops out')

// words on screen
eq(sel.confirmButtonLabel(0), 'Confirm for members', 'no one picked')
eq(sel.confirmButtonLabel(1), 'Confirm 1 member', 'one member')
eq(sel.confirmButtonLabel(5), 'Confirm 5 members', 'several members')
eq(sel.selectionSummary(0, 3), 'None selected', 'summary: none')
eq(sel.selectionSummary(2, 3), '2 of 3 selected', 'summary: some')
eq(sel.namesPreview(['Ana']), 'Ana', 'one name')
eq(sel.namesPreview(['Ana', 'Ben', 'Cora']), 'Ana, Ben and Cora', 'three names')
eq(sel.namesPreview(['Ana', 'Ben', 'Cora', 'Dan', 'Eve']), 'Ana, Ben, Cora and 2 more', 'more than three')

// the proof photos are needed once, for everyone
eq(sel.PROOF_MIN, 2, 'two photos are the minimum')
eq(sel.confirmProblem(0, 5), 'Pick at least one member.', 'nobody picked')
eq(sel.confirmProblem(3, 1), 'Add at least 2 photos as proof.', 'not enough photos')
eq(sel.confirmProblem(3, 2), '', 'enough')

// the Confirm for Members list shows each assistance first, then the members who can be confirmed for it
const mk = (id, name, type, date, qty, extra = {}) => ({ id, farmer_full_name: name, farmer_barangay: 'Poblacion', assistance_type: type, date_given: date, quantity: qty, source_agencies: ['DA'], ...extra })
const list = [
  mk(1, 'Ana Reyes', 'Seeds', '2026-11-20', '5 kg'),
  mk(2, 'Ben Cruz', 'Seeds', '2026-11-20', '5 kg'),
  mk(3, 'Cora Dizon', 'Fertilizer', '2026-11-18', '2 sack'),
  mk(4, 'Dan Lim', 'Seeds', '2026-11-20', '5 kg', { source_agencies: ['DAR'] }),
  mk(5, 'Eve Sy', 'Seeds', '2026-11-20', '5 kg', { latest_request_status: 'PENDING' }),
]
const groups = sel.assistanceGroups(list)
eq(groups.map((g) => [g.assistance_type, g.records.map((r) => r.id)]), [['Seeds', [1, 2, 5]], ['Fertilizer', [3]], ['Seeds', [4]]], 'members are grouped by what was given, in the order the server sent them')
eq(groups[0].title, 'Seeds', 'the type is the title')
eq(sel.groupLabel(groups[0]), 'Seeds · Nov 20, 2026 · 5 kg · DA', 'the heading: type, date, quantity, agency (the list adds the count)')
eq(list.filter((r) => sel.assistanceKey(r) === groups[0].key).map((r) => r.id), [1, 2, 5], 'a record knows its own group')
eq(sel.groupDetails(groups[0]), 'Nov 20, 2026 · 5 kg · DA · 3 members', 'the line under the title: date, quantity, agency, how many members')
eq(sel.groupDetails(groups[1]), 'Nov 18, 2026 · 2 sack · DA · 1 member', 'one member')
eq(sel.assistanceGroups([]), [], 'no records, no groups')

// the search: every word, any order, on the member, the barangay or the assistance
const nameOf = (r) => r.farmer_full_name
eq(sel.filterConfirmRecords(list, '', nameOf).length, 5, 'an empty search keeps everyone')
eq(sel.filterConfirmRecords(list, 'cruz ben', nameOf).map((r) => r.id), [2], 'words in any order find the member')
eq(sel.filterConfirmRecords(list, 'fertilizer', nameOf).map((r) => r.id), [3], 'the assistance type can be searched')
eq(sel.filterConfirmRecords(list, 'poblacion seeds', nameOf).map((r) => r.id), [1, 2, 4, 5], 'the barangay and the type together')
eq(sel.filterConfirmRecords(list, 'zzz', nameOf), [], 'nothing matches')

// picking a whole assistance at once (only the ones that can be picked)
eq([...sel.toggleGroup(new Set(), groups[0].records)].sort(), [1, 2], 'the box of an assistance picks its members, leaving out the one waiting for review')
eq([...sel.toggleGroup(new Set([1, 2, 3]), groups[0].records)].sort(), [3], 'a second click on it unpicks them and keeps the picks of other assistance')
eq([...sel.toggleGroup(new Set([1]), groups[0].records)].sort(), [1, 2], 'a partly picked assistance becomes fully picked')
eq([...sel.toggleGroup(new Set(), [list[4]])], [], 'a group with nothing pickable picks nothing')

console.log(`orgConfirmSelection: ${n} checks passed`)
