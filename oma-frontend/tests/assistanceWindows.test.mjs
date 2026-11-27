// The assistance windows (Edit Assistance Record and the view window) are table forms, and the crop and fisheries pages share one copy of
// each instead of writing it twice.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replaceAll(String.fromCharCode(13), '')

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── one copy of each window
const crop = read('src/pages/AssistanceManagement/CropAssistancePage.jsx')
const fish = read('src/pages/AssistanceManagement/FisheriesAssistancePage.jsx')
for (const [name, src] of [['crop page', crop], ['fisheries page', fish]]) {
  ok(src.includes('AssistanceEditSections'), `${name}: Edit Assistance Record draws the shared sections`)
  ok(!src.includes('rounded-lg border border-[#C8D5C8] px-4 py-2'), `${name}: no hand-styled buttons`)
}

// ── table forms
const sections = read('src/pages/AssistanceManagement/AssistanceEditSections.jsx')
for (const title of ['Assistance Details', 'Notes']) ok(sections.includes(`title="${title}"`), `edit section ${title}`)
for (const label of ['Assistance Type', 'Date Given', 'Source Agency']) ok(sections.includes(`label="${label}"`), `edit field ${label}`)
ok(sections.includes('export function DangerZone'), 'one Danger Zone for both pages')
ok(read('src/pages/AssistanceManagement/AssistanceViewDialog.jsx').includes('DetailTable'), 'the view window is a DetailTable')
ok(!/(overflow-hidden)/.test(read('src/components/UI/FormTable.jsx').split('export function FormRows')[0].split('export function FormSection')[1]), 'a section does not clip a drop-down list')

console.log(`assistanceWindows: ${n} checks passed`)
