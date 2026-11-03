// The Reports page's pure pieces: the six reports the Report type dropdown lists, the wording of the Selected report box, and what the
// paper preview prints (the period line, the filters line, the signature lines). The wording mirrors the printed PDF (backend reports/period.py,
// reports/documents.py and reports/pdf_utils.py), so the paper on screen and the paper that prints say the same.

// One entry per report: `id` is the ?tab= value that opens it. The agreed reports (the Reports page offers exactly these):
//   1. Registered Farmers / Fisherfolk / Organizations   2. Crop Records Harvested   3. Fisheries Production Harvested
//   4. Fisheries Disaster Reports   5. Crop / Parcel Disaster Reports   6. Organization Assistance
export const REPORT_TYPES = [
  { id: 'registered', label: 'Registered Farmers, Fisherfolk & Organizations', description: 'Registration records for everyone at once, filtered by barangay and date registered, or for one record.' },
  { id: 'harvested', label: 'Crop Records Harvested', description: 'Harvested crop records with their yield, by farmer, crop, barangay and season.' },
  { id: 'fisheries', label: 'Fisheries Production Harvested', description: 'Harvested aquaculture production, by fisherfolk, species, barangay and season.' },
  { id: 'disaster_fisheries', label: 'Fisheries Disaster Reports', description: 'Disasters logged against fisherfolk and their stocks, with the volume lost and recovery status.' },
  { id: 'disaster_crops', label: 'Crop / Parcel Disaster Reports', description: 'Disasters logged against crops and farm parcels, with the area affected and recovery status.' },
  { id: 'organization_assistance', label: 'Organization Assistance', description: 'Assistance organizations gave to their members, for one organization or all, with who received it.' },
]

// One report by id.
export const reportType = (id) => REPORT_TYPES.find((r) => r.id === id)

// The report a ?tab= value opens; a missing or unknown value opens the first report.
export const reportTypeFromParam = (param) => (REPORT_TYPES.some((r) => r.id === param) ? param : REPORT_TYPES[0].id)

// ── the period line ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

// A day from 'YYYY-MM-DD' text; null for anything blank or unreadable.
function parseDay(value) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value || '').trim())
  if (!m) return null
  const [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])]
  if (month < 1 || month > 12 || day < 1 || day > 31) return null
  return { year, month, day }
}
const longDay = (d) => `${MONTHS[d.month - 1]} ${d.day}, ${d.year}`
const sameDay = (a, b) => a.year === b.year && a.month === b.month && a.day === b.day

// "As of October 1 to November 1, 2026" and so on, built from the date filters applied; nothing when there are none.
export function periodText(start, end) {
  const from = parseDay(start)
  const to = parseDay(end)
  if (from && to) {
    if (sameDay(from, to)) return `As of ${longDay(from)}`
    if (from.year === to.year) return `As of ${MONTHS[from.month - 1]} ${from.day} to ${longDay(to)}`
    return `As of ${longDay(from)} to ${longDay(to)}`
  }
  if (from) return `From ${longDay(from)} onward`
  if (to) return `Up to ${longDay(to)}`
  return ''
}

// ── the filters line ─────────────────────────────────────────────────────────────────────────────────────────────────────────

// "Barangay: Alaska · Crop: Rice" from [[label, value], ...], leaving out the filters that are not set.
export const detailFromFilters = (pairs) =>
  pairs.filter(([, value]) => String(value ?? '').trim() !== '').map(([label, value]) => `${label}: ${String(value).trim()}`).join(' · ')

// The line under the period of a backend document: its `detail` when it has one, otherwise the title (if it differs from the heading) and the subtitle.
export function filtersLine(doc) {
  if (doc.detail !== undefined && doc.detail !== null) return doc.detail
  const parts = []
  if (doc.title && doc.title !== doc.heading) parts.push(doc.title)
  if (doc.subtitle) parts.push(doc.subtitle)
  return parts.join(' · ')
}

// What the paper shows of a backend document.
export function paperDocument(doc) {
  const heading = doc.heading || doc.title   // the backend defaults the heading to the title
  const paper = { heading, period: doc.period || '', detail: filtersLine({ ...doc, heading }), stats: doc.stats || [], sections: doc.sections || [] }
  return doc.row_refs ? { ...paper, row_refs: doc.row_refs } : paper   // which record each row of a list is
}

// ── the Selected report box ──────────────────────────────────────────────────────────────────────────────────────────────────

export const selectedReport = (type, { period, detail }) => ({
  name: type.label,
  description: type.description,
  rows: [['Period', period || 'All dates'], ['Filters', detail || 'None']],
})

// ── the signature lines ──────────────────────────────────────────────────────────────────────────────────────────────────────

const RECORDS_OFFICER = 'Records Officer, Office of the Municipal Agriculturist'

// The slots of the printed signature block from the signer parameters (utils/signatories.js signatureParams): Prepared | Checked | Noted |
// Approved, a slot nobody fills left out, and the office's "Certified by" column when nobody is noted or approving. Names print in capitals.
export function signatureSlots(params) {
  const p = params || {}
  const slot = (label, name, role) => ({ label, name: String(name || '').toUpperCase(), role })
  const slots = [slot('Prepared by', p.prepared_by, p.prepared_role || RECORDS_OFFICER)]
  if (p.reviewed_by) slots.push(slot('Checked by', p.reviewed_by, p.reviewed_role || ''))
  if (p.noted_by) slots.push(slot('Noted by', p.noted_by, p.noted_role || 'Municipal Agriculturist'))
  if (p.approved_by) slots.push(slot('Approved by', p.approved_by, p.approved_role || ''))
  if (!p.noted_by && !p.approved_by) slots.push({ label: 'Certified by', name: 'MUNICIPAL AGRICULTURIST', role: 'Municipality of Aringay, La Union' })
  return slots
}

// ── the individual report ────────────────────────────────────────────────────────────────────────────────────────────────────

// The registered and the organization assistance reports show a list; one record's individual report comes from a clicked row (`picked`,
// {id, label}) or, with `individual=auto`, from a search that left exactly one record (the backend then sends `doc.individual`).

// The id and name of the record each row of the list stands for ([] for an individual report or while loading).
export const rowRefsOf = (doc) => doc?.row_refs || []

// Which individual report is showing, if any: { label, picked } (picked = by a click, so "Show all records" can go back) or null for the list.
export function individualFrom(doc, picked) {
  if (picked) return { label: picked.label, picked: true }
  if (doc?.individual) return { label: doc.individual.label, picked: false }
  return null
}

// The query of such a report: a clicked row asks for that record; otherwise the search may decide (individual=auto).
export const individualParams = (params, picked) => (picked ? { ...params, id: picked.id } : { ...params, individual: 'auto' })
