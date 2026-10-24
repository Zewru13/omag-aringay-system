import assert from 'node:assert/strict'

const {
  FORCED_REASONS, FORCED_OTHER, LATE_REASONS, OTHER_REASON, harvestTiming, composeReason, reasonProblem, buildHarvestReportSpec,
  composeForcedReason, forcedProblem, forcedReasonLabel,
} = await import(new URL('../src/pages/Monitoring/harvestReport.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

// ── how early or late a harvest is (a 100-day crop planted 2026-05-01, expected 2026-08-09)
const P = '2026-05-01'
const E = '2026-08-09'
eq(harvestTiming(P, E, '2026-05-21'), { varianceDays: -80, isEarly: true, isLate: false, percentGrown: 20 }, 'harvest at 20% of the growing time')
eq(harvestTiming(P, E, '2026-08-05').isEarly, false, '4 days early is within the 7-day tolerance')
eq(harvestTiming(P, E, '2026-08-02').isEarly, false, 'exactly 7 days early is still within the tolerance')
eq(harvestTiming(P, E, '2026-08-01').isEarly, true, '8 days early needs a reason')
eq(harvestTiming(P, E, '2026-08-17').isLate, true, '8 days late needs a reason')
eq(harvestTiming(P, E, '2026-08-09'), { varianceDays: 0, isEarly: false, isLate: false, percentGrown: 100 }, 'on the expected date')
eq(harvestTiming(P, null, '2026-05-21'), { varianceDays: null, isEarly: false, isLate: false, percentGrown: null }, 'no expected date: nothing to compare')
eq(harvestTiming(P, E, ''), { varianceDays: null, isEarly: false, isLate: false, percentGrown: null }, 'no harvest date yet')

// ── the reason that is saved
eq(composeReason('Upcoming storm or typhoon', ''), 'Upcoming storm or typhoon', 'a listed reason on its own')
eq(composeReason('Drought', '  fields cracking  '), 'Drought (fields cracking)', 'a listed reason with a detail')
eq(composeReason(OTHER_REASON, 'Price collapse'), 'Other: Price collapse', 'Other uses the typed text')
eq(composeReason(OTHER_REASON, '   '), '', 'Other without text is not a reason')
eq(composeReason('', 'something'), '', 'no choice, no reason')
eq(composeReason('Drought', 'x'.repeat(400)).length, 255, 'never longer than the 255 characters the record holds')

eq(reasonProblem('', ''), 'Choose a reason.', 'nothing chosen')
eq(reasonProblem(OTHER_REASON, ''), 'Describe the reason.', 'Other needs a description')
eq(reasonProblem('Drought', ''), '', 'a listed reason is enough')
eq(FORCED_REASONS.map((r) => r.value), ['upcoming_typhoon', 'super_typhoon', 'el_nino', 'drought', 'possible_flooding', 'pest_or_disease', 'other'], 'the forced harvest reasons')
eq(forcedReasonLabel('el_nino'), 'El Niño', 'reason label')
eq(forcedReasonLabel('nope'), '', 'unknown reason has no label')
eq(composeForcedReason('upcoming_typhoon', ''), 'Forced harvest due to early harvest: Upcoming Typhoon', 'forced sentence')
eq(composeForcedReason('drought', '  dry spell  '), 'Forced harvest due to early harvest: Drought (dry spell)', 'forced sentence with a detail')
eq(composeForcedReason(FORCED_OTHER, 'Buyer pays double'), 'Forced harvest due to early harvest: Other: Buyer pays double', 'Other is its description')
eq(composeForcedReason('', 'x'), '', 'nothing chosen')
eq(composeForcedReason('drought', 'x'.repeat(400)).length, 255, 'forced sentence never longer than 255')
eq(forcedProblem('', ''), 'Choose why the crop is being harvested early.', 'forced: nothing chosen')
eq(forcedProblem('boredom', ''), 'Choose why the crop is being harvested early.', 'forced: unknown reason')
eq(forcedProblem(FORCED_OTHER, ' '), 'Describe the reason.', 'forced: Other needs a description')
eq(forcedProblem('drought', ''), '', 'forced: a listed reason is enough')
assert.ok(LATE_REASONS.includes(OTHER_REASON)); n++

// ── the printed report
const record = {
  farmer_name: 'Ana Cruz', farmer_barangay: 'Alaska', organization_name: 'Alaska Farmers Assoc.', crop_type_name: 'Palay (Rice)',
  variety_used: 'NSIC Rc222', season: 'Wet', date_planted: P, date_planted_is_estimated: false, expected_harvest_date: E,
  area_planted_ha: '1.50', parcel_number: '01-02-03-004-005-06-007', farm_location_barangay: 'Alaska',
}
const harvest = { id: 42, harvest_start_date: '2026-05-21', harvest_end_date: null, area_harvested_hectares: '1.50', volume_kg: '800', unit_of_measure: 'kg' }
const spec = buildHarvestReportSpec({ record, harvest, reason: 'Upcoming storm or typhoon', notes: 'Harvested before the signal no. 3', recordedOn: '2026-05-21' })
eq(spec.title, 'HARVEST REPORT', 'title')
eq(spec.reference, 'HR-000042', 'reference number')
eq(spec.photos, [], 'no photos')
eq(spec.sections.map((s) => s.title), ['Farmer', 'Crop', 'Harvest Details', 'Reason for Early Harvest', 'Notes'], 'sections')
const details = Object.fromEntries(spec.sections.find((s) => s.title === 'Harvest Details').rows)
eq(details.Timing, '80 days earlier than expected (the crop had grown 20% of its expected time)', 'timing line')
eq(details['Harvested Date'], 'May 21, 2026', 'harvested date')
eq(details['Harvest Type'], undefined, 'an ordinary harvest has no harvest type row')
eq(Object.fromEntries(spec.sections.find((s) => s.title === 'Crop').rows).Variety, 'NSIC Rc222', 'variety')
eq(spec.sections.find((s) => s.title === 'Reason for Early Harvest').paragraphs, ['Upcoming storm or typhoon'], 'reason paragraph')
assert.ok(Array.isArray(spec.signatures) && spec.signatures.length === 2); n++

const onTime = buildHarvestReportSpec({ record, harvest: { ...harvest, harvest_start_date: '2026-08-09' }, reason: '', notes: '', recordedOn: '2026-08-09' })
eq(onTime.sections.map((s) => s.title), ['Farmer', 'Crop', 'Harvest Details'], 'no reason and no notes: those sections are left out')
eq(Object.fromEntries(onTime.sections.find((s) => s.title === 'Harvest Details').rows).Timing, 'On the expected harvest date', 'on time')

// ── a harvest counted in sacks shows what was counted and the kg
const sacks = buildHarvestReportSpec({ record, harvest: { ...harvest, volume_kg: '1000.00', quantity_harvested: '20.00', unit_of_measure: 'Sack' }, reason: '', notes: '', recordedOn: '2026-05-21' })
eq(Object.fromEntries(sacks.sections.find((s) => s.title === 'Harvest Details').rows)['Quantity Harvested'], '20 Sack (1,000 kg)', 'quantity and kg in the report')

// ── a forced harvest's report
const forced = buildHarvestReportSpec({ record, harvest: { ...harvest, force_harvest_reason: 'upcoming_typhoon' },
  reason: 'Forced harvest due to early harvest: Upcoming Typhoon', notes: '', recordedOn: '2026-05-21' })
eq(forced.sections.map((s) => s.title), ['Farmer', 'Crop', 'Harvest Details', 'Reason for Forced Harvest'], 'forced harvest sections')
eq(Object.fromEntries(forced.sections.find((s) => s.title === 'Harvest Details').rows)['Harvest Type'], 'FORCED HARVEST (harvested before it was ready)', 'forced harvest type row')

console.log(`harvestReport: ${n} checks passed`)
