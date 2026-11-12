// The rules of Edit Production Cycle: the Start Production Cycle form filled in with a saved cycle. One save changes the stocking record AND its
// production cycle (the server keeps their copies of the stocking date, species, culture phase and count in step). No screen and no network,
// so these can be tested alone.
//   record   the stocking record (GET /fisheries/stocking/<id>/: with its logs, disaster_reports and harvests)
//   cycle    its production cycle (GET /monitoring/aquaculture-cycles/<id>/: with its units, health_logs and feeding_logs)
import { OWNERSHIP_OPTIONS, chooseOwnership, needsOwnerDetails, ownershipFrom, ownershipPayload, ownershipProblem } from '../../utils/ownership.js'
import { formatDate } from '../../utils/dateFormat.js'
import { pcicChanged, pcicStateFrom } from '../../utils/pcic.js'

// The cycle's own status. Harvested follows the harvest records; Failed and Abandoned are set here.
export const CYCLE_STATUSES = ['Active', 'Harvested', 'Failed', 'Abandoned']

export const CULTURE_PHASES = ['Nursery Phase', 'Stocking Phase', 'Grow-out Phase', 'Harvest Phase', 'Post-Harvest Phase', 'Other']

const dates = (list, key) => (list || []).map((row) => row?.[key]).filter(Boolean)

// The earliest date of anything recorded against this cycle ('' when nothing is): activity logs, disaster reports, harvests, and the cycle's
// own health and feeding logs. The stocking date cannot move after it.
export function firstActivityDate({ record, cycle }) {
  const all = [
    ...dates(record?.logs, 'date_of_activity'), ...dates(record?.disaster_reports, 'date_of_occurrence'), ...dates(record?.harvests, 'harvest_date'),
    ...dates(cycle?.health_logs, 'log_date'), ...dates(cycle?.feeding_logs, 'feeding_date'),
  ].map((d) => String(d).slice(0, 10)).sort()
  return all[0] || ''
}

// What cannot be changed here. The species is locked once anything is recorded. The ponds / cages (their number, size and fingerlings) are not
// edited here at all: with them the count and area are their total (PCIC is changed per pond / cage from the units panel).
export function cycleLocks({ record, cycle }) {
  const first = firstActivityDate({ record, cycle })
  return { species: Boolean(first), ponds: (cycle?.units || []).length > 0, first }
}

// A stored text as the form shows it: an item of the list, or Other with the text.
const choice = (stored, list) => {
  const text = String(stored ?? '').trim()
  if (!text) return ['', '']
  return list.includes(text) ? [text, ''] : ['Other', text]
}
const text = (value) => (value === null || value === undefined ? '' : String(value))

export function cycleEditFormFrom({ record, cycle, barangays = [] }) {
  const [phase, phaseOther] = choice(cycle?.cycle_name, CULTURE_PHASES.filter((p) => p !== 'Other'))
  const [place, placeOther] = choice(record?.pond_location_barangay, barangays)
  const owner = ownershipFrom(cycle)
  return {
    organization: cycle?.organization ? String(cycle.organization) : '',
    cycle_name: phase,
    cycle_name_other: phaseOther,
    species: text(record?.species),
    water_source: text(record?.water_source),
    water_source_other: text(record?.water_source_other_specify),
    fingerling_source: text(record?.fingerling_source),
    fingerling_source_other: text(record?.fingerling_source_other_specify),
    pond_location: place,
    pond_location_other: placeOther,
    stocking_date: text(record?.date_stocked).slice(0, 10),
    target_harvest_date: text(cycle?.target_harvest_date).slice(0, 10),
    number_of_fingerlings: text(record?.number_of_fingerlings),
    ownership: owner.ownership,
    ownerName: owner.ownerName,
    ownerNo: owner.ownerNo,
    survival_rate_pct: text(record?.survival_rate_pct),
    avg_body_weight_kg: text(record?.avg_body_weight_kg),
    seed_cost_php: text(record?.seed_cost_php),
    avg_fingerling_size: text(record?.avg_fingerling_size),
    land_status: text(record?.land_status),
    land_status_other: text(record?.land_status_other_specify),
    // the cycle's own status and harvest summary (saved on the cycle, not the stocking record)
    cycle_status: text(cycle?.status) || 'Active',
    actual_harvest_date: text(cycle?.actual_harvest_date).slice(0, 10),
    harvest_volume_kg: text(cycle?.harvest_volume_kg),
    area_cage_harvested: text(cycle?.area_cage_harvested),
    cycle_notes: text(cycle?.notes),
  }
}

