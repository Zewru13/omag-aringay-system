import assert from 'node:assert/strict'
import fs from 'node:fs'

// 1. every crop's harvest forms start on kg; 2. the signatories table adds a row inside the table like the other settings tables;
// 6. Crop Monitoring has an Actual Harvest column with the variance, like the fisheries tables.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const load = (path) => import(new URL(path, import.meta.url).href)

// ── 1. kg is the default (and always on offer) for every crop
const { harvestUnitOptions } = await load('../src/pages/Monitoring/harvestUnits.js')
eq(harvestUnitOptions(['bags', 'kg', 'sacks']), ['kg', 'bags', 'sacks'], 'kg first, the crop\'s other units after it')
eq(harvestUnitOptions(['cavan', 'sacks']), ['kg', 'cavan', 'sacks'], 'a crop that never listed kg still starts on kg')
eq(harvestUnitOptions([]), ['kg'], 'no units added: kg')
eq(harvestUnitOptions(undefined), ['kg'], 'no list at all: kg')
eq(harvestUnitOptions(['KG', 'bags']), ['kg', 'bags'], 'kg is not repeated in another spelling')
eq(harvestUnitOptions(['bags', 'bags', 'kg']), ['kg', 'bags'], 'nor is any unit')

const { makeRow } = await load('../src/pages/CropInformation/forcedHarvest.js')
const row = makeRow({ id: 1, crop_type: 3, crop_type_name: 'Palay', area_planted_ha: '2', crop_allowed_units: ['cavan', 'kg'] })
eq([row.unit, row.units], ['kg', ['kg', 'cavan']], 'a forced harvest row starts on kg')
eq(makeRow({ id: 2, crop_type: 3, area_planted_ha: '1', crop_allowed_units: [] }).unit, 'kg', 'a crop with no units starts on kg')

const page = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
eq(/crop_allowed_units\[0\]/.test(page), false, 'Record Harvest no longer starts on the first listed unit')
eq(page.includes("harvestUnitOptions(record.crop_allowed_units)"), true, 'Record Harvest offers kg first')

// ── 2. Signatories: the add row sits in the table, like Input Types
const sig = read('../src/pages/Signatories/SignatoriesPage.jsx')
eq(sig.includes('useAddRow('), true, 'a new signatory is typed in a row of the table')
eq(sig.includes('AddRowFooter') && sig.includes('label="Add Signatory"'), true, 'the Add Signatory button is under the table')
eq(/<AddButton/.test(sig), false, 'no separate Add button in the card header')
eq(sig.includes('DraftInput') && sig.includes('DraftSelect') && sig.includes('DraftActions'), true, 'the new row has boxes for the name, position, role and order')
eq(sig.includes('/reports/signatories/'), true, 'it still saves to the same endpoint')
eq(sig.includes("Edit Signatory"), true, 'editing a row still opens the form')

// ── 6. Actual Harvest column with the variance
const { actualHarvestFacts } = await load('../src/pages/Monitoring/cropActualHarvest.js')
eq(actualHarvestFacts({ status: 'Planted', actual_yield_kg: null }), null, 'not harvested: nothing')
eq(actualHarvestFacts({ status: 'Planted' }), null, 'no yield field')
const harvested = actualHarvestFacts({ status: 'Harvested', actual_yield_kg: '4500.00', estimated_yield_kg: '4000.00', yield_variance_pct: '12.50', actual_harvest_date: '2026-10-01' })
eq([harvested.kgText, harvested.label, harvested.tone, harvested.date], ['4,500 kg', '+12.5%', 'green', '2026-10-01'], 'above the estimate')
eq(actualHarvestFacts({ status: 'Harvested', actual_yield_kg: '3500', estimated_yield_kg: '4000', yield_variance_pct: '-12.5' }).tone, 'amber', 'a little under')
eq(actualHarvestFacts({ status: 'Harvested', actual_yield_kg: '2000', estimated_yield_kg: '4000', yield_variance_pct: '-50' }).tone, 'rose', 'a lot under')
eq(actualHarvestFacts({ status: 'Harvested', actual_yield_kg: '4000', estimated_yield_kg: '4000', yield_variance_pct: '0.00' }).label, '+0.0%', 'on the estimate')
eq(actualHarvestFacts({ status: 'Harvested', actual_yield_kg: '3000', estimated_yield_kg: '4000' }).label, '-25.0%', 'worked out when the server sent no variance')
eq(actualHarvestFacts({ status: 'Harvested', actual_yield_kg: '3000', estimated_yield_kg: null }).label, '', 'no estimate: the kg only, no variance')
eq(actualHarvestFacts({ status: 'Total Loss', actual_yield_kg: '0' }), { kgText: '', label: 'Total loss', tone: 'rose', date: '' }, 'a total loss says so')
eq(actualHarvestFacts({ status: 'Near Harvest', actual_yield_kg: '1200', estimated_yield_kg: '4000', yield_variance_pct: '-70' }).kgText, '1,200 kg', 'harvested so far shows too')

const keys = [...page.slice(page.indexOf('const COLUMNS = ['), page.indexOf(']\n', page.indexOf('const COLUMNS = [')))].join('').match(/key: '[a-z_]+'/g).map((k) => k.slice(6, -1))
eq(keys.indexOf('actual_harvest_cell') === keys.indexOf('expected_harvest_cell') + 1, true, 'Actual Harvest sits right after Expected Harvest')
eq(page.includes("label: 'ACTUAL HARVEST'"), true, 'its heading')
eq(page.includes('actual_harvest_cell:'), true, 'its cell is built for every row (also the grouped ones)')

console.log(`ok - ${n} assertions`)
