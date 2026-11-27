// The Audit Log page: no Model column, plain action names, and a click on an entry opens its details with who, when, what and the
// old and new values. The menu calls it Audit Log. No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const load = (p) => import(at(p).href)

const { ACTION_OPTIONS, actionLabel, actionTone, changeHeading, moreText, noDetailsText, shownValue } = await load('../src/pages/Admin/auditLog.js')

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

const page = read('../src/pages/Admin/AuditLogPage.jsx')
ok(!/Model/.test(page.replace(/ModalShell/g, '')) && !page.includes('model_name'), 'no Model column or filter')
for (const piece of ['AuditEntryWindow', 'onClick', 'onKeyDown', 'Description', 'actionLabel']) ok(page.includes(piece), `the page has ${piece}`)
const detail = read('../src/pages/Admin/AuditEntryWindow.jsx')
for (const piece of ['ModalShell', 'When', 'Who', 'Action', 'Before', 'After', 'changeHeading', 'noDetailsText', 'moreText']) ok(detail.includes(piece), `the window has ${piece}`)

for (const file of ['../src/components/Layout/Navbar.jsx', '../src/components/Layout/StaffPhoneShell.jsx']) {
  const menu = read(file)
  ok(menu.includes('Audit Log') && !menu.includes('Activity Log\n'), `${file} calls it Audit Log`)
}
ok(!/activity log/i.test(read('../src/pages/Backup/BackupGroups.jsx')), 'the backup page says Audit Log')

console.log('audit log: all checks passed')
