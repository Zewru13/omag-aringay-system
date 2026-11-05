import assert from 'node:assert/strict'
import fs from 'node:fs'

// Start Production Cycle: the Organization follows the selected fisherfolk's organization membership.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const { organizationChoice, organizationPlaceholder, organizationHint } = await import(new URL('../src/pages/Monitoring/cycleOrganization.js', import.meta.url).href)

// ── which organization is filled in by itself: the only one; with none or several the Admin decides
eq(organizationChoice([{ id: 7, name: 'Samara Fishers' }]), '7', 'one membership: that organization')
eq(organizationChoice([]), '', 'no membership: blank')
eq(organizationChoice([{ id: 7 }, { id: 9 }]), '', 'several memberships: the Admin chooses')
eq(organizationChoice(undefined), '', 'nothing loaded')
eq(organizationChoice(null), '', 'null')

// ── what the box says while it is empty
eq(organizationPlaceholder({ hasFisherfolk: false, loading: false, count: 0 }), 'Select Fisherfolk first', 'no fisherfolk yet')
eq(organizationPlaceholder({ hasFisherfolk: true, loading: true, count: 0 }), 'Loading organizations…', 'loading')
eq(organizationPlaceholder({ hasFisherfolk: true, loading: false, count: 0 }), 'No registered organizations', 'not a member of any')
eq(organizationPlaceholder({ hasFisherfolk: true, loading: false, count: 1 }), 'Select Organization', 'one')
eq(organizationPlaceholder({ hasFisherfolk: true, loading: false, count: 3 }), 'Select Organization', 'several')

// ── the line under the box
eq(organizationHint(2), 'This fisherfolk belongs to 2 organizations - choose the one for this cycle.', 'several')
eq(organizationHint(1), '', 'one: nothing to say')
eq(organizationHint(0), '', 'none: nothing to say')

// ── the form uses them, reads the memberships, and still sends the organization with the cycle
const form = fs.readFileSync(new URL('../src/pages/Monitoring/StartProductionCycleModal.jsx', import.meta.url), 'utf8')
eq(form.includes("/organizations/fisherfolk/"), true, 'the fisherfolk\'s own organizations are read from the existing endpoint')
eq(form.includes('organizationChoice('), true, 'the single organization is filled in')
eq(form.includes('organizationHint('), true, 'several memberships get the choose-one note')
eq(form.includes('organization: form.organization ? Number(form.organization) : null'), true, 'the chosen organization is sent with the cycle')
eq(form.includes('keepOrganization'), true, 'a restored draft keeps its own organization')

console.log(`ok - ${n} assertions`)
