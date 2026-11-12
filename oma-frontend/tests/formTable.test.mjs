// The shared pieces every form and view window is built from: one date formatter, the rows of a read-only detail table, and the
// table-form components in one place (components/UI), with the older names still working.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const { formatDate, formatDateLong, formatDateTime, formatTime } = await import(here('src/utils/dateFormat.js').href)
const { displayValue, detailRows } = await import(here('src/components/UI/formTableRows.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// --- one date formatter: "Nov 1, 2026" on screen
eq(formatDate('2026-11-01'), 'Nov 1, 2026', 'a calendar date')
eq(formatDate('2026-01-09'), 'Jan 9, 2026', 'no leading zero')
// a calendar date is the same day wherever it is read (never moved by a time zone)
eq(formatDate('2026-11-01', { timeZone: 'America/Los_Angeles' }), 'Nov 1, 2026', 'a calendar date ignores the time zone')
eq(formatDate('2026-11-01', { timeZone: 'Asia/Manila' }), 'Nov 1, 2026', 'in Manila too')
// a moment in time is shown on the day it was in that place
eq(formatDate('2026-11-01T18:30:00Z', { timeZone: 'Asia/Manila' }), 'Nov 2, 2026', 'a moment late in the UTC day is the next day in Manila')
eq(formatDate(new Date(Date.UTC(2026, 10, 1, 3, 0, 0)), { timeZone: 'Asia/Manila' }), 'Nov 1, 2026', 'a Date object')
eq(formatDate(null), '—', 'no date')
eq(formatDate(''), '—', 'an empty date')
eq(formatDate(undefined, { empty: '' }), '', 'the caller chooses what an empty date shows')
eq(formatDate('not a date'), '—', 'a value that is not a date')
eq(formatDate('2026-13-45'), '—', 'an impossible date')
eq(formatDateLong('2026-11-01'), 'November 1, 2026', 'the long form, for printed papers')
eq(formatDateLong(null, { empty: '' }), '', 'long form, empty')
eq(formatDateTime('2026-11-01T18:30:00Z', { timeZone: 'Asia/Manila' }), 'Nov 2, 2026, 2:30 AM', 'date and time')
eq(formatDateTime('2026-11-01'), 'Nov 1, 2026', 'a calendar date has no time to show')
eq(formatDateTime(null), '—', 'no date and time')
eq(formatTime('2026-11-01T07:05:00Z', { timeZone: 'Asia/Manila' }), '3:05 PM', 'the time alone')
eq(formatTime('2026-11-01'), '—', 'a calendar date has no time')

// --- what a read-only cell shows
eq(displayValue('Tilapia'), 'Tilapia', 'text')
eq(displayValue(0), 0, 'zero is a value')
eq(displayValue(''), '—', 'empty text')
eq(displayValue('   '), '—', 'blank text')
eq(displayValue(null), '—', 'nothing')
eq(displayValue(undefined), '—', 'undefined')
eq(displayValue(true), 'Yes', 'yes')
eq(displayValue(false), 'No', 'no')
eq(displayValue([]), '—', 'an empty list')
eq(displayValue(['A', 'B']), 'A, B', 'a list')

// --- the rows of a detail table: two fields to a row, a wide field alone, hidden fields left out
const cells = (rows) => rows.map((row) => row.map((c) => `${c.label}${c.wide ? '*' : ''}`))
eq(cells(detailRows([{ label: 'A', value: 1 }, { label: 'B', value: 2 }, { label: 'C', value: 3 }, { label: 'D', value: 4 }])), [['A', 'B'], ['C', 'D']], 'two to a row')
eq(cells(detailRows([{ label: 'A' }, { label: 'B' }, { label: 'C' }])), [['A', 'B'], ['C*']], 'an odd last field takes the whole row')
eq(cells(detailRows([{ label: 'A' }, { label: 'Notes', wide: true }, { label: 'B' }, { label: 'C' }])), [['A*'], ['Notes*'], ['B', 'C']], 'a wide field is alone on its row, and the field before it fills its own')
eq(cells(detailRows([{ label: 'A' }, { label: 'B', hidden: true }, { label: 'C' }])), [['A', 'C']], 'a hidden field is left out')
eq(cells(detailRows([{ label: 'A' }, null, false, { label: 'B' }])), [['A', 'B']], 'empty entries are skipped')
eq(cells(detailRows([{ label: 'A' }, { label: 'B' }, { label: 'C' }], 1)), [['A*'], ['B*'], ['C*']], 'one field to a row')
eq(detailRows([]), [], 'no fields')

// --- the components live in components/UI, and the older names still work
const formTable = read('src/components/UI/FormTable.jsx')
for (const name of ['FormSection', 'FormRows', 'FormRow', 'FormCell', 'FormValue', 'DetailTable']) ok(new RegExp(`export function ${name}\\b`).test(formTable), `FormTable exports ${name}`)
ok(formTable.includes("from './formTableRows.js'"), 'DetailTable uses the tested row helper')
const cycle = read('src/pages/Monitoring/CycleFormTable.jsx')
ok(/FormSection as CycleSection/.test(cycle) && /FormRows as CycleRows/.test(cycle) && /FormRow as CycleRow/.test(cycle) && /FormCell as CycleField/.test(cycle), 'the Start Production Cycle names are the shared pieces')
ok(!/className=/.test(cycle), 'CycleFormTable holds no markup of its own')
const entry = read('src/components/UI/EntryTable.jsx')
for (const name of ['EntryTable', 'EntryHead', 'EntryTh', 'EntryRow', 'EntryCell']) ok(new RegExp(`export function ${name}\\b`).test(entry), `EntryTable exports ${name}`)
const log = read('src/pages/Monitoring/LogFormTable.jsx')
ok(/EntryTable as LogTable/.test(log) && /EntryCell as LogCell/.test(log) && !/className=/.test(log), 'the Feeding / Health Log names are the shared pieces')

// --- one table header look and one label look, named once
const styles = read('src/components/UI/tableStyles.js')
for (const name of ['TABLE_HEAD_ROW', 'TABLE_HEAD_CELL', 'FORM_LABEL', 'FILTER_SELECT']) ok(new RegExp(`export const ${name}\\b`).test(styles), `tableStyles exports ${name}`)
const dataTable = read('src/components/UI/DataTable.jsx')
ok(dataTable.includes("from './tableStyles.js'") && dataTable.includes('TABLE_HEAD_ROW') && dataTable.includes('TABLE_HEAD_CELL'), 'the shared list table uses the named header look')
ok(!/text-\[11px\] font-semibold uppercase tracking-wider text-white/.test(dataTable), 'and no longer spells it out itself')

console.log(`formTable: ${n} checks passed`)
