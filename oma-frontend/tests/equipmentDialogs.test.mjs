// The organization equipment dialogs (change condition, repair, lend, return, reject, history) and the details of the Distribute Assistance
// window are table forms.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

const src = read('src/pages/Organizations/EquipmentActionDialogs.jsx')
const windowOf = (name) => {
  const start = src.indexOf(`export function ${name}(`)
  assert.ok(start >= 0, `${name} exists`)
  const rest = src.slice(start + 10)
  const next = rest.search(/\nexport function [A-Z]/)
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next)
}

ok(src.includes('FormTable.jsx'), 'the dialogs use the shared table form')
ok(!/const LABEL =/.test(src), 'no hand-made label style left')
ok(!src.includes('mb-1 block text-[12px]'), 'no hand-made labels')

const forms = {
  ChangeConditionDialog: ['How Many Units', 'New Condition'],
  RepairDialog: ['Units Repaired', 'Date Repaired', 'What Was Done', 'Cost'],
  LendDialog: ['Member', 'Return By'],
  ReturnDialog: ['How Damaged'],
  RejectDialog: ['Reason'],
}
for (const [name, labels] of Object.entries(forms)) {
  const text = windowOf(name)
  ok(/<FormSection/.test(text), `${name} is a table form`)
  for (const label of labels) ok(text.includes(`label="${label}`) || text.includes(`'${label}'`), `${name}: field ${label}`)
}
ok(windowOf('ReturnDialog').includes('data-testid="breakdown-message"'), 'the return message keeps its test id')
ok(/<ModalShell[^>]*maxWidth="max-w-2xl"/.test(src.slice(src.indexOf('export function ActionForm'), src.indexOf('// A "how many units"'))), 'the action windows are wide enough for the table')

// the history is two tables
const history = windowOf('EquipmentHistoryDialog')
ok(history.includes('EntryTable') && history.includes('EntryHead'), 'History lists repairs and loans in tables')
for (const heading of ['Date', 'Units', 'What Was Done', 'Member', 'Status']) ok(history.includes(`>${heading}</EntryTh>`), `History column ${heading}`)

// Distribute Assistance: the details are a table form
const details = read('src/pages/AssistanceManagement/AssistanceDetailsFields.jsx')
ok(/<FormSection title="Assistance Details"/.test(details), 'Assistance Details is a table section')
for (const label of ['Assistance Type', 'Source Agency', 'Distribution Date', 'Description']) ok(details.includes(`label="${label}"`), `details field ${label}`)
ok(!details.includes('pillLabel'), 'no stand-alone pill labels in the table form')

ok(read('src/pages/AssistanceManagement/DistributeAssistanceModal.jsx').includes('<FormSection title={people'), 'the recipients table is a section like the details')

console.log(`equipmentDialogs: ${n} checks passed`)
