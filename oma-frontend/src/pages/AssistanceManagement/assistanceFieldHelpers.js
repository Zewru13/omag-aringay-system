// Plain constants/functions split out of sharedAssistanceFields.jsx so that
// file can export components only (react-refresh/only-export-components).

// The agencies a form offers: the managed list (Assistance Settings), plus any already chosen on the record (deleted since, or
// typed long ago), alphabetical. `agencies` is [{ name }] or null while it loads.
export function agencyChoices(agencies, selected = []) {
  const names = new Set((agencies || []).map((a) => a.name))
  for (const name of selected || []) names.add(name)
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// Assistance is recorded for today or a future date. A record that already has a (past) date may keep it.
export const PAST_DATE_MESSAGE = 'Assistance can only be recorded for today or a future date.'
export function assistanceDateProblem(value, { today, original = '' } = {}) {
  if (!value) return 'Choose the date the assistance is given.'
  if (original && value === original) return ''
  return value < today ? PAST_DATE_MESSAGE : ''
}

// The `min` of the date box. An old record has none (its own date is allowed, so a minimum would mark it invalid).
export function assistanceMinDate({ today, original = '' } = {}) {
  return original && original < today ? undefined : today
}

export const EMPTY_TYPE_CONDITIONAL_FIELDS = {
  training_duration_days: '',
  equipment_type: '',
  seed_type: '',
  fertilizer_type: '',
}

export const isCashType = (t) => t === 'Cash Assistance'

// Cash is an amount of pesos, not a quantity: the forms ask for "Amount (₱)" and the lists show it as ₱1,500.00.
// Text an older record stored ("₱500 per head") is shown as it was written.
export function formatAssistanceQuantity(type, quantity) {
  if (quantity == null || quantity === '') return ''
  if (!isCashType(type)) return quantity
  const text = String(quantity).trim()
  if (!/^[₱\s]*\d[\d,]*(\.\d+)?\s*$/.test(text)) return quantity
  const amount = Number(text.replace(/[₱,\s]/g, ''))
  return `₱${amount.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

// The number inside what an older cash record stored, for the edit form's amount box.
export function cashAmountFrom(quantity) {
  const match = String(quantity ?? '').replace(/,/g, '').match(/\d+(\.\d+)?/)
  return match ? match[0] : ''
}

export function cashAmountError(type, quantity) {
  if (!isCashType(type)) return ''
  const amount = Number(String(quantity ?? '').trim())
  return Number.isFinite(amount) && amount > 0 && String(quantity ?? '').trim() !== '' ? '' : 'Enter the amount of cash given.'
}

export const isTrainingType = (t) => t === 'Training'
export const isEquipmentType = (t) => t === 'Equipment'
export const isSeedsType = (t) => t === 'Seeds'
export const isFertilizerType = (t) => t === 'Fertilizer'

// Builds the four type-conditional keys for a create/update payload — only
// the one matching the CURRENT assistance_type is ever populated, even if a
// stale value lingers in form state from a prior type selection.
// allowSeedFertilizer=false for the fisherfolk domain, which has no
// seed_type/fertilizer_type columns on its model.
export function buildTypeConditionalPayload(assistanceType, form, { allowSeedFertilizer = true } = {}) {
  const training = isTrainingType(assistanceType)
  const equipment = isEquipmentType(assistanceType)
  const seeds = allowSeedFertilizer && isSeedsType(assistanceType)
  const fertilizer = allowSeedFertilizer && isFertilizerType(assistanceType)
  return {
    training_duration_days: training && form.training_duration_days ? Number(form.training_duration_days) : null,
    equipment_type: equipment ? (form.equipment_type || '').trim() : '',
    seed_type: seeds ? (form.seed_type || '').trim() : '',
    fertilizer_type: fertilizer ? (form.fertilizer_type || '').trim() : '',
  }
}

// Validates the training-duration field the same way DistributeAssistanceModal
// does (1-3 days, required once Training is the selected type). Returns an
// error message string, or '' if valid.
export function validateTrainingDuration(assistanceType, form) {
  if (!isTrainingType(assistanceType)) return ''
  const days = Number(form.training_duration_days)
  if (!form.training_duration_days || days < 1 || days > 3) {
    return 'Enter a valid training duration (1-3 days).'
  }
  return ''
}
