import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The farmer profile (Admin / Focal Person): a hero with the name, ID and classifications, a row of totals, grouped information cards, and a legend.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { classificationChips, ageText, locationText, STATUS_LEGEND, plantingsOf, cropGrownRows } = await import(new URL('../src/pages/Farmers/farmerProfile.js', import.meta.url).href)

// classifications: one chip each, in a fixed order, with what it means
const none = classificationChips({})
eq(none, [], 'no classification, no chips')
const all = classificationChips({ is_pwd: true, is_4ps_beneficiary: true, is_icc_ip_member: true, icc_ip_name: 'Ibaloi', is_senior_citizen: true, is_farm_laborer: true })
eq(all.map((c) => c.key), ['pwd', 'fourps', 'icc_ip', 'senior', 'laborer'], 'fixed order')
eq(all.find((c) => c.key === 'icc_ip').label, 'ICC/IP Member — Ibaloi', 'the ICC/IP group is named')
eq(classificationChips({ is_icc_ip_member: true })[0].label, 'ICC/IP Member', 'no group named')
eq(all.every((c) => c.label && c.meaning && c.tone), true, 'every chip has a label, a meaning and a colour')
eq(classificationChips({ is_pwd: true }).map((c) => c.key), ['pwd'], 'only what is ticked')

eq(ageText('1975-01-01', new Date('2026-11-13')), '51 yrs', 'age')
eq(ageText('2020-12-01', new Date('2026-11-13')), '5 yrs', 'age before the birthday')
eq(ageText('2026-01-01', new Date('2026-11-13')), '0 yrs', 'a baby')
eq(ageText('', new Date()), '', 'no birthdate')
eq(locationText({ barangay: 'Basca', municipality: 'Aringay', province: 'La Union' }), 'Basca, Aringay, La Union', 'the place')
eq(locationText({ barangay: 'Basca' }), 'Basca', 'part of the place')
eq(locationText({}), '', 'no place')

// the crops grown on a parcel: what is shown of a crop, and which plantings are its own
const crop = { crop_name: 'Palay (Rice)', crop_name_other: '', area_hectares: '1.50', is_main_crop: true, number_of_trees: null, variety_used: 'NSIC Rc 222',
  seed_source: 'DA/LGU Provided', quantity_of_seeds_used: '40', seeds_unit: 'kg', has_pcic_insurance: true }
const rows = Object.fromEntries(cropGrownRows(crop))
eq(rows['Crop'], 'Palay (Rice)', 'the crop')
eq(rows['Variety'], 'NSIC Rc 222', 'the variety')
eq(rows['Area (ha)'], '1.50', 'the area')
eq(rows['Main crop'], 'Yes', 'the main crop')
eq(rows['Seeds'], '40 kg', 'the seeds')
eq(rows['Seed source'], 'DA/LGU Provided', 'the seed source')
eq(rows['PCIC insurance'], 'Yes', 'insured')
eq(Object.fromEntries(cropGrownRows({ ...crop, crop_name: 'Other', crop_name_other: 'Dragon fruit', is_main_crop: false, has_pcic_insurance: false, number_of_trees: 120, quantity_of_seeds_used: null }))['Crop'], 'Dragon fruit', 'an "Other" crop is called by its own name')
eq(Object.fromEntries(cropGrownRows({ ...crop, number_of_trees: 120, quantity_of_seeds_used: null }))['Trees'], '120', 'trees')
eq(Object.fromEntries(cropGrownRows({ ...crop, variety_used: '' }))['Variety'], '—', 'nothing recorded is a dash')
const plantings = [{ id: 1, crop_type_name: 'Palay (Rice)' }, { id: 2, crop_type_name: 'Corn' }, { id: 3, crop_type_name: 'palay (rice)' }]
eq(plantingsOf(crop, plantings).map((p) => p.id), [1, 3], 'only the plantings of that crop, whatever the case')
eq(plantingsOf({ ...crop, crop_name: 'Other', crop_name_other: 'Corn' }, plantings).map((p) => p.id), [2], 'an "Other" crop is matched by its own name')
eq(plantingsOf(crop, []), [], 'none')

