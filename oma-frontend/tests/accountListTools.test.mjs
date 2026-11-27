import assert from 'node:assert/strict'
import fs from 'node:fs'

// The pieces the farmer's pages share: the list search and Year filter, the harvest gate, and the office windows made importable.
const { searchRows, yearsOf, inYear } = await import(new URL('../src/pages/Account/accountSearch.js', import.meta.url).href)
const { harvestGateInfo } = await import(new URL('../src/pages/Monitoring/harvestGateInfo.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const rows = [{ id: 1, crop: 'Ginger', place: 'Santa Cecilia', d: '2026-08-13' }, { id: 2, crop: 'Rice', place: 'Alaska', d: '2025-06-01' }, { id: 3, crop: 'Rice', place: 'Santa Cecilia', d: null }]
const textOf = (r) => `${r.crop} ${r.place}`
eq(searchRows(rows, '', textOf).length, 3, 'no search: every row')
eq(searchRows(rows, 'rice', textOf).map((r) => r.id), [2, 3], 'one word')
eq(searchRows(rows, 'cecilia rice', textOf).map((r) => r.id), [3], 'words in any order')
eq(searchRows(rows, 'corn', textOf), [], 'no match')
eq(yearsOf(rows, (r) => r.d), [2026, 2025], 'the years present, newest first')
eq(yearsOf([...rows, { d: '2026-01-01' }, { d: 'nonsense' }], (r) => r.d), [2026, 2025], 'each year once; an unreadable date is skipped')
eq(yearsOf([], (r) => r.d), [], 'no rows, no years')
eq(inYear(rows, '', (r) => r.d).length, 3, 'all years')
eq(inYear(rows, '2025', (r) => r.d).map((r) => r.id), [2], 'one year; a row with no date is left out')
eq(inYear(rows, 2026, (r) => r.d).map((r) => r.id), [1], 'the year as a number')

const base = { date_planted: '2026-01-01', expected_harvest_date: '2026-04-11' }   // 100 days
eq(harvestGateInfo(base, '2026-01-20').gated, true, 'under half the growing time: not yet')
ok(harvestGateInfo(base, '2026-01-20').message, 'with the reason')
eq(harvestGateInfo(base, '2026-03-01'), { gated: false, message: null }, 'past half: allowed')
eq(harvestGateInfo({ ...base, date_planted_is_estimated: true }, '2026-03-01').gated, true, 'an estimated planting date blocks the harvest')

const monitoring = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
ok(/export function ViewLogsModal\(/.test(monitoring) && /export function RecordHarvestFromMonitoringModal\(/.test(monitoring), 'the two windows can be imported')
ok(monitoring.includes("from './harvestGateInfo.js'") && !/^function harvestGateInfo/m.test(monitoring), 'the gate lives in its own file')
const forecasting = read('../src/pages/Forecasting/ForecastingPage.jsx')
ok(/export function ForecastDetailModal\(/.test(forecasting) && /export function YieldAnalysisTab\(/.test(forecasting), 'the forecast window and the yield tab can be imported')
ok(read('../src/pages/Account/ListTools.jsx').includes('type="search"'), 'the list tools hold the search box')
console.log(`ok - ${n} assertions`)
