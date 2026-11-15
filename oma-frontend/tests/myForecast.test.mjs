import assert from 'node:assert/strict'
import fs from 'node:fs'

// The farmer's Forecast page: growing crops with a countdown, then harvested ones with the estimate beside what was harvested.
const { FORECAST_SECTIONS, countdown, yieldDifference, kg, forecastText } = await import(new URL('../src/pages/Account/myForecast.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
const ok = (v, label) => { assert.ok(v, label); n++ }
const read = (p) => fs.readFileSync(new URL(p, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

eq(FORECAST_SECTIONS.map((s) => s.label), ['Growing', 'Harvested'], 'two sections')
const sectionOf = (status) => (FORECAST_SECTIONS.find((s) => s.match({ status })) || {}).label
eq(['Planted', 'Near Harvest', 'Harvested'].map(sectionOf), ['Growing', 'Growing', 'Harvested'], 'crops in the field, then harvested ones')

const TODAY = '2026-11-16'
eq(countdown('2027-02-09', TODAY), 'in 85 days', 'days to go')
eq(countdown('2026-11-17', TODAY), 'tomorrow', 'one day to go')
eq(countdown('2026-11-16', TODAY), 'today', 'the day itself')
eq(countdown('2026-11-15', TODAY), '1 day late', 'one day past')
eq(countdown('2026-11-04', TODAY), '12 days late', 'days past')
eq(countdown('2027-03-01', '2027-02-28'), 'tomorrow', 'across a month end')
eq(countdown(null, TODAY), '', 'no date, no countdown')
eq(countdown('nonsense', TODAY), '', 'an unreadable date, no countdown')

eq(yieldDifference(1000, 1120), { text: '+12%', tone: 'green' }, 'more than estimated')
eq(yieldDifference(1000, 920), { text: '-8%', tone: 'red' }, 'less than estimated')
eq(yieldDifference(1000, 1000), { text: '0%', tone: 'grey' }, 'as estimated')
eq(yieldDifference('1000.00', '1004'), { text: '0%', tone: 'grey' }, 'a difference under half a percent rounds to none')
eq(yieldDifference(0, 5), null, 'no estimate to compare with')
eq(yieldDifference(null, 5), null, 'a missing estimate')
eq(yieldDifference(1000, null), null, 'nothing harvested yet')
eq(yieldDifference(1000, ''), null, 'a blank harvest')

eq(kg(2400), '2,400 kg', 'kilos with a thousands comma')
eq(kg('93.75'), '93.75 kg', 'a decimal as it is')
eq(kg(0), '0 kg', 'zero is a value')
eq(kg(null), null, 'missing'); eq(kg(''), null, 'blank')
const text = forecastText({ crop_type_name: 'Ginger', variety_used: 'Native', farm_location_barangay: 'Santa Cecilia' })
for (const word of ['Ginger', 'Native', 'Santa Cecilia']) ok(text.includes(word), `the search reads ${word}`)

const page = read('../src/pages/Account/MyForecastPage.jsx')
for (const piece of ['RecordList', 'ListTools', 'ForecastDetailModal', 'YieldAnalysisTab', "ordering: 'forecast'", 'onRetry={retry}', 'what="your forecast"', 'Yield analysis']) {
  ok(page.includes(piece), `Forecast uses ${piece}`)
}
const routes = read('../src/pages/Account/accountRoutes.jsx')
ok(routes.includes('isFarmer ? <MyForecastPage />') && routes.includes('<ForecastingPage />'), 'a farmer gets their Forecast page, the office its own')
const app = read('../src/App.jsx')
const route = app.slice(app.indexOf('path="/forecasting"'), app.indexOf('path="/forecasting"') + 220)
ok(route.includes('<ForecastRoute />') && route.includes('allowFarmer'), 'the address is the same for both')
console.log(`ok - ${n} assertions`)
