import assert from 'node:assert/strict'

const { cropMonitoringReport, parcelRecordsReport, aquacultureReport, captureReport, rangeFilter } = await import(new URL('../src/pages/Monitoring/listReports.js', import.meta.url).href)

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

console.log(`listReports: ${n} checks passed`)
