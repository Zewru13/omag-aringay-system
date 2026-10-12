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

console.log(`orgConfirmSelection: ${n} checks passed`)
