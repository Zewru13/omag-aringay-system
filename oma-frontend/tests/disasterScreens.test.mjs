// The remaining disaster windows (several fisherfolk, a farmer's crops, the admin crop screen) are table forms like every other window.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replaceAll(String.fromCharCode(13), '')
let n = 0
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── several fisherfolk: the window and each fisherfolk's own part
const multi = read('src/pages/Monitoring/MultiFisherfolkDisasterModal.jsx')
ok(multi.includes('FormTable.jsx') && /<FormSection/.test(multi) && /<FormCell/.test(multi), 'multi Log Disaster: sections of labelled rows')
ok(!multi.includes('import FormField') && !/<FormLabel/.test(multi), 'multi Log Disaster: no stacked labels')
ok(!/<table/.test(multi), 'multi Log Disaster: no hand-made table')
for (const title of ['The Disaster', 'Damage not linked to a stock']) ok(multi.includes(`title="${title}"`), `multi section ${title}`)

const panel = read('src/pages/Monitoring/FisherfolkDisasterPanel.jsx')
ok(/<FormSection/.test(panel) && /<FormCell/.test(panel), 'fisherfolk part: sections of labelled rows')
ok(!/<FormLabel/.test(panel) && !/<tbody|<tr[ >]/.test(panel), 'fisherfolk part: no hand-made table rows or stacked labels')
ok(panel.includes('data-testid="fisherfolk-panel"') && panel.includes('data-fisherfolk-id'), 'fisherfolk part: test hooks kept')
ok(!/<button\b/.test(panel), 'fisherfolk part: buttons are the shared Button')

// ── a farmer's crops
const crops = read('src/pages/Monitoring/MultiCropDisaster.jsx')
ok(/<FormSection/.test(crops) && /<FormCell/.test(crops), 'crop disaster window: sections of labelled rows')
ok(/<EntryTable/.test(crops), 'crop disaster window: the crops are an entry table')
ok(!/<label className="mb-1 block/.test(crops), 'crop disaster window: no stacked labels')
ok(!/<button\b/.test(crops), 'crop disaster window: buttons are the shared Button')
ok(crops.includes('data-testid="crop-rows"'), 'crop disaster window: test hook kept')

// ── the admin crop screen: its event details
const screen = read('src/pages/Monitoring/LogCropDisasterScreen.jsx')
ok(/<FormSection/.test(screen) && /<FormCell/.test(screen), 'admin crop screen: the event details are a table form')
ok(!/<label className="mb-1 block text-xs/.test(screen), 'admin crop screen: no stacked labels')
ok(!/<button type="button" onClick=\{handleSubmitClick\}/.test(screen), 'admin crop screen: the report button is the shared Button')

console.log(`disasterScreens: ${n} checks passed`)
