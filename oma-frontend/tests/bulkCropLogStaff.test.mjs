import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')
const page = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
const modal = read('../src/pages/Monitoring/LogActivityManyCropsModal.jsx')
const mine = read('../src/pages/Account/MyCropsPage.jsx')
let n = 0
const ok = (cond, label) => { assert.ok(cond, label); n++ }

// logging one activity on many crops is for the farmer's own account only: the office has no button, no menu item and no window for it
ok(!page.includes('Log Activity on Many Crops') && !page.includes('LogActivityManyCropsModal'), 'Crop Monitoring (the office page) does not have it')
// ...and the farmer's My crops page still does, for its own crops
ok(mine.includes('Log activity on many crops') && mine.includes('<LogActivityManyCropsModal onClose={close}'), 'My crops has the button and the window')
ok(!modal.includes('pickFarmer') && !modal.includes('ChooseFarmerWindow') && !modal.includes("'/farmers/?search="), 'the window has no farmer step: it lists the account\'s own crops')

console.log(`bulkCropLogStaff: ${n} checks passed`)
