import assert from 'node:assert/strict'

const { summaryRows, activityLine, disasterLine, pestLine, harvestRows, detailActions, dash } = await import(new URL('../src/pages/Monitoring/cropDetails.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const val = (rows, label) => rows.find(([k]) => k === label)?.[1]

eq(dash(''), '—', 'blank'); eq(dash(null), '—', 'null'); eq(dash(0), '0', 'zero stays'); eq(dash('x'), 'x', 'text')

// ── the summary: what the crop is, where, when, how much
const record = {
  crop_type_name: 'Palay (Rice)', variety_used: 'NSIC Rc 222', farmer_name: 'Ana Cruz', parcel_number: '01-33-02-005-001-02-003',
  farm_location_barangay: 'Alaska', farmer_barangay: 'Basca', season: 'Wet', year: 2026, area_planted_ha: '1.50',
  seed_source: 'Certified Seed', quantity_of_seeds: '40.00', seed_quantity_unit: 'kg', has_pcic_insurance: true,
  date_planted: '2026-05-01', expected_harvest_date: '2026-08-19', status: 'Planted', growth_stage: 'Vegetative',
  estimated_yield_kg: '9000.00', actual_yield_kg: null, organization_name: 'Alaska Farmers', notes: '',
}
const rows = summaryRows(record)
eq(val(rows, 'Crop'), 'Palay (Rice)', 'crop'); eq(val(rows, 'Variety'), 'NSIC Rc 222', 'variety')
eq(val(rows, 'Farmer'), 'Ana Cruz', 'farmer'); eq(val(rows, 'Farm parcel'), '01-33-02-005-001-02-003', 'parcel')
eq(val(rows, 'Farm location'), 'Alaska', 'the record location is used first')
eq(val(rows, 'Season / year'), 'Wet 2026', 'season'); eq(val(rows, 'Area planted (ha)'), '1.50', 'area')
eq(val(rows, 'Seeds'), '40.00 kg · Certified Seed', 'seeds'); eq(val(rows, 'PCIC insurance'), 'Yes', 'pcic')
eq(val(rows, 'Growth stage'), 'Vegetative', 'stage'); eq(val(rows, 'Estimated yield (kg)'), '9,000', 'estimate is formatted')
eq(val(rows, 'Actual yield (kg)'), '—', 'no actual yet'); eq(val(rows, 'Organization'), 'Alaska Farmers', 'org')
eq(val(summaryRows({ ...record, farm_location_barangay: '' }), 'Farm location'), 'Basca', 'falls back to the farmer barangay')
eq(val(summaryRows({ ...record, parcel_number: '' }), 'Farm parcel'), '—', 'no parcel')
eq(val(summaryRows({ ...record, quantity_of_seeds: null, seed_source: '' }), 'Seeds'), '—', 'no seed info')
eq(val(summaryRows({ ...record, seed_source: 'Other', seed_source_other_specify: 'Neighbour' }), 'Seeds'), '40.00 kg · Neighbour', 'other seed source')
eq(val(summaryRows({ ...record, date_planted_is_estimated: true }), 'Date planted').endsWith('(estimated)'), true, 'estimated planting date is flagged')
eq(val(summaryRows({ ...record, has_pcic_insurance: false }), 'PCIC insurance'), 'No', 'no pcic')

// ── list lines
eq(activityLine({ activity_type: 'Fertilizer Application', date_of_activity: '2026-06-01', plant_condition: 'Good', notes: 'Urea', status_at_log: 'Planted' }),
  { title: 'Fertilizer Application', date: '2026-06-01', meta: 'Good', note: 'Urea' }, 'activity')
eq(activityLine({ activity_type: 'Other', activity_type_other_specify: 'Weeding', date_of_activity: '2026-06-02' }).title, 'Weeding', 'other activity uses the typed name')
eq(disasterLine({ disaster_type: 'Typhoon', date_of_occurrence: '2026-07-01', area_affected_ha: '0.5', status: 'Active' }),
  { title: 'Typhoon', date: '2026-07-01', meta: '0.5 ha affected · Active' }, 'disaster')
eq(disasterLine({ disaster_type: 'Other', disaster_type_other_specify: 'Landslide', date_of_occurrence: '2026-07-01', area_affected_ha: null, status: 'Recovered' }),
  { title: 'Landslide', date: '2026-07-01', meta: 'Recovered' }, 'other disaster')
eq(pestLine({ pest_disease_name: 'Stem borer', report_date: '2026-06-10', severity: 'High', action_taken: 'Sprayed' }),
  { title: 'Stem borer', date: '2026-06-10', meta: 'High', note: 'Sprayed' }, 'pest')

// ── the harvest
eq(harvestRows(null), [], 'no harvest')
eq(harvestRows({ harvest_start_date: '2026-08-10', harvest_end_date: '2026-08-12', volume_kg: '8000.00', unit_of_measure: 'kg', area_harvested_hectares: '1.50',
  yield_per_hectare_kg: '5333.33', harvest_variance_days: -9, early_late_reason: 'Upcoming storm' }), [
  ['Harvested date', '2026-08-10 to 2026-08-12'], ['Volume', '8,000 kg'], ['Area harvested (ha)', '1.50'], ['Yield per hectare (kg)', '5,333.33'],
  ['Timing', '9 days early'], ['Reason', 'Upcoming storm']], 'early harvest')
eq(harvestRows({ harvest_start_date: '2026-08-10', volume_kg: '100', unit_of_measure: 'kg', area_harvested_hectares: '1', harvest_variance_days: -9,
  force_harvest_reason: 'drought', early_late_reason: 'Forced harvest due to early harvest: Drought' }).slice(0, 2),
  [['Harvest type', 'FORCED HARVEST (harvested before it was ready)'], ['Harvested date', '2026-08-10']], 'a forced harvest is labelled')
eq(harvestRows({ harvest_start_date: '2026-08-20', volume_kg: '100', unit_of_measure: 'cavan', area_harvested_hectares: '1', harvest_variance_days: 0 })
  .find(([k]) => k === 'Timing')[1], 'On time', 'on time')
eq(harvestRows({ harvest_start_date: '2026-08-20', volume_kg: '100', unit_of_measure: 'kg', area_harvested_hectares: '1', harvest_variance_days: 3 })
  .find(([k]) => k === 'Timing')[1], '3 days late', 'late')

// ── the footer: details are read-only; the buttons open the forms
eq(detailActions({ status: 'Planted' }, { isFarmer: false }).map((a) => a.key), ['activity', 'harvest', 'disaster'], 'a growing crop')
eq(detailActions({ status: 'Harvested' }, { isFarmer: false }).map((a) => a.key), ['disaster'], 'harvested')
eq(detailActions({ status: 'Total Loss' }, { isFarmer: false }).map((a) => a.key), ['disaster'], 'total loss')
eq(detailActions({ status: 'Near Harvest' }, { isFarmer: true }).map((a) => a.key), ['activity', 'harvest', 'disaster'], 'a farmer account has the same buttons')

console.log(`cropDetails: ${n} checks passed`)
