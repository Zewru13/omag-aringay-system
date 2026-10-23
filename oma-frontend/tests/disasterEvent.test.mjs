import assert from 'node:assert/strict'

const {
  growingRecords, groupByParcel, cropLabel, isSelected, selectCrop, selectMany, allSelected, allTotal, markTotal, updateRow, dropRecords,
  counts, orderedSelection, farmerLine,
} = await import(new URL('../src/pages/Monitoring/disasterEvent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const rec = (id, over = {}) => ({ id, crop_type_name: 'Palay (Rice)', season: 'Wet', year: 2026, date_planted: '2026-05-01', area_planted_ha: '2.00',
  status: 'Planted', farm_parcel: 10, parcel_number: '01-33-02-005-001-02-003', ...over })
const records = [
  rec(1), rec(2, { crop_type_name: 'Corn (Mais)', area_planted_ha: '1.5000' }), rec(3, { farm_parcel: 11, parcel_number: '01-33-02-005-001-02-004' }),
  rec(4, { farm_parcel: null, parcel_number: '' }), rec(5, { status: 'Harvested' }), rec(6, { status: 'Total Loss' }), rec(7, { status: 'Near Harvest', farm_parcel: 11, parcel_number: '01-33-02-005-001-02-004' }),
]

// ── what is shown
eq(growingRecords(records).map((r) => r.id), [1, 2, 3, 4, 7], 'only crops still in the field')
eq(cropLabel(rec(1)), 'Palay (Rice) · Wet 2026 — planted 2026-05-01', 'crop label')
const groups = groupByParcel(records)
eq(groups.map((g) => [g.label, g.records.map((r) => r.id)]),
  [['Parcel 01-33-02-005-001-02-003', [1, 2]], ['Parcel 01-33-02-005-001-02-004', [3, 7]], ['No parcel on file', [4]]], 'grouped by parcel, no-parcel last')
eq(groups[0].records[0].label, 'Palay (Rice) · Wet 2026 — planted 2026-05-01', 'records carry the label the rows show')
eq(groupByParcel([rec(8, { parcel_number: '' })])[0].label, 'Parcel #10', 'a parcel with no number')
eq(groupByParcel([]), [], 'nothing growing')

// ── selecting crops
const [p1, p2, none] = groups
let sel = {}
sel = selectCrop(sel, p1.records[0], true)
eq([isSelected(sel, p1.records[0]), isSelected(sel, p1.records[1])], [true, false], 'one crop ticked')
eq(sel[1], { id: 1, label: 'Palay (Rice) · Wet 2026 — planted 2026-05-01', plantedHa: 2, area: '2', total: false }, 'starts with its whole planted area, not a total loss')
sel = updateRow(sel, 1, (r) => ({ ...r, area: '0.5' }))
eq(selectCrop(sel, p1.records[0], true)[1].area, '0.5', 'ticking again keeps what was typed')
eq(selectCrop(sel, p1.records[0], false), {}, 'un-ticking removes it')
eq(updateRow(sel, 99, (r) => r), sel, 'an unknown crop changes nothing')

sel = selectMany(sel, p1.records, true)
eq([allSelected(sel, p1.records), allSelected(sel, p2.records), allSelected(sel, [])], [true, false, false], 'all crops of a parcel')
eq(Object.keys(sel).map(Number).sort(), [1, 2], 'two crops selected')
eq(sel[1].area, '0.5', 'select all keeps an area already typed')

// ── all total loss
eq(allTotal(sel, p1.records), false, 'none are a total loss yet')
sel = markTotal(sel, p1.records, true)
eq([allTotal(sel, p1.records), sel[1].area, sel[2].area, sel[2].total], [true, '2', '1.5', true], 'all total loss: whole area, marked')
sel = markTotal(sel, p2.records, true)
eq(Object.keys(sel).map(Number).sort(), [1, 2, 3, 7], 'marking total loss also selects the crops')
eq(allTotal(sel, [...p1.records, ...p2.records]), true, 'all total loss across parcels')
sel = markTotal(sel, p1.records, false)
eq([sel[1].total, sel[2].total, sel[1].area, isSelected(sel, p1.records[0])], [false, false, '2', true], 'switching it off clears the marks only')
eq(allTotal(sel, [...p1.records, ...p2.records]), false, 'no longer all total loss')
eq(markTotal({}, none.records, false), {}, 'switching off with nothing selected changes nothing')

// ── counting and sending
eq(counts(sel), { crops: 4, total: 2 }, 'counts')
const ordered = orderedSelection(sel, [groups, [{ key: 'x', records: [rec(20)] }]])
eq(ordered.rows.map((r) => r.id), [1, 2, 3, 7], 'sent in the order shown')
eq(ordered.records.map((r) => r.id), [1, 2, 3, 7], 'with the records they came from')
eq(Object.keys(dropRecords(sel, p1.records)).map(Number).sort(), [3, 7], 'taking a farmer off drops his crops')
eq(farmerLine(0, 0), 'No crops selected', 'summary: none')
eq(farmerLine(1, 1), '1 crop of 1 farmer selected', 'summary: one')
eq(farmerLine(5, 2), '5 crops of 2 farmers selected', 'summary: many')

console.log(`disasterEvent: ${n} checks passed`)