// the legend of the crop statuses
eq(STATUS_LEGEND.map((s) => s.label), ['Planted', 'Near Harvest', 'Due Harvest', 'Ready for Harvest', 'Overdue', 'Harvested', 'Total Loss'], 'every stage, in order')
eq(STATUS_LEGEND.every((s) => s.tone && s.meaning), true, 'each has a colour and a meaning')

// the screens
const parts = read('src/pages/Farmers/FarmerProfileParts.jsx')
for (const name of ['ProfileHero', 'InfoCard', 'FieldItem', 'OrganizationList', 'StatusLegend']) {
  ok(new RegExp(`export function ${name}`).test(parts), `${name} is a part of the profile`)
}
ok(!/export function StatsStrip|export function ClassificationList/.test(parts), 'the totals strip and the Classification card are gone')
const page = read('src/pages/Farmers/FarmerDetailPage.jsx')
ok(/<ProfileHero/.test(page), 'the page opens with the hero')
ok(!/<StatsStrip|profileStats/.test(page), 'no totals strip under the hero')
ok(!/<ClassificationList|title="Classification"/.test(page), 'no Classification card (the chips stay in the hero)')
ok(/title="Personal Information"/.test(page) && /title="Contact &amp; Address"|title="Contact & Address"/.test(page), 'information is grouped in cards: Personal Information, Contact & Address')
ok(/<OrganizationList/.test(page), 'organizations have their own card')
ok(/<StatusLegend/.test(page), 'the crops window carries a legend of the stage colours')
ok(!/Reference Information/.test(page), 'the old Reference Information card is regrouped')
ok(/Farm Records/.test(page), 'the records are labelled')
ok(!/lg:sticky/.test(page), 'no sticky columns: the page reads top to bottom')

// Visit History is a View card like the rest, with Record Farm Visit inside its window
ok(/<ViewSection[^>]*title="Visit History"/.test(page), 'Visit History is a View card')
ok(/label="Record Farm Visit"/.test(page), 'Record Farm Visit is inside the Visit History window')
ok(/md:grid-cols-2 xl:grid-cols-4/.test(page), 'four cards in a row: Machinery, Farm Parcels, Crop Monitoring Records, Visit History')

// Import Farm Parcels moved into the Farm Parcels window
const headerActions = page.slice(page.indexOf('const actions = farmer'), page.indexOf('return (\n    <PageLayout'))
ok(!/Import Farm Parcels/.test(headerActions), 'no Import Farm Parcels icon in the profile header')
ok(/<ViewSection[\s\S]{0,300}title="Farm Parcels"[\s\S]*Import Farm Parcels[\s\S]*<\/ViewSection>/.test(page), 'Import Farm Parcels is inside the Farm Parcels window')

// the Farm Parcels table: an Actions column whose menu holds Edit and Details; the same menu in Crops Grown and Crop Monitoring
ok(/>Actions</.test(page) || /'Actions'/.test(page), 'the parcels table has an Actions column')
ok((page.match(/<RowActions/g) || []).length >= 3, 'the parcels, the crops grown and the crop monitoring rows each have a menu')
ok(/alwaysMenu/.test(page), 'the menu is the three-dot button even with one action')
ok(/label: 'View details'/.test(page) && /Open in Crop Monitoring/.test(page), 'View details and Open in Crop Monitoring')
ok(/<FarmCropDetailsModal/.test(page) && /<CropDetailsModal/.test(page), 'the crops open their details windows')

// the details of a crop grown: no activities
const grown = read('src/pages/Farmers/FarmCropDetailsModal.jsx')
ok(/summaryRows\(/.test(grown) && /harvestRows\(/.test(grown), 'the full details of the planting and its harvest')
ok(!/Activities|activityLine|\/logs\//.test(grown), 'no activities in it')
const details = read('src/pages/Monitoring/CropDetailsModal.jsx')
ok(/readOnly/.test(details) && /hideHistory/.test(details), 'the Crop Details window can be read-only, and without its history lists')
ok(/readOnly \? \[\] : harvestManageActions/.test(details), 'a read-only Crop Details window has no Edit / Delete Harvest buttons either')

console.log(`farmerProfile: ${n} checks passed`)
