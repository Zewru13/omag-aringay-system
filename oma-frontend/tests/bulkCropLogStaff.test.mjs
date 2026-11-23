import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
const modal = read('../src/pages/Monitoring/LogActivityManyCropsModal.jsx')
let n = 0
const ok = (cond, label) => { assert.ok(cond, label); n++ }

// the office opens the many-crops window from a crop's menu, for that crop's farmer, with that crop ticked
ok(page.includes("label: 'Log Activity on Many Crops'"), 'Crop Monitoring has the menu item')
ok(/\(isAdmin \|\| isEvaluator\) && rec\.farmer && \(rec\.status === 'Planted' \|\| rec\.status === 'Near Harvest'\)/.test(page), 'staff only, for a growing crop that has a farmer')
ok(page.includes('<LogActivityManyCropsModal') && page.includes('preselectId={manyLogRecord.id}'), 'the crop whose menu it was starts ticked')
// the window lists only that farmer's crops, and keeps a draft per farmer
ok(modal.includes('...(farmer ? { farmer: farmer.id } : {})'), 'the list is narrowed to the farmer')
ok(modal.includes('`crop-log-many:f${farmer.id}`'), 'one draft per farmer')
// a farmer account still sees its own crops without a farmer prop
ok(modal.includes("farmer = null, preselectId = null"), 'the farmer account passes no farmer')

console.log(`bulkCropLogStaff: ${n} checks passed`)
