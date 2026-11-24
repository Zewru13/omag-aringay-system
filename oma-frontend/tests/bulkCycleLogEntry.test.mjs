import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const mine = read('../src/pages/Account/MyCyclesPage.jsx')
const staff = read('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
const button = read('../src/pages/FisheriesRecords/LogActivityButton.jsx')
const modal = read('../src/pages/Monitoring/LogOnManyCyclesModal.jsx')
let n = 0
const ok = (cond, label) => { assert.ok(cond, label); n++ }

// the fisherfolk's own Cycles page offers it when more than one cycle still takes a log
ok(mine.includes('Log on many cycles') && mine.includes('<LogOnManyCyclesModal onClose={close} onDone={done} />'), 'My cycles has the button and the window')
ok(/cycles\.filter\(\(c\) => c\.production_cycle && GROWING\.includes\(c\.status\)\)\.length > 1/.test(mine), 'only with more than one growing cycle')
// the office does not have it: no button above the Aquaculture Monitoring table, nothing in its Log Activity menu
ok(!staff.includes('Log on Many Cycles') && !staff.includes('LogOnManyCyclesModal'), 'Aquaculture Monitoring (the office page) does not have it')
ok(!button.includes('Log on Many Cycles') && !button.includes('onMany'), 'the Log Activity menu is unchanged')
ok(!modal.includes('pickFisherfolk') && !modal.includes('ChooseFisherfolkWindow') && !modal.includes("'/fisheries/fisherfolk/?search="), 'the window has no fisherfolk step')
// the window asks the server for the fisherfolk's own cycles, active ones only
ok(modal.includes("params: { status: 'Active' }"), 'own active cycles only')
ok(modal.includes("'/monitoring/aquaculture-cycles/bulk-feeding/'") && modal.includes("'/monitoring/aquaculture-cycles/bulk-health/'"), 'the two endpoints')

console.log(`bulkCycleLogEntry: ${n} checks passed`)
