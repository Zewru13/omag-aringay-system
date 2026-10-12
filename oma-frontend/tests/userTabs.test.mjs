import assert from 'node:assert/strict'

const { USER_TABS, tabFromParam, defaultFilters, buildUserQuery, filterCount } = await import(new URL('../src/pages/Users/userTabs.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

eq(USER_TABS.map((t) => t.id), ['staff', 'fisherfolk', 'farmers', 'organizations'], 'four separate tables')
eq(USER_TABS.map((t) => t.label), ['Staff', 'Fisherfolk', 'Farmers', 'Organizations'], 'tab labels')

// the tab named in the address, or Staff
eq(tabFromParam('farmers'), 'farmers', 'a known tab')
eq(tabFromParam('nonsense'), 'staff', 'an unknown tab falls back to staff')
eq(tabFromParam(null), 'staff', 'no tab: staff')

// staff open on Active only
eq(defaultFilters('staff'), { role: '', status: 'active', type: '' }, 'staff default: active only')
eq(defaultFilters('fisherfolk'), { role: '', status: '', type: '' }, 'other tabs have no status filter')

// what each tab asks the server for
eq(buildUserQuery('staff', defaultFilters('staff'), '', 1), { page: 1, status: 'active' }, 'staff, default')
eq(buildUserQuery('staff', { role: 'EVALUATOR', status: 'deactivated', type: '' }, 'ana', 2), { page: 2, search: 'ana', role: 'EVALUATOR', status: 'deactivated' }, 'staff, a role and Deactivated')
eq(buildUserQuery('staff', { role: '', status: 'all', type: '' }, '', 1), { page: 1, status: 'all' }, 'staff, All sends status=all')
eq(buildUserQuery('staff', { role: '', status: 'unverified', type: '' }, '', 1), { page: 1, status: 'unverified' }, 'staff, Unverified')
eq(buildUserQuery('fisherfolk', { role: '', status: '', type: 'Aquaculture' }, '', 1), { page: 1, role: 'FISHERFOLK', fisherfolk_type: 'Aquaculture' }, 'fisherfolk by type')
eq(buildUserQuery('fisherfolk', defaultFilters('fisherfolk'), '', 1), { page: 1, role: 'FISHERFOLK' }, 'fisherfolk, every type')
eq(buildUserQuery('farmers', { role: '', status: '', type: 'laborer' }, '', 1), { page: 1, role: 'FARMER', farmer_type: 'laborer' }, 'farmers: laborer')
eq(buildUserQuery('farmers', { role: '', status: '', type: 'operator' }, '', 3), { page: 3, role: 'FARMER', farmer_type: 'operator' }, 'farmers: operator')
eq(buildUserQuery('organizations', { role: '', status: '', type: 'farmers' }, '', 1), { page: 1, role: 'ORGANIZATION', organization_type: 'farmers' }, 'organizations: farmers')
eq(buildUserQuery('organizations', { role: '', status: '', type: 'fisherfolk' }, 'co', 1), { page: 1, search: 'co', role: 'ORGANIZATION', organization_type: 'fisherfolk' }, 'organizations: fisherfolk')

// the filter badge counts what differs from the tab's default
eq(filterCount('staff', defaultFilters('staff')), 0, 'staff default: no active filter')
eq(filterCount('staff', { role: 'ADMIN', status: 'active', type: '' }), 1, 'a role counts')
eq(filterCount('staff', { role: '', status: 'all', type: '' }), 1, 'changing the status counts')
eq(filterCount('farmers', { role: '', status: '', type: 'laborer' }), 1, 'a type counts')

console.log(`userTabs: ${n} checks passed`)