// What stops the save ('' when nothing does).
export function cycleEditProblem(form, { record, cycle, today }) {
  const locks = cycleLocks({ record, cycle })
  if (!form.cycle_name) return 'Choose the culture phase.'
  if (form.cycle_name === 'Other' && !form.cycle_name_other.trim()) return 'Specify the culture phase.'
  if (!form.species) return 'Choose the species.'
  if (form.pond_location === 'Other' && !form.pond_location_other.trim()) return 'Specify the pond location.'
  if (form.water_source === 'Other' && !form.water_source_other.trim()) return 'Specify the water source.'
  if (!form.stocking_date) return 'Stocking date is required.'
  if (today && form.stocking_date > today) return 'Stocking date cannot be in the future.'
  if (locks.first && form.stocking_date > locks.first) {
    return `Stocking date cannot be after ${formatDate(locks.first)}, the first activity recorded for this cycle.`
  }
  if (!form.target_harvest_date) return 'Target harvest date is required.'
  if (form.target_harvest_date < form.stocking_date) return 'Target harvest date cannot be earlier than the stocking date.'
  // A cycle made before ownership was asked may stay without one; a cycle that has one cannot lose it.
  if (form.ownership || OWNERSHIP_OPTIONS.includes(cycle?.ownership)) {
    const problem = ownershipProblem({ ownership: form.ownership, ownerName: form.ownerName, ownerNo: form.ownerNo })
    if (problem) return problem
  }
  const rate = form.survival_rate_pct
  if (rate !== '' && !(parseFloat(rate) >= 0 && parseFloat(rate) <= 100)) return 'Survival rate must be between 0 and 100.'
  if (form.avg_body_weight_kg !== '' && !(parseFloat(form.avg_body_weight_kg) >= 0)) return 'Average body weight cannot be negative.'
  if (form.seed_cost_php !== '' && !(parseFloat(form.seed_cost_php) >= 0)) return 'Seed cost cannot be negative.'
  if (!locks.ponds && !(parseInt(form.number_of_fingerlings, 10) >= 1)) return 'Number of fingerlings is required.'
  if (form.harvest_volume_kg !== '' && !(parseFloat(form.harvest_volume_kg) >= 0)) return 'Harvest volume cannot be negative.'
  if (form.actual_harvest_date && form.actual_harvest_date < form.stocking_date) return 'Actual harvest date cannot be earlier than the stocking date.'
  if (form.actual_harvest_date && today && form.actual_harvest_date > today) return 'Actual harvest date cannot be in the future.'
  return ''
}

const number = (value) => (value === '' ? null : parseFloat(value))

// What is sent: only the fields that changed. The server writes the record and its cycle together (the cycle's own fields go as `cycle_*`).
export function cycleEditPayload(form, { record, cycle, barangays = [] }) {
  const original = cycleEditFormFrom({ record, cycle, barangays })
  const locks = cycleLocks({ record, cycle })
  const body = {}
  const changed = (...keys) => keys.some((key) => form[key] !== original[key])

  if (changed('organization')) body.cycle_organization = form.organization ? Number(form.organization) : null
  if (changed('cycle_name', 'cycle_name_other')) body.cycle_name = form.cycle_name === 'Other' ? form.cycle_name_other.trim() : form.cycle_name
  if (changed('species') && !locks.species) body.species = Number(form.species)
  if (changed('water_source', 'water_source_other')) {
    body.water_source = form.water_source
    body.water_source_other_specify = form.water_source === 'Other' ? form.water_source_other.trim() : ''
  }
  if (changed('fingerling_source', 'fingerling_source_other')) {
    body.fingerling_source = form.fingerling_source
    body.fingerling_source_other_specify = form.fingerling_source === 'Other' ? form.fingerling_source_other.trim() : ''
  }
  if (changed('pond_location', 'pond_location_other')) body.pond_location_barangay = form.pond_location === 'Other' ? form.pond_location_other.trim() : form.pond_location
  if (changed('stocking_date')) body.date_stocked = form.stocking_date
  if (changed('target_harvest_date')) body.cycle_target_harvest_date = form.target_harvest_date || null
  if (changed('ownership', 'ownerName', 'ownerNo')) {
    const owner = ownershipPayload({ ownership: form.ownership, ownerName: form.ownerName, ownerNo: form.ownerNo })
    if (owner.ownership) {
      body.cycle_ownership = owner.ownership
      body.cycle_owner_name = owner.owner_name
      body.cycle_owner_registration_number = owner.owner_registration_number
    }
  }
  if (changed('number_of_fingerlings') && !locks.ponds) body.number_of_fingerlings = parseInt(form.number_of_fingerlings, 10)
  if (changed('survival_rate_pct')) body.survival_rate_pct = number(form.survival_rate_pct)
  if (changed('avg_body_weight_kg')) body.avg_body_weight_kg = number(form.avg_body_weight_kg)
  if (changed('seed_cost_php')) body.seed_cost_php = number(form.seed_cost_php)
  if (changed('avg_fingerling_size')) body.avg_fingerling_size = form.avg_fingerling_size.trim()
  if (changed('land_status', 'land_status_other')) {
    body.land_status = form.land_status
    body.land_status_other_specify = form.land_status === 'Other' ? form.land_status_other.trim() : ''
  }
  return body
}

// What is sent to the CYCLE (PATCH /monitoring/aquaculture-cycles/<id>/): only the status and harvest fields that changed. Nothing when the record has no cycle.
export function cycleOutcomePayload(form, { record, cycle, barangays = [] }) {
  if (!cycle) return {}
  const original = cycleEditFormFrom({ record, cycle, barangays })
  const body = {}
  if (form.cycle_status !== original.cycle_status) body.status = form.cycle_status
  if (form.actual_harvest_date !== original.actual_harvest_date) body.actual_harvest_date = form.actual_harvest_date || null
  if (form.harvest_volume_kg !== original.harvest_volume_kg) body.harvest_volume_kg = number(form.harvest_volume_kg)
  if (form.area_cage_harvested !== original.area_cage_harvested) body.area_cage_harvested = form.area_cage_harvested.trim()
  if (form.cycle_notes !== original.cycle_notes) body.notes = form.cycle_notes
  return body
}

// Each pond / cage's PCIC insurance as the state the form changes (pcic.js), by unit id.
export const unitPcicStates = (cycle) => Object.fromEntries((cycle?.units || []).map((u) => [u.id, pcicStateFrom(u)]))

// Did anything change: a box ticked or cleared, a photo added or removed.
export function unitPcicChanged(cycle, states) {
  return (cycle?.units || []).some((u) => {
    const next = states?.[u.id]
    return Boolean(next) && (next.insured !== Boolean(u.has_pcic_insurance) || pcicChanged(next))
  })
}

export { chooseOwnership, needsOwnerDetails }
