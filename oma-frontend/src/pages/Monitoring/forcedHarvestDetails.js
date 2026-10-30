// The saved forced harvest of a crop as the details window shows it (GET /production/forced-harvest/<id>/): the rows of its two tables, with
// no screen and no network, so they can be tested on their own.

const dash = '—'

export const kgText = (value) => (value === null || value === undefined || value === '' || Number.isNaN(Number(value))
  ? dash
  : Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))

const longDate = (value) => (value
  ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
  : dash)

// "Forced harvest due to early harvest: <reason>" without its fixed start: what the person typed or picked, with its details.
const reasonOnly = (text) => String(text || '').replace(/^Forced harvest due to early harvest:\s*/i, '')

// The first table: label and value.
export function forcedDetailRows(d) {
  return [
    ['Farmer', d.farmer_name || dash],
    ['RSBSA Number', d.rsbsa_number || dash],
    ['Harvested Date', longDate(d.harvest_date)],
    ['Reason for Forced Harvest', reasonOnly(d.reason_text) || d.reason_label || dash],
    ['Remarks', d.remarks || dash],
    ['Recorded By', d.recorded_by_name || dash],
    ['Crops Harvested', String((d.crops || []).length)],
  ]
}

// The second table: one row per crop saved in the same event.
export function forcedCropRows(d) {
  return (d.crops || []).map((c) => ({
    id: c.id,
    crop: c.crop || dash,
    parcel: c.parcel_number || dash,
    expected: longDate(c.expected_harvest_date),
    daysEarly: c.days_early === null || c.days_early === undefined ? dash : String(c.days_early),
    area: c.area_harvested_hectares ? String(Number(c.area_harvested_hectares)) : dash,
    quantity: c.quantity_harvested ? `${Number(c.quantity_harvested).toLocaleString('en-US')} ${c.unit_of_measure || ''}`.trim() : dash,
    kg: kgText(c.volume_kg),
  }))
}
