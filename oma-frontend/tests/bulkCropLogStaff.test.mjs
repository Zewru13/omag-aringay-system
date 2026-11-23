import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
const modal = read('../src/pages/Monitoring/LogActivityManyCropsModal.jsx')
let n = 0
const ok = (cond, label) => { assert.ok(cond, label); n++ }

// the office reaches it from a button ABOVE the table (staff only), not from a row's three-dot menu
ok(page.includes('>Log Activity on Many Crops</Button>'), 'Crop Monitoring has the button')
ok(/\(isAdmin \|\| isEvaluator\) && \(\s*<div className="flex justify-end">/.test(page), 'staff only, in a row above the filters')
ok(!page.includes("label: 'Log Activity on Many Crops'"), 'it is not an item of the Actions menu')
ok(page.includes('<LogActivityManyCropsModal pickFarmer'), 'the window first asks for the farmer')
// the window: a farmer step (registered farmers), then that farmer's growing crops, with a way back
ok(modal.includes('function ChooseFarmerWindow') && modal.includes('`/farmers/?search=${encodeURIComponent(q)}`'), 'a search of the registered farmers')
ok(modal.includes('if (pickFarmer && !chosen) return <ChooseFarmerWindow'), 'no farmer yet: the farmer step')
ok(modal.includes('key={chosen ? chosen.id : \'own\'}'), 'another farmer is another window (its own draft and ticks)')
ok(modal.includes('Change farmer'), 'a way back to the search')
// the list is narrowed to the farmer, a draft is kept per farmer, and a farmer account (no farmer prop) still sees its own crops
ok(modal.includes('...(farmer ? { farmer: farmer.id } : {})'), 'the list is narrowed to the farmer')
ok(modal.includes('`crop-log-many:f${farmer.id}`'), 'one draft per farmer')
ok(modal.includes('farmer = null, pickFarmer = false'), 'the farmer account passes no farmer')

console.log(`bulkCropLogStaff: ${n} checks passed`)
