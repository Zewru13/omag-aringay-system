import assert from 'node:assert/strict'
import fs from 'node:fs'

// Forecasting (crop and fisheries): Group by, Status and a Date From / To are filters in the one toolbar; the Yield Analysis lost its
// Analysis / By farmer and By barangay / By crop type buttons, its Year box and its own farmer search.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')
const count = (text, re) => (text.match(re) || []).length

const pages = [
  { name: 'crop', src: read('../src/pages/Forecasting/ForecastingPage.jsx'), person: 'farmer', dateLabel: 'Date Planted', from: 'planted_from', to: 'planted_to',
    statuses: ['Planted', 'Near Harvest', 'Overdue'], statusParam: "forecast_status", grouped: "Group by farmer" },
  { name: 'fisheries', src: read('../src/pages/Monitoring/FisheriesForecastingTab.jsx'), person: 'fisherfolk', dateLabel: 'Date Stocked', from: 'stocked_from', to: 'stocked_to',
    statuses: ['Stocked', 'Near Harvest', 'Late', 'Harvested'], statusParam: 'status', grouped: 'Group by fisherfolk' },
]

for (const { name, src, dateLabel, from, to, statuses, statusParam, grouped } of pages) {
  // ── the Forecast tab and the Yield Analysis both get a Group by select and a Date From / To
  eq(count(src, /aria-label="Group by"/g), 2, `${name}: a Group by select on each tab`)
  eq(count(src, new RegExp(`<option value="[a-z]+">${grouped}</option>`, 'g')), 2, `${name}: the group is the ${grouped}`)
  eq(count(src, new RegExp(`<DateRangeFields[\\s\\S]{0,40}label="${dateLabel}"`, 'g')), 2, `${name}: ${dateLabel} From / To on each tab`)
  eq(src.includes(`'${from}', '${to}'`), true, `${name}: the dates travel as ${from} / ${to}`)
  eq(src.includes(`dateRangeParams(`), true, `${name}: a reversed range is not sent`)

  // ── the Forecast tab has a Status filter with the statuses the table shows
  eq(count(src, /aria-label="Status"/g), 1, `${name}: one Status select`)
  for (const status of statuses) eq(src.includes(`<option value="${status}">${status}</option>`), true, `${name}: status ${status}`)
  eq(src.includes(`params.${statusParam} =`) || src.includes(`${statusParam}: `), true, `${name}: the status is sent as ${statusParam}`)

  // ── the old toggles, the Year box and the farmer search are gone
  eq(src.includes('ViewToggle'), false, `${name}: no toggle buttons left`)
  eq(src.includes('aria-label="Year"'), false, `${name}: no Year box`)
  eq(/FarmerFilterInput|FisherfolkFilterInput/.test(src), false, `${name}: no second farmer / fisherfolk search`)
  eq(/By barangay|By crop type|By species|All crops'|All stockings/.test(src), false, `${name}: no By barangay / By crop type / By species / All crops / All stockings buttons`)
  eq(/label: 'Analysis'|label: 'By (farmer|fisherfolk)'/.test(src), false, `${name}: no Analysis / By ${name === 'crop' ? 'farmer' : 'fisherfolk'} buttons`)
}

// the crop page still has its All crops choice, as a crop type filter
eq(pages[0].src.includes('<option value="">All crops</option>'), true, 'the All crops filter stays')

console.log(`ok - ${n} assertions`)
