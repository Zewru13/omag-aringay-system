import assert from 'node:assert/strict'

const { buildPhoneTabs } = await import(new URL('../src/components/Layout/staffPhoneNav.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const g = (key) => ({ key, label: key, items: [{ to: `/${key}`, label: key }] })
const sidebar = {
  dashboard: { to: '/dashboard', label: 'Dashboard' },
  groups: ['registration', 'organization-management', 'crop-management', 'fisheries-management', 'forecasting', 'assistance-management'].map(g),
  disaster: g('disaster'),
  reports: g('reports'),
  admin: { ...g('admin'), adminOnly: true },
}
const keysOf = (tab) => tab.groups.map((x) => x.key)

const admin = buildPhoneTabs({ ...sidebar, isAdmin: true })
eq(admin.map((t) => t.key), ['home', 'registry', 'monitoring', 'assistance', 'more'], 'five tabs, in this order')
eq(admin[0].leaf.to, '/dashboard', 'Home goes straight to the dashboard')
eq(keysOf(admin[1]), ['registration', 'organization-management'], 'Registry holds registration and organizations')
eq(keysOf(admin[2]), ['crop-management', 'fisheries-management', 'forecasting'], 'Monitoring holds crop, fisheries and forecasting')
eq(keysOf(admin[3]), ['assistance-management', 'disaster'], 'Assistance holds assistance and disaster')
eq(keysOf(admin[4]), ['reports', 'admin'], 'More holds reports and the admin section')

// a focal person never gets the admin section
const focal = buildPhoneTabs({ ...sidebar, isAdmin: false })
eq(keysOf(focal[4]), ['reports'], 'no admin section for a focal person')

// nothing the sidebar offers is lost or listed twice
const all = admin.flatMap((t) => (t.groups || [])).map((x) => x.key).sort()
eq(all, [...sidebar.groups.map((x) => x.key), 'disaster', 'reports', 'admin'].sort(), 'every sidebar group appears exactly once')

// a group the sidebar no longer has is skipped rather than breaking the menu
const trimmed = buildPhoneTabs({ ...sidebar, groups: sidebar.groups.filter((x) => x.key !== 'forecasting'), isAdmin: true })
eq(keysOf(trimmed[2]), ['crop-management', 'fisheries-management'], 'a missing group is skipped')

console.log(`staffPhoneNav: ${n} checks passed`)
