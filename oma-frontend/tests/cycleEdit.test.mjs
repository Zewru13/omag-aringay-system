// Edit Production Cycle is the Start Production Cycle form filled in (one window, one save for the record and its cycle).
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const here = (p) => new URL(`../${p}`, import.meta.url)
const read = (p) => readFileSync(here(p), 'utf8').replace(/\r\n/g, '\n')
const { CULTURE_PHASES, firstActivityDate, cycleLocks, cycleEditFormFrom, cycleEditProblem, cycleEditPayload } = await import(here('src/pages/FisheriesRecords/cycleEditForm.js').href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }
const ok = (value, label) => { assert.ok(value, label); n++ }

const BARANGAYS = ['Alaska', 'Poblacion']
const record = {
  id: 5, fisherfolk: 9, fisherfolk_name: 'Ann Test', species: 3, species_name: 'Tilapia', date_stocked: '2026-08-01', pond: null, season: 'Wet',
  pond_location_barangay: 'Poblacion', water_source: 'River', water_source_other_specify: '', fingerling_source: 'BFAR', fingerling_source_other_specify: '',
  culture_phase: 'Grow-out Phase', culture_phase_other_specify: '', number_of_fingerlings: 50, survival_rate_pct: '80.00', avg_body_weight_kg: '0.250',
  seed_cost_php: null, avg_fingerling_size: '', land_status: '', land_status_other_specify: '', production_cycle: 11, area_hectares: '0.0016',
  logs: [], disaster_reports: [], harvests: [],
}
const cycle = {
  id: 11, organization: 2, cycle_name: 'Grow-out Phase', culture_system: 'Fishpond', target_harvest_date: '2026-11-29', ownership: 'Tenant', owner_name: 'Lola',
  owner_registration_number: '0123', units: [{ id: 1, unit_number: 1 }, { id: 2, unit_number: 2 }], feeding_logs: [], health_logs: [],
}
const ctx = { record, cycle, barangays: BARANGAYS, today: '2026-11-12' }

ok(CULTURE_PHASES.includes('Grow-out Phase') && CULTURE_PHASES.includes('Other'), 'the culture phases of Start Production Cycle')

// --- what has been recorded, and what that locks
eq(firstActivityDate({ record, cycle }), '', 'nothing recorded yet')
const busy = { record: { ...record, logs: [{ date_of_activity: '2026-09-10' }], disaster_reports: [{ date_of_occurrence: '2026-09-02' }], harvests: [{ harvest_date: '2026-10-30' }] },
  cycle: { ...cycle, health_logs: [{ log_date: '2026-08-20' }], feeding_logs: [{ feeding_date: '2026-08-25' }] } }
eq(firstActivityDate(busy), '2026-08-20', 'the earliest of logs, health logs, feeding logs, disasters and harvests')
eq(cycleLocks({ record, cycle }), { species: false, ponds: true, first: '' }, 'with no activity the species can change; ponds and cages never do here')
eq(cycleLocks(busy), { species: true, ponds: true, first: '2026-08-20' }, 'with activity the species is locked')
eq(cycleLocks({ record, cycle: { ...cycle, units: [] } }).ponds, false, 'a cycle without ponds or cages has a count to type')

// --- the form is the start form, filled in
const form = cycleEditFormFrom(ctx)
eq([form.organization, form.cycle_name, form.cycle_name_other], ['2', 'Grow-out Phase', ''], 'organization and phase')
eq([form.species, form.stocking_date, form.target_harvest_date], ['3', '2026-08-01', '2026-11-29'], 'species and dates')
eq([form.pond_location, form.pond_location_other, form.water_source, form.water_source_other], ['Poblacion', '', 'River', ''], 'location and water')
eq([form.ownership, form.ownerName, form.ownerNo], ['Tenant', 'Lola', '0123'], 'ownership')
eq([form.survival_rate_pct, form.avg_body_weight_kg, form.seed_cost_php], ['80.00', '0.250', ''], 'the numbers the old edit form had')
eq(cycleEditFormFrom({ ...ctx, cycle: { ...cycle, cycle_name: 'Pre-harvest check' } }).cycle_name, 'Other', 'a phase outside the list opens as Other')
eq(cycleEditFormFrom({ ...ctx, cycle: { ...cycle, cycle_name: 'Pre-harvest check' } }).cycle_name_other, 'Pre-harvest check', 'with its text')
eq(cycleEditFormFrom({ ...ctx, record: { ...record, pond_location_barangay: 'Sitio Mabuhay' } }).pond_location, 'Other', 'a location outside the barangays opens as Other')
eq(cycleEditFormFrom({ ...ctx, record: { ...record, pond_location_barangay: 'Sitio Mabuhay' } }).pond_location_other, 'Sitio Mabuhay', 'with its text')
eq(cycleEditFormFrom({ ...ctx, cycle: { ...cycle, organization: null, ownership: '' } }).organization, '', 'no organization, no ownership (an older cycle)')

