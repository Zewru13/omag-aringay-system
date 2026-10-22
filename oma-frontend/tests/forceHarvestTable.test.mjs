import assert from 'node:assert/strict'

const { forceHarvestRows, forceHarvestTable, buildForceHarvestSpec } = await import(new URL('../src/pages/FisheriesRecords/forceHarvestTable.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const units = [
  { id: 11, label: 'HP 1', reasons: ['Fish mortality'] },
  { id: 12, label: 'HP 2', reasons: ['Disease outbreak'] },
  { id: 13, label: 'HP 3', reasons: ['Fish mortality'] },
]
const logs = [
  { production_unit: 11, force_harvest: true, observation: 'Fish kill', mortality_count: 40, log_date: '2026-09-02' },
  { production_unit: 11, force_harvest: true, observation: 'Fish kill', mortality_count: 10, log_date: '2026-09-03' },
  { production_unit: 12, force_harvest: true, observation: 'White spot', mortality_count: 0, log_date: '2026-09-05' },
  { production_unit: 12, force_harvest: false, observation: 'Routine', mortality_count: 99, log_date: '2026-09-06' },
  { production_unit: 99, force_harvest: true, observation: 'Other pond', mortality_count: 5, log_date: '2026-09-07' },
]
const harvests = [
  { id: 1, is_force_harvest: true, harvest_date: '2026-09-10', quantity_kg: '300.00', production_units: [11, 12], unit_harvests: [{ production_unit: 11, quantity_kg: '180.00' }, { production_unit: 12, quantity_kg: '120.00' }] },
  { id: 2, is_force_harvest: true, harvest_date: '2026-09-12', quantity_kg: '75.50', production_units: [13], unit_harvests: [] },
  { id: 3, is_force_harvest: false, harvest_date: '2026-10-01', quantity_kg: '999', production_units: [11], unit_harvests: [] },
]

const rows = forceHarvestRows({ units, harvests, logs, estimates: { 11: 200, 12: null, 13: 60.5 } })
eq(rows.length, 3, 'one row per unit')
eq(rows[0], { id: 11, label: 'HP 1', issue: 'Fish kill', mortality: 50, logDates: ['2026-09-02', '2026-09-03'], harvestDate: '2026-09-10', kg: 180, combinedKg: null, estimateKg: 200, harvested: true }, 'first unit: its own logs, kg and estimate; non-force harvests ignored')
eq(rows[1].issue, 'White spot', 'issue from the force-harvest log only'); eq(rows[1].mortality, 0, 'no mortality'); eq(rows[1].estimateKg, null, 'no estimate')
eq(rows[2], { id: 13, label: 'HP 3', issue: 'Fish mortality', mortality: 0, logDates: [], harvestDate: '2026-09-12', kg: null, combinedKg: 75.5, estimateKg: 60.5, harvested: true }, 'older record: only the combined kg; the issue falls back to the reason')

const waiting = forceHarvestRows({ units: [units[0]], harvests: [], logs, estimates: 'error' })
eq(waiting[0].harvested, false, 'not harvested yet'); eq(waiting[0].harvestDate, null, 'no date'); eq(waiting[0].kg, null, 'no kg'); eq(waiting[0].estimateKg, null, 'estimate failed to load')
eq(forceHarvestRows({ units, harvests: null, logs: null, estimates: null })[0].mortality, 0, 'data still loading')

const table = forceHarvestTable(rows)
eq(table.head, ['Production Unit', 'Health Issue', 'Mortality', 'Health Log Date', 'Harvest Date', 'Actual Harvest (kg)', 'Estimate (kg)'], 'head')
eq(table.rows[0], ['HP 1', 'Fish kill', '50', 'Sep 2, 2026 – Sep 3, 2026', 'Sep 10, 2026', '180.00', '200.00'], 'first row text')
eq(table.rows[1], ['HP 2', 'White spot', '0', 'Sep 5, 2026', 'Sep 10, 2026', '120.00', '—'], 'second row text')
eq(table.rows[2], ['HP 3', 'Fish mortality', '0', '—', 'Sep 12, 2026', '75.50 (combined)', '60.50'], 'combined kg is marked')
eq(table.rows.at(-1), ['TOTAL', '', '50', '', '', '375.50', '260.50'], 'total: own kg, plus the combined kg once; estimates summed')
eq([...table.boldRows], [3], 'the total row is bold')
eq(forceHarvestTable(waiting).rows[0][4], 'Not yet harvested', 'awaiting harvest')

// two units sharing one combined harvest count that harvest once
const shared = forceHarvestRows({ units: [units[0], units[2]], harvests: [{ id: 9, is_force_harvest: true, harvest_date: '2026-09-12', quantity_kg: '100', production_units: [11, 13], unit_harvests: [] }], logs: [], estimates: null })
eq(forceHarvestTable(shared).rows.at(-1)[5], '100.00', 'a shared combined harvest is added once')

const spec = buildForceHarvestSpec({ record: { id: 7, species_name: 'Tilapia', fisherfolk_name: 'Pablo Reyes' }, rows })
eq(spec.title, 'FORCE HARVEST REPORT', 'title'); eq(spec.reference, 'FH-000007', 'reference')
eq(spec.header, [['Reference No.', 'FH-000007'], ['Species', 'Tilapia'], ['Fisherfolk', 'Pablo Reyes']], 'header')
eq(spec.sections.length, 1, 'one section'); eq(spec.sections[0].title, 'Force Harvested Production Units', 'section title'); eq(spec.sections[0].table.head, table.head, 'same table')
eq(spec.signatures, ['Prepared by', 'Noted by'], 'signatures'); eq(spec.footerLabel, 'stocking record', 'footer')

console.log(`forceHarvestTable: ${n} checks passed`)
