// A cooperative logs activities for its members without an activated account, from its Members page, in the same windows a farmer
// or fisherfolk uses for many crops or cycles. Each row says whose it is. No screen and no network.
import assert from 'node:assert/strict'
import fs from 'node:fs'

const at = (p) => new URL(p, import.meta.url)
const read = (p) => fs.readFileSync(at(p), 'utf8').replace(/\r\n/g, '\n')
const load = (p) => import(at(p).href)

const { MEMBER_CROPS_URL, MEMBER_CYCLES_URL, WHO_APPEARS, asMemberCycles, nothingToLogText } = await load('../src/pages/Monitoring/memberLogging.js')
const { cropLabel, filterCrops } = await load('../src/pages/Monitoring/bulkCropLog.js')
const { activeCycles, feedingProblem, filterCycles } = await load('../src/pages/Monitoring/bulkCycleLog.js')

const eq = (actual, expected, message) => assert.deepStrictEqual(actual, expected, message)
const ok = (value, message) => assert.ok(value, message)

eq(MEMBER_CROPS_URL, '/production/monitoring/member-crops/')
eq(MEMBER_CYCLES_URL, '/monitoring/aquaculture-cycles/member-cycles/')
ok(/without an activated account/.test(WHO_APPEARS), 'the window says who appears in it')

// ── crops: each row names its member, and the search finds it ──
eq(cropLabel({ crop_type_name: 'Rice', variety_used: 'Dinorado', member_name: 'Ana Cruz' }), 'Ana Cruz · Rice (Dinorado)')
eq(cropLabel({ crop_type_name: 'Rice', variety_used: '' }), 'Rice', "a farmer's own list is unchanged")
const crops = [{ id: 1, member_name: 'Ana Cruz', crop_type_name: 'Rice' }, { id: 2, member_name: 'Ben Dy', crop_type_name: 'Rice' }]
eq(filterCrops(crops, 'dy rice').map((c) => c.id), [2])

// ── cycles: the name carries the member everywhere the window shows it, messages included ──
const rows = asMemberCycles([
  { id: 5, member_name: 'Ana Cruz', cycle_name: 'Cycle 1', species_farmed: 'Tilapia', status: 'Active', units: [{ id: 9, unit_type: 'pond', unit_number: 1 }] },
  { id: 6, member_name: 'Ben Dy', cycle_name: 'Cycle 1', species_farmed: 'Bangus', status: 'Active', units: [{ id: 10, unit_type: 'cage', unit_number: 1 }] },
])
eq(rows.map((c) => c.cycle_name), ['Ana Cruz, Cycle 1', 'Ben Dy, Cycle 1'], 'two cycles of the same name can be told apart')
eq(activeCycles(rows).length, 2)
eq(filterCycles(rows, 'ben').map((c) => c.id), [6])
eq(feedingProblem({ date: '2026-11-27', feedType: 'Starter', feedOther: '', feedCustom: '' }, rows, { 6: true }, {}),
  'Ben Dy, Cycle 1: enter the feed quantity of at least one pond or cage.')
eq(asMemberCycles(undefined), [])

// ── why the list is empty ──
ok(/activated account log their own/.test(nothingToLogText(0, 'a growing crop')), 'nobody the cooperative may log for')
eq(nothingToLogText(3, 'a growing crop'), 'None of your members without an activated account has a growing crop right now.')

// ── the screens ──
const members = read('../src/pages/Account/MyMembersPage.jsx')
for (const piece of ['Log activity', 'LogActivityManyCropsModal', 'LogOnManyCyclesModal', 'forMembers']) ok(members.includes(piece), `Members has ${piece}`)
const cropWindow = read('../src/pages/Monitoring/LogActivityManyCropsModal.jsx')
for (const piece of ['forMembers', 'MEMBER_CROPS_URL', 'nothingToLogText', 'WHO_APPEARS', 'Log Activity for Members', "'crop-log-members'"]) {
  ok(cropWindow.includes(piece), `the crop window has ${piece}`)
}
const cycleWindow = read('../src/pages/Monitoring/LogOnManyCyclesModal.jsx')
for (const piece of ['forMembers', 'MEMBER_CYCLES_URL', 'asMemberCycles', 'nothingToLogText', 'WHO_APPEARS', 'Log for Members', "'cycle-log-members'"]) {
  ok(cycleWindow.includes(piece), `the cycle window has ${piece}`)
}
// no harvest is offered to a cooperative here
ok(!/harvest/i.test(members), 'Members offers no harvest')

console.log('cooperative logging: all checks passed')
