import assert from 'node:assert/strict'
import fs from 'node:fs'

// The fisherfolk's Disasters page: the reports first, and Report a disaster as a window.
const { disasterText, stockLabel } = await import(new URL('../src/pages/Account/myDisasters.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

const text = disasterText({ disaster_type_label: 'Typhoon', affected_stock: 'Tilapia #1', report_number: 'FD-2026-0002' })
for (const word of ['Typhoon', 'Tilapia #1', 'FD-2026-0002']) ok(text.includes(word), `the search reads ${word}`)
ok(disasterText({ disaster_type_label: 'Flood', crop: 'Ginger' }).includes('Ginger'), "a farmer's report still reads its crop")
eq(stockLabel({ affected_stock: 'Tilapia #1' }), 'Tilapia #1', 'the stock it was on')
eq(stockLabel({ affected_stock: '' }), 'Not linked to a stock', 'a report not on a stock says so')

const page = read('../src/pages/Account/MyFisheriesDisastersPage.jsx')
for (const piece of ['RecordList', 'ListTools', 'FisherfolkStockDisasterModal', 'DisasterLogDetailsModal', 'MarkRecoveredModal', "'/fisheries/disaster-reports/'", "'/monitoring/fisherfolk-disasters/eligibility/'", 'fetchAllStocks', "searchParams.get('stock')", 'Report a disaster', 'Mark recovered', 'kind="fisheries"', 'onRetry={retry}', 'eligibility.message']) {
  ok(page.includes(piece), `Disasters uses ${piece}`)
}
ok(!/\binline\b/.test(page), 'the report opens as a window, not as the page')
const router = read('../src/pages/Monitoring/DisasterPage.jsx')
ok(router.includes('if (isFisherfolk) return <MyFisheriesDisastersPage />') && router.includes('if (isFarmer) return <MyDisastersPage />') && router.includes('<AdminDisasterPage />'), 'each account gets its own page')
console.log(`ok - ${n} assertions`)
