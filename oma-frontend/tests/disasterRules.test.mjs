import assert from 'node:assert/strict'

const { isWholeArea } = await import(new URL('../src/utils/disasterRules.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// Total Loss means the whole planted area is affected (the server enforces the same rule).
eq(isWholeArea('2', 2), true, 'exactly the whole area')
eq(isWholeArea('2.00', 2), true, '2.00 equals 2')
eq(isWholeArea('1.9999', 2), false, 'a hair under is not the whole area')
eq(isWholeArea('0.5', 2), false, 'a partial area')
eq(isWholeArea('', 2), false, 'nothing typed yet')
eq(isWholeArea('abc', 2), false, 'not a number')
eq(isWholeArea('1.2345', 1.2345), true, 'four decimals')
eq(isWholeArea('0.5', null), true, 'no recorded area to compare with: the server cannot enforce it, so do not block')
eq(isWholeArea('', undefined), true, 'no recorded area, nothing typed')

console.log(`ok - ${n} assertions`)
