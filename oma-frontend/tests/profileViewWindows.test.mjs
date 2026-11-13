import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The farmer and fisherfolk profiles (Admin / Focal Person): no Back link, icon-only action buttons, and the long sections are a small card with a View button that
// opens a floating table.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { countText } = await import(new URL('../src/utils/viewSection.js', import.meta.url).href)
eq(countText(3, 'parcel'), '3 parcels', 'plural')
eq(countText(1, 'parcel'), '1 parcel', 'singular')
eq(countText(0, 'parcel'), 'None yet', 'none')
eq(countText(undefined, 'parcel'), 'None yet', 'not loaded')
eq(countText(2, 'machinery line'), '2 machinery lines', 'two words')
eq(countText(1250, 'crop'), '1,250 crops', 'thousands')

// the icon-only button
const button = read('src/components/UI/Button.jsx')
ok(/iconOnly/.test(button) && /sr-only/.test(button), 'Button has an icon-only form whose label is still read by screen readers')
ok(/title=/.test(button), 'and shows its name as a tooltip')
const activate = read('src/components/ActivateCitizenAccountButton.jsx')
ok(/iconOnly/.test(activate), 'Set up account / Regenerate password can be icon-only too')

// the View card and its floating table
const view = read('src/components/UI/ViewSection.jsx')
ok(/ModalShell/.test(view) && />\s*View\s*</.test(view) && /countText\(/.test(view), 'a card with the count and a View button that opens a window')
ok(/aria-haspopup="dialog"/.test(view), 'the View button says it opens a window')

// the farmer profile
const farmer = read('src/pages/Farmers/FarmerDetailPage.jsx')
ok(!/Back to Farmers/.test(farmer) && !/ArrowLeft/.test(farmer), 'no Back to Farmers')
for (const label of ['View Assistance History', 'Generate Report', 'Import Farm Parcels', 'Edit Farmer']) {
  ok(new RegExp(`iconOnly[^>]*>\s*${label}\s*<|${label}[\s\S]{0,40}</Button>`).test(farmer) && farmer.includes(label), `${label} stays as a button`)
}
ok((farmer.match(/iconOnly/g) || []).length >= 5, 'the header buttons (history, report, import, edit, set up account) are icon-only')
const headerEnd = farmer.indexOf('Farm Parcels', farmer.indexOf('<ViewSection'))
ok(farmer.includes('<ViewSection') && /title="Farm Parcels"/.test(farmer), 'Farm Parcels is a View card')
ok(/title="Crop Monitoring Records"|title="Crops"/.test(farmer), 'Crops is a View card')
ok(/<AddRowFooter[^>]*Add Farm Parcel|Add Farm Parcel[\s\S]{0,200}AddRowFooter/.test(farmer), 'Add Farm Parcel sits in the Farm Parcels table (an add row under it)')
const header = farmer.slice(0, farmer.indexOf('<ViewSection'))
ok(!/<Button[^>]*>\s*Add Farm Parcel/.test(header), 'Add Farm Parcel is no longer a header button')
const machinery = read('src/pages/Farmers/FarmerMachineryCard.jsx')
ok(/<ViewSection/.test(machinery) && /Agricultural Machinery/.test(machinery), 'Machinery is a View card')

// the fisherfolk profile
const fisher = read('src/pages/Fisheries/FisherfolkDetailPage.jsx')
ok(!/Back to Fisherfolk Registry/.test(fisher) && !/ArrowLeft/.test(fisher), 'no Back to Fisherfolk Registry')
ok((fisher.match(/iconOnly/g) || []).length >= 3, 'the fisherfolk header buttons are icon-only')
ok(/<ViewSection[\s\S]{0,200}title="Stocking Records"/.test(fisher) && /<ViewSection[\s\S]{0,200}title="Ponds"/.test(fisher), 'Stocking Records and Ponds are View cards')

console.log(`profileViewWindows: ${n} checks passed`)
