import assert from 'node:assert/strict'
import fs from 'node:fs'

// The fisherfolk's Cycles page: their own production cycles in sections, with the main action on each row.
const { CYCLE_SECTIONS, cycleStatusLabel, cycleMainAction, sortCycles, cycleText, cycleDate, cycleTitle, cycleHarvestDate } =
  await import(new URL('../src/pages/Account/myCycles.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(CYCLE_SECTIONS.map((s) => s.label), ['Growing', 'Ready to harvest', 'Harvested', 'Lost'], 'the four sections, in order')
const sectionOf = (rec) => CYCLE_SECTIONS.filter((s) => s.match(rec)).map((s) => s.label)
const forcedAll = { status: 'Harvested', forced_harvests: [{ id: 1 }], harvest_units: [{ harvested: true }] }
const partly = { status: 'Stocked', forced_harvests: [{ id: 1 }], harvest_units: [{ harvested: true }, { harvested: false }] }
eq(sectionOf({ status: 'Stocked' }), ['Growing'], 'stocked: growing')
eq(sectionOf(partly), ['Growing'], 'some ponds force harvested: still growing')
eq(sectionOf({ status: 'Near Harvest' }), ['Ready to harvest'], 'near harvest')
eq(sectionOf({ status: 'Stocked', display_status: 'Late' }), ['Ready to harvest'], 'late is still waiting to be harvested')
eq(sectionOf({ status: 'Stocked', force_harvest: true }), ['Ready to harvest'], 'a force harvest from a Health log makes it ready')
eq(sectionOf({ status: 'Stocked', is_near_harvest: true }), ['Ready to harvest'], 'near its harvest date')
eq(sectionOf({ status: 'Harvested' }), ['Harvested'], 'harvested')
eq(sectionOf(forcedAll), ['Harvested'], 'every pond force harvested: harvested')
eq(sectionOf({ status: 'Total Loss' }), ['Lost'], 'a total loss')
eq(sectionOf({ status: 'Odd' }), ['Growing'], 'an unknown status is still listed')

eq(cycleStatusLabel({ status: 'Stocked' }), 'Growing', 'stocked')
eq(cycleStatusLabel(partly), 'Partly harvested', 'in progress')
eq(cycleStatusLabel({ status: 'Near Harvest' }), 'Ready to harvest', 'near harvest')
eq(cycleStatusLabel({ status: 'Stocked', display_status: 'Late' }), 'Late', 'late')
eq(cycleStatusLabel({ status: 'Harvested' }), 'Harvested', 'harvested')
eq(cycleStatusLabel(forcedAll), 'Force harvested', 'forced')
eq(cycleStatusLabel({ status: 'Total Loss' }), 'Lost', 'lost')
eq(cycleStatusLabel({ status: 'Odd' }), 'Odd', 'unknown as given')

const open = { gated: false, message: null }
const shut = { gated: true, message: 'not yet' }
eq(cycleMainAction({ status: 'Stocked' }, open), 'activity', 'growing: log activity')
eq(cycleMainAction({ status: 'Near Harvest' }, open), 'harvest', 'ready and allowed: record the harvest')
eq(cycleMainAction({ status: 'Near Harvest' }, shut), 'activity', 'ready but not allowed yet')
eq(cycleMainAction({ status: 'Stocked', force_harvest: true }, open), 'harvest', 'a force harvest leads with the harvest')
eq(cycleMainAction({ status: 'Harvested' }, open), null, 'harvested: none')
eq(cycleMainAction(forcedAll, open), null, 'force harvested: none')
eq(cycleMainAction({ status: 'Total Loss' }, open), null, 'lost: none')

const rows = [
  { id: 1, status: 'Stocked', expected_harvest_date: '2027-02-01' },
  { id: 2, status: 'Harvested', actual_harvest_date: '2025-10-02' },
  { id: 3, status: 'Near Harvest', expected_harvest_date: '2026-11-20' },
  { id: 4, status: 'Harvested', actual_harvest_date: '2026-10-02' },
  { id: 5, status: 'Total Loss', date_stocked: '2026-01-05' },
  { id: 6, status: 'Stocked', expected_harvest_date: null },
]
eq(sortCycles(rows).map((r) => r.id), [3, 1, 6, 4, 2, 5], 'soonest harvest first, then newest harvest, then the lost ones')
eq(rows.map((r) => r.id), [1, 2, 3, 4, 5, 6], 'the list given is not reordered')

eq(cycleTitle({ species_name: 'Tilapia', production_cycle_no: 1 }), 'Tilapia, Cycle #1', 'species and cycle number')
eq(cycleTitle({ species_name: 'Bangus' }), 'Bangus', 'no cycle number')
eq(cycleTitle({}), 'Cycle', 'nothing known')
const text = cycleText({ species_name: 'Tilapia', production_cycle_no: 3, culture_type: 'Pond', pond_location_barangay: 'Alaska' })
for (const word of ['Tilapia', '3', 'Pond', 'Alaska']) ok(text.includes(word), `the search reads ${word}`)
eq(cycleDate({ date_stocked: '2026-08-01' }), '2026-08-01', 'the Year filter reads the stocking date')
eq(cycleHarvestDate({ status: 'Stocked', expected_harvest_date: '2026-12-01' }), '2026-12-01', 'growing: the expected date')
eq(cycleHarvestDate({ status: 'Harvested', expected_harvest_date: '2026-12-01', actual_harvest_date: '2026-11-28' }), '2026-11-28', 'harvested: the day it was')

const { CYCLE_FORECAST_SECTIONS } = await import(new URL('../src/pages/Account/myCycles.js', import.meta.url).href)
eq(CYCLE_FORECAST_SECTIONS.map((s) => s.label), ['Growing', 'Harvested'], 'the forecast: growing cycles, then harvested ones')
const forecastSection = (rec) => CYCLE_FORECAST_SECTIONS.filter((s) => s.match(rec)).map((s) => s.label)
eq(forecastSection({ status: 'Stocked' }), ['Growing'], 'stocked')
eq(forecastSection({ status: 'Near Harvest' }), ['Growing'], 'near harvest')
eq(forecastSection({ status: 'Stocked', display_status: 'Late' }), ['Growing'], 'late is still growing')
eq(forecastSection({ status: 'Harvested' }), ['Harvested'], 'harvested')
eq(forecastSection(forcedAll), ['Harvested'], 'force harvested')
const forecastPage = read('../src/pages/Account/MyFisheriesForecastPage.jsx')
for (const piece of ['RecordList', 'ListTools', 'StockingForecastDetailModal', 'view="yield"', "'Stocked,Near Harvest,Harvested'", 'yieldDifference', 'countdown', 'onRetry={retry}', 'what="your forecast"', 'Yield analysis']) {
  ok(forecastPage.includes(piece), `Forecast uses ${piece}`)
}
const forecastRoutes = read('../src/pages/Account/accountRoutes.jsx')
ok(forecastRoutes.includes('isFisherfolk ? <MyFisheriesForecastPage />') && forecastRoutes.includes('<FisheriesForecastingTab />'), 'a fisherfolk gets their Forecast page, the office its own')
const forecastRoute = read('../src/App.jsx').slice(read('../src/App.jsx').indexOf('path="/fisheries-forecasting"'), read('../src/App.jsx').indexOf('path="/fisheries-forecasting"') + 220)
ok(forecastRoute.includes('<FisheriesForecastRoute />') && forecastRoute.includes('allowFisherfolk'), 'the address is the same for both')
const page = read('../src/pages/Account/MyCyclesPage.jsx')
ok(page.includes('<StatusBadge status={cycleStatusText(r)}>'), 'the badge colour comes from the real status, not the plain-word label')
const { toneOf } = await import(new URL('../src/pages/Account/statusTone.js', import.meta.url).href)
eq(['Stocked', 'In Progress', 'Near Harvest', 'Late', 'Harvested', 'Forced Harvested', 'Total Loss'].map(toneOf), ['green', 'green', 'amber', 'amber', 'grey', 'grey', 'red'], 'every cycle status has its tone')
for (const piece of ['RecordList', 'ListTools', 'CycleDetailsWindow', 'ChooseLogWindow', 'LogActivityModal', 'RecordStockingHarvestModal', 'StartProductionCycleModal', 'stockingHarvestGate', "searchParams.get('cycle')", "searchParams.get('record')", "searchParams.get('forced')", 'ForcedHarvestDetailsModal', 'Start a cycle', 'onRetry={retry}', 'what="your cycles"']) {
  ok(page.includes(piece), `My cycles uses ${piece}`)
}
const details = read('../src/pages/Account/CycleDetailsWindow.jsx')
for (const piece of ['CycleInfoSummary', 'Activity logs', 'Edit', 'Print', 'canForceHarvest', 'Force harvest', 'Harvest details']) ok(details.includes(piece), `Details holds ${piece}`)
const choose = read('../src/pages/Account/ChooseLogWindow.jsx')
ok(choose.includes('LOG_ACTIVITY_OPTIONS') && choose.includes('min-h-[56px]'), 'the log choice uses the same two logs, as big buttons')
const routes = read('../src/pages/Account/accountRoutes.jsx')
ok(routes.includes('isFisherfolk ? <MyCyclesPage />') && routes.includes('<FisheriesMonitoringPage />'), 'a fisherfolk gets My cycles, the office its own page')
const app = read('../src/App.jsx')
const route = app.slice(app.indexOf('path="/fisheries-monitoring"'), app.indexOf('path="/fisheries-monitoring"') + 220)
ok(route.includes('<CyclesRoute />') && route.includes('allowFisherfolk'), 'the address is the same for both')
console.log(`ok - ${n} assertions`)
