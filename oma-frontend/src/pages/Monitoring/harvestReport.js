// Crop harvests that come in early or late: how early, the reason that is saved with the harvest, and the printable
// Harvest Report. Pure functions (no screen, no network) so they can be tested on their own; the print window itself is
// printSpec() in disasterReportDocument.js.

// A harvest more than this many days away from the expected date needs a reason. Mirrors HarvestRecordSerializer on the
// server, which is what actually enforces it.
export const TOLERANCE_DAYS = 7
export const OTHER_REASON = 'Other'

export const EARLY_REASONS = [
  'Upcoming storm or typhoon',
  'Drought',
  'Flooding',
  'Pest or disease outbreak',
  'Other disaster',
  'Buyer demand',
  'Crop matured early',
  OTHER_REASON,
]
export const LATE_REASONS = ['Delayed field visit', 'Weather', 'Labor unavailable', OTHER_REASON]

const MAX_REASON_LENGTH = 255   // the size of the saved reason field

const dayNumber = (iso) => (iso ? Date.parse(`${iso}T00:00:00Z`) / 86400000 : NaN)

// Days from the expected date (negative = early, positive = late) and how much of the expected growing time had passed.
export function harvestTiming(plantedISO, expectedISO, harvestISO) {
  const planted = dayNumber(plantedISO)
  const expected = dayNumber(expectedISO)
  const harvest = dayNumber(harvestISO)
  if (Number.isNaN(expected) || Number.isNaN(harvest)) return { varianceDays: null, isEarly: false, isLate: false, percentGrown: null }
  const varianceDays = Math.round(harvest - expected)
  const total = expected - planted
  const percentGrown = !Number.isNaN(planted) && total > 0 ? Math.round(((harvest - planted) / total) * 100) : null
  return { varianceDays, isEarly: varianceDays < -TOLERANCE_DAYS, isLate: varianceDays > TOLERANCE_DAYS, percentGrown }
}

// What is saved in the record's reason field: the chosen reason, plus an optional detail. "Other" is only its detail.
export function composeReason(choice, detail) {
  const text = String(detail ?? '').trim()
  if (!choice) return ''
  let reason
  if (choice === OTHER_REASON) {
    if (!text) return ''
    reason = `Other: ${text}`
  } else {
    reason = text ? `${choice} (${text})` : choice
  }
  return reason.slice(0, MAX_REASON_LENGTH)
}

export function reasonProblem(choice, detail) {
  if (!choice) return 'Choose a reason.'
  if (choice === OTHER_REASON && !String(detail ?? '').trim()) return 'Describe the reason.'
  return ''
}

// ── the printable report
const fmtDate = (iso) => (iso
  ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))
  : null)
const fmtNumber = (v, suffix = '') => {
  if (v === null || v === undefined || v === '') return null
  const num = Number(v)
  return Number.isNaN(num) ? `${v}${suffix}` : `${num.toLocaleString('en-US', { maximumFractionDigits: 4 })}${suffix}`
}
const keep = (rows) => rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

function timingLine(timing) {
  if (timing.varianceDays === null) return null
  if (timing.varianceDays === 0) return 'On the expected harvest date'
  if (timing.varianceDays < 0) {
    const grown = timing.percentGrown === null ? '' : ` (the crop had grown ${timing.percentGrown}% of its expected time)`
    return `${plural(Math.abs(timing.varianceDays), 'day')} earlier than expected${grown}`
  }
  return `${plural(timing.varianceDays, 'day')} later than expected`
}

// record = the crop monitoring record the harvest was recorded on; harvest = the saved harvest (as the server returned it).
export function buildHarvestReportSpec({ record, harvest, reason, notes, recordedOn }) {
  const reference = `HR-${String(harvest.id).padStart(6, '0')}`
  const timing = harvestTiming(record.date_planted, record.expected_harvest_date, harvest.harvest_start_date)
  const reasonTitle = timing.varianceDays !== null && timing.varianceDays < 0 ? 'Reason for Early Harvest'
    : timing.varianceDays !== null && timing.varianceDays > 0 ? 'Reason for Late Harvest' : 'Reason'
  const sections = [
    { title: 'Farmer', rows: keep([
      ['Name', record.farmer_name || record.farmer_full_name],
      ['Barangay', record.farmer_barangay],
      ['Organization', record.organization_name || record.farmer_organization_name],
    ]) },
    { title: 'Crop', rows: keep([
      ['Crop', record.crop_type_name],
      ['Variety', record.variety_used],
      ['Season', record.season],
      ['Date Planted', record.date_planted ? `${fmtDate(record.date_planted)}${record.date_planted_is_estimated ? ' (estimated)' : ''}` : null],
      ['Expected Harvest Date', fmtDate(record.expected_harvest_date)],
      ['Area Planted', fmtNumber(record.area_planted_ha, ' ha')],
      ['Parcel No.', record.parcel_number],
      ['Location', record.farm_location_barangay],
    ]) },
    { title: 'Harvest Details', rows: keep([
      ['Harvest Date', fmtDate(harvest.harvest_start_date)],
      ['Harvest End Date', fmtDate(harvest.harvest_end_date)],
      ['Timing', timingLine(timing)],
      ['Area Harvested', fmtNumber(harvest.area_harvested_hectares, ' ha')],
      ['Quantity Harvested', fmtNumber(harvest.volume_kg, harvest.unit_of_measure ? ` ${harvest.unit_of_measure}` : '')],
      ['Estimated Yield', fmtNumber(record.estimated_yield_kg, ' kg')],
    ]) },
  ]
  if (reason) sections.push({ title: reasonTitle, paragraphs: [reason], empty: '' })
  if (notes && String(notes).trim()) sections.push({ title: 'Notes', paragraphs: [String(notes).trim()], empty: '' })
  return {
    title: 'HARVEST REPORT',
    reference,
    header: keep([['Reference No.', reference], ['Date Recorded', fmtDate(recordedOn)]]),
    sections,
    photos: [],
    footerLabel: 'harvest record',
    signatures: ['Prepared by', 'Noted by'],
  }
}
