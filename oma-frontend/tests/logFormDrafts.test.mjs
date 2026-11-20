import assert from 'node:assert/strict'
import fs from 'node:fs'

// The fisheries Log Feeding / Log Health forms (FeedingLogTab, HealthLogTab): opening one is not a draft, and a saved or cancelled form leaves
// no draft behind. (A reset AFTER draft.clear() starts the draft again, and closing the window then keeps the stale typed values.)
let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const source = fs.readFileSync(new URL('../src/pages/Monitoring/AquacultureCycleDetailModal.jsx', import.meta.url), 'utf8')
const part = (from, to) => { const a = source.indexOf(from); return source.slice(a, source.indexOf(to, a + 20)) }
const feeding = part('export function FeedingLogTab', 'export function HealthLogTab')
const health = source.slice(source.indexOf('export function HealthLogTab'))

for (const [name, tab, dateField] of [['feeding', feeding, 'feeding_date'], ['health', health, 'log_date']]) {
  // the date starts on today in both modes, so the Log button (which sets today) does not make a draft by itself
  eq(tab.includes(`${dateField}: formOnly ? todayISOLocal() : ''`), false, `${name}: the date does not start empty`)
  eq(tab.includes(`${dateField}: todayISOLocal(),`), true, `${name}: the date starts on today`)
  // Cancel throws the draft away
  eq(/draft\.discard\(\)/.test(tab), true, `${name}: Cancel discards the draft`)
  // a saved form: the draft is cleared, and last
  eq(/draft\.clear\(\)/.test(tab), true, `${name}: a saved log clears the draft`)
}
eq(feeding.indexOf('setUnitQty({})') < feeding.indexOf('draft.clear()'), true, 'feeding: the reset comes before the clear')
for (const m of health.matchAll(/resetForm\(\)/g)) {
  const after = health.slice(m.index, m.index + 160)
  if (health.slice(Math.max(0, m.index - 20), m.index).includes('const ')) continue   // the definition
  eq(after.includes('draft.clear()'), true, 'health: every reset after a save is followed by the clear')
}
console.log(`ok - ${n} assertions`)
