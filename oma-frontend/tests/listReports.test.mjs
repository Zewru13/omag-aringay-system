import assert from 'node:assert/strict'

const { cropMonitoringReport, parcelRecordsReport, aquacultureReport, captureReport, rangeFilter, parcelReport, cycleReport } = await import(new URL('../src/pages/Monitoring/listReports.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const now = new Date(2026, 9, 30, 9, 5)
const table = (spec) => spec.sections[0].table

eq(rangeFilter('Date Planted', '2026-05-01', '2026-06-30'), ['Date Planted', 'May 1, 2026 to June 30, 2026'], 'a range as a filter line')
eq(rangeFilter('Date Planted', '', ''), ['Date Planted', ''], 'no range, left out of the header')

// ── Crop Monitoring
const crop = cropMonitoringReport({
  now, filters: [['Date Planted', 'May 1, 2026 to June 30, 2026'], ['Status', '']],
  records: [{ crop_type_name: 'Palay', variety_used: 'NSIC Rc222', farmer_name: 'Ana Cruz', organization_name: 'Basca Growers', farm_location_barangay: 'Basca', date_planted: '2026-05-10',
    expected_harvest_date: '2026-09-01', area_planted_ha: '1.50', has_pcic_insurance: true, status: 'Planted' }],
})
eq(crop.title, 'CROP MONITORING REPORT', 'crop title')
eq(crop.landscape, true, 'wide table prints landscape')
eq(crop.header.slice(1), [['Date Planted', 'May 1, 2026 to June 30, 2026'], ['Records', '1 crop record']], 'the date range is under the title; an empty filter is left out')
eq(table(crop).head.slice(0, 3), ['No.', 'Crop', 'Variety'], 'crop columns')
eq(table(crop).rows[0], ['1', 'Palay', 'NSIC Rc222', 'Ana Cruz', 'Basca Growers', 'Basca', 'May 10, 2026', 'Sep 1, 2026', '1.5', 'Yes', 'Planted'], 'a crop row')
const late = cropMonitoringReport({ now, filters: [], records: [{ crop_type_name: 'Corn', status: 'Near Harvest', expected_harvest_date: '2000-01-01', farmer_full_name: 'Ben Dizon', farmer_barangay: 'Alaska', has_pcic_insurance: false }] })
eq(table(late).rows[0].slice(1, 12), ['Corn', '—', 'Ben Dizon', '—', 'Alaska', '—', 'Jan 1, 2000', '—', 'No', 'Overdue'], 'blank cells are a dash; the status says Overdue; the farmer and barangay fall back')

// ── Crop Records (parcels)
const parcels = parcelRecordsReport({ now, filters: [], parcels: [{ id: 4, farmer_name: 'Ana Cruz', rsbsa_number: '01-033', parcel_number: '', barangay: 'Basca', area_hectares: '2.00', land_ownership: 'Tenant', crop_count: 3 }] })
eq(parcels.title, 'CROP RECORDS REPORT', 'parcels title')
eq(table(parcels).rows[0], ['1', 'Ana Cruz', '01-033', 'Parcel #4', 'Basca', '2', 'Tenant', '3'], 'a parcel row')
eq(parcels.header.at(-1), ['Records', '1 farm parcel'], 'parcel count')

// ── Aquaculture Monitoring
const aqua = aquacultureReport({
  now, filters: [['Date Stocked', 'up to June 30, 2026']],
  records: [
    { fisherfolk_name: 'Pablo Reyes', species_name: 'Tilapia', culture_type: 'Pond', production_cycle_no: 2, date_stocked: '2026-03-01', expected_harvest_date: '2026-07-01', estimated_harvest_kg: '50',
      harvest_count: 0, total_harvested_kg: '0', organization_name: '', pond_location_barangay: 'Poblacion', status: 'Stocked', display_status: 'Near Harvest' },
    { fisherfolk_name: 'Cora Diaz', species_name: 'Bangus', culture_type: 'Cage', date_stocked: '2026-02-01', harvest_count: 1, total_harvested_kg: '1200.5', status: 'Harvested' },
  ],
})
eq(aqua.title, 'AQUACULTURE MONITORING REPORT', 'aquaculture title')
eq(table(aqua).rows[0], ['1', 'Pablo Reyes', 'Tilapia', 'Pond', '#2', 'Mar 1, 2026', 'Jul 1, 2026', '50.00', '—', '—', 'Poblacion', 'Near Harvest'], 'a cycle row uses its display status; no harvest yet is a dash')
eq(table(aqua).rows[1].slice(7, 9), ['—', '1,200.50'], 'a harvested cycle shows its actual kg')

// ── Capture Monitoring
const trips = captureReport({ now, filters: [['Date Trip', '']], trips: [{ fisherfolk_name: 'Cora Diaz', fisherfolk_type: 'Capture', trip_date: '2026-02-15', fishing_ground: 'Lingayen Gulf', gear_used: 'Gill net', total_catch_kg: '12.5', top_species: 'Bangus', hours_at_sea: '6.5' }] })
eq(trips.title, 'CAPTURE MONITORING REPORT', 'capture title')
eq(table(trips).rows[0], ['1', 'Cora Diaz', 'Capture', 'Feb 15, 2026', 'Lingayen Gulf', 'Gill net', '12.50', 'Bangus', '6.5 h'], 'a trip row')

// ── one parcel
const one = parcelReport({
  now,
  parcel: { id: 4, farmer_name: 'Ana Cruz', rsbsa_number: '01-033', parcel_number: '01-33-02', barangay: 'Basca', area_hectares: '2.00', land_ownership: 'Tenant', land_owner_name: 'Rosa Reyes',
    land_owner_rsbsa_number: '', farm_type: 'Irrigated', cropping_schedule: 'Single Cropping', classifications: ['Irrigated', 'Organic'] },
  crops: [{ crop_type_name: 'Palay', variety_used: 'Rc222', date_planted: '2026-05-10', expected_harvest_date: '2026-09-01', area_planted_ha: '1.5', has_pcic_insurance: true, status: 'Planted' }],
})
eq(one.title, 'FARM PARCEL REPORT', 'parcel title')
eq(one.sections[0].rows.find(([k]) => k === 'Land Owner'), ['Land Owner', 'Rosa Reyes'], 'a tenant parcel names its land owner')
eq(one.sections[0].rows.find(([k]) => k === 'Classifications'), ['Classifications', 'Irrigated, Organic'], 'classifications')
eq(one.sections[0].rows.find(([k]) => k === 'Tax Declaration Number'), ['Tax Declaration Number', '—'], 'blank details are a dash')
eq(one.sections[1].table.rows[0], ['1', 'Palay', 'Rc222', 'May 10, 2026', 'Sep 1, 2026', '1.5', 'Yes', 'Planted'], 'a crop on the parcel')
eq(parcelReport({ now, parcel: { id: 5, land_ownership: 'Owner' }, crops: [] }).sections[0].rows.some(([k]) => k === 'Land Owner'), false, 'an owner parcel has no land owner line')
eq(parcelReport({ now, parcel: { id: 5, land_ownership: 'Owner' }, crops: [] }).sections[0].rows.find(([k]) => k === 'Parcel Number'), ['Parcel Number', 'Parcel #5'], 'a parcel with no number')

// ── one production cycle
const record = { fisherfolk_name: 'Pablo Reyes', species_name: 'Tilapia', culture_type: 'Pond', production_cycle_no: 2, date_stocked: '2026-03-01', expected_harvest_date: '2026-07-01', number_of_fingerlings: 250,
  estimated_harvest_kg: '50', harvest_count: 0, status: 'Stocked', ownership: 'Owner' }
const cyc = cycleReport({ now, record, cycle: { has_pcic_insurance: true, units: [
  { unit_type: 'pond', unit_number: 1, length_m: '4.00', width_m: '3.00', size_sqm: '12.00', fingerling_count: 100, has_pcic_insurance: true },
  { unit_type: 'pond', unit_number: 2, length_m: null, width_m: null, size_sqm: '15.00', fingerling_count: 150, has_pcic_insurance: false }] } })
eq(cyc.title, 'PRODUCTION CYCLE REPORT', 'cycle title')
eq(cyc.sections[0].rows.find(([k]) => k === 'PCIC Insured'), ['PCIC Insured', 'Yes'], 'the cycle is insured when a pond is')
eq(cyc.sections[0].rows.find(([k]) => k === 'Actual Harvest (kg)'), ['Actual Harvest (kg)', '—'], 'no harvest yet')
eq(cyc.sections[1].title, 'Production Units (Ponds)', 'units section')
eq(cyc.sections[1].table.rows, [['1', 'Pond 1', '4 m × 3 m', '12', '100', 'Yes'], ['2', 'Pond 2', '—', '15', '150', 'No']], 'ponds with and without dimensions')
eq(cycleReport({ now, record, cycle: null }).sections.length, 1, 'a record with no cycle prints only its details')

console.log(`listReports: ${n} checks passed`)
