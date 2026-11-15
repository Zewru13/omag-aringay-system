import assert from 'node:assert/strict'
import fs from 'node:fs'

// Home of the farmer, fisherfolk and organization accounts: a to-do list first, then what is active, then a short summary.
const { homeSources, homeSummary, homeActive, greeting, failedText } = await import(new URL('../src/pages/Account/homeData.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(homeSources('farmer', { isMember: false }), ['assistance', 'crops', 'parcels'], 'a farmer outside any organization asks for no loans')
eq(homeSources('farmer', { isMember: true }), ['assistance', 'crops', 'parcels', 'loans'], 'a member also loads loans')
eq(homeSources('fisherfolk', { isMember: false }), ['assistance', 'cycles'], 'fisherfolk')
eq(homeSources('fisherfolk', { isMember: true }), ['assistance', 'cycles', 'loans'], 'a fisherfolk member')
eq(homeSources('orgFish', { orgId: 3 }), ['members', 'confirmables', 'loans'], 'organization')
eq(homeSources(null), [], 'no account, nothing to load')

const crops = [{ id: 1, status: 'Planted', area_planted_ha: '1.56' }, { id: 2, status: 'Near Harvest', area_planted_ha: '0.04' }, { id: 3, status: 'Harvested', area_planted_ha: '2' }]
eq(homeSummary('farmer', { crops, parcels: [{}, {}] }), [{ label: 'Active crops', value: 2 }, { label: 'Total area', value: '1.6 ha' }, { label: 'Farm parcels', value: 2 }], 'a farmer')
eq(homeSummary('farmer', { crops, parcels: null })[2], { label: 'Farm parcels', value: null }, 'a failed source is unknown, not zero')
eq(homeSummary('farmer', { crops: null, parcels: [] }).map((f) => f.value), [null, null, 0], 'unknown crops, a real zero for parcels')
eq(homeSummary('farmer', { crops: [], parcels: [] }).map((f) => f.value), [0, '0 ha', 0], 'a farmer with nothing yet')
eq(homeActive('farmer', { crops }).map((r) => r.id), [1, 2], 'the active crops')
eq(homeActive('farmer', { crops: null }), [], 'nothing when the crops failed')

const cycles = [{ id: 1, status: 'Stocked', number_of_units: 2 }, { id: 2, status: 'Harvested', number_of_units: 1 }, { id: 3, status: 'Late', number_of_units: 1 }, { id: 4, status: 'Total Loss', number_of_units: 4 }]
eq(homeSummary('fisherfolk', { cycles }), [{ label: 'Active cycles', value: 2 }, { label: 'Ponds and cages', value: 3 }, { label: 'Harvested cycles', value: 1 }], 'a fisherfolk')
eq(homeSummary('fisherfolk', { cycles: null }).map((f) => f.value), [null, null, null], 'failed cycles are unknown')
eq(homeActive('fisherfolk', { cycles }).map((r) => r.id), [1, 3], 'the active cycles')

const members = [{ is_active: true }, { is_active: true }, { is_active: false }]
const loans = [{ status: 'BORROWED' }, { status: 'REQUESTED' }, { status: 'RETURNED' }, { status: 'RETURN_PENDING' }]
eq(homeSummary('orgFarm', { members, loans }, { isActive: (m) => m.is_active }), [{ label: 'Active members', value: 2 }, { label: 'Equipment on loan', value: 2 }, { label: 'Borrow requests', value: 1 }], 'an organization')
eq(homeSummary('orgFish', { members: null, loans: null }, { isActive: (m) => m.is_active }).map((f) => f.value), [null, null, null], 'a failed organization is unknown')
eq(homeActive('orgFarm', { members }), [], 'an organization has no active list on Home')

eq(greeting('farmer', 'Lourdes Villanueva'), { title: 'Hello, Lourdes Villanueva', line: 'Farmer account' }, 'farmer greeting')
eq(greeting('orgFarm', 'Santa Cecilia Farmers').line, 'Farmers organization account', 'farmers organization greeting')
eq(greeting('orgFish', 'Dulao Fishers').line, 'Fisherfolk organization account', 'fisherfolk organization greeting')
eq(greeting('fisherfolk', ''), { title: 'Hello', line: 'Fisherfolk account' }, 'no name')

eq(failedText(['parcels']), 'your farm parcels', 'one failed part, in plain words')
eq(failedText(['assistance', 'crops']), 'your assistance and your crops', 'two')
eq(failedText(['assistance', 'cycles', 'loans']), 'your assistance, your cycles and your equipment loans', 'three')
eq(failedText(['suggestions']), 'the activities that are due', 'the suggestions')

const home = read('../src/pages/Account/AccountHome.jsx')
ok(home.includes('settleAll') && home.includes('LoadFailed'), 'each part can fail on its own and says so')
ok(home.includes('capTodos') && home.includes('TodoCard'), 'the to-do list, capped')
ok(home.includes('Nothing needs you today'), 'the all-clear line')
ok(!/DonutCard|HarvestBarsCard|MonthlyBarsCard/.test(home), 'no charts on Home')
ok(home.indexOf('>To do today') > 0 && home.indexOf('>To do today') < home.indexOf('>Summary<'), 'to-do comes before the summary')
ok(!/month:\s*['"]long['"]/.test(home), 'the month is not written in full')
const page = read('../src/pages/Citizen/CitizenHomePage.jsx')
ok(page.includes('AccountHome') && !/FarmerPhoneHome|FisherfolkPhoneHome|OrgPhoneHome/.test(page), 'one Home for every kind')
for (const gone of ['FarmerPhoneHome', 'FisherfolkPhoneHome', 'OrgPhoneHome']) ok(!fs.existsSync(new URL(`../src/pages/Citizen/${gone}.jsx`, import.meta.url)), `${gone} is removed`)
const windows = read('../src/pages/Account/HomeWindows.jsx')
for (const piece of ['ViewLogsModal', 'RecordHarvestFromMonitoringModal', 'ConfirmReceivedModal', 'ReportNotReceivedModal']) {
  ok(windows.includes(piece), `a farmer's to-do opens ${piece} on Home`)
}
ok(/lazy\(\(\) => import\('\.\/HomeWindows\.jsx'\)\)/.test(home) && home.includes('<Suspense'), 'the windows are downloaded only when a button is pressed')
ok(home.includes('harvestGateInfo') && home.includes('onAct={act}'), 'Record harvest opens only when the crop may be harvested')
const card = read('../src/pages/Account/TodoCard.jsx')
ok(card.includes('onAct') && card.includes('todo.actions'), 'a to-do button opens its window in place, or links to its page')
ok(card.includes('min-h-[44px]') && !/text-\[(9|10|11|12)(\.\d+)?px\]/.test(card), 'a to-do button is 44px and no text is under 13px')
console.log(`ok - ${n} assertions`)
