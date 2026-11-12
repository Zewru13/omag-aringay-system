// The organization page's small windows (Add Member, Choose Main Organization, Assign Officer, End Term Early, Add Equipment) are table forms.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const src = readFileSync(new URL('../src/pages/Organizations/OrganizationDetailPage.jsx', import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// the text of one window: from its function to the next top-level function
const windowOf = (name) => {
  const start = src.indexOf(`function ${name}(`)
  assert.ok(start >= 0, `${name} exists`)
  const rest = src.slice(start + 10)
  const next = rest.search(/\n(?:export default )?function [A-Z]/)
  return next < 0 ? src.slice(start) : src.slice(start, start + 10 + next)
}

ok(src.includes("from '../../components/UI/FormTable.jsx'") || src.includes('from "../../components/UI/FormTable.jsx"'), 'the page uses the shared table form')

const forms = {
  AddMemberModal: { sections: ['Member'], labels: ['Search', 'Position', 'Date Joined'] },
  AssignOfficerModal: { sections: ['Officer'], labels: ['Position', 'Member'] },
  EndTermModal: { sections: ['Officer', 'Term'], labels: ['Reason'] },
  AddEquipmentModal: { sections: ['Equipment'], labels: ['Equipment Name', 'Quantity', 'Acquisition Date', 'Remarks'] },
}
for (const [name, want] of Object.entries(forms)) {
  const text = windowOf(name)
  for (const title of want.sections) ok(text.includes(`title="${title}"`), `${name}: section ${title}`)
  for (const label of want.labels) ok(text.includes(`label="${label}"`) || text.includes(`label={`) && text.includes(label), `${name}: field ${label}`)
  ok(/<FormCell /.test(text), `${name} draws FormCell rows`)
  ok(!/labelCls/.test(text), `${name} has no hand-made labels`)
  ok(text.includes('variant="outline"') && !text.includes('variant="secondary"'), `${name}: Cancel is the outline button`)
}
const main = windowOf('AddMemberModal')
ok(main.includes('Choose Main Organization') && /DetailTable|FormSection/.test(main), 'Choose Main Organization shows its facts in a table')
ok(!/absolute z-50 mt-1 w-full/.test(windowOf('MemberSearchInput')), 'the member list is in the flow, so a table section does not clip it')

console.log(`orgDetailForms: ${n} checks passed`)
