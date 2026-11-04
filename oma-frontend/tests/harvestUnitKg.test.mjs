import assert from 'node:assert/strict'
import fs from 'node:fs'

const { validateUnitKg, unitKgTotal, fmtKg, harvestRowState, pickedUnits } = await import(new URL('../src/pages/FisheriesRecords/harvestUnitKg.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── the same checks as the Record Harvest form always made on one pond's/cage's actual kg
eq(validateUnitKg(''), 'Required.', 'empty')
eq(validateUnitKg('  '), 'Required.', 'blank')
eq(validateUnitKg(undefined), 'Required.', 'nothing typed')
eq(validateUnitKg('abc'), 'Enter a valid number.', 'text')
eq(validateUnitKg('0'), 'Must be greater than 0.', 'zero')
eq(validateUnitKg('12.345'), 'At most 2 decimal places.', 'three decimals')
eq(validateUnitKg('12.5'), '', 'one decimal')
eq(validateUnitKg('.5'), '', 'a leading point')
eq(validateUnitKg('100'), '', 'a whole number')

// ── the total adds up the valid rows only
const units = [{ id: 1 }, { id: 2 }, { id: 3 }]
eq(unitKgTotal(units, { 1: '10.5', 2: '4', 3: '' }), 14.5, 'an empty row adds nothing')
eq(unitKgTotal(units, { 1: '10', 2: 'x', 3: '0' }), 10, 'an invalid row adds nothing')
eq(unitKgTotal([], {}), 0, 'no units')
eq(fmtKg(1234.5), (1234.5).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 'two decimals')

// ── Record Harvest, normal harvest: the ponds/cages still available are chosen one by one
const available = [{ id: 1, label: 'Pond 1' }, { id: 2, label: 'Pond 2' }, { id: 3, label: 'Pond 3' }]
eq(pickedUnits(available, [2, 3], false).map((u) => u.id), [2, 3], 'the ticked ones')
eq(pickedUnits(available, [], false), [], 'none ticked')
// ── health-related forced harvest: every affected pond/cage is harvested (the workflow does not allow leaving one out)
eq(pickedUnits(available, [], true).map((u) => u.id), [1, 2, 3], 'all of them, whatever was ticked')
eq(harvestRowState({ forced: true, ticked: false }), { checked: true, locked: true }, 'a forced row is always ticked and cannot be unticked')
eq(harvestRowState({ forced: false, ticked: false }), { checked: false, locked: false }, 'a normal row starts unticked')
eq(harvestRowState({ forced: false, ticked: true }), { checked: true, locked: false }, 'a ticked normal row')

// ── the typhoon Force Harvest is a different workflow and stays out of this form
const modal = fs.readFileSync(new URL('../src/pages/FisheriesRecords/StockingMonitoringModals.jsx', import.meta.url), 'utf8')
eq(/^import .*(ForceHarvestModal|forcedHarvest)|force-harvest\/eligible/m.test(modal), false, 'the Record Harvest form does not touch the upcoming-typhoon Force Harvest')
eq(modal.includes('HarvestUnitsTable'), true, 'both harvests use the one units table')

console.log(`ok - ${n} assertions`)
