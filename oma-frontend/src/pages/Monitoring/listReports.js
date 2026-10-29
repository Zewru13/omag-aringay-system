// The Print Report of Crop Records, Crop Monitoring, Aquaculture Monitoring and Capture Monitoring: each takes the rows a table's filters
// match (every page, see utils/listReport.js) and what the table was filtered by, and gives the document to print. No screen, no network.
import { dateRangeText } from '../../utils/dateRange.js'
import { buildListReportSpec } from '../../utils/listReport.js'
import { cycleStatusText } from '../FisheriesRecords/emergencyForceHarvest.js'
import { fmtActualHarvestKg } from '../FisheriesRecords/stockingHelpers.js'
import { cropDisplayStatus } from './monitoringGroups.js'

const yesNo = (value) => (value ? 'Yes' : 'No')
const day = (value) => (value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
  : '')
const kg = (value) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value))
  ? ''
  : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const ha = (value) => (value === null || value === undefined || value === '' ? '' : String(Number(value)))

// The "Date Planted" style line of a filter: the range in words, or nothing.
export const rangeFilter = (label, from, to) => [label, dateRangeText(from, to)]

export function cropMonitoringReport({ records, filters, now }) {
  return buildListReportSpec({
    title: 'CROP MONITORING REPORT', noun: 'crop record', filters, now, wide: true,
    head: ['Crop', 'Variety', 'Farmer', 'Organization', 'Barangay', 'Date Planted', 'Expected Harvest', 'Area (ha)', 'PCIC Insured', 'Status'],
    rows: records.map((r) => [
      r.crop_type_name, r.variety_used, r.farmer_name || r.farmer_full_name, r.organization_name, r.farm_location_barangay || r.farmer_barangay,
      day(r.date_planted), day(r.expected_harvest_date), ha(r.area_planted_ha), yesNo(r.has_pcic_insurance), cropDisplayStatus(r),
    ]),
  })
}

// Crop Records is a table of farm parcels (with how many crops sit on each).
export function parcelRecordsReport({ parcels, filters, now }) {
  return buildListReportSpec({
    title: 'CROP RECORDS REPORT', noun: 'farm parcel', filters, now, wide: true,
    head: ['Farmer', 'RSBSA No.', 'Parcel No.', 'Barangay', 'Area (ha)', 'Land Ownership', 'Crops'],
    rows: parcels.map((p) => [p.farmer_name, p.rsbsa_number, p.parcel_number || `Parcel #${p.id}`, p.barangay, ha(p.area_hectares), p.land_ownership, String(p.crop_count ?? 0)]),
  })
}

export function aquacultureReport({ records, filters, now }) {
  return buildListReportSpec({
    title: 'AQUACULTURE MONITORING REPORT', noun: 'production cycle', filters, now, wide: true,
    head: ['Fisherfolk', 'Species', 'Culture Type', 'Cycle', 'Date Stocked', 'Expected Harvest', 'Est. Harvest (kg)', 'Actual Harvest (kg)', 'Organization', 'Pond Location', 'Status'],
    rows: records.map((r) => [
      r.fisherfolk_name, r.species_name, r.culture_type, r.production_cycle_no ? `#${r.production_cycle_no}` : '', day(r.date_stocked), day(r.expected_harvest_date),
      kg(r.estimated_harvest_kg), fmtActualHarvestKg(r) === '—' ? '' : fmtActualHarvestKg(r), r.organization_name, r.pond_location_barangay, cycleStatusText(r),
    ]),
  })
}

export function captureReport({ trips, filters, now }) {
  return buildListReportSpec({
    title: 'CAPTURE MONITORING REPORT', noun: 'fishing trip', filters, now, wide: true,
    head: ['Fisherfolk', 'Type', 'Trip Date', 'Fishing Ground', 'Gear', 'Catch (kg)', 'Top Species', 'Hours at Sea'],
    rows: trips.map((t) => [
      t.fisherfolk_name, t.fisherfolk_type, day(t.trip_date), t.fishing_ground, t.gear_used, kg(t.total_catch_kg),
      t.top_species,
      t.hours_at_sea === null || t.hours_at_sea === undefined ? '' : `${Number(t.hours_at_sea).toFixed(1)} h`,
    ]),
  })
}
