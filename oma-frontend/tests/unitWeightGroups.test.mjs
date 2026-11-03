import assert from 'node:assert/strict'

const { groupWeights, cropsText, groupRequest } = await import(new URL('../src/pages/Production/unitWeightGroups.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const w = (id, unit, crop, kg, note = '') => ({ id, unit, crop_type: crop, crop_type_name: crop ? `Crop ${crop}` : '', kg_per_unit: kg, note })

// rows of the same unit, weight and note become one group listing its crops; every-crop rows are a group of their own
const rows = [w(1, 'Sack', 1, '50.0000', 'NFA'), w(2, 'Sack', 2, '50.0000', 'NFA'), w(3, 'sack', 3, '50.0000', 'NFA'), w(4, 'Sack', 4, '40.0000', 'NFA'), w(5, 'Sack', null, '30.0000'), w(6, 'Bundle', 1, null)]
const groups = groupWeights(rows)
eq(groups.map((g) => [g.unit, g.ids, g.crop_ids, g.every]), [
  ['Bundle', [6], [1], false],
  ['Sack', [5], [], true],
  ['Sack', [4], [4], false],
  ['Sack', [1, 2, 3], [1, 2, 3], false],
], 'grouped, newest group first')
eq(groups[3].crop_names, ['Crop 1', 'Crop 2', 'Crop 3'], 'the crop names')
eq(groups[3].id, 3, 'a group is as new as its newest row')
eq(groupWeights([]), [], 'nothing')
eq(groupWeights(undefined), [], 'not loaded')
eq(groupWeights([w(1, 'Sack', 1, '50'), w(2, 'Sack', 2, 50)]).length, 1, '50 and 50.0000 are the same weight')
eq(groupWeights([w(1, 'Sack', 1, null), w(2, 'Sack', 2, '')]).length, 1, 'no weight is no weight')

eq(cropsText({ every: true, crop_names: [] }), 'Every crop', 'every crop')
eq(cropsText({ every: false, crop_names: ['Rice', 'Corn'] }), 'Rice, Corn', 'a list')

// what is sent: crops as numbers, no weight as null
eq(groupRequest({ unit: ' Sack ', crop_types: ['3', 4], kg_per_unit: '50', note: ' NFA ' }), { unit: 'Sack', crop_types: [3, 4], kg_per_unit: '50', note: 'NFA' }, 'request')
eq(groupRequest({ unit: 'Sack', crop_types: [], kg_per_unit: '', note: '' }), { unit: 'Sack', crop_types: [], kg_per_unit: null, note: '' }, 'every crop, no weight')

console.log(`unitWeightGroups: ${n} checks passed`)
