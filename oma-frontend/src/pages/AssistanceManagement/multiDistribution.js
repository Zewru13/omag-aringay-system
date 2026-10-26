// Distributing assistance to several organizations in one go (the "Distribute to Multiple Organizations" page): each row is one
// organization with the assistance it receives for its members. Pure rules (blank rows, what is wrong with a row, what is sent, how the
// review and the outcome are counted), with no screen and no network, so they can be tested on their own.
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, assistanceDateProblem, buildTypeConditionalPayload, validateTrainingDuration,
  isCashType, isTrainingType,
} from './assistanceFieldHelpers.js'

export const MAX_DISTRIBUTION_ROWS = 30

export const makeDistributionRow = (id, today, copyFrom = null) => ({
  _id: id,
  org: null,                                // { id, name, barangay } once an organization is picked
  assistance_type: copyFrom?.assistance_type || '',
  assistance_type_other: copyFrom?.assistance_type_other || '',
  source_agencies: [...(copyFrom?.source_agencies || [])],
  date_given: copyFrom?.date_given || today,
  quantity: copyFrom?.quantity || '',
  cash_amount: copyFrom?.cash_amount || '',
  description: copyFrom?.description || '',
  ...EMPTY_TYPE_CONDITIONAL_FIELDS,
  ...(copyFrom ? {
    training_duration_days: copyFrom.training_duration_days, equipment_type: copyFrom.equipment_type,
    seed_type: copyFrom.seed_type, fertilizer_type: copyFrom.fertilizer_type,
  } : {}),
})

// Changing the assistance type clears what belonged to the old one, so nothing stale is ever sent for the new one.
export const withAssistanceType = (row, type) => ({
  ...row, assistance_type: type, quantity: '', cash_amount: '', training_duration_days: '', equipment_type: '', seed_type: '', fertilizer_type: '',
})

export const typeName = (row) => (row.assistance_type === 'Other' ? (row.assistance_type_other || '').trim() : row.assistance_type)

// What a row gives per member, as the confirmation and the request word it.
export function quantityText(row) {
  if (isCashType(row.assistance_type)) return row.cash_amount ? `₱${row.cash_amount} per head` : ''
  if (isTrainingType(row.assistance_type)) return ''
  return row.quantity || ''
}

// What is wrong with one row ('' when nothing).
export function rowProblem(row, { today }) {
  if (!row.org) return 'choose the organization'
  if (!row.assistance_type) return 'choose the assistance type'
  if (row.assistance_type === 'Other' && !(row.assistance_type_other || '').trim()) return 'say what the assistance type is'
  const dateProblem = assistanceDateProblem(row.date_given, { today })
  if (dateProblem) return dateProblem.charAt(0).toLowerCase() + dateProblem.slice(1).replace(/\.$/, '')
  if (isCashType(row.assistance_type) && !(Number(row.cash_amount) > 0)) return 'enter the cash amount per member'
  const training = validateTrainingDuration(row.assistance_type, row)
  if (training) return training.charAt(0).toLowerCase() + training.slice(1).replace(/\.$/, '')
  return ''
}

// The same organization twice with the same assistance on the same date would give it twice.
export function repeatedProblems(rows) {
  const seen = new Map()
  const found = {}
  rows.forEach((row, i) => {
    if (!row.org || !row.assistance_type) return
    const key = `${row.org.id}|${typeName(row).toLowerCase()}|${row.date_given}`
    if (seen.has(key)) found[row._id] = `${row.org.name} already receives this assistance on this date in row ${seen.get(key)}`
    else seen.set(key, i + 1)
  })
  return found
}

// { [row._id]: 'Row 2: choose the organization.' } for every row that cannot be sent yet; {} when all are fine.
export function validateRows(rows, { today }) {
  const repeats = repeatedProblems(rows)
  const problems = {}
  rows.forEach((row, i) => {
    const problem = rowProblem(row, { today }) || repeats[row._id] || ''
    if (problem) problems[row._id] = `Row ${i + 1}: ${problem}.`
  })
  return problems
}

// The body of one organization's request (the same one the single-organization form sends). `dryRun` previews; `memberIds` chooses the
// recipients of the real one.
export function distributionPayload(row, { dryRun = false, memberIds = null } = {}) {
  return {
    assistance_type: typeName(row),
    source_agencies: row.source_agencies,
    date_given: row.date_given,
    quantity: quantityText(row),
    description: row.description,
    ...buildTypeConditionalPayload(row.assistance_type, row),
    ...(dryRun ? { dry_run: true } : {}),
    ...(memberIds ? { member_ids: memberIds } : {}),
  }
}

// ── the review: each row's preview ({ member_count, results: [{ person_id, status: would_create | would_block, ... }] }) and which
// members are ticked (a Set of person ids per row).
export const eligibleIds = (preview) => (preview?.results || []).filter((m) => m.status === 'would_create').map((m) => m.person_id)

export function reviewTotals(previews, selected) {
  let organizations = 0
  let records = 0
  let blocked = 0
  previews.forEach((preview, i) => {
    const chosen = (selected[i] ? [...selected[i]] : []).filter((id) => eligibleIds(preview).includes(id)).length
    if (chosen > 0) organizations += 1
    records += chosen
    blocked += (preview?.results || []).filter((m) => m.status === 'would_block').length
  })
  return { organizations, records, blocked }
}

// ── the outcome: what each organization's request answered ({ results: [{ status: created | blocked | error }] }) or the error that
// stopped it ({ failed: 'message' }).
export function outcomeTotals(outcomes) {
  const totals = { organizations: 0, created: 0, blocked: 0, errors: 0, failed: 0 }
  outcomes.forEach((outcome) => {
    if (outcome.failed) { totals.failed += 1; return }
    totals.organizations += 1
    ;(outcome.results || []).forEach((r) => {
      if (r.status === 'created') totals.created += 1
      else if (r.status === 'blocked') totals.blocked += 1
      else if (r.status === 'error') totals.errors += 1
    })
  })
  return totals
}
