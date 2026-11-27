// A cooperative's own list for giving assistance holds its current members only: someone whose membership ended is not offered
// (the server refuses them too, interventions/test_former_members.py). No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const domains = read('../src/pages/AssistanceManagement/distributionDomains.js')

const loaders = domains.split('\n').filter((line) => line.includes('loadOwnMembers:'))
assert.equal(loaders.length, 2, 'one for farmers and one for fisherfolk')
for (const line of loaders) assert.ok(line.includes('active_only: 1'), `asks for current members only: ${line.trim()}`)

const page = read('../src/pages/Account/MyOrgAssistancePage.jsx')
assert.ok(page.includes('memberUrl={config.memberSearchUrl(orgId)}'), "the cooperative's window still lists through that loader")

console.log('former members: all checks passed')