// --- what is refused
const ok0 = cycleEditProblem(form, ctx)
eq(ok0, '', 'the form as loaded can be saved')
eq(cycleEditProblem({ ...form, stocking_date: '' }, ctx), 'Stocking date is required.', 'no stocking date')
eq(cycleEditProblem({ ...form, stocking_date: '2026-11-13' }, ctx), 'Stocking date cannot be in the future.', 'a future stocking date')
eq(cycleEditProblem({ ...form, stocking_date: '2026-09-01' }, { ...ctx, ...busy }), 'Stocking date cannot be after Aug 20, 2026, the first activity recorded for this cycle.', 'after the first activity')
eq(cycleEditProblem({ ...form, stocking_date: '2026-08-20' }, { ...ctx, ...busy }), '', 'on the day of the first activity is fine')
eq(cycleEditProblem({ ...form, target_harvest_date: '' }, ctx), 'Target harvest date is required.', 'no target date')
eq(cycleEditProblem({ ...form, target_harvest_date: '2026-07-31' }, ctx), 'Target harvest date cannot be earlier than the stocking date.', 'target before stocking')
eq(cycleEditProblem({ ...form, cycle_name: '' }, ctx), 'Choose the culture phase.', 'no phase')
eq(cycleEditProblem({ ...form, cycle_name: 'Other', cycle_name_other: ' ' }, ctx), 'Specify the culture phase.', 'Other phase without text')
eq(cycleEditProblem({ ...form, pond_location: 'Other', pond_location_other: '' }, ctx), 'Specify the pond location.', 'Other location without text')
eq(cycleEditProblem({ ...form, water_source: 'Other', water_source_other: '' }, ctx), 'Specify the water source.', 'Other water without text')
eq(cycleEditProblem({ ...form, ownerName: ' ' }, ctx), "Enter the owner's name.", 'a Tenant needs the owner name')
eq(cycleEditProblem({ ...form, ownership: 'Owner' }, ctx), '', 'an Owner needs nothing more')
eq(cycleEditProblem({ ...form, ownership: '' }, { ...ctx, cycle: { ...cycle, ownership: '' } }), '', 'an older cycle with no ownership may stay without')
eq(cycleEditProblem({ ...form, ownership: '' }, ctx), 'Choose the ownership.', 'a cycle that has one cannot lose it')
eq(cycleEditProblem({ ...form, survival_rate_pct: '120' }, ctx), 'Survival rate must be between 0 and 100.', 'survival over 100')
eq(cycleEditProblem({ ...form, seed_cost_php: '-1' }, ctx), 'Seed cost cannot be negative.', 'negative cost')
const noPonds = { ...ctx, cycle: { ...cycle, units: [] } }
eq(cycleEditProblem({ ...cycleEditFormFrom(noPonds), number_of_fingerlings: '' }, noPonds), 'Number of fingerlings is required.', 'a cycle without ponds needs its count')
eq(cycleEditProblem({ ...form, number_of_fingerlings: '' }, ctx), '', 'with ponds the count is not typed, so not checked')

