import assert from 'node:assert/strict'

const { harvestAreaProblem, harvestAreaHint } = await import(new URL('../src/pages/Monitoring/harvestArea.js', import.meta.url).href)
const { DEFAULT_STATUS, DEFAULT_GROUP } = await import(new URL('../src/pages/Monitoring/monitoringGroups.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(harvestAreaProblem('', 2), 'Area harvested is required.', 'empty')
eq(harvestAreaProblem(undefined, 2), 'Area harvested is required.', 'not typed')
eq(harvestAreaProblem('0', 2), 'Area must be greater than 0.', 'zero')
eq(harvestAreaProblem('abc', 2), 'Area must be greater than 0.', 'not a number')
eq(harvestAreaProblem('1.5', 2), '', 'less than planted')
eq(harvestAreaProblem('2', 2), '', 'exactly the planted area')
eq(harvestAreaProblem('2.00004', 2), '', 'rounding noise is fine')
eq(harvestAreaProblem('2.01', 2), 'Cannot be more than the area planted (2 ha).', 'more than planted')
eq(harvestAreaProblem('2.01', '2.0000'), 'Cannot be more than the area planted (2 ha).', 'the planted area as the server sends it')
eq(harvestAreaProblem('3.5', 3, 'the parcel'), 'Cannot be more than the parcel (3 ha).', 'a parcel limit')
eq(harvestAreaProblem('9', null), '', 'no limit known: nothing to compare with')
eq(harvestAreaHint('2.0000'), 'Planted: 2 ha', 'hint')
eq(harvestAreaHint(3, 'Parcel'), 'Parcel: 3 ha', 'parcel hint')
eq(harvestAreaHint(null), '', 'no hint without a limit')

// ── Crop Monitoring opens on the crops still in the ground, with no grouping
eq([DEFAULT_STATUS, DEFAULT_GROUP], ['Planted', 'none'], 'defaults')

console.log(`harvestArea: ${n} checks passed`)
