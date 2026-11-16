import assert from 'node:assert/strict'
import fs from 'node:fs'

// An organization account's Equipment page: what it owns (Items) and what is lent (Loans).
const { equipmentRows, conditionText, LOAN_SECTIONS, loanActions, loanStatusText, loanTone, sortLoans, loanText } =
  await import(new URL('../src/pages/Account/orgEquipment.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// ── items: one row per kind of equipment
const lines = [
  { id: 1, equipment_name: 'Hand Tractor', condition: 'Good', quantity: 4, on_loan: 1, available: 3 },
  { id: 2, equipment_name: 'Rice Thresher', condition: 'Broken', quantity: 2, on_loan: 0, available: 0 },
  { id: 3, equipment_name: 'Hand Tractor', condition: 'Broken', quantity: 1, on_loan: 0, available: 0 },
]
const rows = equipmentRows(lines)
eq(rows.map((r) => [r.label, r.total, r.onLoan, r.available]), [['Hand Tractor', 5, 1, 3], ['Rice Thresher', 2, 0, 0]], 'the same equipment in two conditions is one row')
eq(rows.map(conditionText), ['4 Good, 1 Broken', '2 Broken'], 'its units by condition')
eq(rows[0].lines.map((l) => l.id), [1, 3], 'its lines, Good first')
eq(equipmentRows([]), [], 'nothing owned')

// ── loans: requests, then what is out, then what came back
eq(LOAN_SECTIONS.map((s) => s.label), ['Requests', 'On loan', 'Returned'], 'three sections')
const sectionOf = (loan) => LOAN_SECTIONS.filter((s) => s.match(loan)).map((s) => s.label)
const STATES = ['REQUESTED', 'BORROWED', 'RETURN_PENDING', 'RETURNED', 'REJECTED', 'CANCELLED', 'ODD']
eq(STATES.map((status) => sectionOf({ status })), [['Requests'], ['On loan'], ['On loan'], ['Returned'], ['Returned'], ['Returned'], ['Returned']], 'every loan has one section')

const labels = (loan) => loanActions(loan).map((a) => [a.label, a.kind, Boolean(a.primary)])
eq(labels({ status: 'REQUESTED' }), [['Approve', 'approve', true], ['Reject', 'reject', false]], 'a request: approve or reject')
eq(labels({ status: 'BORROWED' }), [['Mark returned', 'return', true]], 'out: mark returned')
eq(labels({ status: 'RETURN_PENDING' }), [['Mark returned', 'return', true]], 'the member said it is back: confirm it')
for (const status of ['RETURNED', 'REJECTED', 'CANCELLED']) eq(labels({ status }), [], `${status}: nothing to do`)

eq(STATES.map((status) => loanStatusText({ status })), ['Requested', 'On loan', 'Return to confirm', 'Returned', 'Rejected', 'Cancelled', 'ODD'], 'the status in plain words')
eq(loanStatusText({ status: 'BORROWED', overdue: true }), 'Overdue', 'past its return date')
eq(STATES.map((status) => loanTone({ status })), ['amber', 'green', 'amber', 'grey', 'grey', 'grey', 'grey'], 'the badge tone')
eq(loanTone({ status: 'BORROWED', overdue: true }), 'red', 'overdue is a problem')

const loans = [
  { id: 1, status: 'BORROWED', borrowed_at: '2026-10-01' },
  { id: 2, status: 'BORROWED', overdue: true, borrowed_at: '2026-09-01' },
  { id: 3, status: 'REQUESTED', requested_at: '2026-11-10T08:00:00Z' },
  { id: 4, status: 'REQUESTED', requested_at: '2026-11-12T08:00:00Z' },
  { id: 5, status: 'BORROWED', borrowed_at: '2026-11-01' },
]
eq(sortLoans(loans).map((l) => l.id), [2, 4, 3, 5, 1], 'overdue first, then the newest (by the date it was asked for, lent or returned)')
const text = loanText({ equipment_name: 'Hand Tractor', member_name: 'Eduardo Ramos' })
ok(text.includes('Hand Tractor') && text.includes('Eduardo Ramos'), 'the search reads the equipment and the borrower')

// ── the screen
const page = read('../src/pages/Account/MyOrgEquipmentPage.jsx')
for (const piece of ['TabBar', 'RecordList', 'EquipmentGroupBody', 'LendEquipmentForm', 'AddEquipmentModal', 'ImportFileModal', 'RejectDialog', 'ReturnDialog', '/approve/', 'ChangeConditionDialog', 'RepairDialog', 'LendDialog', 'EquipmentHistoryDialog', 'ConfirmDialog', 'equipment-loans/', 'openRequestCount', 'Add equipment', 'Lend equipment', 'Import', "'items'", "'loans'"]) {
  ok(page.includes(piece), `Equipment uses ${piece}`)
}
const route = read('../src/pages/Account/MyOrganizationRoute.jsx')
ok(route.includes("<MyOrgEquipmentPage tab={view.tab} />") && !page.includes("useState(initialTab)"), 'the router opens Equipment on the tab the link asked for')
console.log(`ok - ${n} assertions`)
