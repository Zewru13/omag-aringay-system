import assert from 'node:assert/strict'
import fs from 'node:fs'

const { activityLogRows, filterActivityRows, ACTIVITY_FILTERS } = await import(new URL('../src/pages/Monitoring/cycleActivityLogs.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const feeding = [
  { id: 1, feeding_date: '2026-01-10', feed_type: 'Grower Feed', quantity_kg: '30.00', notes: 'morning',
    unit_quantities: [{ production_unit: 11, unit_label: 'Pond 1', quantity_kg: '10.00' }, { production_unit: 12, unit_label: 'Pond 2', quantity_kg: '20.00' }] },
  { id: 2, feeding_date: '2026-01-20', feed_type: 'Finisher Feed', quantity_kg: '5.00', notes: '', unit_quantities: [] },
]
const health = [
  { id: 7, log_date: '2026-02-01', observation: 'Fish Mortality', mortality_count: 7, treatment_applied: '', notes: '', force_harvest: true, unit_label: 'Pond 2' },
  { id: 8, log_date: '2026-01-20', observation: 'Poor Water Quality', mortality_count: 0, treatment_applied: 'Water Exchange', notes: 'after rain', force_harvest: false, unit_label: null },
]

const rows = activityLogRows({ feeding, health })

// ── one list of everything that was logged, newest first
eq(rows.map((r) => [r.date, r.type, r.unit]), [
  ['2026-02-01', 'Health Log', 'Pond 2'],
  ['2026-01-20', 'Feeding Log', 'Whole cycle'],
  ['2026-01-20', 'Health Log', 'Whole cycle'],
  ['2026-01-10', 'Feeding Log', 'Pond 1'],
  ['2026-01-10', 'Feeding Log', 'Pond 2'],
], 'newest first; a feeding log is one row for each pond/cage it was given to')

// ── what each row says is what was saved
const byKey = Object.fromEntries(rows.map((r) => [r.key, r]))
eq(byKey['feeding-1-11'].summary, 'Grower Feed — 10.00 kg', 'a pond\'s share of a feeding')
eq(byKey['feeding-1-12'].summary, 'Grower Feed — 20.00 kg', 'another pond\'s share')
eq(byKey['feeding-1-11'].notes, 'morning', 'the feeding notes')
eq(byKey['feeding-2'].summary, 'Finisher Feed — 5.00 kg', 'a feeding logged without a breakdown is for the whole cycle')
eq(byKey['health-7'].summary, 'Fish Mortality', 'the observation')
eq(byKey['health-7'].details, [['Mortality count', '7'], ['Force Harvest', 'Yes']], 'mortality and force harvest')
eq(byKey['health-8'].details, [['Treatment', 'Water Exchange']], 'a treatment')
eq(byKey['health-8'].notes, 'after rain', 'the health notes')

// ── the totals shown above the list
const totals = activityLogRows({ feeding, health }).reduce((acc, r) => ({ ...acc, [r.kind]: (acc[r.kind] || 0) + 1 }), {})
eq(totals, { health: 2, feeding: 3 }, 'rows by kind')

// ── the filter
eq(ACTIVITY_FILTERS.map((f) => f.key), ['all', 'feeding', 'health'], 'All, Feeding Log, Health Log')
eq(filterActivityRows(rows, 'all').length, 5, 'all')
eq(filterActivityRows(rows, 'feeding').map((r) => r.type), ['Feeding Log', 'Feeding Log', 'Feeding Log'], 'feeding only')
eq(filterActivityRows(rows, 'health').map((r) => r.type), ['Health Log', 'Health Log'], 'health only')

// ── nothing logged
eq(activityLogRows({ feeding: [], health: [] }), [], 'no logs')
eq(activityLogRows({}), [], 'no lists at all')

// ── the row menu of Fisheries Monitoring and its View Details
const page = fs.readFileSync(new URL('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx', import.meta.url), 'utf8')
const menuStart = page.indexOf('function StockingRowActions')
const menu = page.slice(menuStart, page.indexOf('\nfunction ', menuStart + 10))
eq(menu.includes("label: 'Activity Logs'"), true, 'Activity Logs is in the ⋮ menu')
const detailStart = page.indexOf('function StockingDetailModal')
const details = page.slice(detailStart, page.indexOf('\n// ─── Row Actions Menu', detailStart))
for (const gone of ["'Land Status'", "'Survival Rate (%)'", "'Seed/Fingerling Cost'", "'Avg Body Weight (kg)'"]) eq(details.includes(gone), false, `View Details no longer lists ${gone}`)
for (const kept of ["'Species'", "'Fisherfolk'", "'Pond Location'", "'Water Source'", "'Number of Fingerlings'", "'Production Cycle'", "'Expected Harvest Date'", "'Estimated Harvest (kg)'", "'Notes'"]) eq(details.includes(kept), true, `View Details keeps ${kept}`)

console.log(`ok - ${n} assertions`)
