import assert from 'node:assert/strict'
import fs from 'node:fs'

// The farmer's Crops page: their own crops in sections, with the main action on each row.
const { CROP_SECTIONS, cropStatusLabel, cropMainAction, sortCrops, cropText, cropDate, cropHarvestDate } = await import(new URL('../src/pages/Account/myCrops.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(CROP_SECTIONS.map((s) => s.label), ['Growing', 'Ready to harvest', 'Harvested', 'Lost'], 'the four sections, in order')
const STATUSES = ['Planted', 'Near Harvest', 'Harvested', 'Total Loss']
CROP_SECTIONS.forEach((section, i) => eq(STATUSES.filter((status) => section.match({ status })), [STATUSES[i]], `${section.label} takes only its own status`))

eq(STATUSES.map((status) => cropStatusLabel({ status })), ['Growing', 'Ready to harvest', 'Harvested', 'Lost'], 'the status in plain words')
eq(cropStatusLabel({ status: 'Odd' }), 'Odd', 'an unknown status is shown as it is')

const open = { gated: false, message: null }
const shut = { gated: true, message: 'not yet' }
eq(cropMainAction({ status: 'Planted' }, open), 'activity', 'a growing crop: log activity, even when a harvest would be allowed')
eq(cropMainAction({ status: 'Near Harvest' }, open), 'harvest', 'ready and allowed: record the harvest')
eq(cropMainAction({ status: 'Near Harvest' }, shut), 'activity', 'ready but not allowed yet: log activity')
eq(cropMainAction({ status: 'Harvested' }, open), null, 'a harvested crop has no main action')
eq(cropMainAction({ status: 'Total Loss' }, open), null, 'neither has a lost one')

const crops = [
  { id: 1, status: 'Planted', expected_harvest_date: '2027-02-09' },
  { id: 2, status: 'Harvested', actual_harvest_date: '2025-10-02' },
  { id: 3, status: 'Planted', expected_harvest_date: '2026-12-01' },
  { id: 4, status: 'Harvested', actual_harvest_date: '2026-10-02' },
  { id: 5, status: 'Total Loss', date_planted: '2026-01-05' },
  { id: 6, status: 'Near Harvest', expected_harvest_date: '2026-11-20' },
  { id: 7, status: 'Planted', expected_harvest_date: null },
]
eq(sortCrops(crops).map((c) => c.id), [6, 3, 1, 7, 4, 2, 5], 'soonest harvest first (no date last), then the newest harvest first, then the lost ones')
eq(crops.map((c) => c.id), [1, 2, 3, 4, 5, 6, 7], 'the list given is not reordered')
eq(sortCrops([]), [], 'nothing to sort')

const text = cropText({ crop_type_name: 'Ginger', variety_used: 'Native', farm_location_barangay: 'Santa Cecilia', season: 'Wet', year: 2026 })
for (const word of ['Ginger', 'Native', 'Santa Cecilia', 'Wet', '2026']) ok(text.includes(word), `the search reads ${word}`)
eq(cropDate({ date_planted: '2026-08-13' }), '2026-08-13', 'the Year filter reads the planting date')
eq(cropHarvestDate({ status: 'Planted', expected_harvest_date: '2027-02-09', actual_harvest_date: null }), '2027-02-09', 'a growing crop shows the expected date')
eq(cropHarvestDate({ status: 'Harvested', expected_harvest_date: '2026-10-10', actual_harvest_date: '2026-10-02' }), '2026-10-02', 'a harvested crop shows the day it was harvested')
eq(cropHarvestDate({ status: 'Harvested', expected_harvest_date: '2026-10-10', actual_harvest_date: null }), '2026-10-10', 'or the expected date when that is all there is')

const page = read('../src/pages/Account/MyCropsPage.jsx')
for (const piece of ['RecordList', 'ListTools', 'ViewLogsModal', 'RecordHarvestFromMonitoringModal', 'CropDetailsModal', 'DisasterReportModal', 'harvestGateInfo', "searchParams.get('record')", 'onRetry={retry}', 'what="your crops"']) {
  ok(page.includes(piece), `My crops uses ${piece}`)
}
ok(page.includes('Log activity') && page.includes('Record harvest') && page.includes('Details'), 'the row buttons')
const routes = read('../src/pages/Account/accountRoutes.jsx')
ok(routes.includes('isFarmer ? <MyCropsPage />') && routes.includes('<CropMonitoringPage />'), 'a farmer gets My crops, the office its own page')
const app = read('../src/App.jsx')
const route = app.slice(app.indexOf('path="/crop-monitoring"'), app.indexOf('path="/crop-monitoring"') + 220)
ok(route.includes('<CropsRoute />') && route.includes('allowFarmer'), 'the address is the same for both')
console.log(`ok - ${n} assertions`)
