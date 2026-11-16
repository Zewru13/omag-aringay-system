import assert from 'node:assert/strict'
import fs from 'node:fs'

// An organization account's Assistance page: To do, History, and Confirm for members (with what it already confirmed).
const { orgAssistanceTab, confirmReview, orgAssistanceDomain } = await import(new URL('../src/pages/Account/myOrganization.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(['', '?tab=history', '?tab=confirm', '?tab=current', '?tab=needs-follow-up', '?tab=odd'].map(orgAssistanceTab), ['todo', 'history', 'confirm', 'todo', 'todo', 'todo'], 'the tab a link opens; old words open To do')
eq(confirmReview({ latest_request_status: 'PENDING' }), { text: 'Pending review', tone: 'amber' }, 'sent to the office, waiting')
eq(confirmReview({ latest_request_status: 'REJECTED', latest_request_reason: 'Blurry photo' }), { text: 'Rejected: Blurry photo', tone: 'red' }, 'the office said no, and why')
eq(confirmReview({ latest_request_status: 'REJECTED' }), { text: 'Rejected', tone: 'red' }, 'rejected with no reason')
eq(confirmReview({}), { text: 'Needs confirmation', tone: 'amber' }, 'nothing sent yet')

const farm = orgAssistanceDomain('orgFarm')
const fish = orgAssistanceDomain('orgFish')
eq([farm.domain, farm.nameField], ['crop', 'farmer_full_name'], 'a farmers organization gives crop assistance')
eq([fish.domain, fish.nameField], ['fisheries', 'fisherfolk_full_name'], 'a fisherfolk organization gives fisheries assistance')

const page = read('../src/pages/Account/MyOrgAssistancePage.jsx')
for (const piece of ['TabBar', 'OrgDistributionHistory', 'useConfirmSelection', 'ConfirmActionBar', 'ConfirmMembersDialog', 'ConfirmedForMembersPanel', 'ChooseDistributeWindow', 'DistributeAssistanceModal', 'accountlessConfirmablesUrl', 'confirmOnBehalfBulkUrl', 'memberSearchUrl', 'fixedOrg', 'selectable=', 'isSelectable', "'To do'", "'History'", "'Confirm for members'", 'Already confirmed', 'Distribute assistance', 'onRetry=']) {
  ok(page.includes(piece), `Assistance uses ${piece}`)
}
const choose = read('../src/pages/Account/ChooseDistributeWindow.jsx')
ok(choose.includes('Give to one member') && choose.includes('Give to all members') && choose.includes('min-h-[56px]'), 'one member or all members, as big buttons')
const routes = read('../src/pages/Account/accountRoutes.jsx')
ok(routes.includes('if (isOrg) return <MyOrgAssistancePage kind="orgFarm" />'), 'a farmers organization gets its own Assistance page on /crop-assistance')
ok(routes.includes('if (isOrg) return <MyOrgAssistancePage kind="orgFish" />'), 'a fisherfolk organization on /fisheries-assistance')
console.log(`ok - ${n} assertions`)
