import assert from 'node:assert/strict'
import fs from 'node:fs'

// Crop Monitoring: Record Harvest is a button beside the three-dot menu (like the harvest button of Aquaculture Monitoring), not a menu item.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { harvestButton } = await import(new URL('../src/pages/Monitoring/cropHarvestButton.js', import.meta.url).href)

// ── who can use it: the same rules the menu item had (not Harvested, not Total Loss, and past the gate)
const open = { gated: false, message: null }
eq(harvestButton({ status: 'Planted' }, open), { active: true, title: 'Record Harvest' }, 'a growing crop past the gate')
eq(harvestButton({ status: 'Near Harvest' }, open), { active: true, title: 'Record Harvest' }, 'a near-harvest crop')
eq(harvestButton({ status: 'Planted' }, { gated: true, message: 'Record Harvest opens on Jan 5.' }), { active: false, title: 'Record Harvest opens on Jan 5.' }, 'before half of the growing time: greyed out, saying why')
eq(harvestButton({ status: 'Harvested' }, open), { active: false, title: 'Already harvested' }, 'harvested')
eq(harvestButton({ status: 'Total Loss' }, open), { active: false, title: 'Harvest not available (Total Loss)' }, 'total loss')
eq(harvestButton({ status: 'Harvested' }, { gated: true, message: 'x' }).title, 'Already harvested', 'a closed crop says so before any gate message')

// ── the page
const page = read('../src/pages/Monitoring/CropMonitoringPage.jsx')
const actions = page.slice(page.indexOf('    actions: ('), page.indexOf('  const rows = filtered.map(buildRow)'))
eq(actions.includes('data-testid="quick-harvest"'), true, 'the harvest button is in the Actions cell')
eq(/<Wheat size=\{16\}/.test(actions), true, 'with the crop harvest icon the system already uses')
eq(actions.includes('setHarvestRecord(rec)'), true, 'it opens the existing Record Harvest form for that record')
eq(actions.includes('e.stopPropagation()'), true, 'a click on it never triggers the row')
eq(actions.includes('harvestButton(rec, harvestGateInfo(rec))'), true, 'the same gate as before decides it')
eq(actions.indexOf('data-testid="quick-harvest"') < actions.indexOf('<RowActions'), true, 'it sits beside the menu, before it, like Aquaculture Monitoring')
eq(actions.includes('flex items-center gap-1') && actions.includes('rounded-lg p-1.5 transition-colors'), true, 'the same placement and button style as Aquaculture Monitoring')
const fish = read('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
eq(fish.includes('rounded-lg p-1.5 transition-colors') && fish.includes('data-testid="quick-harvest"'), true, 'the reference button is there')

// the menu no longer has Record Harvest; its other items are untouched
eq(actions.includes("label: 'Record Harvest'"), false, 'Record Harvest is out of the three-dot menu')
for (const key of ['activity', 'details', 'force-harvest', 'disaster', 'unlock']) eq(actions.includes(`key: '${key}'`), true, `the ${key} menu item is still there`)
eq(actions.includes("key: 'harvest'"), false, 'no harvest item left')
// the form itself is not rebuilt: one Record Harvest modal, one route to it
eq((page.match(/function RecordHarvestFromMonitoringModal/g) || []).length, 1, 'the one existing Record Harvest form')
eq(page.includes('<RecordHarvestFromMonitoringModal'), true, 'still rendered by the page')

console.log(`ok - ${n} assertions`)
