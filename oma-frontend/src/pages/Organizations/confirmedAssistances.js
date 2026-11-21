// The Confirmed for Members table: one row per assistance, opening to the members the organization confirmed. These are the rules behind it
// and the reports it prints or downloads. No screen and no network, so they can be tested alone.
import { buildAssistanceReportSpec } from '../AssistanceManagement/assistanceReport.js'

// What the table calls an assistance: its type and, when it has one, the item ("Seeds — Palay (Rice)").
export function assistanceName(group) {
  const type = String(group?.assistance_type || '').trim() || 'Assistance'
  const item = String(group?.item || '').trim()
  return item && type !== 'Assistance' ? `${type} — ${item}` : type
}

// The records a report is made of, in the shape the assistance report reads: every member that was confirmed (the bulk report), or just
// `member` (the individual report).
export function confirmedRecords(group, member = null) {
  const members = member ? [member] : (group?.members || [])
  return members.map((m) => ({
    id: m.record_id, name: m.name, rsbsa: m.rsbsa, barangay: m.barangay,
    assistance_type: group.assistance_type, item: group.item, quantity: group.quantity,
    source_agencies: group.source_agencies || [], date_given: group.date_given,
  }))
}

// The Assistance Distribution Report of one assistance: all its confirmed members, or one member's own. It is dated by the confirmation.
export function confirmedReportSpec({ domain, group, member = null, organizationName = '' }) {
  return buildAssistanceReportSpec({
    domain,
    records: confirmedRecords(group, member),
    confirmedOn: (member || group).confirmed_at,
    organizationName,
    dateLabel: 'Date Confirmed',
  })
}
