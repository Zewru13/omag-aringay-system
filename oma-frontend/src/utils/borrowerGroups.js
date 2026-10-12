// The Borrowed tab of an organization: loans (one per equipment per person) shown as one row per borrower that opens onto
// that person's items. Pure helpers, so the grouping, the filters and the messages can be tested without a screen.
import { loanStatusLabel } from './equipmentLoans.js'

const OPEN = ['REQUESTED', 'BORROWED', 'RETURN_PENDING']
const isOpen = (loan) => OPEN.includes(loan.status)
// The organization has to act on these: decide a request, or confirm a return the member reported.
const needsAction = (loan) => loan.status === 'REQUESTED' || loan.status === 'RETURN_PENDING'

// One loan against the Borrowed tab's filters ('' or missing = no filter). "Borrowed" includes overdue loans; the
// Overdue filter narrows those down.
export const loanMatches = (loan, { status = '', overdue = '', equipment = '' } = {}) => {
  if (status && loanStatusLabel(loan.status) !== status) return false
  if (overdue === 'Overdue only' && !loan.overdue) return false
  if (equipment && loan.equipment_name !== equipment) return false
  return true
}

const countsOf = (loans) => {
  const counts = { requested: 0, returnPending: 0, overdue: 0, borrowed: 0, earlier: 0 }
  loans.forEach((loan) => {
    if (loan.status === 'REQUESTED') counts.requested += 1
    else if (loan.status === 'BORROWED' || loan.status === 'RETURN_PENDING') {
      if (loan.overdue) counts.overdue += 1
      else if (loan.status === 'RETURN_PENDING') counts.returnPending += 1
      else counts.borrowed += 1
    } else counts.earlier += 1
  })
  return counts
}

const summaryOf = (c) => [
  c.requested && `${c.requested} requested`,
  c.returnPending && `${c.returnPending} return pending`,
  c.overdue && `${c.overdue} overdue`,
  c.borrowed && `${c.borrowed} borrowed`,
  c.earlier && `${c.earlier} earlier`,
].filter(Boolean).join(' · ')

// Groups loans (as the equipment-loans endpoint returns them, newest first) by person:
// [{ id, name, loans (open ones first), counts, summary, needsAction }]. People with a request or a return waiting for
// the organization come first; everyone else keeps the order the loans came in.
export const groupLoansByBorrower = (loans) => {
  if (!Array.isArray(loans)) return []
  const groups = new Map()
  loans.forEach((loan) => {
    const id = loan.member_id !== undefined && loan.member_id !== null ? `member:${loan.member_id}` : `name:${loan.member_name}`
    if (!groups.has(id)) groups.set(id, { id, name: loan.member_name, loans: [] })
    groups.get(id).loans.push(loan)
  })
  const built = [...groups.values()].map((group) => {
    const ordered = [...group.loans.filter(isOpen), ...group.loans.filter((l) => !isOpen(l))]
    const counts = countsOf(ordered)
    return { ...group, loans: ordered, counts, summary: summaryOf(counts), needsAction: ordered.some(needsAction) }
  })
  return [...built.filter((g) => g.needsAction), ...built.filter((g) => !g.needsAction)]
}

// What to tell the organization after a return: the units that came back Good can be lent again. '' when none did.
export const availableAgainText = (equipmentName, breakdown) => {
  const good = (Array.isArray(breakdown) ? breakdown : [])
    .filter((part) => part.condition === 'Good')
    .reduce((sum, part) => sum + (Number(part.quantity) || 0), 0)
  if (good < 1) return ''
  return `${good} × ${equipmentName} ${good === 1 ? 'is' : 'are'} available again.`
}
