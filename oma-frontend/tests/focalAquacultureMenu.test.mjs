// Aquaculture Monitoring's row menu is the same for every account (Admin, Focal Person, fisherfolk): View Details, Edit, Activity Logs,
// Force Harvest (+ Force Unlock for Admin). The Focal Person no longer gets the older menu with View Logs / Record Harvest / Report Disaster,
// so the windows only that menu opened are gone. Harvest stays on the fishing-net button; disasters through Disaster.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const page = read('src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
ok(!/\bsimplified\b/.test(page.replace(/\/\/.*$/gm, '')), 'menu: no second, older menu for the Focal Person')
ok(!page.includes("label: 'View Logs'") && !page.includes("label: 'Report Disaster'"), 'menu: no View Logs / Report Disaster entries')
ok(!page.includes('ViewStockingLogsModal') && !page.includes('StockingDisasterReportModal'), 'page: the windows only that menu opened are not mounted')
for (const label of ["label: 'View Details'", "label: 'Edit'", "label: 'Activity Logs'", "label: 'Force Harvest'"]) ok(page.includes(label), `menu keeps ${label}`)
ok(page.includes('RecordStockingHarvestModal') && page.includes('data-testid') , 'page: the fishing-net Record Harvest stays')

const modals = read('src/pages/FisheriesRecords/StockingMonitoringModals.jsx')
for (const gone of ['ViewStockingLogsModal', 'StockingDisasterReportModal', 'StockingSuggestionsModal']) ok(!modals.includes(gone), `${gone} is deleted`)
ok(modals.includes('export function RecordStockingHarvestModal'), 'Record Harvest window is kept')

console.log(`focalAquacultureMenu: ${n} checks passed`)
