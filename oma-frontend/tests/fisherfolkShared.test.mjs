import assert from 'node:assert/strict'
import fs from 'node:fs'

// The pieces the fisherfolk's pages share: the cycle harvest gate in its own file, and the office windows made importable.
const { stockingHarvestGate } = await import(new URL('../src/pages/FisheriesRecords/stockingHarvestGate.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const base = { date_stocked: '2026-01-01', expected_harvest_date: '2026-04-11' }   // 100 days
eq(stockingHarvestGate(base, '2026-01-20').gated, true, 'under half the culture time: not yet')
ok(stockingHarvestGate(base, '2026-01-20').message, 'with the reason')
eq(stockingHarvestGate(base, '2026-03-01'), { gated: false, message: null }, 'past half: allowed')
eq(stockingHarvestGate({ ...base, date_stocked_is_estimated: true }, '2026-03-01').gated, true, 'an estimated stocking date blocks the harvest')
eq(stockingHarvestGate({ ...base, force_harvest: true }, '2026-01-20'), { gated: false, message: null }, 'a force harvest lifts the wait')
eq(stockingHarvestGate({ ...base, force_harvest: true, date_stocked_is_estimated: true }, '2026-03-01').gated, true, 'but never past an estimated date')

const records = read('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
ok(records.includes("from './stockingHarvestGate.js'") && !/^function harvestGateInfo/m.test(records), 'the gate lives in its own file')
ok(/export function StockingDetailModal\(/.test(records), 'the stocking details window can be imported')
ok(/export function MarkRecoveredModal\(/.test(read('../src/pages/Monitoring/FisherfolkDisasterPage.jsx')), 'the fisherfolk Mark Recovered window can be imported')
const forecast = read('../src/pages/Monitoring/FisheriesForecastingTab.jsx')
ok(/export function StockingForecastDetailModal\(/.test(forecast), 'the forecast details window can be imported')
ok(/export default function ForecastingTab\(\{ asTab = false, view \}\)/.test(forecast) && forecast.includes("view === 'yield'"), 'the forecast page can show only its yield analysis')
console.log(`ok - ${n} assertions`)
