// One feeding or one health log made on the ponds and cages of SEVERAL production cycles at once (the fisherfolk's Cycles page, and the office's
// Aquaculture Monitoring for one fisherfolk). The rules of that window, with no screen and no network, so they can be tested on their own: which
// cycles it offers, the search, the quantities, what is wrong with each form, what is sent and how the server's answer is read.
// The server (POST /monitoring/aquaculture-cycles/bulk-feeding/ and bulk-health/) checks everything again with the same rules as the single-cycle forms.
import { matchesSearch } from '../../utils/searchMatch.js'
import { isForceObservation, unitLabel } from './cycleLogForms.js'

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`
const num = (v) => { const x = parseFloat(v); return x > 0 ? x : 0 }

export const unitName = unitLabel

// Only an Active cycle takes a log, and only one that has ponds or cages to name.
export const activeCycles = (cycles) => (Array.isArray(cycles) ? cycles.filter((c) => c.status === 'Active' && (c.units || []).length > 0) : [])

// The search box: every word typed has to be found in the cycle, its species or its culture system, in any order.
export const filterCycles = (cycles, query) => cycles.filter((c) => matchesSearch([c.cycle_name, c.species_farmed, c.culture_system].filter(Boolean).join(' '), query))

// ─── Feeding ─────────────────────────────────────────────────────────────────────────────────────
// `ticked` is { [cycleId]: true }; `qty` is { [unitId]: 'kg typed' }.
const tickedCycles = (cycles, ticked) => cycles.filter((c) => ticked[c.id])

// The "fill all" box: the same kg on every pond and cage of the ticked cycles (each can still be changed). An empty box changes nothing.
export function fillAll(qty, cycles, ticked, value) {
  if (!String(value ?? '').trim()) return qty
  const next = { ...qty }
  tickedCycles(cycles, ticked).forEach((c) => c.units.forEach((u) => { next[u.id] = String(value).trim() }))
  return next
}

// The kg of the ticked cycles together (junk and negatives count as nothing).
export const feedTotal = (qty, cycles, ticked) => tickedCycles(cycles, ticked).reduce((sum, c) => sum + c.units.reduce((s, u) => s + num(qty[u.id]), 0), 0)

// The feed type as it is saved: the one chosen, the other feed, or the name typed for a custom feed.
function resolvedFeed(form) {
  if (form.feedType !== 'Others') return form.feedType
  return form.feedOther === 'Custom Feed' ? form.feedCustom.trim() : form.feedOther
}

// What is wrong with the feeding form ('' when nothing).
export function feedingProblem(form, cycles, ticked, qty) {
  if (!form.date) return 'Enter the date of the feeding.'
  if (!form.feedType) return 'Choose the feed type.'
  if (form.feedType === 'Others') {
    if (!form.feedOther) return 'Choose the other feed type.'
    if (form.feedOther === 'Custom Feed' && !form.feedCustom.trim()) return 'Type the name of the feed.'
  }
  const chosen = tickedCycles(cycles, ticked)
  if (!chosen.length) return 'Tick at least one cycle.'
  const empty = chosen.find((c) => !c.units.some((u) => num(qty[u.id]) > 0))
  if (empty) return `${empty.cycle_name}: enter the feed quantity of at least one pond or cage.`
  return ''
}

// The request: only the ticked cycles, and in each only the ponds and cages that have a quantity.
export function buildFeedingPayload(form, cycles, ticked, qty) {
  return {
    feeding_date: form.date,
    feed_type: resolvedFeed(form),
    notes: form.notes,
    cycles: tickedCycles(cycles, ticked).map((c) => ({
      cycle: c.id,
      unit_quantities: c.units.filter((u) => num(qty[u.id]) > 0).map((u) => ({ production_unit: u.id, quantity_kg: num(qty[u.id]) })),
    })),
  }
}

// ─── Health ──────────────────────────────────────────────────────────────────────────────────────
// `picked` is { [unitId]: true }; `deaths` is { [unitId]: 'count typed' } (only Fish Mortality asks for it).
export const pickedUnits = (cycles, picked) => cycles.flatMap((c) => c.units.filter((u) => picked[u.id]).map((u) => ({ ...u, cycle: c })))

// What is wrong with the health form ('' when nothing). One observation and treatment is used for every pond ticked.
export function healthProblem(form, cycles, picked, deaths) {
  if (!form.date) return 'Enter the date of the observation.'
  if (!form.observation) return 'Choose the observation.'
  if (form.observation === 'Other' && !form.observationOther.trim()) return 'Describe the observation.'
  const units = pickedUnits(cycles, picked)
  if (!units.length) return 'Tick at least one pond or cage.'
  if (!isForceObservation(form.observation) && !form.treatment) return 'Choose the treatment.'
  if (form.observation === 'Fish Mortality') {
    const missing = units.find((u) => !(parseInt(deaths[u.id], 10) > 0))
    if (missing) return `${missing.cycle.cycle_name}, ${unitName(missing)}: enter how many fish died.`
  }
  return ''
}

// The request: one entry for each pond or cage ticked (the date and notes are shared). A disease or Fish Mortality has no treatment (force harvest applies).
export function buildHealthPayload(form, cycles, picked, deaths) {
  const observation = form.observation === 'Other' ? form.observationOther.trim() : form.observation
  const force = isForceObservation(form.observation)
  return {
    log_date: form.date,
    notes: form.notes,
    unit_logs: pickedUnits(cycles, picked).map((u) => ({
      cycle: u.cycle.id,
      production_unit: u.id,
      observation,
      mortality_count: form.observation === 'Fish Mortality' ? (parseInt(deaths[u.id], 10) || 0) : 0,
      treatment_applied: force ? '' : form.treatment,
    })),
  }
}

// ─── Ticking, buttons and the server's answer ───────────────────────────────────────────────────
export const cycleTickState = (picked, cycle) => {
  const on = cycle.units.filter((u) => picked[u.id]).length
  return on === 0 ? 'none' : on === cycle.units.length ? 'all' : 'some'
}

// The box of a cycle: every pond and cage of it ticked, or (when all already were) none of them; other cycles are left alone.
export function toggleCycleUnits(picked, cycle) {
  const next = { ...picked }
  if (cycleTickState(picked, cycle) === 'all') cycle.units.forEach((u) => { delete next[u.id] })
  else cycle.units.forEach((u) => { next[u.id] = true })
  return next
}

export function saveLabel(kind, count) {
  if (count === 0) return kind === 'feeding' ? 'Log Feeding' : 'Log Health'
  return kind === 'feeding' ? `Log Feeding on ${plural(count, 'Cycle', 'Cycles')}` : `Log Health on ${plural(count, 'Pond/Cage', 'Ponds/Cages')}`
}

export const doneMessage = (kind, count) => (kind === 'feeding' ? `Feeding logged on ${plural(count, 'cycle', 'cycles')}.` : `Health log saved for ${plural(count, 'pond/cage', 'ponds/cages')}.`)

// The server's refusal: the sentence to show and the cycles / ponds it named (so they can be marked on the list).
export function serverProblem(data) {
  const fallback = 'It could not be saved. Please try again.'
  if (!data || typeof data !== 'object') return { message: fallback, cycleIds: [], unitIds: [] }
  const errors = Array.isArray(data.errors) ? data.errors : []
  const cycleIds = errors.map((e) => e.cycle).filter((id) => id != null)
  const unitIds = errors.map((e) => e.production_unit).filter((id) => id != null)
  if (data.detail) return { message: String(data.detail), cycleIds, unitIds }
  const first = Object.values(data).flat().find((m) => typeof m === 'string')
  return { message: first || fallback, cycleIds, unitIds }
}
