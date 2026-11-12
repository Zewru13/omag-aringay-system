// The assistance windows (Edit Assistance Record, Mark Resolved, Report Not Received, Confirm Received, the view window) are table forms, and the
// crop and fisheries pages share one copy of each instead of writing it twice.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replaceAll(String.fromCharCode(13), '')
const { FOLLOW_UP, followUpFor } = await import(here('src/pages/AssistanceManagement/assistanceFollowUp.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── what differs between crop and fisheries is data, written once
eq(Object.keys(FOLLOW_UP).sort(), ['crop', 'fisheries'], 'two domains')
eq(FOLLOW_UP.crop.resolveUrl(7), '/interventions/beneficiaries/7/mark-resolved/', 'crop resolve url')
eq(FOLLOW_UP.crop.reportUrl(7), '/interventions/beneficiaries/7/report-not-received/', 'crop report url')
eq(FOLLOW_UP.fisheries.resolveUrl(7), '/interventions/fisherfolk-beneficiaries/7/mark-resolved/', 'fisheries resolve url')
eq(FOLLOW_UP.fisheries.reportUrl(7), '/interventions/fisherfolk-beneficiaries/7/report-not-received/', 'fisheries report url')
eq(FOLLOW_UP.crop.draftKey('resolve', 7), 'crop-assistance-resolve:7', 'the drafts keep their old keys (crop)')
eq(FOLLOW_UP.fisheries.draftKey('not-received', 7), 'fisheries-assistance-not-received:7', 'the drafts keep their old keys (fisheries)')
eq(followUpFor('crop').recipientName({ farmer_full_name: 'Ana Cruz' }), 'Ana Cruz', 'crop recipient')
eq(followUpFor('fisheries').recipientName({ fisherfolk_full_name: 'Ben Reyes' }), 'Ben Reyes', 'fisheries recipient')
eq(followUpFor('nope'), followUpFor('crop'), 'an unknown domain falls back to crop')

// ── one copy of each window
const modals = read('src/pages/AssistanceManagement/AssistanceFollowUpModals.jsx')
for (const name of ['MarkResolvedModal', 'ReportNotReceivedModal']) ok(modals.includes(`export function ${name}`), `${name} lives in the shared file`)
const crop = read('src/pages/AssistanceManagement/CropAssistancePage.jsx')
const fish = read('src/pages/AssistanceManagement/FisheriesAssistancePage.jsx')
for (const [name, src] of [['crop page', crop], ['fisheries page', fish]]) {
  ok(!/function MarkResolvedModal|function ReportNotReceivedModal/.test(src), `${name} no longer writes them again`)
  ok(src.includes('AssistanceFollowUpModals.jsx'), `${name} imports the shared windows`)
  ok(src.includes('AssistanceEditSections'), `${name}: Edit Assistance Record draws the shared sections`)
  ok(!src.includes('rounded-lg border border-[#C8D5C8] px-4 py-2'), `${name}: no hand-styled buttons`)
}

// ── table forms
const sections = read('src/pages/AssistanceManagement/AssistanceEditSections.jsx')
for (const title of ['Assistance Details', 'Notes']) ok(sections.includes(`title="${title}"`), `edit section ${title}`)
for (const label of ['Assistance Type', 'Date Given', 'Source Agency']) ok(sections.includes(`label="${label}"`), `edit field ${label}`)
ok(sections.includes('export function DangerZone'), 'one Danger Zone for both pages')
ok(/FormSection/.test(modals) && /label="Follow-up Notes"/.test(modals) && /label="Reason"/.test(modals), 'follow-up windows are table forms')
ok(read('src/pages/AssistanceManagement/AssistanceViewDialog.jsx').includes('DetailTable'), 'the view window is a DetailTable')
ok(read('src/pages/AssistanceManagement/ConfirmReceivedDialog.jsx').includes('DetailTable'), 'Confirm Received (fisherfolk) shows the assistance in a table')
ok(/<DetailTable/.test(crop) || /FormSection/.test(crop), 'Confirm Received (farmer) is a table form')
ok(!/(overflow-hidden)/.test(read('src/components/UI/FormTable.jsx').split('export function FormRows')[0].split('export function FormSection')[1]), 'a section does not clip a drop-down list')

console.log(`assistanceWindows: ${n} checks passed`)
