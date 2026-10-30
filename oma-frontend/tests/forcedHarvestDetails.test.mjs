import assert from 'node:assert/strict'

const { forcedDetailRows, forcedCropRows, kgText } = await import(new URL('../src/pages/Monitoring/forcedHarvestDetails.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const d = {
  farmer_name: 'Ana Cruz', rsbsa_number: '01-033-02-019-000123', harvest_date: '2026-10-28', reason: 'other', reason_label: 'Other',
  reason_text: 'Forced harvest due to early harvest: Other: Buyer pays double', remarks: 'before the storm', recorded_by_name: 'Admin One', total_kg: '250',
  crops: [
    { id: 1, crop: 'Palay (Rc222)', parcel_number: 'PA', expected_harvest_date: '2026-11-20', days_early: 23, area_harvested_hectares: '1.50', quantity_harvested: '1500', unit_of_measure: 'kg', volume_kg: '150' },
    { id: 2, crop: 'Corn', parcel_number: '', expected_harvest_date: null, days_early: null, area_harvested_hectares: '0.5', quantity_harvested: null, unit_of_measure: 'kg', volume_kg: '100' },
  ],
}
eq(forcedDetailRows(d), [
  ['Farmer', 'Ana Cruz'], ['RSBSA Number', '01-033-02-019-000123'], ['Harvested Date', 'October 28, 2026'], ['Reason for Forced Harvest', 'Other: Buyer pays double'],
  ['Remarks', 'before the storm'], ['Recorded By', 'Admin One'], ['Crops Harvested', '2'],
], 'the details table')
eq(forcedDetailRows({ reason_label: 'El Niño', crops: [] }).find(([k]) => k === 'Reason for Forced Harvest'), ['Reason for Forced Harvest', 'El Niño'], 'the label when no sentence was saved')
eq(forcedDetailRows({ crops: [] }).find(([k]) => k === 'Remarks'), ['Remarks', '—'], 'blank remarks')
eq(forcedCropRows(d), [
  { id: 1, crop: 'Palay (Rc222)', parcel: 'PA', expected: 'November 20, 2026', daysEarly: '23', area: '1.5', quantity: '1,500 kg', kg: '150.00' },
  { id: 2, crop: 'Corn', parcel: '—', expected: '—', daysEarly: '—', area: '0.5', quantity: '—', kg: '100.00' },
], 'one row per crop, blanks as a dash')
eq([kgText('250'), kgText(null), kgText('1234.5')], ['250.00', '—', '1,234.50'], 'kg text')

console.log(`forcedHarvestDetails: ${n} checks passed`)
