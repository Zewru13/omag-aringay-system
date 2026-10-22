// The Assistance Distribution Report: what a confirmation just recorded, as a printable document for the office. Pure (no screen,
// no network); the print itself is printSpec() from the disaster report document, the same one the harvest report uses.
import { formatAssistanceQuantity } from './assistanceFieldHelpers.js'

const SECTORS = { crop: 'Crop (Farmers)', fisheries: 'Fisheries (Fisherfolk)' }

const fmt = (value) => (value
  ? new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00`))
  : '')

export const beneficiaryName = (record) => record.farmer_full_name || record.fisherfolk_full_name || record.name || '—'

const unique = (values) => [...new Set(values.filter(Boolean))]
const byText = (a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })

// records: the assistance rows that were confirmed; confirmedOn: the day of the confirmation (an ISO date or datetime).
export function buildAssistanceReportSpec({ domain = 'crop', records, confirmedOn, organizationName = '', note = '' }) {
  const day = String(confirmedOn || '').slice(0, 10)
  const firstId = Math.min(...records.map((r) => Number(r.id)).filter(Number.isFinite))
  const reference = `AD-${day.replace(/-/g, '')}-${String(firstId).padStart(6, '0')}`

  const sorted = [...records].sort((a, b) => byText(beneficiaryName(a), beneficiaryName(b)))
  const dates = records.map((r) => r.date_given).filter(Boolean).sort()
  const dateGiven = dates.length === 0 ? '' : (dates[0] === dates.at(-1) ? fmt(dates[0]) : `${fmt(dates[0])} to ${fmt(dates.at(-1))}`)
  const agencies = unique(records.flatMap((r) => r.source_agencies || [])).sort(byText)

  const sections = [
    {
      title: 'Summary',
      rows: [
        ['Beneficiaries', String(records.length)],
        ['Assistance', unique(records.map((r) => r.assistance_type)).sort(byText).join(', ')],
        ...(agencies.length ? [['Source agencies', agencies.join(', ')]] : []),
        ...(dateGiven ? [['Date given', dateGiven]] : []),
      ],
    },
    {
      title: 'Beneficiaries',
      table: {
        head: ['No.', 'Beneficiary', 'Barangay', 'Assistance', 'Quantity / Amount', 'Source Agency', 'Date Given'],
        rows: sorted.map((r, i) => [
          String(i + 1), beneficiaryName(r), r.farmer_barangay || r.fisherfolk_barangay || r.barangay || '—', r.assistance_type || '—',
          String(formatAssistanceQuantity(r.assistance_type, r.quantity) || '—'), (r.source_agencies || []).join(', ') || '—', fmt(r.date_given) || '—',
        ]),
        boldRows: new Set(),
      },
    },
  ]
  if (note && String(note).trim()) sections.push({ title: 'Notes', paragraphs: [String(note).trim()], empty: '' })

  return {
    title: 'ASSISTANCE DISTRIBUTION REPORT',
    reference,
    header: [
      ['Reference No.', reference],
      ['Date Confirmed', fmt(day)],
      ['Sector', SECTORS[domain] || SECTORS.crop],
      ...(organizationName ? [['Organization', organizationName]] : []),
    ],
    sections,
    photos: [],
    footerLabel: 'assistance record',
    signatures: ['Prepared by', 'Noted by'],
  }
}
