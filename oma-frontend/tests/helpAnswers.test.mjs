import assert from 'node:assert/strict'
import fs from 'node:fs'

// The Help answers of the farmer, fisherfolk and organization accounts name only the pages and buttons they have now.
const { HELP } = await import(new URL('../src/pages/Account/helpAnswers.js', import.meta.url).href)
let n = 0
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')
const textOf = (help) => help.faq.map((f) => `${f.q} ${f.a}`).join(' ')

const NEEDS = {
  farmer: ['Crops', 'Log activity', 'Record harvest', 'Report a disaster', 'Received', 'Not received', 'More', 'To do today', 'My profile'],
  fisherfolk: ['Cycles', 'Log activity', 'Feeding Log', 'Health Log', 'Start a cycle', 'Details', 'Record harvest', 'Report a disaster', 'More'],
  org: ['Members', 'Equipment', 'Loans', 'Officers', 'More', 'Distribute assistance', 'Confirm for members', 'Approve', 'Mark returned', 'Organization profile'],
}
const GONE = {
  farmer: ['Crop Monitoring', 'Open crop', 'Log Disaster', 'Disaster history', 'My Profile', 'Assistance Received'],
  fisherfolk: ['Fisheries Monitoring', 'View Cycle', 'Log Disaster', 'My Logged Disasters', 'fishing-net', 'My Profile'],
  org: ['My Organization', 'Borrowed tab', 'Borrowed History', 'Distribute to Individual', 'Distribute to All Members', 'Confirmed for Members', 'My Profile'],
}
for (const kind of ['farmer', 'fisherfolk', 'org']) {
  const help = HELP[kind]
  ok(help && help.title === 'Help' && help.faq.length >= 5, `${kind}: a Help page with its questions`)
  const text = textOf(help)
  for (const word of NEEDS[kind]) ok(text.includes(word), `${kind}: the answers name ${word}`)
  for (const word of GONE[kind]) ok(!text.includes(word), `${kind}: no answer names "${word}", which is gone`)
  ok(help.faq.every((f) => f.key && f.q.endsWith('?') && f.a.length > 20), `${kind}: every question has an answer`)
  ok(!/\bplease\b|successfully/i.test(text), `${kind}: plain words`)
  for (const key of ['contactOfficeValue', 'contactAddressValue', 'contactPhoneValue', 'contactHoursValue']) ok(help[key] === 'To be confirmed by the office', `${kind}: ${key} is marked as not confirmed yet`)
  ok(help.behaviorRequestLabel === 'Request change' && help.behaviorInstantLabel === 'Edit' && help.behaviorReadonlyLabel === 'Fixed', `${kind}: the profile words are the profile's`)
}
for (const [file, kind] of [['FarmerAccountPages.jsx', 'farmer'], ['FisherfolkAccountPages.jsx', 'fisherfolk'], ['OrgAccountPages.jsx', 'org']]) {
  const src = read(`../src/pages/Citizen/${file}`)
  ok(src.includes(`HELP.${kind}`) && !/_HELP_EN = \{/.test(src), `${file}: the Help page reads the shared answers`)
}
console.log(`ok - ${n} assertions`)
