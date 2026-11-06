import assert from 'node:assert/strict'
import fs from 'node:fs'

// 1. every crop's harvest forms start on kg; 2. the signatories table adds a row inside the table like the other settings tables;
// 6. Crop Monitoring has no Actual Harvest / variance column (that is Crop Forecasting's Act. Yield).
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

// ── 6. Crop Monitoring has no Actual Harvest / variance column (they live in Crop Forecasting: Act. Yield and Actual Harvest Date)
eq(page.includes("label: 'ACTUAL HARVEST'") || page.includes('actual_harvest_cell') || page.includes('actualHarvestFacts'), false, 'no Actual Harvest column, cell or helper in Crop Monitoring')
eq(fs.existsSync(new URL('../src/pages/Monitoring/cropActualHarvest.js', import.meta.url)), false, 'and the helper that only it used is gone')
const pageText = page.replace(/\r\n/g, '\n')
const monitoringKeys = [...pageText.slice(pageText.indexOf('const COLUMNS = ['), pageText.indexOf(']\n', pageText.indexOf('const COLUMNS = [')))].join('').match(/key: '[a-z_]+'/g).map((k) => k.slice(6, -1))
eq(monitoringKeys, ['crop_cell', 'variety_col', 'farmer_col', 'organization_col', 'location_col', 'date_planted', 'expected_harvest_cell', 'logs_cell', 'pcic_cell', 'status_cell', 'actions'], 'every other column is unchanged, in the same order')
eq(read('../src/pages/Forecasting/ForecastingPage.jsx').includes("label: 'ACT. YIELD (KG)'"), true, 'Crop Forecasting keeps its Act. Yield column')

console.log(`ok - ${n} assertions`)
