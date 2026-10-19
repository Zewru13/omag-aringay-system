import assert from 'node:assert/strict'

const { sliceIds, summarizePlan, summarizeResults, undoNote, MAX_ITEMS_PER_CALL } =
  await import(new URL('../src/utils/importUndo.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// slices of 100 (the server refuses more per call)
eq(MAX_ITEMS_PER_CALL, 100, 'the server limit')
eq(sliceIds([]), [], 'no ids')
eq(sliceIds([1, 2, 3]), [[1, 2, 3]], 'fewer than one slice')
eq(sliceIds(Array.from({ length: 250 }, (_, i) => i + 1)).map((s) => s.length), [100, 100, 50], '250 ids')
eq(sliceIds([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]], 'custom size')

// the preview counts
eq(summarizePlan([]), { total: 0, canUndo: 0, kept: 0 }, 'empty plan')
eq(summarizePlan([{ can_undo: true }, { can_undo: true }, { can_undo: false, reason: 'x' }]), { total: 3, canUndo: 2, kept: 1 }, 'mixed plan')

// what an undo run did
eq(summarizeResults([]), { removed: 0, restored: 0, kept: 0, skipped: 0 }, 'no results')
eq(summarizeResults([{ result: 'removed' }, { result: 'removed' }, { result: 'restored' }, { result: 'kept' }, { result: 'skipped' }]),
  { removed: 2, restored: 1, kept: 1, skipped: 1 }, 'a mixed run')
eq(summarizeResults([{ result: 'something else' }]), { removed: 0, restored: 0, kept: 0, skipped: 0 }, 'unknown results are ignored')

// what an undo cannot take back
eq(undoNote('farmers_org').includes('emails'), true, 'organizations: emails')
eq(undoNote('fisherfolk_org').includes('emails'), true, 'fisherfolk organizations: emails')
eq(undoNote('crop_assistance').includes('notifications'), true, 'assistance: notifications')
eq(undoNote('fisheries_assistance').includes('notifications'), true, 'fisheries assistance: notifications')
eq(undoNote('stocking'), '', 'stocking: nothing extra')
eq(undoNote('crop_records'), '', 'crop records: nothing extra')

console.log(`importUndo: ${n} checks passed`)
