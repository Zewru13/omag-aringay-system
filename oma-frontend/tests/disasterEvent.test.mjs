import assert from 'node:assert/strict'

const {
  cropLabel, isSelected, selectCrop, selectMany, allSelected, allTotal, markTotal, updateRow, counts,
} = await import(new URL('../src/pages/Monitoring/disasterEvent.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const LABEL = 'Palay (Rice) · Wet 2026 — planted 2026-05-01'
const rec = (id, over = {}) => ({ id, label: LABEL, crop_type_name: 'Palay (Rice)', season: 'Wet', year: 2026, date_planted: '2026-05-01', area_planted_ha: '2.00', ...over })
const parcel1 = [rec(1), rec(2, { area_planted_ha: '1.5000' })]
const parcel2 = [rec(3), rec(7)]

eq(cropLabel(rec(1)), LABEL, 'crop label')
eq(cropLabel({ crop_type_name: '' }), 'Crop', 'a crop with no name')

// ── selecting crops
let sel = {}
sel = selectCrop(sel, parcel1[0], true)
eq([isSelected(sel, parcel1[0]), isSelected(sel, parcel1[1])], [true, false], 'one crop ticked')
eq(sel[1], { id: 1, label: LABEL, plantedHa: 2, area: '2', total: false }, 'starts with its whole planted area, not a total loss')
sel = updateRow(sel, 1, (r) => ({ ...r, area: '0.5' }))
eq(selectCrop(sel, parcel1[0], true)[1].area, '0.5', 'ticking again keeps what was typed')
eq(selectCrop(sel, parcel1[0], false), {}, 'un-ticking removes it')
eq(updateRow(sel, 99, (r) => r), sel, 'an unknown crop changes nothing')

sel = selectMany(sel, parcel1, true)
eq([allSelected(sel, parcel1), allSelected(sel, parcel2), allSelected(sel, [])], [true, false, false], 'all crops of a parcel')
eq(Object.keys(sel).map(Number).sort(), [1, 2], 'two crops selected')
eq(sel[1].area, '0.5', 'select all keeps an area already typed')

// ── total loss
eq(allTotal(sel, parcel1), false, 'none are a total loss yet')
sel = markTotal(sel, parcel1, true)
eq([allTotal(sel, parcel1), sel[1].area, sel[2].area, sel[2].total], [true, '2', '1.5', true], 'total loss: whole area, marked')
sel = markTotal(sel, parcel2, true)
eq(Object.keys(sel).map(Number).sort(), [1, 2, 3, 7], 'marking total loss also selects the crops')
eq(allTotal(sel, [...parcel1, ...parcel2]), true, 'total loss across parcels')
sel = markTotal(sel, parcel1, false)
eq([sel[1].total, sel[2].total, sel[1].area, isSelected(sel, parcel1[0])], [false, false, '2', true], 'switching it off clears the marks only')
eq(allTotal(sel, [...parcel1, ...parcel2]), false, 'no longer all total loss')
eq(markTotal({}, parcel1, false), {}, 'switching off with nothing selected changes nothing')

// ── counting
eq(counts(sel), { crops: 4, total: 2 }, 'counts')
eq(counts({}), { crops: 0, total: 0 }, 'nothing selected')

console.log(`disasterEvent: ${n} checks passed`)
