// The read-only "View Crop Details" window of Crop Monitoring: pure helpers for what it lists, with no screen and no network, so
// they can be tested on their own.

export const dash = (value) => (value === undefined || value === null || value === '' ? '—' : String(value))

const number = (value, digits = 2) => {
  if (value === undefined || value === null || value === '') return '—'
  const n = Number(value)
  return Number.isFinite(n) ? n.toLocaleString('en-US', { maximumFractionDigits: digits }) : String(value)
}

// What the crop is, where it grows, when it was planted and how much is expected: [[label, value], ...].
export function summaryRows(record) {
  const seedSource = record.seed_source === 'Other' ? (record.seed_source_other_specify || 'Other') : record.seed_source
  const seeds = [record.quantity_of_seeds ? `${record.quantity_of_seeds} ${record.seed_quantity_unit || ''}`.trim() : '', seedSource].filter(Boolean).join(' · ')
  return [
    ['Crop', dash(record.crop_type_name)],
    ['Variety', dash(record.variety_used)],
    ['Farmer', dash(record.farmer_name || record.farmer_full_name)],
    ['Organization', dash(record.organization_name)],
    ['Farm parcel', dash(record.parcel_number)],
    ['Farm location', dash(record.farm_location_barangay || record.farmer_barangay)],
    ['Land status', dash(record.land_status)],
    ['Season / year', dash([record.season, record.year].filter(Boolean).join(' '))],
    ['Area planted (ha)', dash(record.area_planted_ha)],
    ['Seeds', dash(seeds)],
    ['PCIC insurance', record.has_pcic_insurance ? 'Yes' : 'No'],
    ['Date planted', `${dash(record.date_planted)}${record.date_planted_is_estimated ? ' (estimated)' : ''}`],
    ['Expected harvest', dash(record.expected_harvest_date)],
    ['Status', dash(record.status)],
    ['Growth stage', dash(record.growth_stage)],
    ['Estimated yield (kg)', number(record.estimated_yield_kg, 0)],
    ['Actual yield (kg)', number(record.actual_yield_kg, 0)],
  ]
}

const joinMeta = (...parts) => parts.filter(Boolean).join(' · ')

export const activityLine = (log) => ({
  title: log.activity_type === 'Other' && log.activity_type_other_specify ? log.activity_type_other_specify : log.activity_type,
  date: log.date_of_activity,
  meta: log.plant_condition || '',
  note: log.notes || '',
})

export const disasterLine = (report) => ({
  title: report.disaster_type === 'Other' && report.disaster_type_other_specify ? report.disaster_type_other_specify : report.disaster_type,
  date: report.date_of_occurrence,
  meta: joinMeta(report.area_affected_ha ? `${number(report.area_affected_ha, 4)} ha affected` : '', report.status),
})

export const pestLine = (report) => ({
  title: report.pest_disease_name,
  date: report.report_date,
  meta: report.severity || '',
  note: report.action_taken || '',
})

const timing = (days) => {
  const n = Number(days)
  if (days === undefined || days === null || !Number.isFinite(n)) return ''
  if (n === 0) return 'On time'
  const count = Math.abs(n)
  return `${count} day${count === 1 ? '' : 's'} ${n < 0 ? 'early' : 'late'}`
}

// The harvest record of a harvested crop (none when it is not harvested yet).
export function harvestRows(harvest) {
  if (!harvest) return []
  const end = harvest.harvest_end_date && harvest.harvest_end_date !== harvest.harvest_start_date ? ` to ${harvest.harvest_end_date}` : ''
  const unit = harvest.unit_of_measure && harvest.unit_of_measure !== 'kg' ? ` (recorded in ${harvest.unit_of_measure})` : ''
  return [
    ...(harvest.force_harvest_reason ? [['Harvest type', 'FORCED HARVEST (harvested before it was ready)']] : []),
    ['Harvested date', `${dash(harvest.harvest_start_date)}${end}`],
    ['Volume', `${number(harvest.volume_kg, 2)} kg${unit}`],
    ['Area harvested (ha)', dash(harvest.area_harvested_hectares)],
    ['Yield per hectare (kg)', number(harvest.yield_per_hectare_kg, 2)],
    ['Timing', dash(timing(harvest.harvest_variance_days))],
    ...(harvest.early_late_reason ? [['Reason', harvest.early_late_reason]] : []),
  ]
}

// The buttons in the window's footer. The window itself is read-only; each button opens the form that does the work.
export function detailActions(record) {
  const open = record.status !== 'Harvested' && record.status !== 'Total Loss'
  return [
    ...(open ? [{ key: 'activity', label: 'Record Activity' }, { key: 'harvest', label: 'Record Harvest' }] : []),
    { key: 'disaster', label: 'Report Disaster' },
  ]
}
