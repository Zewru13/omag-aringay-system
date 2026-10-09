import assert from 'node:assert/strict'

const { approvalLines, waitingText, hasApproved } = await import(new URL('../src/utils/approvalStatus.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const none = { requires_both: true, status: 'PENDING', awaiting: ['ADMIN', 'EVALUATOR'], admin_approved_by_name: null, admin_approved_at: null, focal_approved_by_name: null, focal_approved_at: null }
eq(approvalLines(none), [
  { role: 'Admin', done: false, by: '', at: null },
  { role: 'Focal Person', done: false, by: '', at: null },
], 'nothing approved: two pending lines')
eq(waitingText(none), 'Waiting for approval from the Admin and the Focal Person', 'waiting for both')

const adminDone = { ...none, awaiting: ['EVALUATOR'], admin_approved_by_name: 'Ana Admin', admin_approved_at: '2026-10-07T08:00:00Z' }
eq(approvalLines(adminDone)[0], { role: 'Admin', done: true, by: 'Ana Admin', at: '2026-10-07T08:00:00Z' }, 'Admin line done')
eq(approvalLines(adminDone)[1].done, false, 'Focal line pending')
eq(waitingText(adminDone), 'Waiting for approval from the Focal Person', 'waiting for the Focal Person only')

const focalDone = { ...none, awaiting: ['ADMIN'], focal_approved_by_name: 'Fe Focal', focal_approved_at: '2026-10-07T09:00:00Z' }
eq(waitingText(focalDone), 'Waiting for approval from the Admin', 'waiting for the Admin only')

const approved = { ...adminDone, status: 'APPROVED', awaiting: [], focal_approved_by_name: 'Fe Focal', focal_approved_at: '2026-10-07T09:00:00Z' }
eq(approvalLines(approved).map((l) => l.done), [true, true], 'both lines done once approved')

const plain = { requires_both: false, status: 'PENDING', awaiting: [] }
eq(approvalLines(plain), [], 'plain request has no lines')
eq(waitingText(plain), 'Pending review', 'plain request text')

eq([hasApproved(adminDone, 'ADMIN'), hasApproved(adminDone, 'EVALUATOR')], [true, false], 'hasApproved per role')
eq([hasApproved(plain, 'ADMIN'), hasApproved(adminDone, 'CITIZEN'), hasApproved(adminDone, undefined)], [false, false, false], 'hasApproved false for plain requests and unknown roles')

eq(approvalLines({}), [], 'missing fields tolerated (lines)')
eq(waitingText({}), 'Pending review', 'missing fields tolerated (text)')
eq(hasApproved({}, 'ADMIN'), false, 'missing fields tolerated (hasApproved)')
eq(hasApproved(null, 'ADMIN'), false, 'null request tolerated')

console.log(`ok - ${n} assertions`)
