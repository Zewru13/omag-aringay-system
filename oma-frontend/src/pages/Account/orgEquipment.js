// The rules of an organization account's Equipment page (MyOrgEquipmentPage.jsx draws them): one row per kind of equipment, and the
// loans in sections with the buttons each one needs. No screen and no network, so they can be tested on their own.
import { groupEquipment } from '../../utils/equipmentLoans.js'

// One row per kind of equipment (its lines, one per condition, are inside it): { id, label, lines, total, onLoan, available, ... }.
export const equipmentRows = (lines) => groupEquipment(lines)

// Its units by condition: "4 Good, 1 Broken".
export const conditionText = (row) => String(row.summary || '').split(' · ').slice(1).join(' · ')

const OUT = ['BORROWED', 'RETURN_PENDING']

// Requests first (they wait on the organization), then what is out, then everything that is closed (returned, rejected, cancelled).
export const LOAN_SECTIONS = [
  { key: 'requests', label: 'Requests', match: (loan) => loan.status === 'REQUESTED' },
  { key: 'out', label: 'On loan', match: (loan) => OUT.includes(loan.status) },
  { key: 'returned', label: 'Returned', match: (loan) => loan.status !== 'REQUESTED' && !OUT.includes(loan.status) },
]

// The buttons of a loan: approve or reject a request; mark returned what is out (also when the member already said it is back).
export function loanActions(loan) {
  if (loan.status === 'REQUESTED') return [{ label: 'Approve', kind: 'approve', primary: true }, { label: 'Reject', kind: 'reject' }]
  if (OUT.includes(loan.status)) return [{ label: 'Mark returned', kind: 'return', primary: true }]
  return []
}

const STATUS = {
  REQUESTED: { text: 'Requested', tone: 'amber' },
  BORROWED: { text: 'On loan', tone: 'green' },
  RETURN_PENDING: { text: 'Return to confirm', tone: 'amber' },
  RETURNED: { text: 'Returned', tone: 'grey' },
  REJECTED: { text: 'Rejected', tone: 'grey' },
  CANCELLED: { text: 'Cancelled', tone: 'grey' },
}
const isLate = (loan) => Boolean(loan.overdue) && OUT.includes(loan.status)

export const loanStatusText = (loan) => (isLate(loan) ? 'Overdue' : STATUS[loan.status]?.text || loan.status)
export const loanTone = (loan) => (isLate(loan) ? 'red' : STATUS[loan.status]?.tone || 'grey')

// The date that says how recent a loan is: when it came back, else when it was lent, else when it was asked for.
const recency = (loan) => String(loan.returned_at || loan.borrowed_at || loan.requested_at || '')

// Overdue loans first, then the newest. A new list.
export const sortLoans = (loans) => [...loans].sort((a, b) => (Number(isLate(b)) - Number(isLate(a))) || recency(b).localeCompare(recency(a)))

// Everything the search box may look at.
export const loanText = (loan) => [loan.equipment_name, loan.member_name].filter(Boolean).join(' ')
