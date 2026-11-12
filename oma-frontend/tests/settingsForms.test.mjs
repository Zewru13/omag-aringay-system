// The settings edit windows (crop, fisheries, assistance, signatories, units...) are table forms: titled sections of labelled rows.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replaceAll(String.fromCharCode(13), '')
const { settingsLabel } = await import(here('src/components/UI/settingsLabel.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

// ── labels written the old way ("Name *", "Description (optional)") read the new way: a plain label and a required flag
eq(settingsLabel('Name *'), { label: 'Name', required: true }, 'a trailing star means required')
eq(settingsLabel('Category Name *'), { label: 'Category Name', required: true }, 'a longer label')
eq(settingsLabel('Description (optional)'), { label: 'Description', required: false }, 'optional is not repeated in the label')
eq(settingsLabel('Growth Stage (optional)'), { label: 'Growth Stage', required: false }, 'optional growth stage')
eq(settingsLabel('Unit', true), { label: 'Unit', required: true }, 'the required flag passes through')
eq(settingsLabel('Kg per unit'), { label: 'Kg per unit', required: false }, 'a plain label stays')
eq(settingsLabel('Name * '), { label: 'Name', required: true }, 'trailing space')

// ── every settings edit window draws the table form
const files = [
  'ActivitySettings/ActivityTypePageBase.jsx', 'AssistanceManagement/AssistanceAgenciesPage.jsx', 'AssistanceManagement/AssistanceOptionsTab.jsx',
  'CropCategory/CropCategoryPage.jsx', 'CropOption/CropOptionPage.jsx', 'CropSettings/CropInputTypePage.jsx', 'CropVariety/CropVarietyPage.jsx',
  'Farmers/ClassificationSettingsPage.jsx', 'FisheriesSettings/DiseaseSettingsPage.jsx', 'FisheriesSettings/FeedTypePage.jsx',
  'FisheriesSettings/FingerlingSourcePage.jsx', 'FisheriesSettings/SpeciesCategoryPage.jsx', 'FisheriesSettings/SpeciesOptionPage.jsx',
  'Production/HarvestUnitSettingsPage.jsx', 'SeedSource/SeedSourcePage.jsx', 'Signatories/SignatoriesPage.jsx', 'AssistanceManagement/AssistanceTypeUnitsCard.jsx',
]
for (const file of files) {
  const src = read(`src/pages/${file}`)
  ok(src.includes('FormTable.jsx') || src.includes('SettingsFormTable.jsx'), `${file}: imports the table form`)
  ok(/<SettingsFields/.test(src), `${file}: its edit window is a table form`)
  // no old stacked field inside an edit form
  const forms = [...src.matchAll(/<form id="[^"]+"[\s\S]*?<\/form>/g)].map((m) => m[0])
  ok(forms.length > 0, `${file}: has an edit form`)
  for (const form of forms) ok(!/<FormField\b/.test(form), `${file}: no stacked FormField left in a window`)
}
const comp = read('src/components/UI/SettingsFormTable.jsx')
ok(comp.includes('export function SettingsFields') && comp.includes('export function SettingsField') && comp.includes('export function SettingsCell'), 'the three building blocks')

console.log(`settingsForms: ${n} checks passed`)
