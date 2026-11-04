// The rules behind the Feeding Log and Health Log forms of a production cycle (AquacultureCycleDetailModal.jsx), kept apart so they can be
// tested on their own. Display and checking only: the backend decides (monitoring.models) and checks everything again.

// What the "Log Activity" button of an expanded production cycle offers.
export const LOG_ACTIVITY_OPTIONS = [
  { key: 'feeding', label: 'Feeding Log' },
  { key: 'health', label: 'Health Log' },
]

export const unitLabel = (u) => `${u.unit_type === 'cage' ? 'Cage' : 'Pond'} ${u.unit_number}`

export const HEALTH_OBSERVATION_OPTIONS = [
  'Fish Mortality',
  'Bacterial Infection',
  'Fungal Infection',
  'Fin Rot',
  'Gill Disease',
  'White Spot (Ich)',
  'Parasites',
  'Poor Water Quality',
  'Low Dissolved Oxygen',
  'Weak Swimming',
  'Feeding Issue',
  'Injury',
  'Predator Attack',
  'Other',
]

// The disease entries of HEALTH_OBSERVATION_OPTIONS. Mirrors monitoring.models.HEALTH_DISEASE_OBSERVATIONS,
// which is the authoritative rule; this only drives the live banner.
export const HEALTH_DISEASE_OBSERVATIONS = [
  'Bacterial Infection',
  'Fungal Infection',
  'Fin Rot',
  'Gill Disease',
  'White Spot (Ich)',
  'Parasites',
]

export const HEALTH_RECOMMENDED_TREATMENT = {
  'Fish Mortality': 'Remove dead fish and disinfect pond',
  'Bacterial Infection': 'Oxytetracycline',
  'Fungal Infection': 'Salt Bath',
  'Fin Rot': 'Oxytetracycline',
  'Gill Disease': 'Improve water quality',
  'White Spot (Ich)': 'Salt Treatment',
  Parasites: 'Formalin Bath',
  'Poor Water Quality': 'Water Exchange',
  'Low Dissolved Oxygen': 'Increase Aeration',
  'Weak Swimming': 'Improve water quality, increase aeration, and closely observe affected fish.',
  'Feeding Issue': 'Adjust Feeding Schedule',
  Injury: 'Isolate Injured Fish',
  'Predator Attack': 'Install Protective Netting',
  Other: 'Manual Input',
}

export const HEALTH_TREATMENT_OPTIONS = [
  'Oxytetracycline',
  'Salt Bath',
  'Improve water quality',
  'Salt Treatment',
  'Formalin Bath',
  'Water Exchange',
  'Increase Aeration',
  'Improve water quality, increase aeration, and closely observe affected fish.',
  'Adjust Feeding Schedule',
  'Isolate Injured Fish',
  'Install Protective Netting',
  'Manual Input',
]

// Same rule as the backend (monitoring.models.health_requires_force_harvest) - display only.
export const isForceObservation = (obs) => obs === 'Fish Mortality' || HEALTH_DISEASE_OBSERVATIONS.includes(obs)

// Which boxes a pond/cage row needs once its observation is chosen: a mortality count for Fish Mortality, a treatment for every
// observation that is not a force-harvest one.
export function unitEntryNeeds(entry) {
  const observation = entry?.observation || ''
  const force = isForceObservation(observation)
  return { observation: true, mortality: observation === 'Fish Mortality', treatment: Boolean(observation) && !force, force }
}

// The message for a pond/cage row that is not complete yet, or '' when it is.
export function validateUnitEntry(e) {
  if (!e.observation) return 'Observation is required.'
  if (e.observation === 'Other' && !e.observation_other.trim()) return 'Specify the observation.'
  if (e.observation === 'Fish Mortality' && !(Number(e.mortality_count) > 0)) return 'Mortality Count is required for Fish Mortality.'
  if (!isForceObservation(e.observation) && !e.treatment_applied) return 'Treatment is required for this observation.'
  return ''
}
