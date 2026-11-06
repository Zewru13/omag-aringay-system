import assert from 'node:assert/strict'
import fs from 'node:fs'

// Crop Forecasting's Act. Yield (kg) and Actual Harvest Date columns, built the way Fisheries Forecasting builds its own.
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const read = (path) => fs.readFileSync(new URL(path, import.meta.url), 'utf8')

const {
  actualYieldFacts, varianceShortLabel, varianceLongLabel, varianceBadgeCls, timingFacts, VARIANCE_TONE_CLS, TIMING_SHORT, TIMING_BADGE_CLS,
} = await import(new URL('../src/pages/Forecasting/cropForecastActuals.js', import.meta.url).href)

// ── the yield comparison: the fisheries rule, ((actual - estimated) / estimated) * 100
const crop = (actual, estimated) => ({ actual_yield_kg: actual, estimated_yield_kg: estimated })
const f = actualYieldFacts(crop('1200.00', '1000.00'))
eq([f.kgText, Math.round(f.v.pct * 10) / 10, f.v.diff, f.badge, f.cls === VARIANCE_TONE_CLS.green], ['1,200.00', 20, 200, '+20% above', true], '20% above the estimate')
const g = actualYieldFacts(crop('700', '1000'))
eq([g.kgText, g.v.diff, g.badge, g.cls === VARIANCE_TONE_CLS.amber], ['700.00', -300, '30% less', true], '30% less is amber, like the fisheries badge')
const h = actualYieldFacts(crop('100', '1000'))
eq([h.badge, h.cls === VARIANCE_TONE_CLS.amber], ['90% less', true], 'far below the estimate is still the fisheries amber (never a verdict)')
const o = actualYieldFacts(crop('1000', '1000'))
eq([o.badge, o.cls === VARIANCE_TONE_CLS.slate], ['On estimate', true], 'exactly on the estimate')
eq(actualYieldFacts(crop('1000.004', '1000')).badge, 'On estimate', 'less than half a gram off is on estimate')
eq(actualYieldFacts(crop('1000.04', '1000')).badge, 'On estimate', 'a variance that rounds to 0.0% is on estimate')
eq(actualYieldFacts(crop('1500.5', '1000')).kgText, '1,500.50', 'two decimals like the fisheries Actual Harvest')

// nothing harvested: a dash and no badge, never an invented number
eq(actualYieldFacts(crop(null, '1000')), { kgText: '—', v: null, badge: '', cls: '' }, 'no harvest yet')
eq(actualYieldFacts(crop(undefined, '1000')).kgText, '—', 'no actual yield field')
eq(actualYieldFacts(crop('', '1000')).kgText, '—', 'empty actual yield')
// harvested, but no estimate to compare with: the kg shows, no percentage
eq(actualYieldFacts(crop('800', null)), { kgText: '800.00', v: null, badge: '', cls: '' }, 'no estimate: kg only')
eq(actualYieldFacts(crop('800', '0')).badge, '', 'a zero estimate gives no percentage')
eq(actualYieldFacts(crop('0', '1000')).badge, '100% less', 'a harvest of 0 kg is 100% less')

eq([varianceShortLabel({ pct: 20, diff: 200 }), varianceShortLabel({ pct: -30, diff: -300 }), varianceShortLabel({ pct: 0, diff: 0 })], ['+20% above', '30% less', 'On estimate'], 'short labels')
eq([varianceLongLabel({ pct: 20, diff: 200 }), varianceLongLabel({ pct: -30, diff: -300 })], ['+20% above estimate', '30% less than estimate'], 'long labels')
eq(varianceBadgeCls({ pct: 5, diff: 5 }), VARIANCE_TONE_CLS.green, 'above is green')

// ── Early / On-Time / Late come from the server (fisheries.models.harvest_timing); the screen only shows them
eq(timingFacts({ latest_harvest_date: '2026-09-05', actual_harvest_timing: 'early', actual_harvest_timing_days: -5 }),
  { date: '2026-09-05', timing: 'early', text: 'Early', cls: TIMING_BADGE_CLS.early, days: -5 }, 'early')
