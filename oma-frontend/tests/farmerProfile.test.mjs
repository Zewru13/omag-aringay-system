import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// The farmer profile (Admin / Focal Person): a hero with the name, ID and classifications, a row of totals, grouped information cards, and a legend.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }
const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const { classificationChips, profileStats, ageText, locationText, areaText, STATUS_LEGEND } = await import(new URL('../src/pages/Farmers/farmerProfile.js', import.meta.url).href)

// classifications: one chip each, in a fixed order, with what it means
const none = classificationChips({})
eq(none, [], 'no classification, no chips')
const all = classificationChips({ is_pwd: true, is_4ps_beneficiary: true, is_icc_ip_member: true, icc_ip_name: 'Ibaloi', is_senior_citizen: true, is_farm_laborer: true })
eq(all.map((c) => c.key), ['pwd', 'fourps', 'icc_ip', 'senior', 'laborer'], 'fixed order')
eq(all.find((c) => c.key === 'icc_ip').label, 'ICC/IP Member — Ibaloi', 'the ICC/IP group is named')
eq(classificationChips({ is_icc_ip_member: true })[0].label, 'ICC/IP Member', 'no group named')
eq(all.every((c) => c.label && c.meaning && c.tone), true, 'every chip has a label, a meaning and a colour')
eq(classificationChips({ is_pwd: true }).map((c) => c.key), ['pwd'], 'only what is ticked')

// the totals strip
const parcels = [{ area_hectares: '2.00' }, { area_hectares: '1.50' }, { area_hectares: null }]
eq(profileStats({ parcels, cropTotal: 7, organizations: [{ is_active: true }, { is_active: false }] }).map((s) => [s.key, s.value]),
  [['parcels', '3'], ['area', '3.50'], ['crops', '7'], ['organizations', '1']], 'parcels, hectares, crops, active organizations')
eq(profileStats({ parcels: [], cropTotal: undefined, organizations: [] }).map((s) => s.value), ['0', '0', '—', '0'], 'nothing yet; the crop total not loaded shows a dash')
eq(profileStats({ parcels, cropTotal: 1250, organizations: [] })[2].value, '1,250', 'thousands')
eq(areaText([{ area_hectares: '0.10' }, { area_hectares: '0.20' }]), '0.30', 'hectares add up without float noise')

eq(ageText('1975-01-01', new Date('2026-11-13')), '51 yrs', 'age')
eq(ageText('2020-12-01', new Date('2026-11-13')), '5 yrs', 'age before the birthday')
eq(ageText('2026-01-01', new Date('2026-11-13')), '0 yrs', 'a baby')
eq(ageText('', new Date()), '', 'no birthdate')
eq(locationText({ barangay: 'Basca', municipality: 'Aringay', province: 'La Union' }), 'Basca, Aringay, La Union', 'the place')
eq(locationText({ barangay: 'Basca' }), 'Basca', 'part of the place')
eq(locationText({}), '', 'no place')

// the legend of the crop statuses
eq(STATUS_LEGEND.map((s) => s.label), ['Planted', 'Near Harvest', 'Due Harvest', 'Ready for Harvest', 'Overdue', 'Harvested', 'Total Loss'], 'every stage, in order')
eq(STATUS_LEGEND.every((s) => s.tone && s.meaning), true, 'each has a colour and a meaning')

// the screens
const parts = read('src/pages/Farmers/FarmerProfileParts.jsx')
for (const name of ['ProfileHero', 'StatsStrip', 'InfoCard', 'FieldItem', 'OrganizationList', 'ClassificationList', 'StatusLegend']) {
  ok(new RegExp(`export function ${name}`).test(parts), `${name} is a part of the profile`)
}
const page = read('src/pages/Farmers/FarmerDetailPage.jsx')
ok(/<ProfileHero/.test(page) && /<StatsStrip/.test(page), 'the page opens with the hero and the totals')
ok(/title="Personal Information"/.test(page) && /title="Contact &amp; Address"|title="Contact & Address"/.test(page), 'information is grouped in cards: Personal Information, Contact & Address')
ok(/<OrganizationList/.test(page) && /<ClassificationList/.test(page), 'organizations and classifications have their own cards')
ok(/<StatusLegend/.test(page), 'the crops window carries a legend of the stage colours')
ok(!/Reference Information/.test(page), 'the old Reference Information card is regrouped')
ok(/Farm Records/.test(page) && /Visit History/.test(page), 'the sections are labelled')
ok(!/lg:sticky/.test(page), 'no sticky columns: the page reads top to bottom')

console.log(`farmerProfile: ${n} checks passed`)
