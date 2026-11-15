import assert from 'node:assert/strict'

// The account kit's small rules: a status is one of four tones, and several requests are loaded together with each failure named.
const { toneOf, TONES } = await import(new URL('../src/pages/Account/statusTone.js', import.meta.url).href)
const { settleAll, listOf } = await import(new URL('../src/pages/Account/loadState.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }

eq(TONES, ['green', 'amber', 'red', 'grey'], 'four tones only')
for (const s of ['Planted', 'Stocked', 'Active', 'CONFIRMED', 'RESOLVED', 'BORROWED', 'Good']) eq(toneOf(s), 'green', `${s} is fine or done`)
for (const s of ['Near Harvest', 'AWAITING_CONFIRMATION', 'REQUESTED', 'RETURN_PENDING', 'Needs Repair', 'Late']) eq(toneOf(s), 'amber', `${s} waits on someone`)
for (const s of ['Overdue', 'NOT_RECEIVED', 'Total Loss', 'REJECTED', 'Broken', 'Lost', 'Not Operational']) eq(toneOf(s), 'red', `${s} is a problem`)
for (const s of ['Harvested', 'RETURNED', 'CANCELLED', 'PENDING', 'Inactive']) eq(toneOf(s), 'grey', `${s} is finished or not started`)
eq(toneOf('Something new'), 'grey', 'an unknown status is grey')
eq(toneOf(''), 'grey', 'no status is grey'); eq(toneOf(undefined), 'grey', 'missing status is grey')
eq(toneOf('near harvest'), 'amber', 'case does not matter')

const out = await settleAll({ crops: async () => ({ data: [1, 2] }), parcels: async () => { throw new Error('500') }, none: async () => ({ data: { results: [] } }) })
eq(out.failed, ['parcels'], 'the failed source is named')
eq(out.data.parcels, null, 'a failed source is null, not an empty list')
eq(listOf(out.data.crops), [1, 2], 'a plain array'); eq(listOf(out.data.none), [], 'a paged answer')
eq(listOf(null), [], 'nothing'); eq(listOf({ data: { results: [3] } }), [3], 'results')
eq(listOf([4, 5]), [4, 5], 'already a list (every page fetched)')
eq((await settleAll({})).failed, [], 'no sources, nothing failed')
console.log(`ok - ${n} assertions`)
