// Every table heading is shown in CAPITALS, whichever way the table was written: one base rule for `thead th`, in the base layer so a
// utility class (normal-case) can still opt out. The on-screen copy of a printed report keeps its own wording.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const css = read('src/index.css')
const base = css.slice(css.indexOf('@layer base {'))
ok(/thead\s+th\s*\{[^}]*text-transform:\s*uppercase/.test(base), 'css: thead th is uppercase, inside the base layer')

const paper = read('src/pages/Reports/ReportPaper.jsx')
ok(/<th[^>]*normal-case/.test(paper), 'report paper: keeps its own wording (normal-case)')

console.log(`lookHeadings: ${n} checks passed`)
