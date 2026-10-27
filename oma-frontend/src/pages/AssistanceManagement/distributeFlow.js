// Giving assistance from the Assistance pages, to selected farmers / fisherfolk or to selected organizations (one form for both): the
// blank form, what is wrong with it, what is sent, how the review and the outcome are counted, and the records the printable report is
// built from. No screen and no network, so it can be tested on its own.
import {
  EMPTY_TYPE_CONDITIONAL_FIELDS, assistanceDateProblem, buildTypeConditionalPayload, isCashType, isTrainingType, validateTrainingDuration,
} from './assistanceFieldHelpers.js'

export const MAX_RECIPIENTS = 300

export const makeAssistanceForm = (today) => ({
  assistance_type: '',
  assistance_type_other: '',
  source_agencies: [],
  date_given: today,
  quantity: '',
  cash_amount: '',
  description: '',
  ...EMPTY_TYPE_CONDITIONAL_FIELDS,
})

// Changing the assistance type clears what belonged to the old one, so nothing stale is ever sent for the new one.
export const withAssistanceType = (form, type) => ({
  ...form, assistance_type: type, quantity: '', cash_amount: '', training_duration_days: '', equipment_type: '', seed_type: '', fertilizer_type: '',
})

export const typeName = (form) => (form.assistance_type === 'Other' ? (form.assistance_type_other || '').trim() : form.assistance_type)

// What the form gives per recipient, as the review and the request word it.
export function quantityText(form) {
  if (isCashType(form.assistance_type)) return form.cash_amount ? `₱${form.cash_amount} per head` : ''
  if (isTrainingType(form.assistance_type)) return ''
  return form.quantity || ''
}

// What is wrong with the form ('' when nothing), as a sentence.
export function assistanceFormProblem(form, { today }) {
  if (!form.assistance_type) return 'Choose the assistance type.'
  if (form.assistance_type === 'Other' && !(form.assistance_type_other || '').trim()) return 'Say what the assistance type is.'
  const dateProblem = assistanceDateProblem(form.date_given, { today })
  if (dateProblem) return dateProblem
  if (isCashType(form.assistance_type) && !(Number(form.cash_amount) > 0)) return 'Enter the cash amount per member.'
  return validateTrainingDuration(form.assistance_type, form)
}

// The body of an organization's request (POST .../distribute-assistance/). `dryRun` previews; `memberIds` chooses the real one's recipients.
export function organizationRequest(form, { dryRun = false, memberIds = null } = {}) {
  return {
    assistance_type: typeName(form),
    source_agencies: form.source_agencies,
    date_given: form.date_given,
    quantity: quantityText(form),
    description: form.description,
    ...buildTypeConditionalPayload(form.assistance_type, form),
    ...(dryRun ? { dry_run: true } : {}),
    ...(memberIds ? { member_ids: memberIds } : {}),
  }
}

// The body of the request for selected people (POST .../adhoc/bulk/): `idsKey` is farmer_ids or fisherfolk_ids, `descriptionKey` the
// field the notes go to (remarks for farmers, description for fisherfolk). Fisherfolk have no seed or fertilizer type.
export function peopleRequest(form, { idsKey, ids, descriptionKey = 'remarks', dryRun = false, allowSeedFertilizer = true }) {
  return {
    assistance_type: typeName(form),
    source_agencies: form.source_agencies,
    date_given: form.date_given,
    quantity: quantityText(form),
    [descriptionKey]: form.description,
    ...buildTypeConditionalPayload(form.assistance_type, form, { allowSeedFertilizer }),
    [idsKey]: ids,
    ...(dryRun ? { dry_run: true } : {}),
  }
}

// ── the review of organizations: each one's preview ({ member_count, results: [{ person_id, status: would_create | would_block }] }) and
// which members are ticked (a Set of person ids per organization).
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

export function personOutcomeTotals(results) {
  return {
    created: results.filter((r) => r.status === 'created').length,
    errors: results.filter((r) => r.status === 'error').length,
  }
}

// The recipients picked in a table that has several pages: a Map of id -> record, so a pick on page 1 survives a look at page 2.
export function toggleInMap(map, record) {
  const next = new Map(map)
  if (next.has(record.id)) next.delete(record.id)
  else next.set(record.id, record)
  return next
}

// The assistance records of a finished distribution, for the printable report: only what was created. `results` are the per-person
// answers (a person's own `organization_name` wins over the `organizationName` of the whole request).
export function reportRecords(results, form, { organizationName = '' } = {}) {
  return results.filter((r) => r.status === 'created').map((r) => ({
    id: r.record_id,
    name: r.name,
    barangay: r.barangay || '',
    assistance_type: typeName(form),
    quantity: quantityText(form),
    source_agencies: form.source_agencies,
    date_given: form.date_given,
    organization_name: r.organization_name || organizationName,
  }))
}
