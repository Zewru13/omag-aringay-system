// The fisheries Log Disaster form (one fisherfolk) is a table form like every other window.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const src = read('src/pages/Monitoring/FisherfolkStockDisasterModal.jsx')
ok(src.includes('FormTable.jsx') && /<FormSection/.test(src) && /<FormCell/.test(src), 'sections of labelled rows')
ok(src.includes('EntryTable.jsx') && /<EntryTable/.test(src), 'the fingerlings-lost entries use the shared entry table')
ok(!src.includes("import FormField"), 'no stacked FormField')
ok(!/<FormLabel/.test(src), 'no hand-made stacked labels')
ok(!src.includes('sm:hidden'), 'one responsive table, not a separate phone copy')
for (const title of ['Event', 'Stock and Equipment', 'Photo Documentation of Damage']) ok(src.includes(`title="${title}"`), `section ${title}`)
for (const label of ['Date of Occurrence', 'Disaster Type', 'Volume Lost (kg)', 'Description of Damage', 'Affected Stock', 'Equipment Damaged']) ok(src.includes(`label="${label}"`), `field ${label}`)
for (const hook of ['stock-picker', 'fingerlings-lost', 'loss-row', 'stock-total', 'overall-total']) ok(src.includes(`"${hook}"`), `test hook ${hook}`)
ok(src.includes('export function StockPicker') && src.includes('export function FingerlingsLostTable'), 'the panel still reuses the picker and the table')

// ── the disaster view windows
const details = read('src/pages/Monitoring/DisasterLogDetailsModal.jsx')
ok(details.includes('FormTable.jsx') && /<DetailTable/.test(details) && /<FormSection/.test(details), 'Disaster Details: detail tables in titled sections')
ok(!details.includes('<dl') && !details.includes('function Rows'), 'Disaster Details: no hand-made definition lists')
ok(details.includes('EntryTable.jsx') && /<EntryTable/.test(details), 'Disaster Details: the stocks and losses tables are entry tables')
ok(details.includes('data-testid="disaster-log"') && details.includes('testId="affected-stocks"') && details.includes('testId="fingerlings-lost"'), 'Disaster Details: test hooks kept')

const history = read('src/pages/Monitoring/DisasterHistoryModal.jsx')
ok(/<EntryTable/.test(history) && /<EntryHead/.test(history), 'Disaster history: the shared table')
ok(!history.includes('bg-[#1B4D2E] text-white') && !history.includes('const TH'), 'Disaster history: no hand-made table head')
ok(history.includes('data-testid="disaster-history-row"') && history.includes('data-testid="disaster-history-empty"'), 'Disaster history: test hooks kept')

const timeline = read('src/pages/Monitoring/FisheriesHistoryModal.jsx')
ok(/<FormSection/.test(timeline) && /<FormCell/.test(timeline), 'Fisheries timeline: the filters are a table form')
ok(/<EntryTable/.test(timeline), 'Fisheries timeline: the seasons table is the shared table')
ok(!/style=\{\{/.test(timeline.replace(/<ResponsiveContainer[\s\S]*?<\/ResponsiveContainer>/, '')), 'Fisheries timeline: no inline-styled tables or labels')

console.log(`fisheriesDisasterForm: ${n} checks passed`)
