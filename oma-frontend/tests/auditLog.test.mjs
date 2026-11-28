// The Audit Log page: no Model column, plain action names, and a click on an entry opens its details with who, when, what and the
// old and new values. The menu calls it Audit Log. No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const load = (p) => import(at(p).href)

const {
  ACTION_OPTIONS, MODULE_OPTIONS, actionLabel, actionTone, changeHeading, historyLink, historyTarget, moreText, noDetailsText, pageNumbers,
  peopleOf, rowPerson, showingText, shownValue,
} = await load('../src/pages/Admin/auditLog.js')

const eq = (actual, expected, message) => assert.deepStrictEqual(actual, expected, message)
const ok = (value, message) => assert.ok(value, message)

// every action the server records has a name and a colour, and can be filtered on
const SERVER = ['CREATE', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'IMPORT', 'DOWNLOAD', 'SIGN_IN', 'SIGN_OUT', 'SIGN_IN_FAILED', 'BACKUP', 'RESTORE']
const server = read('../../oma_aringay/auditlog/models.py')
for (const action of SERVER) {
  ok(server.includes(`${action} = '${action}'`), `the server has ${action}`)
  ok(ACTION_OPTIONS.some((o) => o.value === action), `${action} can be filtered`)
  ok(actionLabel(action) && actionLabel(action) !== action, `${action} has a plain name`)
  ok(['green', 'blue', 'rose', 'slate'].includes(actionTone(action)), `${action} has a colour`)
}
eq(ACTION_OPTIONS[0], { label: 'All Actions', value: '' })
eq(actionLabel('SIGN_IN_FAILED'), 'Failed sign-in')
eq(actionTone('SIGN_IN_FAILED'), 'rose')
eq(actionLabel('SOMETHING_NEW'), 'SOMETHING_NEW')

eq(changeHeading({ record: 'Farmer', name: 'Pia Cruz', change: 'updated' }), 'Farmer changed: Pia Cruz')
eq(changeHeading({ record: 'Seed source', name: 'Bank', change: 'created' }), 'Seed source added: Bank')
eq(changeHeading({ record: 'Pond or cage', name: 'Pond 1', change: 'deleted' }), 'Pond or cage deleted: Pond 1')
eq(shownValue(null), '—')
eq(shownValue(''), '—')
eq(shownValue('0'), '0')
eq(moreText(1), '1 more record was changed and is not listed here.')
eq(moreText(120), '120 more records were changed and are not listed here.')
eq(moreText(0), '')
ok(/no further details/.test(noDetailsText({ details: null })), 'an older entry says so')

// the module filter offers every module the server records, in the server's order
eq(MODULE_OPTIONS[0], { label: 'All modules', value: '' })
const modulesFile = read('../../oma_aringay/auditlog/modules.py')
const named = Object.fromEntries([...modulesFile.matchAll(/^([A-Z_]+) = '([^']+)'$/gm)].map((m) => [m[1], m[2]]))
const listed = modulesFile.match(/^MODULES = \(([^)]*)\)/m)[1].split(',').map((s) => s.trim()).filter(Boolean).map((key) => named[key])
eq(listed.length, 17)
eq(MODULE_OPTIONS.slice(1), listed.map((name) => ({ label: name, value: name })))

// numbered pages: the first, the last and the neighbours of the one shown
eq(pageNumbers(1, 137), [1, 2, 3, 4, '…', 137])
eq(pageNumbers(4, 137), [1, '…', 3, 4, 5, '…', 137])
eq(pageNumbers(5, 137), [1, '…', 4, 5, 6, '…', 137])
eq(pageNumbers(137, 137), [1, '…', 134, 135, 136, 137])
eq(pageNumbers(3, 5), [1, 2, 3, 4, 5])
eq(pageNumbers(1, 1), [1])
eq(showingText(1, 10, 1363), 'Showing 1 to 10 of 1,363 entries')
eq(showingText(137, 10, 1363), 'Showing 1,361 to 1,363 of 1,363 entries')
eq(showingText(1, 10, 1), 'Showing 1 to 1 of 1 entry')

