import assert from 'node:assert/strict'

const { registeredReportParams, registeredReportUrl } = await import(new URL('../src/utils/registeredReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// nothing filtered: just the kind
eq(registeredReportParams('farmers', {}), { kind: 'farmers' }, 'no filters')
eq(registeredReportParams('farmers', { search: '  ', gender: 'all', farmerType: 'all', barangay: '' }), { kind: 'farmers' }, 'blank and "all" are left out')

// the farmer table's filters become the report's
eq(registeredReportParams('farmers', {
  search: ' Maria ', gender: 'Female', farmerType: 'true', seniorOnly: true, filterICC: true, filterPWD: true, barangay: 'Alaska', registeredFrom: '2026-01-01', registeredTo: '2026-06-30',
}), {
  kind: 'farmers', search: 'Maria', gender: 'Female', is_farm_laborer: 'true', is_senior: 'true', is_icc_ip: 'true', is_pwd: 'true', barangay: 'Alaska', registered_from: '2026-01-01', registered_to: '2026-06-30',
}, 'every farmer filter')
eq(registeredReportParams('farmers', { farmerType: 'false' }).is_farm_laborer, 'false', 'Farm Operator')

// the fisherfolk table's
eq(registeredReportParams('fisherfolk', { gender: 'Male', typeFilter: 'Capture', seniorOnly: true, filterPWD: true, filter4Ps: true, barangay: 'Basca' }), {
  kind: 'fisherfolk', gender: 'Male', fisherfolk_type: 'Capture', is_senior: 'true', is_pwd: 'true', is_4ps: 'true', barangay: 'Basca',
}, 'every fisherfolk filter')

// an unticked box is not "false": it is no filter
eq(registeredReportParams('farmers', { seniorOnly: false, filterICC: false, filterPWD: false }), { kind: 'farmers' }, 'unticked boxes add nothing')

// organizations: only the search and barangay mean anything
eq(registeredReportParams('farmers_orgs', { search: 'Rice', barangay: 'Alaska', gender: 'Male', seniorOnly: true }), { kind: 'farmers_orgs', search: 'Rice', barangay: 'Alaska' }, 'organization filters')
eq(registeredReportParams('fisherfolk_orgs', { barangay: 'Basca' }), { kind: 'fisherfolk_orgs', barangay: 'Basca' }, 'fisherfolk organizations')
eq(registeredReportParams('farmers_orgs', { registeredFrom: '2026-02-01', registeredTo: '2026-03-31' }), { kind: 'farmers_orgs', registered_from: '2026-02-01', registered_to: '2026-03-31' }, 'organizations print by date registered')
eq(registeredReportParams('fisherfolk_orgs', { registeredTo: '2026-03-31' }), { kind: 'fisherfolk_orgs', registered_to: '2026-03-31' }, 'fisherfolk organizations, only a To')

// the PDF address
eq(registeredReportUrl('farmers', { barangay: 'Alaska' }), '/reports/registered/?format=pdf&kind=farmers&barangay=Alaska', 'the PDF url')

console.log(`registeredReport: ${n} checks passed`)
