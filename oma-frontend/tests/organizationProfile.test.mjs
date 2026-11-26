import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The organization profile (Admin / Focal Person): hero with the name, registration number and place; Organization Details and Contact cards (nothing the banner already shows); Members,
// Equipment Inventory, Confirmed for Members and Officers as View cards. An organization's own page ("My Organization") keeps its tabs.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { addressText } = await import(new URL('../src/pages/Organizations/organizationProfile.js', import.meta.url).href)
eq(addressText({ street_address: 'Purok 3', barangay: 'Alaska' }), 'Purok 3, Alaska', 'street and barangay')
eq(addressText({ barangay: 'Alaska' }), 'Alaska', 'barangay only')
eq(addressText({}), '', 'nothing')

const page = read('src/pages/Organizations/OrganizationDetailPage.jsx')
ok(/<ProfileHero/.test(page), 'the staff view opens with the hero')
ok(!/Back to Organizations/.test(page), 'no Back to Cooperatives')
ok(/title="Cooperative Details"/.test(page) && /title="Contact"/.test(page), 'Cooperative Details and Contact are InfoCards')
ok(!/label="Registration Number"|label="Registration Agency"|label="Date Registered"|label="Barangay"|label="Street Address"/.test(page), 'the registration number, agency, date registered and address are in the banner only, not repeated in a card')
for (const title of ['Members', 'Equipment Inventory', 'Confirmed for Members', 'Officers']) {
  ok(new RegExp(`<ViewSection[\\s\\S]{0,260}title="${title}"`).test(page), `${title} is a View card`)
}
ok(/const renderBody = \(section\)/.test(page) && /renderBody\(activeSection\)/.test(page), 'the section bodies are drawn by one function, for the tabs of "My Cooperative" and for the windows')
ok(/const renderActions = \(section\)/.test(page), 'the Import / Add buttons of a section are drawn by one function too')
ok(/<Tabs/.test(page) && /own \?/.test(page), 'a cooperative\'s own page keeps its tabs')
ok(/iconOnly/.test(page), 'the staff actions are icons')
ok(!/lg:sticky/.test(page), 'no sticky columns')

console.log(`organizationProfile: ${n} checks passed`)
