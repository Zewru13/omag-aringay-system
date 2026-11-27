// The Audit Log's history tabs: pick one farmer, fisherfolk or cooperative and see their history. No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const { HISTORY_TABS, pickerRows, pickerUrl } = await import(at('../src/pages/Admin/historyTabs.js').href)

const eq = (actual, expected, message) => assert.deepStrictEqual(actual, expected, message)
const ok = (value, message) => assert.ok(value, message)

eq(Object.keys(HISTORY_TABS), ['farmer', 'fisherfolk', 'cooperative'])
eq([HISTORY_TABS.farmer.title, HISTORY_TABS.farmer.intro, HISTORY_TABS.farmer.empty], [
  'Farmer History',
  'Search for a farmer to see their history: crops, harvests, disasters, assistance, farm visits and more.',
  'Pick a farmer above to see their history.'])
eq([HISTORY_TABS.fisherfolk.title, HISTORY_TABS.fisherfolk.intro, HISTORY_TABS.fisherfolk.empty], [
  'Fisherfolk History',
  'Search for a fisherfolk to see their history: ponds, cycles, harvests, fishing trips, disasters, assistance and more.',
  'Pick a fisherfolk above to see their history.'])
eq([HISTORY_TABS.cooperative.title, HISTORY_TABS.cooperative.intro, HISTORY_TABS.cooperative.empty], [
  'Cooperative History',
  'Search for a cooperative to see its history: members, officers, equipment and assistance given.',
  'Pick a cooperative above to see its history.'])
eq(HISTORY_TABS.farmer.sources, [{ url: '/farmers/', kind: 'farmer' }])
eq(HISTORY_TABS.fisherfolk.sources, [{ url: '/fisheries/fisherfolk/', kind: 'fisherfolk' }])
eq(HISTORY_TABS.cooperative.sources, [
  { url: '/organizations/farmers/', kind: 'farmers-cooperative' }, { url: '/organizations/fisherfolk/', kind: 'fisherfolk-cooperative' }])
for (const tab of Object.values(HISTORY_TABS)) ok(tab.placeholder, `${tab.title} says what to type`)

// what is typed goes in the address safely
eq(pickerUrl('/farmers/', 'Cruz, Juan & co'), '/farmers/?search=Cruz%2C+Juan+%26+co&page_size=20')

const person = { id: 1, first_name: 'Pia', last_name: 'Cruz', rsbsa_number: '01-1' }
eq(pickerRows('farmer', { results: [person] }), [{ kind: 'farmer', id: 1, name: 'Pia Cruz', note: '01-1' }])
eq(pickerRows('farmer', [person]), [{ kind: 'farmer', id: 1, name: 'Pia Cruz', note: '01-1' }])
eq(pickerRows('fisherfolk', [{ id: 2, full_name: 'Nena M. Reyes', rsbsa_number: '' }]), [{ kind: 'fisherfolk', id: 2, name: 'Nena M. Reyes', note: '' }])
eq(pickerRows('farmers-cooperative', [{ id: 3, name: 'Santa Cecilia' }]), [{ kind: 'farmers-cooperative', id: 3, name: 'Santa Cecilia', note: 'Farmers cooperative' }])
eq(pickerRows('fisherfolk-cooperative', [{ id: 4, name: 'Nets' }])[0].note, 'Fisherfolk cooperative')
eq(pickerRows('farmer', { results: Array.from({ length: 30 }, (_, i) => ({ ...person, id: i })) }).length, 20, 'at most 20 matches')
eq(pickerRows('farmer', {}), [])

const tab = read('../src/pages/Admin/AuditHistoryTab.jsx')
for (const piece of ['Date', 'What Happened', 'Module', 'NumberedPages', 'phoneTitleKey', 'historyLink', 'Pick another', 'Nothing recorded yet.',
  '/auditlog/history/', 'response?.data?.detail']) ok(tab.includes(piece), `the history tab has ${piece}`)
const page = read('../src/pages/Admin/AuditLogPage.jsx')
ok(page.includes('<AuditHistoryTab'), 'the page shows the history tabs')

console.log('audit history: all checks passed')
