import assert from 'node:assert/strict'

const { equipmentOptions, equipmentToServer } = await import(new URL('../src/utils/equipmentNames.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const builtIn = ['Hand Tractor', 'Rice Mill', 'Other']
eq(equipmentOptions(['Seed Dryer', 'Hand Tractor'], builtIn), ['Seed Dryer', 'Hand Tractor'], 'Settings names win')
eq(equipmentOptions([], builtIn), ['Hand Tractor', 'Rice Mill'], 'an empty list falls back to the built-in names, without Other')
eq(equipmentOptions(undefined, builtIn), ['Hand Tractor', 'Rice Mill'], 'not loaded yet')
eq(equipmentOptions(['Other', 'Seed Dryer', ''], builtIn), ['Seed Dryer'], 'Other and blanks are never listed')

eq(equipmentToServer('Hand Tractor', '', builtIn), { name: 'Hand Tractor', other: '' }, 'a name the server knows')
eq(equipmentToServer('Seed Dryer', '', builtIn), { name: 'Other', other: 'Seed Dryer' }, 'a name from Settings becomes Other + its name')
eq(equipmentToServer('Other', '  Seed Cleaner ', builtIn), { name: 'Other', other: 'Seed Cleaner' }, 'Other keeps what was typed, trimmed')
eq(equipmentToServer(' Seed Dryer ', '', builtIn), { name: 'Other', other: 'Seed Dryer' }, 'a stray space is trimmed')

console.log(`equipmentNames: ${n} checks passed`)
