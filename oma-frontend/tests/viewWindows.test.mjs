// The read-only windows (Assistance History, the two Forced Harvest details) are table forms like every other window: the shared
// DetailTable for key/value details, the shared EntryTable for lists, no hand-made <table> or header colours.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── Assistance History: one shared window for the farmer and the fisherfolk pages
const history = read('src/components/AssistanceHistoryModal.jsx')
ok(/<DetailTable/.test(history) && /<EntryTable/.test(history), 'history: person details and the list use the shared tables')
ok(history.includes('formatDate'), 'history: dates read like "Nov 1, 2026"')
ok(!/<table/.test(history) && !history.includes('DataTable'), 'history: no hand-made or list-page table')
ok(history.includes('ListPrintButton') && history.includes('buildPersonHistorySpec'), 'history: print button kept')
for (const [file, domain] of [['Farmers/FarmerDetailPage.jsx', 'crop'], ['Fisheries/FisherfolkDetailPage.jsx', 'fisheries']]) {
  const page = read(`src/pages/${file}`)
  ok(page.includes("components/AssistanceHistoryModal.jsx"), `${file}: uses the shared history window`)
  ok(!page.includes('function AssistanceHistoryModal'), `${file}: no private copy of the history window`)
  ok(!page.includes('HISTORY_COLUMNS'), `${file}: no private column list`)
  ok(page.includes(`domain="${domain}"`), `${file}: names its domain`)
}

// ── the two Forced Harvest details windows
for (const [file, units] of [['FisheriesRecords/ForcedHarvestDetails.jsx', 'forced-harvest-units'], ['Monitoring/CropForcedHarvestDetails.jsx', 'crop-forced-harvest-crops']]) {
  const src = read(`src/pages/${file}`)
  ok(/<DetailTable/.test(src), `${file}: details are a DetailTable`)
  ok(/<EntryTable/.test(src) && src.includes(units), `${file}: the list is an EntryTable with its test hook`)
  ok(!/<table|<thead|<tbody/.test(src.replace(/<EntryTable[\s\S]*?<\/EntryTable>/g, '')), `${file}: no hand-made table outside EntryTable`)
  ok(!src.includes('bg-[#1B4D2E] text-white'), `${file}: no hand-made header colours`)
}
ok(read('src/pages/FisheriesRecords/ForcedHarvestDetails.jsx').includes('forced-harvest-total'), 'aquaculture details: total hook kept')
ok(read('src/pages/Monitoring/CropForcedHarvestDetails.jsx').includes('crop-forced-harvest-total'), 'crop details: total hook kept')

console.log(`viewWindows: ${n} checks passed`)
