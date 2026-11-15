import assert from 'node:assert/strict'
import fs from 'node:fs'

// The farmer's Disasters page: the reports first, and Report a disaster as a window.
const { DISASTER_SECTIONS, disasterTone, reportBlock, disasterText, sortDisasters, cropChoiceLabel } =
  await import(new URL('../src/pages/Account/myDisasters.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(DISASTER_SECTIONS.map((s) => s.label), ['Ongoing', 'Recovered'], 'two sections')
const sectionOf = (row) => DISASTER_SECTIONS.find((s) => s.match(row)).label
eq(sectionOf({ status: 'Active' }), 'Ongoing', 'an active report is ongoing')
eq(sectionOf({ status: 'Recovered' }), 'Recovered', 'a recovered one')
eq(sectionOf({ status: 'Odd' }), 'Recovered', 'anything else is still listed')

eq(disasterTone({ status: 'Active', can_recover: true }), 'amber', 'ongoing and can still be marked recovered')
eq(disasterTone({ status: 'Active', can_recover: false }), 'grey', 'ongoing but nothing more can be done')
eq(disasterTone({ status: 'Active', is_total_loss: true, can_recover: false }), 'red', 'a total loss')
eq(disasterTone({ status: 'Recovered', can_recover: false }), 'green', 'recovered')

eq(reportBlock([]), 'You can only report a disaster on a crop you have on record.', 'no active crop: the reason')
eq(reportBlock([{ id: 1 }]), null, 'an active crop: the report can open')
eq(reportBlock(null), null, 'still loading: no reason yet')

const rows = [{ id: 1, date_of_occurrence: '2026-08-01' }, { id: 2, date_of_occurrence: '2026-10-20' }, { id: 3, date_of_occurrence: null }]
eq(sortDisasters(rows).map((r) => r.id), [2, 1, 3], 'newest first; one with no date last')
eq(rows.map((r) => r.id), [1, 2, 3], 'the list given is not reordered')
const text = disasterText({ disaster_type_label: 'Flood', crop: 'Ginger', report_number: 'DR-2026-0004' })
for (const word of ['Flood', 'Ginger', 'DR-2026-0004']) ok(text.includes(word), `the search reads ${word}`)
const label = cropChoiceLabel({ crop_type_name: 'Ginger', season: 'Wet', year: 2026, date_planted: '2026-08-13', farm_location_barangay: 'Santa Cecilia' })
for (const word of ['Ginger', 'Wet 2026', 'Aug 13, 2026', 'Santa Cecilia']) ok(label.includes(word), `a crop to choose names ${word}`)

const page = read('../src/pages/Account/MyDisastersPage.jsx')
for (const piece of ['RecordList', 'ChooseCropsModal', 'MultiCropDisasterModal', 'DisasterLogDetailsModal', 'MarkRecoveredModal', "searchParams.get('crop')", 'Report a disaster', 'Mark recovered', 'onRetry={retry}', "'/production/disaster-logs/'"]) {
  ok(page.includes(piece), `Disasters uses ${piece}`)
}
ok(!/\binline\b/.test(page), 'the report opens as a window, not as the page')
const router = read('../src/pages/Monitoring/DisasterPage.jsx')
ok(router.includes('if (isFarmer) return <MyDisastersPage />') && router.includes('<AdminDisasterPage />') && router.includes('<FisherfolkDisasterPage />'), 'a farmer gets the new page; the others keep theirs')
ok(/export function MarkRecoveredModal\(/.test(read('../src/pages/Monitoring/FarmerDisasterPage.jsx')), 'Mark Recovered can be imported')
console.log(`ok - ${n} assertions`)
