import assert from 'node:assert/strict'

const { chartRows, varianceChip, formatValue, rowDescription, axisMax } = await import(new URL('../src/pages/Dashboard/yieldChart.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── crop rows (the server sends metric tons per hectare)
const crops = [
  { crop: 'Palay (Rice)', target_mt_ha: 4.5, actual_mt_ha: 3.9, variance_pct: -13.3, season: 'Wet', year: 2026 },
  { crop: 'Tomato', target_mt_ha: 12, actual_mt_ha: 13.8, variance_pct: 15, season: 'Dry', year: 2026 },
]
eq(chartRows('crop', crops), [
  { name: 'Palay (Rice)', target: 4.5, actual: 3.9, variancePct: -13.3, unit: 'mt/ha', season: 'Wet 2026' },
  { name: 'Tomato', target: 12, actual: 13.8, variancePct: 15, unit: 'mt/ha', season: 'Dry 2026' },
], 'crop rows')

// ── fisheries rows (totals in kg per species)
const fish = [{ species: 'Tilapia', target_kg: 400, actual_kg: 340, variance_pct: -15, season: 'Dry', year: 2026, records: 2 }]
eq(chartRows('fisheries', fish), [{ name: 'Tilapia', target: 400, actual: 340, variancePct: -15, unit: 'kg', season: 'Dry 2026' }], 'fisheries rows')
eq(chartRows('crop', null), [], 'no data')
eq(chartRows('crop', [{ crop: 'X', target_mt_ha: 1, actual_mt_ha: 1, variance_pct: null, season: '', year: null }])[0].season, '', 'no season is blank, not "undefined"')

// ── the variance chip under each pair of columns
eq(varianceChip(15), { text: '▲ 15%', tone: 'safe' }, 'above target')
eq(varianceChip(-13.3), { text: '▼ 13.3%', tone: 'critical' }, 'below target')
eq(varianceChip(0), { text: '0%', tone: 'neutral' }, 'on target')
eq(varianceChip(null), { text: '—', tone: 'neutral' }, 'no variance')

// ── numbers
eq(formatValue(4.5, 'mt/ha'), '4.5 mt/ha', 'crop value')
eq(formatValue(1234.5, 'kg'), '1,234.5 kg', 'thousands separator')

// ── the sentence a screen reader gets for a pair of columns
eq(rowDescription(chartRows('crop', crops)[0]), 'Palay (Rice): target 4.5 mt/ha, actual 3.9 mt/ha, 13.3% below target', 'below')
eq(rowDescription(chartRows('crop', crops)[1]), 'Tomato: target 12 mt/ha, actual 13.8 mt/ha, 15% above target', 'above')
eq(rowDescription({ name: 'X', target: 1, actual: 1, variancePct: 0, unit: 'kg' }), 'X: target 1 kg, actual 1 kg, on target', 'on target')

// ── the top of the value axis leaves room above the tallest column
eq(axisMax(chartRows('crop', crops)), 16, 'room above 13.8')
eq(axisMax([]), 1, 'empty chart still has an axis')
eq(axisMax([{ target: 0, actual: 0 }]), 1, 'all zero still has an axis')

console.log(`yieldChart: ${n} checks passed`)
