import assert from 'node:assert/strict'

const b = await import(new URL('../src/pages/Monitoring/bulkCycleLog.js', import.meta.url).href)

let n = 0
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, `${label}: got ${JSON.stringify(actual)}, wanted ${JSON.stringify(expected)}`); n++ }

const unit = (id, number, type = 'pond') => ({ id, unit_type: type, unit_number: number })
const cycle = (id, extra = {}) => ({ id, cycle_name: `Cycle ${id}`, species_farmed: 'Tilapia', culture_system: 'Fishpond', status: 'Active', units: [unit(id * 10 + 1, 1), unit(id * 10 + 2, 2, 'cage')], ...extra })

// only an Active cycle takes a log, and only one that has ponds or cages is listed
const all = [cycle(1), cycle(2, { status: 'Harvested' }), cycle(3, { status: 'Failed' }), cycle(4, { units: [] }), cycle(5)]
eq(b.activeCycles(all).map((c) => c.id), [1, 5], 'only active cycles with ponds or cages are offered')

// the search: every word, any order, on the cycle, species or culture system
const list = [cycle(1), cycle(2, { cycle_name: 'Blue lagoon', species_farmed: 'Bangus', culture_system: 'Fishcage' })]
eq(b.filterCycles(list, '').length, 2, 'an empty search keeps every cycle')
eq(b.filterCycles(list, 'bangus lagoon').map((c) => c.id), [2], 'words in any order')
eq(b.filterCycles(list, 'tilapia').map((c) => c.id), [1], 'the species')
eq(b.filterCycles(list, 'zzz'), [], 'nothing matches')
eq(b.unitName(unit(1, 3)), 'Pond 3', 'a pond')
eq(b.unitName(unit(1, 2, 'cage')), 'Cage 2', 'a cage')

// the quantities: a fill-all box sets the same kg on every pond of the ticked cycles, and a pond can still be changed
const ticked = { 1: true, 5: true }
const cycles = [cycle(1), cycle(5), cycle(7)]
eq(b.fillAll({}, cycles, ticked, '5'), { 11: '5', 12: '5', 51: '5', 52: '5' }, 'fill-all reaches the ponds of ticked cycles only')
eq(b.fillAll({ 11: '9', 99: '1' }, cycles, ticked, '5')[11], '5', 'fill-all replaces a typed value')
eq(b.fillAll({ 11: '9' }, cycles, ticked, ''), { 11: '9' }, 'an empty fill-all box changes nothing')
eq(b.feedTotal({ 11: '2.5', 12: '4', 71: '10' }, cycles, ticked), 6.5, 'the total counts only ticked cycles')
eq(b.feedTotal({ 11: 'x', 12: '-3' }, cycles, ticked), 0, 'junk and negatives count as nothing')

// what is wrong with the feeding form ('' when nothing)
const form = (extra = {}) => ({ date: '2026-11-20', feedType: 'Grower Feed', feedOther: '', feedCustom: '', notes: '', ...extra })
eq(b.feedingProblem(form(), cycles, ticked, { 11: '5', 51: '5' }), '', 'a complete form')
eq(b.feedingProblem(form({ date: '' }), cycles, ticked, { 11: '5', 51: '5' }), 'Enter the date of the feeding.', 'no date')
eq(b.feedingProblem(form({ feedType: '' }), cycles, ticked, { 11: '5', 51: '5' }), 'Choose the feed type.', 'no feed type')
eq(b.feedingProblem(form({ feedType: 'Others' }), cycles, ticked, { 11: '5', 51: '5' }), 'Choose the other feed type.', 'Others needs its kind')
eq(b.feedingProblem(form({ feedType: 'Others', feedOther: 'Custom Feed' }), cycles, ticked, { 11: '5', 51: '5' }), 'Type the name of the feed.', 'a custom feed needs its name')
eq(b.feedingProblem(form(), cycles, {}, {}), 'Tick at least one cycle.', 'no cycle')
eq(b.feedingProblem(form(), cycles, ticked, { 11: '5' }), 'Cycle 5: enter the feed quantity of at least one pond or cage.', 'a ticked cycle without any quantity')
eq(b.feedingProblem(form(), cycles, { 1: true }, { 11: '-2' }), 'Cycle 1: enter the feed quantity of at least one pond or cage.', 'a negative quantity is not a quantity')

// what is sent for the feeding
eq(b.buildFeedingPayload(form(), cycles, ticked, { 11: '2.5', 12: '', 51: '4', 71: '9' }), {
  feeding_date: '2026-11-20', feed_type: 'Grower Feed', notes: '',
  cycles: [{ cycle: 1, unit_quantities: [{ production_unit: 11, quantity_kg: 2.5 }] }, { cycle: 5, unit_quantities: [{ production_unit: 51, quantity_kg: 4 }] }],
}, 'only ticked cycles, only ponds with a quantity')
eq(b.buildFeedingPayload(form({ feedType: 'Others', feedOther: 'Rice Bran' }), cycles, { 1: true }, { 11: '1' }).feed_type, 'Rice Bran', 'the other feed')
eq(b.buildFeedingPayload(form({ feedType: 'Others', feedOther: 'Custom Feed', feedCustom: ' Fish meal ' }), cycles, { 1: true }, { 11: '1' }).feed_type, 'Fish meal', 'a custom feed')

