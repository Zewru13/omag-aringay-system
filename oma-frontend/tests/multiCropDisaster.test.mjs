import assert from 'node:assert/strict'

const {
  MAX_CROPS, toRows, isWholeArea, areaProblem, withArea, withTotal, dateProblem, buildRequest, selectionSummary, filterCrops,
} = await import(new URL('../src/pages/Monitoring/multiCropDisaster.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const crops = [
  { id: 1, crop_type_name: 'Palay (Rice)', label: 'Palay (Rice) · Wet 2026', area_planted_ha: '1.5000', date_planted: '2026-05-01' },
  { id: 2, crop_type_name: 'Corn (Mais)', label: 'Corn (Mais) · Wet 2026', area_planted_ha: '2.00', date_planted: '2026-06-10' },
  { id: 3, crop_type_name: 'Tomato', label: 'Tomato · Dry 2026', area_planted_ha: null, date_planted: '2026-03-01' },
]

// ── each selected crop starts with its whole planted area affected
const rows = toRows(crops)
eq(rows.map((r) => [r.id, r.plantedHa, r.area, r.total]), [[1, 1.5, '1.5', false], [2, 2, '2', false], [3, null, '', false]], 'rows start at the full planted area')
eq(rows[0].label, 'Palay (Rice) · Wet 2026', 'label kept')

// ── the whole-area rule (Total Loss only then)
eq(isWholeArea(rows[0]), true, 'full area is the whole area')
eq(isWholeArea({ ...rows[0], area: '1.2' }), false, 'a partial area is not')
eq(isWholeArea({ ...rows[0], area: '1.49999' }), true, 'tiny rounding differences still count as the whole area')
eq(isWholeArea(rows[2]), true, 'a crop with no recorded area: no limit to compare with')

eq(withArea(withTotal(rows[0], true), '0.5').total, false, 'typing a partial area switches Total Loss off')
eq(withArea(withTotal(rows[0], true), '1.5').total, true, 'typing the whole area keeps it on')
eq(withTotal({ ...rows[0], area: '1' }, true).total, false, 'Total Loss cannot be switched on for a partial area')

// ── area problems
eq(areaProblem(rows[0]), '', 'ok')
eq(areaProblem({ ...rows[0], area: '' }), 'Area affected is required.', 'blank')
eq(areaProblem({ ...rows[0], area: '0' }), 'Area must be greater than 0.', 'zero')
eq(areaProblem({ ...rows[0], area: 'abc' }), 'Area must be greater than 0.', 'not a number')
eq(areaProblem({ ...rows[0], area: '1.6' }), 'Cannot exceed the area planted (1.5 ha).', 'more than planted')
eq(areaProblem({ ...rows[2], area: '9' }), '', 'no planted area recorded: nothing to exceed')

// ── date problems (not in the future, not before the latest planting date of the chosen crops)
eq(dateProblem('', rows, crops, '2026-09-01'), 'Date of occurrence is required.', 'blank date')
eq(dateProblem('2026-09-02', rows, crops, '2026-09-01'), 'Date cannot be in the future.', 'future')
eq(dateProblem('2026-06-01', toRows(crops.slice(0, 2)), crops, '2026-09-01'), 'Date cannot be before the planting date of Corn (Mais) (2026-06-10).', 'before the latest planting')
eq(dateProblem('2026-06-10', toRows(crops.slice(0, 2)), crops, '2026-09-01'), '', 'on the latest planting date is fine')

// ── the request
const shared = { disasterType: 'Typhoon', other: '', date: '2026-09-01', damage: 'Flattened', loss: 'Half' }
const req = buildRequest(shared, [withTotal(rows[0], true), { ...rows[1], area: '1' }])
eq(req.fields, { disaster_type: 'Typhoon', disaster_type_other_specify: '', date_of_occurrence: '2026-09-01', estimated_damage: 'Flattened', production_loss: 'Half' }, 'shared fields')
eq(req.crops, [{ monitoring_record: 1, area_affected_ha: 1.5, is_total_loss: true }, { monitoring_record: 2, area_affected_ha: 1, is_total_loss: false }], 'one entry per crop')
eq(buildRequest({ ...shared, disasterType: 'Other', other: ' Locusts ' }, [rows[0]]).fields.disaster_type_other_specify, 'Locusts', 'Other is trimmed')
eq(buildRequest({ ...shared, disasterType: 'Typhoon', other: 'left over' }, [rows[0]]).fields.disaster_type_other_specify, '', 'a leftover description is dropped')

// ── the selection line and the picker filter
eq(selectionSummary(rows), '3 crops selected', 'plural')
eq(selectionSummary([rows[0]]), '1 crop selected', 'singular')
eq(selectionSummary([]), 'No crops selected', 'none')
eq(filterCrops(crops, 'corn').map((c) => c.id), [2], 'search by crop name')
eq(filterCrops(crops, '').length, 3, 'no search shows all')
eq(filterCrops(crops, 'wet 2026').map((c) => c.id), [1, 2], 'search by season')
assert.equal(MAX_CROPS, 50); n++

console.log(`multiCropDisaster: ${n} checks passed`)
