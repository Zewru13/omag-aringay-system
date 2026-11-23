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
// the office reaches it from a button ABOVE the Aquaculture Monitoring table (staff only), not from the Log Activity menu of a cycle
ok(staff.includes('>Log on Many Cycles</Button>') && /\{!isFisherfolk && \(\s*<div className="flex justify-end">/.test(staff), 'a button above the table, for the office')
ok(!button.includes('Log on Many Cycles') && !button.includes('onMany'), 'the Log Activity menu is unchanged')
ok(staff.includes('<LogOnManyCyclesModal pickFisherfolk'), 'the window first asks for the fisherfolk')
ok(modal.includes('function ChooseFisherfolkWindow') && modal.includes('`/fisheries/fisherfolk/?search=${encodeURIComponent(q)}`'), 'a search of the registered fisherfolk')
ok(modal.includes('if (pickFisherfolk && !chosen) return <ChooseFisherfolkWindow'), 'no fisherfolk yet: the fisherfolk step')
ok(modal.includes("key={chosen ? chosen.id : 'own'}") && modal.includes('Change fisherfolk'), 'another fisherfolk is another window, with a way back to the search')
// the window asks the server for the fisherfolk's own cycles, active ones only
ok(modal.includes("params: { status: 'Active', ...(fisherfolk ? { fisherfolk: fisherfolk.id } : {}) }"), 'active cycles, narrowed to the fisherfolk for the office')
ok(modal.includes("'/monitoring/aquaculture-cycles/bulk-feeding/'") && modal.includes("'/monitoring/aquaculture-cycles/bulk-health/'"), 'the two endpoints')

console.log(`bulkCycleLogEntry: ${n} checks passed`)
