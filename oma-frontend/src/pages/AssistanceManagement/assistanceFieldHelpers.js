// Plain constants/functions split out of sharedAssistanceFields.jsx so that
// file can export components only (react-refresh/only-export-components).

export const SOURCE_AGENCY_OPTIONS = [
  'LGU - Aringay',
  'Office of the Provincial Agriculturist',
  'Department of Agriculture (DA)',
  'Department of Agrarian Reform (DAR)',
  'Non-Government Organization (NGO)',
]

export const EMPTY_TYPE_CONDITIONAL_FIELDS = {
  training_duration_days: '',
  equipment_type: '',
  seed_type: '',
  fertilizer_type: '',
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
