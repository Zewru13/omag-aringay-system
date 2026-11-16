import assert from 'node:assert/strict'
import fs from 'node:fs'

// An organization account's own pages: which page /my-organization shows, the farmers / fisherfolk differences, members and officers.
const { orgDomain, orgView, MEMBER_SECTIONS, memberText, officerRows } = await import(new URL('../src/pages/Account/myOrganization.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

// ── /my-organization?tab=… : every link that exists today opens the right page
eq(orgView(''), { page: 'members' }, 'no tab: Members')
eq(orgView('?tab=members'), { page: 'members' }, 'members')
eq(orgView('?tab=equipment'), { page: 'equipment', tab: 'items' }, 'equipment: Items')
eq(orgView('?tab=borrowed'), { page: 'equipment', tab: 'loans' }, 'borrowed (the bell links here): Loans')
eq(orgView('?tab=borrowed-history'), { page: 'equipment', tab: 'loans' }, 'borrowed history: Loans')
eq(orgView('?tab=officers'), { page: 'officers' }, 'officers')
eq(orgView('?tab=confirmed'), { page: 'assistance-confirm' }, 'confirmed for members moved to Assistance')
eq(orgView('?tab=nonsense'), { page: 'members' }, 'an unknown tab: Members')

// ── the two kinds of organization
const farm = orgDomain('orgFarm')
const fish = orgDomain('orgFish')
eq([farm.type, farm.nameField, farm.idField, farm.personField, farm.assistancePath], ['farmers', 'farmer_full_name', 'farmer_rsbsa_number', 'farmer', '/crop-assistance'], 'a farmers organization')
eq([fish.type, fish.nameField, fish.idField, fish.personField, fish.assistancePath], ['fisherfolk', 'fisherfolk_full_name', 'fisherfolk_rsbsa_number', 'fisherfolk', '/fisheries-assistance'], 'a fisherfolk organization')
eq([farm.personLabel, fish.personLabel], ['farmers', 'fisherfolk'], 'who its members are')

// ── members
eq(MEMBER_SECTIONS.map((s) => s.label), ['Active', 'Inactive'], 'two sections')
const sectionOf = (m) => MEMBER_SECTIONS.find((s) => s.match(m)).label
eq([sectionOf({ is_active: true }), sectionOf({}), sectionOf({ is_active: false })], ['Active', 'Active', 'Inactive'], 'only a member marked inactive is inactive')
const text = memberText({ farmer_full_name: 'Lourdes Villanueva', farmer_rsbsa_number: 'DEMO-0010', position: 'Treasurer' }, farm)
for (const word of ['Lourdes Villanueva', 'DEMO-0010', 'Treasurer']) ok(text.includes(word), `the search reads ${word}`)

// ── officers
const org = {
  officers: [
    { id: 3, full_name: 'Cely Padua', position: 'Auditor', is_member: true },
    { id: 1, full_name: 'Carlos Mendoza', position: 'President', is_member: false },
    { id: 2, full_name: 'Alma Jimenez', position: 'Secretary' },
    { id: 9, full_name: 'Old One', position: 'Manager', is_active: false },
  ],
}
eq(officerRows(org).map((o) => o.position), ['President', 'Secretary', 'Auditor'], 'current officers, in the order of the positions')
eq(officerRows(org).map((o) => o.memberText), ['Not a member', 'Yes', 'Yes'], 'an officer who is not a member says so')
eq(officerRows({}), [], 'no officers')

// ── the screens
const members = read('../src/pages/Account/MyMembersPage.jsx')
for (const piece of ['RecordList', 'ListTools', 'AddMemberModal', 'ImportFileModal', 'Add member', 'Import', 'MEMBER_SECTIONS', 'useMyOrganization', 'onRetry=']) {
  ok(members.includes(piece), `Members uses ${piece}`)
}
const route = read('../src/pages/Account/MyOrganizationRoute.jsx')
ok(route.includes('<Navigate') && route.includes('?tab=confirm') && route.includes('MyMembersPage'), 'the router shows Members and sends confirmed to Assistance')
const hook = read('../src/pages/Account/useMyOrganization.js')
ok(hook.includes('/organizations/${domain.type}/${id}/') && hook.includes("'failed'"), 'one loader for the organization, which can fail')
const officers = read('../src/pages/Account/MyOfficersPage.jsx')
for (const piece of ['RecordList', 'officerRows', 'AssignOfficerModal', 'EndTermModal', 'OfficerHistoryModal', 'Assign officer', 'Officer history', 'End term early', 'useMyOrganization', 'onRetry=']) {
  ok(officers.includes(piece), `Officers uses ${piece}`)
}
ok(route.includes('<MyOfficersPage />') && !route.includes('OrganizationDetailPage'), 'the router shows Officers too; the old page is no longer used for an organization account')
const app = read('../src/App.jsx')
const orgRoute = app.slice(app.indexOf('path="/my-organization"'), app.indexOf('path="/my-organization"') + 260)
ok(orgRoute.includes('<MyOrganizationRoute />') && orgRoute.includes('FISHERFOLK_ORG'), 'the address stays /my-organization')
ok(app.includes('<OrganizationDetailPage />'), 'the staff view of an organization is still there')
console.log(`ok - ${n} assertions`)
