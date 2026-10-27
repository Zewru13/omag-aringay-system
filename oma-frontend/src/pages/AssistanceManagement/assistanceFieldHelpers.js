// Plain constants/functions split out of sharedAssistanceFields.jsx so that
// file can export components only (react-refresh/only-export-components).

// The agencies a form offers: the managed list (Assistance Settings), plus any already chosen on the record (deleted since, or
// typed long ago), alphabetical. `agencies` is [{ name }] or null while it loads.
export function agencyChoices(agencies, selected = []) {
  const names = new Set((agencies || []).map((a) => a.name))
  for (const name of selected || []) names.add(name)
  return [...names].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
}

// The chosen agencies as the box shows them: the first `max` by name, and how many more there are (shown as "and N more", the
// full list stays in the tooltip), so a long selection can never stretch the box.
export function agencyChipSummary(selected, max = 3) {
  const list = selected || []
  return { shown: list.slice(0, max), more: Math.max(0, list.length - max) }
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
  item_type: '',   // fisheries: the feed, fishing gear or fingerlings given
}

// Which dropdown an assistance type asks for, per domain: the record field it fills (`key`), the list the choices come from (`choices`,
// see GET /interventions/assistance-choices/), its label and where an Admin manages that list.
export const TYPE_FIELDS = {
  crop: {
    Seeds:      { key: 'seed_type',       choices: 'seed',       label: 'Type of Seed',       where: 'Crop Settings > Crop Options' },
    Fertilizer: { key: 'fertilizer_type', choices: 'fertilizer', label: 'Type of Fertilizer', where: 'Crop Settings > Input Types (category Fertilizer)' },
    Equipment:  { key: 'equipment_type',  choices: 'equipment',  label: 'Type of Equipment',  where: 'Crop Settings > Equipment Types' },
  },
  fisheries: {
    Equipment:           { key: 'equipment_type', choices: 'equipment',  label: 'Type of Equipment',          where: 'Fisheries Settings > Equipment Types' },
    Feed:                { key: 'item_type',      choices: 'feed',       label: 'Type of Feed',               where: 'Fisheries Settings > Feed Types' },
    'Fishing Gear':      { key: 'item_type',      choices: 'gear',       label: 'Type of Fishing Gear',       where: 'Fisheries Settings > Fishing Gear' },
    'Fingerlings/Seeds': { key: 'item_type',      choices: 'fingerling', label: 'Type of Fingerlings / Species', where: 'Fisheries Settings > Species' },
  },
}
export const UNITS_WHERE = { crop: 'Crop Settings > Units', fisheries: 'Fisheries Settings > Units' }

export const typeFieldFor = (domain, assistanceType) => TYPE_FIELDS[domain]?.[assistanceType] || null

// The choices of a dropdown with the record's own value kept in (a value no longer in the list must stay selectable on an old record).
export function choicesWith(list, current) {
  const names = [...(list || [])]
  if (current && !names.includes(current)) names.push(current)
  return names
}

// A quantity typed as a number and picked as a unit, as the one text the record stores ("2 sack").
export function quantityWithUnit(amount, unit) {
  const number = String(amount ?? '').trim()
  if (!number) return ''
  return [number, String(unit ?? '').trim()].filter(Boolean).join(' ')
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
  // Fisheries only (the crop domain has no such field): the type of feed, fishing gear or fingerlings.
  const item = !allowSeedFertilizer && typeFieldFor('fisheries', assistanceType)?.key === 'item_type'
  return {
    training_duration_days: training && form.training_duration_days ? Number(form.training_duration_days) : null,
    equipment_type: equipment ? (form.equipment_type || '').trim() : '',
    seed_type: seeds ? (form.seed_type || '').trim() : '',
    fertilizer_type: fertilizer ? (form.fertilizer_type || '').trim() : '',
    item_type: item ? (form.item_type || '').trim() : '',
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
