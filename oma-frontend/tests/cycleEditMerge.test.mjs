// Edit Production Cycle is the ONE place a cycle is edited: besides the Start Production Cycle fields it now holds what the Cycle window's own
// Edit form used to (cycle status, actual harvest date / volume, area or cage harvested, notes, and each pond / cage's PCIC insurance). The Cycle
// window is read-only.
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const mod = await import(here('src/pages/FisheriesRecords/cycleEditForm.js').href)
const { cycleEditFormFrom, cycleEditPayload, cycleEditProblem, cycleOutcomePayload, CYCLE_STATUSES, unitPcicStates, unitPcicChanged } = mod

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

const record = {
  id: 5, species: 3, date_stocked: '2026-08-01', pond_location_barangay: 'Poblacion', water_source: 'River', fingerling_source: 'BFAR',
  number_of_fingerlings: 50, survival_rate_pct: '80.00', avg_body_weight_kg: '0.250', logs: [], disaster_reports: [], harvests: [], production_cycle: 11,
}
const cycle = {
  id: 11, organization: 2, cycle_name: 'Grow-out Phase', target_harvest_date: '2026-11-29', ownership: 'Owner', status: 'Active', actual_harvest_date: null,
  harvest_volume_kg: null, area_cage_harvested: '', notes: '', units: [{ id: 1, unit_number: 1, has_pcic_insurance: false }, { id: 2, unit_number: 2, has_pcic_insurance: true, pcic_form_photos: [{ id: 7, url: 'x' }] }],
  feeding_logs: [], health_logs: [],
}
const ctx = { record, cycle, barangays: ['Poblacion'], today: '2026-11-12' }

// ── the form carries the cycle's own status and harvest fields
eq(CYCLE_STATUSES, ['Active', 'Harvested', 'Failed', 'Abandoned'], 'the four cycle statuses')
const form = cycleEditFormFrom(ctx)
eq([form.cycle_status, form.actual_harvest_date, form.harvest_volume_kg, form.area_cage_harvested, form.cycle_notes], ['Active', '', '', '', ''], 'filled in from the saved cycle')
eq(cycleEditFormFrom({ ...ctx, cycle: { ...cycle, status: 'Harvested', actual_harvest_date: '2026-11-02', harvest_volume_kg: '120.50', area_cage_harvested: 'Pond 1', notes: 'ok' } })
  .cycle_status, 'Harvested', 'a saved status shows')

// ── what goes to the stocking record is unchanged: these fields never travel with it
eq(cycleEditPayload({ ...form, cycle_status: 'Failed', cycle_notes: 'x' }, ctx), {}, 'outcome fields are not part of the stocking save')

// ── the cycle's own save: only what changed
eq(cycleOutcomePayload(form, ctx), {}, 'nothing changed, nothing sent')
eq(cycleOutcomePayload({ ...form, cycle_status: 'Failed' }, ctx), { status: 'Failed' }, 'status')
eq(cycleOutcomePayload({ ...form, actual_harvest_date: '2026-11-02', harvest_volume_kg: '120.5', area_cage_harvested: 'Pond 1 & 2', cycle_notes: 'Sold fresh' }, ctx),
  { actual_harvest_date: '2026-11-02', harvest_volume_kg: 120.5, area_cage_harvested: 'Pond 1 & 2', notes: 'Sold fresh' }, 'harvest fields and notes')
const harvested = { ...ctx, cycle: { ...cycle, actual_harvest_date: '2026-11-02', harvest_volume_kg: '120.50' } }
eq(cycleOutcomePayload({ ...cycleEditFormFrom(harvested), actual_harvest_date: '', harvest_volume_kg: '' }, harvested), { actual_harvest_date: null, harvest_volume_kg: null }, 'cleared values are sent as null')
eq(cycleOutcomePayload(form, { record, cycle: null }), {}, 'a record without a cycle has no cycle save')

// ── rules
eq(cycleEditProblem({ ...form, harvest_volume_kg: '-3' }, ctx), 'Harvest volume cannot be negative.', 'negative volume')
eq(cycleEditProblem({ ...form, actual_harvest_date: '2026-08-01' }, ctx) === '', true, 'a harvest on the stocking date is fine')
eq(cycleEditProblem({ ...form, actual_harvest_date: '2026-07-31' }, ctx), 'Actual harvest date cannot be earlier than the stocking date.', 'harvest before stocking')
eq(cycleEditProblem({ ...form, actual_harvest_date: '2026-11-13' }, ctx), 'Actual harvest date cannot be in the future.', 'harvest in the future')

// ── each pond / cage's PCIC insurance
const states = unitPcicStates(cycle)
eq([states[1].insured, states[2].insured, states[2].photos.length], [false, true, 1], 'each unit starts from its saved insurance')
eq(unitPcicChanged(cycle, states), false, 'untouched: no change')
eq(unitPcicChanged(cycle, { ...states, 1: { ...states[1], insured: true } }), true, 'ticking a box is a change')
eq(unitPcicChanged(cycle, { ...states, 2: { ...states[2], removed: [7] } }), true, 'removing a photo is a change')
eq(unitPcicChanged(cycle, { ...states, 2: { ...states[2], files: [{}] } }), true, 'adding a photo is a change')

// ── screens
const edit = read('src/pages/FisheriesRecords/EditStockingModal.jsx')
ok(edit.includes('title="Cycle Status and Harvest"'), 'Edit Production Cycle: has the Cycle Status and Harvest section')
ok(edit.includes('PcicInsuranceField') && edit.includes('uploadPcicForm') && edit.includes('aquaculture-units'), 'Edit Production Cycle: edits each pond / cage PCIC')
ok(edit.includes('/monitoring/aquaculture-cycles/'), 'Edit Production Cycle: saves the cycle fields on the cycle')
const view = read('src/pages/Monitoring/AquacultureCycleDetailModal.jsx')
ok(!view.includes('editMode') && !view.includes('PcicInsuranceField') && !/api\.patch/.test(view), 'Cycle window: read-only, no second edit form')
ok(!/>Edit<\/Button>/.test(view), 'Cycle window: no Edit button')

console.log(`cycleEditMerge: ${n} checks passed`)