// View history: a row links only when it is about exactly one
const pia = { kind: 'farmer', id: 5, name: 'Pia' }
const noy = { kind: 'farmer', id: 6, name: 'Noy' }
eq(peopleOf({ details: { people: [pia, noy] } }), [pia, noy])
eq(peopleOf({ details: { changes: [] } }), [])
eq(peopleOf({ details: null }), [])
eq(rowPerson({ details: { people: [pia] } }), pia)
eq(rowPerson({ details: { people: [pia, noy] } }), null)
eq(rowPerson({ details: null }), null)
eq(rowPerson({ details: { people: [pia], more: 275 } }), null, 'records that are not listed may be about others: no row link')
eq(rowPerson({ details: { people: [pia], more: 0 } }), pia)
eq(rowPerson({ details: { people: [pia], more: 0, people_dropped: true } }), null, 'a restore took another link off it: it was about more than the one left')
eq(historyLink(pia), '/audit-log?tab=farmer&id=5')
eq(historyLink({ kind: 'fisherfolk', id: 2 }), '/audit-log?tab=fisherfolk&id=2')
eq(historyLink({ kind: 'farmers-cooperative', id: 3 }), '/audit-log?tab=cooperative&kind=farmers-cooperative&id=3')
const target = (query) => historyTarget(new URLSearchParams(query))
eq(target(''), { tab: 'all', kind: '', id: null })
eq(target('tab=farmer'), { tab: 'farmer', kind: '', id: null })
eq(target('tab=farmer&id=5'), { tab: 'farmer', kind: 'farmer', id: 5 })
eq(target('tab=fisherfolk&id=2'), { tab: 'fisherfolk', kind: 'fisherfolk', id: 2 })
eq(target('tab=cooperative&kind=fisherfolk-cooperative&id=3'), { tab: 'cooperative', kind: 'fisherfolk-cooperative', id: 3 })
eq(target('tab=cooperative&kind=nonsense&id=3'), { tab: 'cooperative', kind: '', id: null })
eq(target('tab=nonsense&id=abc'), { tab: 'all', kind: '', id: null })
eq(target('tab=farmer&id=-4'), { tab: 'farmer', kind: '', id: null })

const page = read('../src/pages/Admin/AuditLogPage.jsx')
for (const words of ['All Activity', 'Farmer History', 'Fisherfolk History', 'Cooperative History', 'useSearchParams']) ok(page.includes(words), `the page has ${words}`)
const activity = read('../src/pages/Admin/AuditActivityTab.jsx')
// the page layout shows no titles or subtitles, so the line is part of the tab itself
ok(/<h2[^>]*>All Activity<\/h2>\s*<p[^>]*>Every action in the system, newest first: who did it, what they did, and to whom\.<\/p>/.test(activity),
  'the list says what it is, on screen')
ok(!page.includes('subtitle='), 'no subtitle that would never be shown')
for (const file of [page, activity]) ok(!/Model/.test(file.replace(/ModalShell/g, '')) && !file.includes('model_name'), 'no Model column or filter')
for (const piece of ['AuditEntryWindow', 'onClick', 'onKeyDown', 'What Happened', 'Module', 'View history', 'NumberedPages', 'MODULE_OPTIONS',
  'ACTION_OPTIONS', 'Search a name or what happened…', 'From Date', 'To Date']) ok(activity.includes(piece), `the list has ${piece}`)
ok(!activity.includes('<StatusPill'), 'the list has no Action column')
const numbered = read('../src/pages/Admin/NumberedPages.jsx')
for (const piece of ['pageNumbers', 'showingText', 'aria-current', 'Previous', 'Next']) ok(numbered.includes(piece), `the pages have ${piece}`)
const detail = read('../src/pages/Admin/AuditEntryWindow.jsx')
for (const piece of ['ModalShell', 'When', 'Who', 'Action', 'Module', 'Before', 'After', 'changeHeading', 'noDetailsText', 'moreText', 'peopleOf', 'historyLink', 'View history']) ok(detail.includes(piece), `the window has ${piece}`)

for (const file of ['../src/components/Layout/Navbar.jsx', '../src/components/Layout/StaffPhoneShell.jsx']) {
  const menu = read(file)
  ok(menu.includes('Audit Log') && !menu.includes('Activity Log\n'), `${file} calls it Audit Log`)
}
ok(!/activity log/i.test(read('../src/pages/Backup/BackupGroups.jsx')), 'the backup page says Audit Log')

// the two date boxes keep a readable width: the shared box style is as wide as its holder, and a filter label has no width of its own
const dateBoxes = activity.split('\n').filter((line) => line.includes('type="date"'))
eq(dateBoxes.length, 2, 'From Date and To Date')
for (const line of dateBoxes) ok(line.includes('md:w-44') && line.includes('DATE_FILTER_BOX'), 'a date box has its own width on a computer and fills the row on a phone')
console.log('audit log: all checks passed')