// --- what is sent: only what changed
eq(cycleEditPayload(form, ctx), {}, 'nothing changed, nothing sent')
eq(cycleEditPayload({ ...form, water_source: 'Spring' }, ctx), { water_source: 'Spring', water_source_other_specify: '' }, 'one record field')
eq(cycleEditPayload({ ...form, cycle_name: 'Nursery Phase' }, ctx), { cycle_name: 'Nursery Phase' }, 'the phase goes as the cycle name (the server keeps the record in step)')
eq(cycleEditPayload({ ...form, cycle_name: 'Other', cycle_name_other: ' Pre-harvest ' }, ctx), { cycle_name: 'Pre-harvest' }, 'a typed phase')
eq(cycleEditPayload({ ...form, organization: '' }, ctx), { cycle_organization: null }, 'organization cleared')
eq(cycleEditPayload({ ...form, organization: '4' }, ctx), { cycle_organization: 4 }, 'organization changed')
eq(cycleEditPayload({ ...form, stocking_date: '2026-07-30' }, ctx), { date_stocked: '2026-07-30' }, 'the stocking date once (the server moves the cycle too)')
eq(cycleEditPayload({ ...form, target_harvest_date: '2026-12-15' }, ctx), { cycle_target_harvest_date: '2026-12-15' }, 'the target date goes to the cycle')
eq(cycleEditPayload({ ...form, ownership: 'Owner' }, ctx), { cycle_ownership: 'Owner', cycle_owner_name: '', cycle_owner_registration_number: '' }, 'Owner clears the owner details')
eq(cycleEditPayload({ ...form, ownerName: 'Lolo' }, ctx), { cycle_ownership: 'Tenant', cycle_owner_name: 'Lolo', cycle_owner_registration_number: '0123' }, 'a Tenant sends all three')
eq(cycleEditPayload({ ...form, species: '4' }, ctx), { species: 4 }, 'a changed species')
eq(cycleEditPayload({ ...form, pond_location: 'Other', pond_location_other: ' Sitio X ' }, ctx), { pond_location_barangay: 'Sitio X' }, 'a typed location is what is stored')
eq(cycleEditPayload({ ...form, survival_rate_pct: '', seed_cost_php: '1500' }, ctx), { survival_rate_pct: null, seed_cost_php: 1500 }, 'numbers, empty as null')
eq(cycleEditPayload({ ...form, number_of_fingerlings: '999' }, ctx), {}, 'with ponds the count is never sent')
eq(cycleEditPayload({ ...cycleEditFormFrom(noPonds), number_of_fingerlings: '640' }, noPonds), { number_of_fingerlings: 640 }, 'without ponds the count is sent')
eq(cycleEditPayload({ ...form, species: '4' }, { ...ctx, ...busy }), {}, 'a locked species is never sent')

// --- one window, in the table layout, in its own file
const modal = read('src/pages/FisheriesRecords/EditStockingModal.jsx')
for (const title of ['Fisherfolk Information', 'Culture Details', 'Stocking Information', 'Ownership', 'Pond/Cage Details', 'Other Details']) ok(modal.includes(`title="${title}"`), `section ${title}`)
for (const label of ['Fisherfolk', 'Organization', 'Culture Phase', 'Species Farmed', 'Culture System', 'Water Source', 'Fingerling Source', 'Pond Location', 'Stocking Date', 'Season',
  'Target Harvest Date', 'Ownership', 'Survival Rate (%)', 'Avg Body Weight (kg)', 'Seed / Fingerling Cost', 'Land Status']) ok(modal.includes(`label="${label}"`), `field ${label}`)
ok(modal.includes("from '../../components/UI/FormTable.jsx'") && modal.includes("from '../../components/UI/EntryTable.jsx'"), 'the shared table form and the shared pond table')
ok(modal.includes('/monitoring/aquaculture-cycles/') && modal.includes('/fisheries/stocking/'), 'it loads the cycle and the record')
ok(!/PondSelector|Production Cycle \(optional\)/.test(modal), 'no second way to pick a pond or another cycle')
const page = read('src/pages/FisheriesRecords/FisheriesRecordsPage.jsx')
ok(!/function EditStockingModal/.test(page) && page.includes("from './EditStockingModal.jsx'"), 'the page uses the one window')

console.log(`cycleEdit: ${n} checks passed`)
