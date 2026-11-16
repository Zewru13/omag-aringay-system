import assert from 'node:assert/strict'
import fs from 'node:fs'

// One profile for farmer, fisherfolk and organization accounts: which details show, what each row's button does, and requests waiting.
const { profileSections, pendingByField, approvalText, profileHeader } = await import(new URL('../src/pages/Account/profileFields.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const brief = (sections) => sections.map((s) => [s.title, s.rows.map((r) => [r.label, r.mode, r.value ?? null])])

// ── a farmer
const farmer = {
  first_name: 'Lourdes', middle_name: '', last_name: 'Villanueva', label: 'Lourdes Villanueva', barangay: 'Santa Cecilia', contact_number: '',
  rsbsa_number: 'DEMO-0010', birthdate: '1995-10-10', civil_status: 'Widowed', highest_education: 'Unspecified', is_pwd: true, is_4ps_beneficiary: false,
  organization_names: ['Santa Cecilia Progressive Farmers'],
}
eq(brief(profileSections('farmer', farmer, {})), [
  ['About you', [['Full name', 'request', 'Lourdes Villanueva'], ['Barangay', 'request', 'Santa Cecilia'], ['Contact number', 'edit', null]]],
  ['Your record', [['RSBSA number', 'fixed', 'DEMO-0010'], ['Date of birth', 'fixed', 'Oct 10, 2026'.replace('2026', '1995')], ['Civil status', 'fixed', 'Widowed'], ['Organization', 'fixed', 'Santa Cecilia Progressive Farmers'], ['Also listed as', 'fixed', 'PWD']]],
], 'a farmer: what they can change, then their record; "Unspecified" education is left out, a blank contact number stays')
eq(profileSections('farmer', farmer, {})[0].rows[0].fields, ['first_name', 'middle_name', 'last_name'], 'the full name is requested as its three parts')
eq(profileSections('farmer', { ...farmer, organization_names: [] }, {})[1].rows.find((r) => r.label === 'Organization').value, 'Not a member of any organization', 'no organization says so')

// ── a fisherfolk: the same, with the FishR number and type
const fisher = { ...farmer, fishr_number: 'FR-77', fisherfolk_type: 'Fish farmer', is_pwd: false, is_4ps_beneficiary: true, organization_names: [] }
const fishRecord = profileSections('fisherfolk', fisher, {})[1].rows.map((r) => r.label)
eq(fishRecord, ['RSBSA number', 'FishR number', 'Type', 'Date of birth', 'Civil status', 'Organization', 'Also listed as'], 'a fisherfolk also sees the FishR number and type')
eq(profileSections('fisherfolk', fisher, {})[1].rows.at(-1).value, '4Ps beneficiary', '4Ps')

// ── an organization
const org = {
  name: 'Alaska Growers', label: 'Alaska Growers', barangay: 'Alaska', street_address: '', email_address: 'a@b.test', contact_person: 'Ana', contact_number: '0917',
  registration_number: 'REG-1', registration_agency: 'CDA', date_organized: '2018-10-13', date_registered: null,
}
eq(brief(profileSections('orgFarm', org, {})), [
  ['Organization details', [['Organization name', 'request', 'Alaska Growers'], ['Barangay', 'request', 'Alaska'], ['Street address', 'request', null], ['Email address', 'request', 'a@b.test'], ['Contact person', 'request', 'Ana'], ['Contact number', 'edit', '0917']]],
  ['Registration', [['Registration number', 'fixed', 'REG-1'], ['Registration agency', 'fixed', 'CDA — Cooperative Development Authority'], ['Date organized', 'fixed', 'Oct 13, 2018']]],
], 'an organization: its details (by request) and its registration (fixed, empty ones left out)')

// ── requests waiting
const requests = [
  { id: 1, field_name: 'middle_name', status: 'PENDING', requested_value: 'Cruz' },
  { id: 2, field_name: 'barangay', status: 'APPROVED', requested_value: 'Alaska' },
  { id: 3, field_name: 'name', status: 'PENDING', requires_both: true, admin_approved_at: '2026-11-07T08:00:00Z', admin_approved_by_name: 'Ana', awaiting: ['EVALUATOR'] },
]
const pending = pendingByField(requests)
eq(Object.keys(pending).sort(), ['middle_name', 'name'], 'only requests still waiting count')
eq(profileSections('farmer', farmer, pending)[0].rows[0].pending.id, 1, 'a waiting change to any part of the name holds the Full name row')
eq(profileSections('farmer', farmer, pending)[0].rows[1].pending, null, 'the barangay request was approved: nothing waits')
eq(profileSections('orgFarm', org, pending)[0].rows[0].pending.id, 3, "the organization's name waits")
eq(approvalText(requests[2]), ['Admin: approved Nov 7, 2026 (Ana)', 'Focal Person: still to approve'], 'both approvals of an organization request, in words')
eq(approvalText(requests[0]), [], 'a one-approval request has no lines')

eq(profileHeader('farmer', farmer), { name: 'Lourdes Villanueva', kind: 'Farmer', id: 'RSBSA DEMO-0010' }, 'the header of a farmer')
eq(profileHeader('orgFish', org), { name: 'Alaska Growers', kind: 'Fisherfolk organization', id: 'Registration REG-1' }, 'the header of an organization')

// ── the screen
const page = read('../src/pages/Account/AccountProfilePage.jsx')
for (const piece of ['/profile/image/', '/profile/contact-number/', '/profile/change-requests/', '/accounts/change-password/', '/accounts/me/', 'PasswordRequirementChecklist', 'Waiting for approval', 'Request a change', 'Log out', 'ProfileRow', 'Change password', 'shared organization account', 'Your change requests', 'Borrow equipment']) {
  ok(page.includes(piece), `the profile holds ${piece}`)
}
ok(!page.includes('EditLegend'), 'no colour key: each row says in words what its button does')
const row = read('../src/pages/Account/ProfileRow.jsx')
ok(row.includes('min-h-[44px]') && row.includes('Fixed') && row.includes('Lock') && row.includes('Request change') && row.includes('>Edit<'), 'a row button is easy to tap; a fixed row shows a padlock and says so')
ok(read('../src/pages/Citizen/OwnAccountPages.jsx').includes('<AccountProfilePage />'), '/my-profile shows the one profile for every account')
ok(!/className="mx-auto max-w-3xl/.test(page) && page.includes('className="max-w-3xl space-y-4"'), 'the profile column starts under the page heading, not centred away from it')
console.log(`ok - ${n} assertions`)
