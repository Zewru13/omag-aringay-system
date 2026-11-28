import assert from 'node:assert/strict'

// The common questions of the farmer, fisherfolk and organization accounts name only the pages and buttons they have now.
const { HELP } = await import(new URL('../src/pages/Account/helpAnswers.js', import.meta.url).href)
let n = 0
const ok = (v, label) => { assert.ok(v, label); n++ }
const textOf = (help) => help.faq.map((f) => `${f.q} ${f.a}`).join(' ')

const NEEDS = {
  farmer: ['Crops', 'Log activity', 'Record harvest', 'Report a disaster', 'claim', 'More', 'To do today', 'My profile'],
  fisherfolk: ['Cycles', 'Log activity', 'Feeding Log', 'Health Log', 'Start a cycle', 'Details', 'Record harvest', 'Report a disaster', 'More'],
  org: ['Members', 'Equipment', 'Loans', 'Officers', 'More', 'Distribute assistance', 'claim', 'Approve', 'Mark returned', 'Cooperative profile'],
}
const GONE = {
  farmer: ['Not received', 'confirm', 'Crop Monitoring', 'Open crop', 'Log Disaster', 'Disaster history', 'My Profile', 'Assistance Received'],
  fisherfolk: ['Not received', 'confirm', 'Fisheries Monitoring', 'View Cycle', 'Log Disaster', 'My Logged Disasters', 'fishing-net', 'My Profile'],
  org: ['Confirm for members', 'waiting for a confirmation', 'proof photos', 'rganization', 'My Organization', 'Borrowed tab', 'Borrowed History', 'Distribute to Individual', 'Distribute to All Members', 'Confirmed for Members', 'My Profile'],
}
for (const kind of ['farmer', 'fisherfolk', 'org']) {
  const help = HELP[kind]
  ok(help && help.faq.length >= 5, `${kind}: its common questions`)
  const text = textOf(help)
  for (const word of NEEDS[kind]) ok(text.includes(word), `${kind}: the answers name ${word}`)
  for (const word of GONE[kind]) ok(!text.includes(word), `${kind}: no answer names "${word}", which is gone`)
  ok(help.faq.every((f) => f.key && f.q.endsWith('?') && f.a.length > 20), `${kind}: every question has an answer`)
  ok(!/\bplease\b|successfully/i.test(text), `${kind}: plain words`)
}
console.log(`ok - ${n} assertions`)
