import assert from 'node:assert/strict'

const { filterOrgItems, filterOptions } = await import(new URL('../src/utils/orgListFilter.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const names = (items) => items.map((i) => i.name)

const items = [
  { id: 1, name: 'Juan Dela Cruz', attrs: { status: 'Active', position: 'President', main: 'yes' } },
  { id: 2, name: 'Maria Santos', attrs: { status: 'Active', position: 'Member', main: 'no' } },
  { id: 3, name: 'Pedro Dela Rosa', attrs: { status: 'Inactive', position: 'Member', main: 'yes' } },
  { id: 4, name: 'Ana Reyes-Cruz', attrs: { status: 'Active', position: 'Treasurer', main: 'no' } },
]

// ── search: name only, case-insensitive, every word must match ──────────────
eq(names(filterOrgItems(items, { query: '' })), ['Juan Dela Cruz', 'Maria Santos', 'Pedro Dela Rosa', 'Ana Reyes-Cruz'], 'no query keeps everything in order')
eq(names(filterOrgItems(items, { query: '  ' })).length, 4, 'blank query keeps everything')
eq(names(filterOrgItems(items, { query: 'maria' })), ['Maria Santos'], 'case-insensitive')
eq(names(filterOrgItems(items, { query: 'DELA' })), ['Juan Dela Cruz', 'Pedro Dela Rosa'], 'partial word match')
eq(names(filterOrgItems(items, { query: 'cruz juan' })), ['Juan Dela Cruz'], 'words in any order, all must match')
eq(names(filterOrgItems(items, { query: 'reyes cruz' })), ['Ana Reyes-Cruz'], 'hyphenated surname split across words')
eq(names(filterOrgItems(items, { query: 'zzz' })), [], 'no match')
eq(names(filterOrgItems(items, { query: 'president' })), [], 'the search looks at names, not positions')
eq(names(filterOrgItems(items, { query: 'Cruz,' })), ['Juan Dela Cruz', 'Ana Reyes-Cruz'], 'a comma is ignored')

// ── filters: exact match on an attribute; empty means "all" ────────────────
eq(names(filterOrgItems(items, { filters: { status: 'Inactive' } })), ['Pedro Dela Rosa'], 'one filter')
eq(names(filterOrgItems(items, { filters: { status: '' } })).length, 4, 'an empty filter is ignored')
eq(names(filterOrgItems(items, { filters: { status: 'Active', position: 'Member' } })), ['Maria Santos'], 'filters combine')
eq(names(filterOrgItems(items, { filters: { main: 'yes' } })), ['Juan Dela Cruz', 'Pedro Dela Rosa'], 'main only')
eq(names(filterOrgItems(items, { query: 'dela', filters: { status: 'Active' } })), ['Juan Dela Cruz'], 'search and filter together')
eq(names(filterOrgItems(items, { filters: { nothing: 'x' } })), [], 'an unknown attribute never matches')
eq(names(filterOrgItems(undefined, { query: 'a' })), [], 'missing list tolerated')
eq(names(filterOrgItems([{ id: 9, name: null, attrs: {} }], { query: 'a' })), [], 'an item without a name never matches a search')
eq(names(filterOrgItems(items)), ['Juan Dela Cruz', 'Maria Santos', 'Pedro Dela Rosa', 'Ana Reyes-Cruz'], 'no options at all')

// ── filterOptions: the distinct values present, in first-seen order ─────────
eq(filterOptions(items, 'position'), ['President', 'Member', 'Treasurer'], 'distinct positions in first-seen order')
eq(filterOptions(items, 'status'), ['Active', 'Inactive'], 'distinct statuses')
eq(filterOptions(items, 'missing'), [], 'unknown attribute')
eq(filterOptions(undefined, 'position'), [], 'missing list tolerated')

console.log(`ok - ${n} assertions`)
