import assert from 'node:assert/strict'

const { summaryTiles, filterTabs, STATUS_META } = await import(new URL('../src/utils/importSummary.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// legacy imports (organizations, assistance, crop records, fisheries): byte-identical to the old modal
const legacy = { ready: 3, duplicate_in_file: 1, duplicate_in_database: 0, invalid: 2 }
eq(summaryTiles(legacy, 'preview'), [
  { label: 'Ready to Create', value: 3 }, { label: 'Duplicate in File', value: 1 },
  { label: 'Already Exists', value: 0 }, { label: 'Invalid Rows', value: 2 },
], 'legacy tiles (preview)')
eq(summaryTiles(legacy, 'done')[0], { label: 'Created', value: 3 }, 'legacy tiles (done)')
eq(filterTabs(legacy, 6, 'preview').map((t) => t.label), ['All 6', '3 Will Create', '1 In-File Dupe', '2 Invalid'], 'legacy tabs drop zero counts')
eq(filterTabs(legacy, 6, 'done').map((t) => t.key), ['all', 'ready', 'duplicate_in_file', 'invalid'], 'legacy tab keys')
eq(filterTabs({ ready: 0, duplicate_in_file: 0, duplicate_in_database: 0, invalid: 0 }, 0, 'preview').map((t) => t.label), ['All 0'], 'legacy empty')

// members
const members = { ready: 2, already_member: 2, duplicate_in_file: 0, not_found: 1, needs_main_choice: 1, invalid: 0 }
eq(summaryTiles(members, 'preview').map((t) => t.label), ['Ready to Create', 'Already a Member', 'Duplicate in File', 'Not Found', 'Needs Main Choice', 'Invalid Rows'], 'member tiles')
eq(filterTabs(members, 6, 'preview').map((t) => t.label), ['All 6', '2 Will Create', '2 Already a Member', '1 Not Found', '1 Needs Main Choice'], 'member tabs')
eq(filterTabs(members, 6, 'done')[1].label, '2 Created', 'done label for ready')

// equipment
const equipment = { ready: 1, already_exists: 3, duplicate_in_file: 1, invalid: 0 }
eq(summaryTiles(equipment, 'preview').map((t) => t.label), ['Ready to Create', 'Already Exists', 'Duplicate in File', 'Invalid Rows'], 'equipment tiles')
eq(filterTabs(equipment, 5, 'preview').map((t) => t.key), ['all', 'ready', 'already_exists', 'duplicate_in_file'], 'equipment tabs')

// unknown keys ignored; empty summary
eq(summaryTiles({ ready: 1, mystery: 4 }, 'preview'), [{ label: 'Ready to Create', value: 1 }], 'unknown summary key ignored')
eq(filterTabs({}, 0, 'preview'), [{ key: 'all', label: 'All 0' }], 'empty summary')

// per-status meta
eq(STATUS_META.not_found.tone, 'rose', 'not found tone')
eq(STATUS_META.already_member.preview, 'Already a Member', 'already member preview label')
eq(STATUS_META.already_member.done, 'Skipped — Already a Member', 'already member done label')
eq(STATUS_META.ready.done, 'Created', 'ready done label')
console.log(`ALL ${n} CHECKS PASSED`)
