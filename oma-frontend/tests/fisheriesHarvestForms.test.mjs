// The fisheries Record Harvest and Force Harvest windows are table forms like every other window.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── Record Harvest (the part of StockingMonitoringModals.jsx from the units table to the end of the file)
const all = read('src/pages/FisheriesRecords/StockingMonitoringModals.jsx')
const harvest = all.slice(all.indexOf('function HarvestUnitsTable'))
ok(harvest.includes('<FormSection') && harvest.includes('<FormCell'), 'Record Harvest: details are a table form')
ok(harvest.includes('<DetailTable'), 'Record Harvest: the harvest timing is a detail table')
ok(!/<label className="mb-1 block/.test(harvest), 'Record Harvest: no hand-made stacked labels')
ok(!harvest.includes('Detail</LogTh>'), 'Record Harvest: no hand-made Detail/Value tables')
ok(!/<button\b/.test(harvest), 'Record Harvest: buttons are the shared Button')
ok(harvest.includes('HarvestUnitsTable'), 'Record Harvest: both harvests still share the units table')
ok(harvest.includes('testId="unit-harvest-table-wrap"') && harvest.includes('data-testid="harvest-reason"'), 'Record Harvest: test hooks kept')

// ── Force Harvest (Aquaculture Monitoring menu)
const force = read('src/pages/FisheriesRecords/ForceHarvestModal.jsx')
ok(force.includes('FormTable.jsx') && force.includes('<FormSection') && force.includes('<FormCell'), 'Force Harvest: details are a table form')
ok(force.includes('<DetailTable'), 'Force Harvest: the review details are a detail table')
ok(force.includes('EntryTable.jsx'), 'Force Harvest: the ponds and cages use the shared entry table')
ok(!force.includes('const HEAD') && !force.includes('const FRAME') && !force.includes('const TH '), 'Force Harvest: no hand-made table styles')
ok(!/<label htmlFor/.test(force), 'Force Harvest: no hand-made labels')
ok(force.includes('testId="force-harvest-select-table"') && force.includes('data-testid="force-harvest-total"'), 'Force Harvest: test hooks kept')

console.log(`fisheriesHarvestForms: ${n} checks passed`)
