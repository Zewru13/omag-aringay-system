import test from 'node:test'
import assert from 'node:assert/strict'
import {
  assistanceTypeSlices, countBy, disasterSlices, harvestBars, hasBars, hasData, hasMonthly, limitSlices,
  memberSlices, monthlyCounts, statusSlices, withColors,
} from '../src/pages/Citizen/homeCharts.js'

test('countBy counts, sorts biggest first and keeps blanks under a label', () => {
  const rows = [{ t: 'Flood' }, { t: 'Drought' }, { t: 'Flood' }, { t: '' }, {}]
  assert.deepEqual(countBy(rows, (r) => r.t), [
    { name: 'Flood', value: 2 }, { name: 'Not stated', value: 2 }, { name: 'Drought', value: 1 },
  ])
  assert.deepEqual(countBy(null, (r) => r.t), [])
})

test('limitSlices folds the smallest slices into Other and leaves a short list alone', () => {
  const slices = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((name, i) => ({ name, value: 10 - i }))
  const limited = limitSlices(slices, 5)
  assert.equal(limited.length, 5)
  assert.deepEqual(limited[4], { name: 'Other', value: 6 + 5 + 4 })
  assert.equal(limited.reduce((s, x) => s + x.value, 0), slices.reduce((s, x) => s + x.value, 0))
  assert.equal(limitSlices(slices.slice(0, 3), 5).length, 3)
})

test('statusSlices merges Planted and Stocked into Growing and keeps cycle order and fixed colours', () => {
  const slices = statusSlices([
    { status: 'Harvested' }, { status: 'Planted' }, { status: 'Stocked' }, { status: 'Near Harvest' }, { status: 'Total Loss' },
  ])
  assert.deepEqual(slices.map((s) => [s.name, s.value]), [
    ['Growing', 2], ['Near harvest', 1], ['Harvested', 1], ['Total loss', 1],
  ])
  assert.equal(slices[0].color, '#4C9F70')
  // a crop with no near-harvest record does not move the others' colours
  assert.equal(statusSlices([{ status: 'Harvested' }])[0].color, '#1B4D2E')
})

test('disasterSlices counts by type label and colours each slice', () => {
  const slices = disasterSlices([
    { disaster_type_label: 'Typhoon' }, { disaster_type_label: 'Typhoon' }, { disaster_type_label: 'Flood' },
  ])
  assert.deepEqual(slices.map((s) => [s.name, s.value]), [['Typhoon', 2], ['Flood', 1]])
  assert.ok(slices.every((s) => /^#[0-9A-F]{6}$/i.test(s.color)))
  assert.notEqual(slices[0].color, slices[1].color)
})

test('assistanceTypeSlices folds more than five types into Other', () => {
  const records = ['Seeds', 'Fertilizer', 'Feed', 'Tools', 'Cash', 'Nets', 'Boats'].map((assistance_type) => ({ assistance_type }))
  const slices = assistanceTypeSlices(records)
  assert.equal(slices.length, 5)
  assert.equal(slices[4].name, 'Other')
  assert.equal(slices[4].value, 3)
})

test('memberSlices splits active and inactive and hides an empty side', () => {
  const isActive = (m) => m.is_active !== false
  assert.deepEqual(memberSlices([{}, {}, { is_active: false }], isActive).map((s) => [s.name, s.value]), [['Active', 2], ['Inactive', 1]])
  assert.deepEqual(memberSlices([{}], isActive).map((s) => s.name), ['Active'])
  assert.deepEqual(memberSlices([], isActive), [])
})

test('harvestBars keeps only rows with both figures, newest first, at most the limit', () => {
  const rows = [
    { crop: 'Rice', est: '1000', act: '1200', d: '2026-03-01' },
    { crop: 'Corn', est: '500', act: null, d: '2026-05-01' },
    { crop: 'Okra', est: '0', act: '40', d: '2026-06-01' },
    { crop: 'Beans', est: '200', act: '150', d: '2026-04-01' },
    { crop: 'Squash', est: '300', act: '310', d: '2026-02-01' },
  ]
  const opts = { nameOf: (r) => r.crop, estimateKey: 'est', actualKey: 'act', dateOf: (r) => r.d }
  assert.deepEqual(harvestBars(rows, opts), [
    { name: 'Beans', estimate: 200, actual: 150 },
    { name: 'Rice', estimate: 1000, actual: 1200 },
    { name: 'Squash', estimate: 300, actual: 310 },
  ])
  assert.equal(harvestBars(rows, { ...opts, limit: 2 }).length, 2)
  assert.deepEqual(harvestBars(null, opts), [])
})

test('harvestBars drops a trailing local name from the label', () => {
  const bars = harvestBars([{ c: 'Palay (Rice)', e: 10, a: 12, d: '2026-01-01' }], { nameOf: (r) => r.c, estimateKey: 'e', actualKey: 'a', dateOf: (r) => r.d })
  assert.equal(bars[0].name, 'Palay')
})

test('monthlyCounts returns twelve months of the chosen year only', () => {
  const rows = [{ d: '2026-01-05' }, { d: '2026-01-20' }, { d: '2026-12-31' }, { d: '2025-12-31' }, { d: '' }, {}]
  const months = monthlyCounts(rows, (r) => r.d, 2026)
  assert.equal(months.length, 12)
  assert.deepEqual(months[0], { month: 'Jan', value: 2 })
  assert.deepEqual(months[11], { month: 'Dec', value: 1 })
  assert.equal(months.reduce((s, m) => s + m.value, 0), 3)
})

test('the has* helpers say when there is nothing to draw', () => {
  assert.equal(hasData([]), false)
  assert.equal(hasData([{ name: 'a', value: 0 }]), false)
  assert.equal(hasData([{ name: 'a', value: 1 }]), true)
  assert.equal(hasBars([]), false)
  assert.equal(hasBars([{ name: 'a', estimate: 1, actual: 1 }]), true)
  assert.equal(hasMonthly(monthlyCounts([], (r) => r.d, 2026)), false)
  assert.equal(hasMonthly(monthlyCounts([{ d: '2026-02-02' }], (r) => r.d, 2026)), true)
})

test('withColors never reuses a category colour inside five slices', () => {
  const colors = withColors(['a', 'b', 'c', 'd', 'e'].map((name) => ({ name, value: 1 }))).map((s) => s.color)
  assert.equal(new Set(colors).size, 5)
})