// the health form: one observation and treatment for every pond ticked, and a mortality count for each pond when it is Fish Mortality
const hform = (extra = {}) => ({ date: '2026-11-20', observation: 'Poor Water Quality', observationOther: '', treatment: 'Water Exchange', notes: '', ...extra })
const picked = { 11: true, 52: true }
eq(b.healthProblem(hform(), cycles, picked, {}), '', 'a complete health form')
eq(b.healthProblem(hform({ date: '' }), cycles, picked, {}), 'Enter the date of the observation.', 'no date')
eq(b.healthProblem(hform({ observation: '' }), cycles, picked, {}), 'Choose the observation.', 'no observation')
eq(b.healthProblem(hform({ observation: 'Other' }), cycles, picked, {}), 'Describe the observation.', 'Other needs its description')
eq(b.healthProblem(hform(), cycles, {}, {}), 'Tick at least one pond or cage.', 'no pond')
eq(b.healthProblem(hform({ treatment: '' }), cycles, picked, {}), 'Choose the treatment.', 'a treatment is needed for an ordinary observation')
eq(b.healthProblem(hform({ observation: 'Fish Mortality', treatment: '' }), cycles, picked, { 11: '12' }), 'Cycle 5, Cage 2: enter how many fish died.', 'each pond needs its own count')
eq(b.healthProblem(hform({ observation: 'Fish Mortality', treatment: '' }), cycles, picked, { 11: '12', 52: '3' }), '', 'every pond has a count')
eq(b.healthProblem(hform({ observation: 'Bacterial Infection', treatment: '' }), cycles, picked, {}), '', 'a disease has no treatment box (force harvest applies)')

// what is sent for the health log
eq(b.buildHealthPayload(hform(), cycles, picked, {}), {
  log_date: '2026-11-20', notes: '',
  unit_logs: [
    { cycle: 1, production_unit: 11, observation: 'Poor Water Quality', mortality_count: 0, treatment_applied: 'Water Exchange' },
    { cycle: 5, production_unit: 52, observation: 'Poor Water Quality', mortality_count: 0, treatment_applied: 'Water Exchange' },
  ],
}, 'one entry for each pond ticked')
eq(b.buildHealthPayload(hform({ observation: 'Fish Mortality', treatment: 'x' }), cycles, picked, { 11: '12', 52: '3' }).unit_logs.map((e) => [e.mortality_count, e.treatment_applied]), [[12, ''], [3, '']], 'mortality counts per pond, no treatment')
eq(b.buildHealthPayload(hform({ observation: 'Other', observationOther: ' Odd color ' }), cycles, picked, {}).unit_logs[0].observation, 'Odd color', 'the typed observation')
eq(b.pickedUnits(cycles, picked).map((u) => u.id), [11, 52], 'the ponds picked, in list order')

// the cycle box ticks all its ponds; the pond boxes tick one
eq(b.toggleCycleUnits({}, cycle(1)), { 11: true, 12: true }, 'ticking a cycle ticks its ponds')
eq(b.toggleCycleUnits({ 11: true, 12: true, 51: true }, cycle(1)), { 51: true }, 'ticking it again clears them')
eq(b.toggleCycleUnits({ 11: true }, cycle(1)), { 11: true, 12: true }, 'a partly ticked cycle becomes fully ticked')
eq(b.cycleTickState({ 11: true }, cycle(1)), 'some', 'partly')
eq(b.cycleTickState({ 11: true, 12: true }, cycle(1)), 'all', 'all')
eq(b.cycleTickState({}, cycle(1)), 'none', 'none')

// buttons and the server's answer
eq(b.saveLabel('feeding', 0), 'Log Feeding', 'nothing ticked')
eq(b.saveLabel('feeding', 3), 'Log Feeding on 3 Cycles', 'feeding on 3 cycles')
eq(b.saveLabel('feeding', 1), 'Log Feeding on 1 Cycle', 'feeding on one cycle')
eq(b.saveLabel('health', 4), 'Log Health on 4 Ponds/Cages', 'health on 4 ponds')
eq(b.saveLabel('health', 1), 'Log Health on 1 Pond/Cage', 'health on 1 pond')
eq(b.serverProblem({ detail: 'Cycle 3: nope', errors: [{ cycle: 3, errors: {} }, { cycle: 4, production_unit: 41, errors: {} }] }), { message: 'Cycle 3: nope', cycleIds: [3, 4], unitIds: [41] }, 'what the server refused')
eq(b.serverProblem({ cycles: ['One of the cycles could not be found.'] }), { message: 'One of the cycles could not be found.', cycleIds: [], unitIds: [] }, 'a message about the list')
eq(b.serverProblem(undefined).cycleIds, [], 'no answer')
eq(b.doneMessage('feeding', 3), 'Feeding logged on 3 cycles.', 'feeding done')
eq(b.doneMessage('health', 1), 'Health log saved for 1 pond/cage.', 'health done')

console.log(`bulkCycleLog: ${n} checks passed`)
