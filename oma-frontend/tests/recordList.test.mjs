import assert from 'node:assert/strict'
import fs from 'node:fs'

// The account kit's record list: one column definition gives rows on a phone and a table on a computer.
const { phoneParts, groupRows, cellText } = await import(new URL('../src/pages/Account/recordList.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const columns = [
  { key: 'crop', label: 'Crop', phone: 'title' }, { key: 'area', label: 'Area (ha)', align: 'right' }, { key: 'place', label: 'Location' },
  { key: 'planted', label: 'Date planted' }, { key: 'status', label: 'Status', phone: 'badge' }, { key: 'note', label: 'Note', phone: 'hide' },
]
const parts = phoneParts(columns)
eq(parts.title.key, 'crop', 'the title column'); eq(parts.badge.key, 'status', 'the badge column')
eq(parts.lines.map((c) => c.key), ['area', 'place'], 'two detail lines at most, hidden ones never')
eq(phoneParts([{ key: 'name', label: 'Name' }, { key: 'x', label: 'X' }]).title.key, 'name', 'the first column is the title by default')
eq(phoneParts([{ key: 'name', label: 'Name' }, { key: 'x', label: 'X' }]).lines.map((c) => c.key), ['x'], 'the default title is not repeated as a line')
eq(phoneParts([{ key: 'name', label: 'Name' }]).badge, null, 'no badge column')

const rows = [{ id: 1, status: 'Planted' }, { id: 2, status: 'Harvested' }, { id: 3, status: 'Planted' }, { id: 4, status: 'Odd' }]
const sections = [{ key: 'growing', label: 'Growing', match: (r) => r.status === 'Planted' }, { key: 'ready', label: 'Ready to harvest', match: (r) => r.status === 'Near Harvest' }, { key: 'done', label: 'Harvested', match: (r) => r.status === 'Harvested' }]
eq(groupRows(rows, sections).map((g) => [g.label, g.rows.map((r) => r.id)]), [['Growing', [1, 3]], ['Harvested', [2]]], 'empty sections are left out; an unmatched row is not listed')
eq(groupRows(rows).map((g) => [g.label, g.rows.length]), [[null, 4]], 'no sections: one group')
eq(groupRows([], sections), [], 'no rows, no groups')
eq(groupRows([]), [], 'no rows and no sections, no groups')

eq(cellText({ key: 'area' }, { area: 0 }), 0, 'zero is a value'); eq(cellText({ key: 'area' }, { area: '' }), '—', 'blank is a dash')
eq(cellText({ key: 'area' }, {}), '—', 'missing is a dash'); eq(cellText({ key: 'x', render: (r) => `${r.a} ha` }, { a: 2 }), '2 ha', 'render wins')
eq(cellText({ key: 'x', render: () => null }, {}), '—', 'a render that gives nothing is a dash')

const list = read('../src/pages/Account/RecordList.jsx')
ok(list.includes('TABLE_HEAD_ROW') && list.includes('TABLE_HEAD_CELL'), 'the computer table uses the office table header')
ok(list.includes('LoadingRows') && list.includes('LoadFailed') && list.includes('EmptyNote'), 'loading, failed and empty are three different things')
ok(list.includes('md:hidden') && list.includes('hidden md:block'), 'rows on a phone, a table on a computer')
ok(list.includes('min-h-[44px]'), 'phone buttons are 44px tall')
ok(!/text-\[(9|10|11|12)(\.\d+)?px\]/.test(list.split('hidden md:block')[0]), 'no phone text under 13px')
const states = read('../src/pages/Account/ListStates.jsx')
ok(states.includes("Couldn't load") && states.includes('Try again'), 'a failure says so and offers a retry')
ok(read('../src/pages/Account/StatusBadge.jsx').includes('toneOf'), 'the badge tone comes from the one map')
ok(read('../src/pages/Account/AccountPage.jsx').includes('<h1'), 'the page has a visible heading')
console.log(`ok - ${n} assertions`)
