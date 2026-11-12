// The Cycle window (Cycle Info, Feeding Log, Health Log) is a table form: the saved cycle is a DetailTable, its ponds / cages an EntryTable,
// (editing is in Edit Production Cycle). The old commented-out Inputs and Economics tabs are gone.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const src = read('src/pages/Monitoring/AquacultureCycleDetailModal.jsx')
ok(!src.includes('InputsTab') && !src.includes('EconomicsTab') && !src.includes('INPUT_TYPE_OPTIONS'), 'cycle window: dead Inputs / Economics code removed')
ok(!/\/\*\s*const /.test(src), 'cycle window: no commented-out blocks of code')

// the saved cycle
ok(/<DetailTable/.test(src) && src.includes('title="Cycle Details"'), 'cycle summary: details are a DetailTable')
ok(/<EntryTable/.test(src) && src.includes('testId="units-table"'), 'cycle summary: ponds / cages are an EntryTable with their hook')
ok(!src.includes('InfoField'), 'cycle summary: no hand-made field grid')
ok(!/<table|<thead/.test(src), 'cycle window: no hand-made table')
ok(!src.includes('Intl.DateTimeFormat') && src.includes("utils/dateFormat.js"), 'cycle window: dates use the shared format')

// the Edit form moved to Edit Production Cycle (tests/cycleEditMerge.test.mjs): this window only shows the cycle
ok(!src.includes('labelCls') && !src.includes('OwnershipFields'), 'cycle window: no hand-made labels')

// the tabs keep working through the shared Button where it is a plain button
ok(src.includes('data-testid="use-suggested-feed"'), 'cycle window: suggested-feed hook kept')

console.log(`cycleDetailForm: ${n} checks passed`)
