// "View Crop Details" is a table form like every other window: DetailTable for what the crop is and its harvest, an EntryTable for each
// history list (activities, pest and disease reports, disasters, remarks), shared Button, dates as "Nov 1, 2026".
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const src = read('src/pages/Monitoring/CropDetailsModal.jsx')
ok(src.includes('FormTable.jsx') && /<DetailTable/.test(src), 'crop details: the crop and its harvest are DetailTables')
ok(src.includes('title="Crop Details"') && src.includes('title="Harvest"'), 'crop details: sections named Crop Details and Harvest')
ok(src.includes('EntryTable.jsx') && /<EntryTable/.test(src), 'crop details: each history list is an EntryTable')
for (const title of ['Activities', 'Pest and Disease Reports', 'Disasters', 'Remarks']) ok(src.includes(title), `crop details: section ${title}`)
ok(!/<dl\b|<dt\b|<dd\b|<ul\b|<li\b/.test(src), 'crop details: no hand-made definition or bullet lists')
ok(!/<button\b/.test(src), 'crop details: buttons are the shared Button')
ok(!src.includes('Intl.DateTimeFormat') && src.includes('formatDate'), 'crop details: dates use the shared format')
ok(src.includes('data-testid="crop-details-history"') || src.includes("testId={"), 'crop details: history tables carry test hooks')

console.log(`cropDetailsForm: ${n} checks passed`)
