import assert from 'node:assert/strict'

const {
  SORTS, PAGE_SIZE, parcelTitle, prepareParcels, filterParcels, sortParcels, pageOf, pageCount, allCrops, parcelState, orderedRows,
  selectedStats, summaryLine, barangayOptions, farmerOptions,
} = await import(new URL('../src/pages/Monitoring/disasterTargets.js', import.meta.url).href)
const { selectCrop, markTotal } = await import(new URL('../src/pages/Monitoring/disasterEvent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const crop = (id, name = 'Palay (Rice)', ha = '2.00') => ({ id, crop_type_name: name, season: 'Wet', year: 2026, date_planted: '2026-05-01', area_planted_ha: ha, status: 'Planted' })
const parcel = (id, farmer, name, barangay, crops, over = {}) => ({
  key: id ? `p${id}` : `f${farmer}`, parcel_id: id, parcel_number: id ? `01-33-02-005-001-02-00${id}` : '', farmer_id: farmer, farmer_name: name,
  rsbsa_number: `RS-${farmer}`, barangay, area_hectares: '5.00', land_ownership: 'Owner', crops, ...over,
})
const parcels = prepareParcels([
  parcel(1, 10, 'Ana Cruz', 'Basca', [crop(1), crop(2, 'Corn (Mais)', '1.50')]),
  parcel(2, 10, 'Ana Cruz', 'Alaska', [crop(3)]),
  parcel(3, 11, 'Ben Dizon', 'Basca', [crop(4, 'Mango')]),
  parcel(0, 12, 'Cora Lim', 'Dulao', [crop(5)]),
])

// ── what is shown
eq(parcels.map((p) => p.title), ['Parcel 01-33-02-005-001-02-001', 'Parcel 01-33-02-005-001-02-002', 'Parcel 01-33-02-005-001-02-003', 'No parcel on file'], 'titles')
eq(parcelTitle({ parcel_id: 9, parcel_number: '' }), 'Parcel #9', 'a parcel with no number')
eq(parcels[0].crops[0], { id: 1, crop_type_name: 'Palay (Rice)', season: 'Wet', year: 2026, date_planted: '2026-05-01', area_planted_ha: '2.00', status: 'Planted', farmer: 10, label: 'Palay (Rice) · Wet 2026 — planted 2026-05-01' }, 'a crop carries its farmer and label')
eq(prepareParcels(undefined), [], 'nothing loaded')

// ── search and filters
const ids = (list) => list.map((p) => p.parcel_id)
eq(ids(filterParcels(parcels, {})), [1, 2, 3, 0], 'no filter')
eq(ids(filterParcels(parcels, { search: 'ana' })), [1, 2], 'search by farmer')
eq(ids(filterParcels(parcels, { search: 'RS-11' })), [3], 'search by RSBSA')
eq(ids(filterParcels(parcels, { search: '005-001-02-002' })), [2], 'search by parcel number')
eq(ids(filterParcels(parcels, { search: 'mango' })), [3], 'search by crop')
eq(ids(filterParcels(parcels, { search: 'ana corn' })), [1], 'every word must match')
eq(ids(filterParcels(parcels, { search: 'nobody' })), [], 'nothing found')
eq(ids(filterParcels(parcels, { barangay: 'Basca' })), [1, 3], 'per barangay')
eq(ids(filterParcels(parcels, { farmer: '10' })), [1, 2], 'per farmer (as text or number)')
eq(ids(filterParcels(parcels, { farmer: 10, barangay: 'Alaska', search: 'palay' })), [2], 'filters combine')

// ── the sort order
eq(SORTS.map((m) => m.id), ['farmer', 'barangay', 'parcel'], 'three sorts')
eq(ids(sortParcels(parcels, 'farmer')), [1, 2, 3, 0], 'by farmer, then parcel')
eq(ids(sortParcels(parcels, 'barangay')), [2, 1, 3, 0], 'by barangay, then farmer')
eq(ids(sortParcels(parcels, 'parcel')), [1, 2, 3, 0].sort((a, b) => parcels.find((p) => p.parcel_id === a).title.localeCompare(parcels.find((p) => p.parcel_id === b).title, undefined, { numeric: true })), 'by parcel number')

// ── pages
const many = prepareParcels(Array.from({ length: 30 }, (_, i) => parcel(i + 1, 10, 'Ana Cruz', 'Basca', [crop(100 + i)])))
eq(PAGE_SIZE, 25, 'page size')
eq([pageOf(sortParcels(many, 'farmer'), 1).length, pageOf(sortParcels(many, 'farmer'), 2).length], [25, 5], 'two pages')
eq([pageCount(0), pageCount(25), pageCount(26)], [1, 1, 2], 'page count')

// ── ticking
const every = allCrops(parcels)
eq(every.map((c) => c.id), [1, 2, 3, 4, 5], 'every crop in order')
let sel = {}
eq(parcelState(sel, parcels[0]), { picked: 0, all: false, total: false }, 'nothing ticked')
sel = selectCrop(sel, parcels[0].crops[0], true)
eq(parcelState(sel, parcels[0]), { picked: 1, all: false, total: false }, 'one of two crops')
sel = markTotal(sel, parcels[0].crops, true)
eq(parcelState(sel, parcels[0]), { picked: 2, all: true, total: true }, 'the whole parcel is a total loss')
eq(parcelState(sel, parcels[1]), { picked: 0, all: false, total: false }, 'another parcel is untouched')
sel = selectCrop(sel, parcels[2].crops[0], true)
const ordered = orderedRows(sel, parcels)
eq([ordered.rows.map((r) => r.id), ordered.records.map((r) => r.id)], [[1, 2, 4], [1, 2, 4]], 'sent in the order shown')
eq(selectedStats(sel, parcels), { crops: 3, parcels: 2, farmers: 2 }, 'stats')
eq([summaryLine({ crops: 0, parcels: 0, farmers: 0 }), summaryLine({ crops: 1, parcels: 1, farmers: 1 }), summaryLine({ crops: 3, parcels: 2, farmers: 2 })],
  ['No crops selected', '1 crop on 1 parcel of 1 farmer selected', '3 crops on 2 parcels of 2 farmers selected'], 'summary')

// ── the filter lists
eq(barangayOptions(parcels), ['Alaska', 'Basca', 'Dulao'], 'barangays')
eq(farmerOptions(parcels), [{ id: 10, name: 'Ana Cruz' }, { id: 11, name: 'Ben Dizon' }, { id: 12, name: 'Cora Lim' }], 'farmers')

console.log(`disasterTargets: ${n} checks passed`)
