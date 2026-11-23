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
// the office reaches it from the Log Activity menu of an expanded cycle, for that cycle's fisherfolk, with that cycle ticked
ok(button.includes('Log on Many Cycles') && button.includes('onMany'), 'the Log Activity menu has the extra item')
ok(staff.includes('<LogOnManyCyclesModal') && staff.includes('preselectId={manyLogRec.production_cycle}'), 'the cycle whose menu it was starts ticked')
ok(staff.includes('fisherfolk={{ id: manyLogRec.fisherfolk,'), 'the window lists that fisherfolk cycles')
ok((staff.match(/onMany=\{row\._rec\?\.fisherfolk && !isFisherfolk/g) || []).length === 1 && staff.includes('onLogMany={row._rec?.fisherfolk && !isFisherfolk'), 'office only, on the table and on the phone card')
// the window asks the server for the fisherfolk's own cycles, active ones only
ok(modal.includes("params: { status: 'Active', ...(fisherfolk ? { fisherfolk: fisherfolk.id } : {}) }"), 'active cycles, narrowed to the fisherfolk for the office')
ok(modal.includes("'/monitoring/aquaculture-cycles/bulk-feeding/'") && modal.includes("'/monitoring/aquaculture-cycles/bulk-health/'"), 'the two endpoints')

console.log(`bulkCycleLogEntry: ${n} checks passed`)