eq(timingFacts({ latest_harvest_date: '2026-09-14', actual_harvest_timing: 'late', actual_harvest_timing_days: 4 }).text, 'Late', 'late')
eq(timingFacts({ latest_harvest_date: '2026-09-10', actual_harvest_timing: 'on_time', actual_harvest_timing_days: 0 }).text, 'On-Time', 'on time')
eq(timingFacts({ latest_harvest_date: null, actual_harvest_timing: null }), null, 'no harvest: no date, no badge')
eq(timingFacts({}), null, 'nothing sent')
eq(timingFacts({ latest_harvest_date: '2026-09-10', actual_harvest_timing: null }).text, '', 'a date with no expected date to compare: the date, no badge')

// ── the same look as Fisheries Forecasting: the very same colour classes and badge shape
const fish = read('../src/pages/Monitoring/FisheriesForecastingTab.jsx')
for (const [name, cls] of Object.entries({ ...VARIANCE_TONE_CLS, ...Object.fromEntries(Object.entries(TIMING_BADGE_CLS).map(([k, v]) => [`timing ${k}`, v])) })) {
  eq(fish.includes(`'${cls}'`), true, `Fisheries Forecasting uses the same classes for ${name}`)
}
eq([TIMING_SHORT.early, TIMING_SHORT.on_time, TIMING_SHORT.late], ['Early', 'On-Time', 'Late'], 'badge words')
const badgeShape = 'rounded-full border px-2 py-0.5 text-[11px] font-semibold'
eq(fish.includes(badgeShape), true, 'the fisheries badge shape')
const page = read('../src/pages/Forecasting/ForecastingPage.jsx')
eq(page.includes(badgeShape), true, 'the crop badge has the same shape (padding, size, weight, rounding)')
eq(page.includes('inline-flex items-center gap-1.5 whitespace-nowrap'), true, 'the value and its badge sit side by side with the same spacing')

// ── the table: Act. Yield right after Est. Yield, Actual Harvest Date right after the expected date
const keys = [...page.matchAll(/\{ key: '([a-z_]+)',\s+label: '([^']+)' \}/g)].map((m) => m[2])
eq(keys, ['CROP', 'FARMER', 'AREA (HA)', 'EST. YIELD (KG)', 'ACT. YIELD (KG)', 'EXPECTED HARVEST DATE', 'ACTUAL HARVEST DATE', 'STATUS', 'DETAILS'], 'the column order')
eq(page.includes("'Planted,Near Harvest,Harvested'"), true, 'harvested crops are listed so their actual harvest shows')
eq(page.includes("ordering: 'forecast'"), true, 'growing crops first')
eq(page.includes('value="Harvested"'), true, 'a Harvested status option')
eq(page.includes('actualYieldFacts(') && page.includes('timingFacts('), true, 'the cells use the helpers')
eq(page.includes('/production/monitoring/'), true, 'the existing crop records are the source')

// ── Aquaculture Monitoring: the PCIC Insured filter
const aqua = read('../src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
eq(aqua.includes('aria-label="PCIC insured"') && aqua.includes("params.set('pcic', pcicFilter)"), true, 'the filter is sent as ?pcic=')
eq(aqua.includes('pcicFilter') && /activeCount=\{\[[^\]]*Boolean\(pcicFilter\)/.test(aqua), true, 'it counts as an active filter')
eq(/AQUACULTURE_PCIC_OPTIONS/.test(aqua), true, 'its options come from one list')
const { AQUACULTURE_PCIC_OPTIONS } = await import(new URL('../src/utils/pcic.js', import.meta.url).href)
eq(AQUACULTURE_PCIC_OPTIONS.map((o) => [o.value, o.label]), [['', 'PCIC Insured: All'], ['insured', 'PCIC Insured: Insured'], ['not_insured', 'PCIC Insured: Not Insured']], 'All / Insured / Not Insured')
eq(aqua.includes("label: 'PCIC INSURED'") || aqua.includes("label: 'PCIC INSURED'"), true, 'the PCIC INSURED column is still there')

console.log(`ok - ${n} assertions`)
