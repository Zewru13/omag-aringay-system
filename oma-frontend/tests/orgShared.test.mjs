import assert from 'node:assert/strict'
import fs from 'node:fs'

// Step 4's shared pieces: the record list's tick boxes, the kit's tab row, and the organization windows made importable.
const { selectionState } = await import(new URL('../src/pages/Account/recordList.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const rows = [{ id: 1 }, { id: 2 }, { id: 3, locked: true }]
const canSelect = (r) => !r.locked
eq(selectionState(rows, new Set(), canSelect), { all: false, some: false }, 'nothing ticked')
eq(selectionState(rows, new Set([1, 2]), canSelect), { all: true, some: true }, 'every row that can be ticked is ticked')
eq(selectionState(rows, new Set([1]), canSelect), { all: false, some: true }, 'one of two')
eq(selectionState([], new Set(), canSelect), { all: false, some: false }, 'no rows')
eq(selectionState([{ id: 3, locked: true }], new Set(), canSelect), { all: false, some: false }, 'no row can be ticked')
eq(selectionState(rows, new Set([1, 2])), { all: false, some: true }, 'without a rule every row counts')

const list = read('../src/pages/Account/RecordList.jsx')
ok(list.includes('selectable') && list.includes('type="checkbox"') && list.includes('aria-label={selectable.label(row)}'), 'a tick box per row, named after the row')
ok(list.includes('aria-label="Select every row"'), 'a header box ticks every row on a computer')
const tabs = read('../src/pages/Account/TabBar.jsx')
ok(tabs.includes('role="tablist"') && tabs.includes('role="tab"') && tabs.includes('aria-selected') && tabs.includes('min-h-[44px]'), 'the tab row is a real tab list, easy to tap')
const org = read('../src/pages/Organizations/OrganizationDetailPage.jsx')
for (const name of ['AddMemberModal', 'AssignOfficerModal', 'EndTermModal', 'OfficerHistoryModal', 'AddEquipmentModal']) {
  ok(new RegExp(`export function ${name}\\(`).test(org), `${name} can be imported`)
}
console.log(`ok - ${n} assertions`)
