import assert from 'node:assert/strict'

const { groupDisasterRows } = await import(new URL('../src/pages/Monitoring/disasterGroups.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const OPTS = { idKey: 'farmer_id', nameKey: 'farmer_name', barangayKey: 'barangay' }
const row = (id, farmerId, name, status = 'Active', extra = {}) => ({ id, farmer_id: farmerId, farmer_name: name, barangay: 'Alaska', status, ...extra })

// one row per person, in the order people first appear
const rows = [row(1, 10, 'Ana Cruz'), row(2, 11, 'Ben Lim'), row(3, 10, 'Ana Cruz', 'Recovered'), row(4, 10, 'Ana Cruz')]
const groups = groupDisasterRows(rows, OPTS)
eq(groups.map((g) => g.name), ['Ana Cruz', 'Ben Lim'], 'people in first-seen order')
eq(groups[0].rows.map((r) => r.id), [1, 3, 4], "a person's rows keep their order")
eq(groups[0].total, 3, 'total per person')
eq([groups[0].active, groups[0].recovered], [2, 1], 'active and recovered counts')
eq(groups[0].summary, '2 active · 1 recovered', 'summary text')
eq(groups[1].summary, '1 active', 'summary leaves out zero counts')
eq(groups[0].barangay, 'Alaska', 'barangay is taken from the rows')

// two different people with the same name stay two rows when their ids differ
eq(groupDisasterRows([row(1, 10, 'Ana Cruz'), row(2, 12, 'Ana Cruz')], OPTS).length, 2, 'same name, different id: two people')
// without an id the name is the key
eq(groupDisasterRows([row(1, null, 'Ana Cruz'), row(2, undefined, 'Ana Cruz')], OPTS).length, 1, 'no id: grouped by name')
// an open disaster that can no longer be recovered (harvested crop or stock) is history only, not active
const mixed = groupDisasterRows([row(1, 10, 'Ana Cruz', 'Active', { can_recover: true }), row(2, 10, 'Ana Cruz', 'Active', { can_recover: false }), row(3, 10, 'Ana Cruz', 'Recovered')], OPTS)[0]
eq([mixed.active, mixed.history, mixed.recovered], [1, 1, 1], 'active, history only and recovered are counted apart')
eq(mixed.summary, '1 active · 1 recovered · 1 history only', 'summary names all three')

eq(groupDisasterRows([], OPTS), [], 'empty')
eq(groupDisasterRows(null, OPTS), [], 'null')
eq(groupDisasterRows([row(1, 10, '')], OPTS)[0].name, 'Unknown', 'a missing name')

console.log(`disasterGroups: ${n} checks passed`)
