// Record Harvest and Edit Harvest Record show the same fields in the same table layout (one shared set of rows); each window keeps its own rules.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const rows = read('src/pages/Monitoring/HarvestFormRows.jsx')
ok(rows.includes("from '../../components/UI/FormTable.jsx'") && /export default function HarvestFormRows/.test(rows), 'the shared rows are built on the shared table form')
for (const label of ['Harvested Date', 'Area Harvested (ha)', 'Unit of Measure', 'Quantity Harvested', 'Remarks']) ok(rows.includes(`label="${label}"`), `the rows have ${label}`)
ok(!/Notes/.test(rows), 'the free text is Remarks in both windows, not Notes in one')

const page = read('src/pages/Monitoring/CropMonitoringPage.jsx')
// one function's source: from its name to the next top-level function
const body = (name) => {
  const start = page.indexOf(`function ${name}(`)
  const next = page.slice(start + 10).search(new RegExp(String.raw`\n(?:export )?function [A-Z]`))
  return page.slice(start, next === -1 ? undefined : start + 10 + next)
}
const record = body('RecordHarvestFromMonitoringModal')
const edit = body('EditHarvestRecordModal')
for (const [name, src] of [['Record Harvest', record], ['Edit Harvest Record', edit]]) {
  ok(src.includes('<HarvestFormRows'), `${name} draws the shared rows`)
  ok(!/>Harvested Date \*<|>Area Harvested \(ha\) \*<|>Quantity Harvested \*</.test(src), `${name} has no labels of its own for them`)
  ok(!/className="rounded-xl px-4 py-2\.5 text-sm text-slate-600 hover:bg-slate-100/.test(src) && src.includes('<Button'), `${name} uses the shared buttons`)
}
ok(record.includes('data-testid="harvest-crop-card"') && record.includes('data-testid="harvest-reason"'), 'Record Harvest keeps the crop card and the late-harvest reason')
ok(record.includes('reasonRequired') && record.includes('LATE_REASONS'), 'and its late-harvest rule')
ok(/needsTotalKg/.test(edit) && /quantityPayload/.test(edit), 'Edit keeps the unit-weight rules')

console.log(`harvestForm: ${n} checks passed`)
