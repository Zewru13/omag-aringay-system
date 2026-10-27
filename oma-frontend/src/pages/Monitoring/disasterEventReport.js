// The report shown right after Log Disaster saves one event over many crops (GET /production/disasters/event-report/): what it lists,
// and the layout the browser prints. Pure functions - no screen, no network - so they can be tested on their own. The PDF is built by the
// server from the same saved reports, so the screen, the printout and the PDF carry the same rows.

const fmtDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${String(v).slice(0, 10)}T00:00:00`)) : null)
const fmtDateTime = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(v)) : null)
export function fmtHa(v) {
  if (v === null || v === undefined || v === '') return '—'
  const n = Number(v)
  return Number.isNaN(n) ? String(v) : n.toLocaleString('en-US', { maximumFractionDigits: 4 })
}
const keep = (rows) => rows.filter(([, v]) => v !== null && v !== undefined && v !== '')
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`

export const EVENT_HEAD = ['Farmer', 'Barangay', 'Parcel', 'Crop', 'Planted (ha)', 'Affected (ha)', 'Total Loss']

// The crops that were reported, one row each (already in the order the server sends them), then a TOTAL row.
export function eventTable(doc) {
  const totals = doc.totals || {}
  const rows = (doc.rows || []).map((r) => [
    r.farmer_name || '—', r.barangay || '—', r.parcel, r.variety ? `${r.crop} (${r.variety})` : r.crop,
    fmtHa(r.area_planted_ha), fmtHa(r.area_affected_ha), r.is_total_loss ? 'Yes' : 'No',
  ])
  rows.push(['TOTAL', '', plural(totals.parcels || 0, 'parcel'), plural(totals.crops || 0, 'crop'), fmtHa(totals.area_planted_ha), fmtHa(totals.area_affected_ha), String(totals.total_loss || 0)])
  return { head: EVENT_HEAD, rows, boldRows: new Set([rows.length - 1]) }
}

// The event's own details as [label, value] rows (empty values dropped).
export function eventDetails(doc) {
  const totals = doc.totals || {}
  return keep([
    ['Date of Occurrence', fmtDate(doc.date_of_occurrence)],
    ['Disaster Type', doc.disaster_type_label],
    ['Farmers Affected', String(totals.farmers ?? '')],
    ['Parcels Affected', String(totals.parcels ?? '')],
    ['Crops Affected', String(totals.crops ?? '')],
    ['Total Area Affected', totals.area_affected_ha === undefined ? null : `${fmtHa(totals.area_affected_ha)} ha`],
    ['Crops Lost (Total Loss)', totals.total_loss ? String(totals.total_loss) : null],
  ])
}

export const eventParagraphs = (doc) => [doc.description, doc.production_loss && `Estimated production loss: ${doc.production_loss}`].filter(Boolean)

// What the browser prints (the shared document layout of disasterReportDocument.js).
export function eventPrintSpec(doc) {
  return {
    title: 'CROP DISASTER REPORT',
    reference: doc.reference,
    header: keep([['Reference No.', doc.reference], ['Date/Time Logged', fmtDateTime(doc.date_reported)], ['Logged By', doc.reported_by_name]]),
    sections: [
      { title: 'Disaster Details', rows: eventDetails(doc) },
      { title: 'Description of Damage', paragraphs: eventParagraphs(doc), empty: 'No description recorded.' },
      { title: 'Affected Parcels and Crops', table: eventTable(doc) },
    ],
    photos: doc.photos || [],
    footerLabel: 'disaster report',
  }
}

export function eventSummary(doc) {
  const t = doc.totals || {}
  return `${plural(t.crops || 0, 'crop')} on ${plural(t.parcels || 0, 'parcel')} of ${plural(t.farmers || 0, 'farmer')}`
}
