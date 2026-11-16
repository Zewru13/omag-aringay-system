import assert from 'node:assert/strict'
import fs from 'node:fs'

// The farmer's Assistance page: what waits for them first, then what is being followed up, what is scheduled, and the history.
const { ASSISTANCE_SECTIONS, assistanceStatusLabel, assistanceTone, canConfirm, assistanceText, assistanceDate, sortAssistance } =
  await import(new URL('../src/pages/Account/myAssistance.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(ASSISTANCE_SECTIONS.map((s) => s.label), ['Waiting for you', 'Being followed up', 'Scheduled', 'History'], 'the four sections, in order')
const STATUSES = ['AWAITING_CONFIRMATION', 'NOT_RECEIVED', 'PENDING', 'CONFIRMED', 'RESOLVED', 'ODD']
const sectionOf = (status) => ASSISTANCE_SECTIONS.find((s) => s.match({ status })).label
eq(STATUSES.map(sectionOf), ['Waiting for you', 'Being followed up', 'Scheduled', 'History', 'History', 'History'], 'every status has a section; an unknown one is still listed, under History')
for (const status of STATUSES) eq(ASSISTANCE_SECTIONS.filter((s) => s.match({ status })).length >= 1, true, `${status} is listed`)

eq(STATUSES.map(assistanceStatusLabel), ['Confirm', 'Not received', 'Scheduled', 'Received', 'Resolved', 'ODD'], 'the status in plain words')
eq(STATUSES.map(assistanceTone), ['amber', 'red', 'grey', 'green', 'green', 'grey'], 'the badge tone')
eq(STATUSES.map((status) => canConfirm({ status })), [true, false, false, false, false, false], 'only assistance awaiting confirmation gets the buttons')

const rows = [{ id: 1, date_given: '2026-10-01' }, { id: 2, date_given: '2026-11-14' }, { id: 3, date_given: null }, { id: 4, date_given: '2025-03-02' }]
eq(sortAssistance(rows).map((r) => r.id), [2, 1, 4, 3], 'newest first; one with no date last')
eq(rows.map((r) => r.id), [1, 2, 3, 4], 'the list given is not reordered')
const text = assistanceText({ assistance_type: 'Fertilizer', quantity: '5 bags', source_agencies: ['DA', 'PCA'], item_type: 'Urea' })
for (const word of ['Fertilizer', '5 bags', 'DA', 'PCA', 'Urea']) ok(text.includes(word), `the search reads ${word}`)
eq(assistanceDate({ date_given: '2026-11-14' }), '2026-11-14', 'the Year filter reads the date given')

const page = read('../src/pages/Account/MyAssistancePage.jsx')
for (const piece of ['RecordList', 'ListTools', 'ConfirmReceivedModal', 'ReportNotReceivedModal', "'/interventions/my-beneficiary-history/'", 'formatAssistanceQuantity', 'onRetry={retry}', 'what="your assistance"']) {
  ok(page.includes(piece), `Assistance uses ${piece}`)
}
ok(page.includes("label: 'Received'") && page.includes("label: 'Not received'"), 'the two buttons of a waiting record')
// the same page for a fisherfolk: their own list, and the fisheries windows
for (const piece of ["'/interventions/my-fisherfolk-beneficiary-history/'", 'ConfirmReceivedDialog', '/interventions/fisherfolk-beneficiaries/', 'ReportNotReceivedModal domain={domain}']) {
  ok(page.includes(piece), `the fisheries side uses ${piece}`)
}
ok(page.includes("export default function MyAssistancePage({ domain = 'crop' })"), 'crop is the default, so the farmer is unchanged')
const routes = read('../src/pages/Account/accountRoutes.jsx')
ok(routes.includes('isFisherfolk ? <MyAssistancePage domain="fisheries" />') && routes.includes('<FisheriesAssistancePage />'), 'a fisherfolk gets the same page; the office and a fisherfolk organization keep theirs')
const fishRoute = read('../src/App.jsx').slice(read('../src/App.jsx').indexOf('path="/fisheries-assistance"'), read('../src/App.jsx').indexOf('path="/fisheries-assistance"') + 260)
ok(fishRoute.includes('<FisheriesAssistanceRoute />') && fishRoute.includes('allowFisherfolk') && fishRoute.includes('FISHERFOLK_ORG'), 'the fisheries address is the same for everyone who had it')
ok(routes.includes('isFarmer ? <MyAssistancePage domain="crop" />') && routes.includes('<CropAssistancePage />'), 'a farmer gets their Assistance page, the office and organizations theirs')
const app = read('../src/App.jsx')
const route = app.slice(app.indexOf('path="/crop-assistance"'), app.indexOf('path="/crop-assistance"') + 260)
ok(route.includes('<CropAssistanceRoute />') && route.includes('allowFarmer') && route.includes('FARMERS_ORG'), 'the address is the same for everyone who had it')
console.log(`ok - ${n} assertions`)
