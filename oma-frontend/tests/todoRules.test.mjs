import assert from 'node:assert/strict'

// Home's to-do list: what a farmer, a fisherfolk or an organization can act on today, worked out from their own records.
const { farmerTodos, fisherfolkTodos, orgTodos, capTodos } = await import(new URL('../src/pages/Account/todoRules.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
// An item's buttons: their labels, and what each does (the window it opens in place, or the page it links to).
const brief = (t) => [t.tone, t.title, t.actions.map((a) => a.label).join(' / '), t.actions.map((a) => a.act?.kind || a.to).join(' / ')]

const assistance = [
  { id: 7, status: 'PENDING', assistance_type: 'Fertilizer', quantity: '5 bags', date_given: '2026-11-14', distribution_time: '09:00', distribution_place: 'Barangay Hall' },
  { id: 8, status: 'CONFIRMED', assistance_type: 'Seeds', quantity: '', date_given: '2026-10-01' },
  { id: 9, status: 'PENDING', assistance_type: 'Training', quantity: '', date_given: '2026-11-10' },
]
const crops = [{ id: 1, status: 'Planted', crop_type_name: 'Ginger' }, { id: 2, status: 'Near Harvest', crop_type_name: 'Rice' }, { id: 3, status: 'Harvested', crop_type_name: 'Corn' }]
const suggestions = { 1: [{ activity_name: 'Weeding', status: 'overdue', day_after_planting: 30 }, { activity_name: 'Fertilizing', status: 'due_now', day_after_planting: 45 }, { activity_name: 'Spraying', status: 'upcoming', day_after_planting: 60 }], 3: [{ activity_name: 'Old', status: 'overdue', day_after_planting: 5 }] }
const loans = [{ id: 4, status: 'BORROWED', overdue: true, equipment_name: 'Hand Tractor', due_date: '2026-11-01' }, { id: 5, status: 'BORROWED', overdue: false, equipment_name: 'Sprayer' }, { id: 6, status: 'RETURNED', overdue: true, equipment_name: 'Plow' }]

eq(farmerTodos({ assistance, crops, suggestions, loans }).map(brief), [
  ['amber', 'Claim your assistance: Training', 'View assistance', '/crop-assistance'],
  ['amber', 'Claim your assistance: Fertilizer, 5 bags', 'View assistance', '/crop-assistance'],
  ['red', 'Ginger: Weeding', 'Log activity', 'activity'],
  ['red', 'Hand Tractor is due back', 'View loan', '/my-equipment'],
  ['amber', 'Ginger: Fertilizing', 'Log activity', 'activity'],
  ['amber', 'Rice is ready to harvest', 'Record harvest', 'harvest'],
], 'a farmer: assistance to claim first, then problems, then what waits; harvested crops and returned loans never appear')
{
  const todos = farmerTodos({ assistance, crops, suggestions, loans })
  eq(todos[2].actions[0].act.record.id, 1, 'Log activity carries the crop')
  eq(todos[5].actions[0].act.record.id, 2, 'Record harvest carries the crop')
  eq(todos.map((t) => t.actions.filter((a) => a.primary).length), [1, 1, 1, 1, 1, 1], 'one main button on every item')
}
eq(farmerTodos({ assistance, crops, suggestions, loans })[2].detail, 'Past its suggested date', 'the overdue line')
eq(farmerTodos({ assistance, crops, suggestions, loans })[3].detail, 'Was due Nov 1, 2026', 'when the loan was due')
eq(farmerTodos({ assistance, crops, suggestions, loans })[0].detail, 'Nov 10, 2026', 'the soonest first; the day when there is no time or place')
eq(farmerTodos({ assistance, crops, suggestions, loans })[1].detail, 'Nov 14, 2026 · 9:00 AM · Barangay Hall', 'when and where to claim it')
eq(farmerTodos({ assistance, crops, suggestions, loans })[4].detail, 'Due today', 'the due line')
eq(farmerTodos({ assistance: null, crops: null, suggestions: null, loans: null }), [], 'failed sources add nothing')
eq(farmerTodos({}), [], 'nothing loaded, nothing to do')
eq(farmerTodos({ crops, suggestions: {} }).map((t) => t.title), ['Rice is ready to harvest'], 'no suggestions still shows the harvest')
eq(farmerTodos({ loans: [{ id: 1, status: 'BORROWED', overdue: true, equipment_name: 'Pump' }] })[0].detail, 'Past its return date', 'an overdue loan with no date')

const cycles = [{ id: 11, production_cycle: 3, status: 'Stocked', species_name: 'Tilapia' }, { id: 12, production_cycle: 4, status: 'Near Harvest', species_name: 'Bangus' }, { id: 13, production_cycle: 5, status: 'Stocked', species_name: 'Shrimp', force_harvest: true }, { id: 14, production_cycle: 6, status: 'Stocked', species_name: 'Carp', is_near_harvest: true }]
eq(fisherfolkTodos({ assistance, cycles, loans }).map(brief), [
  ['amber', 'Claim your assistance: Training', 'View assistance', '/fisheries-assistance'],
  ['amber', 'Claim your assistance: Fertilizer, 5 bags', 'View assistance', '/fisheries-assistance'],
  ['red', 'Hand Tractor is due back', 'View loan', '/my-equipment'],
  ['amber', 'Bangus is ready to harvest', 'Record harvest', 'harvest'],
  ['amber', 'Shrimp is ready to harvest', 'Record harvest', 'harvest'],
  ['amber', 'Carp is ready to harvest', 'Record harvest', 'harvest'],
], 'a fisherfolk sees what to claim, and harvests on Home too')
{
  const todos = fisherfolkTodos({ assistance, cycles, loans })
  eq(todos.flatMap((t) => t.actions.filter((a) => a.act).map((a) => a.act.domain)), ['fisheries', 'fisheries', 'fisheries'], 'every window a fisherfolk opens is the fisheries one')
  eq(todos[3].actions[0].act.record.id, 12, 'Record harvest carries the cycle')
  eq(farmerTodos({ assistance, crops, suggestions, loans }).flatMap((t) => t.actions.filter((a) => a.act).map((a) => a.act.domain)).every((d) => d === 'crop'), true, "a farmer's windows are the crop ones")
}
eq(fisherfolkTodos({ cycles: null }), [], 'failed cycles add nothing')

const orgLoans = [{ status: 'REQUESTED' }, { status: 'REQUESTED' }, { status: 'BORROWED', overdue: true }, { status: 'RETURNED', overdue: true }]
eq(orgTodos({ loans: orgLoans }).map(brief), [
  ['red', '1 loan is overdue', 'View loans', '/my-organization?tab=borrowed'],
  ['amber', '2 borrow requests to review', 'Review requests', '/my-organization?tab=borrowed'],
], 'an organization: one line per kind, with a count; nothing to confirm')
eq(orgTodos({ loans: [{ status: 'REQUESTED' }] }).map((t) => t.title), ['1 borrow request to review'], 'singular wording')
eq(orgTodos({ loans: null }), [], 'failed sources add nothing')
eq(orgTodos({ loans: [] }), [], 'nothing waiting')

const lotsOverdue = { assistance, crops: [{ id: 1, status: 'Planted', crop_type_name: 'Ginger' }], suggestions: { 1: Array.from({ length: 12 }, (_, i) => ({ activity_name: `Task ${i}`, status: 'overdue', day_after_planting: i })) } }
eq(capTodos(farmerTodos(lotsOverdue)).shown.slice(0, 2).map((t) => t.title), ['Claim your assistance: Training', 'Claim your assistance: Fertilizer, 5 bags'], 'a pile of overdue work never hides what there is to claim')

eq(farmerTodos({ assistance: [{ id: 1, status: 'PENDING', assistance_type: 'Cash Assistance', quantity: '500', date_given: '2026-11-28' }] })[0].title, 'Claim your assistance: Cash Assistance, ₱500.00', 'cash reads as pesos, as on the Assistance page')

const many = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}` }))
eq([capTodos(many).shown.length, capTodos(many).more], [6, 24], 'six shown, the rest counted')
eq([capTodos(many.slice(0, 6)).shown.length, capTodos(many.slice(0, 6)).more], [6, 0], 'exactly six: nothing hidden')
eq(capTodos([]), { shown: [], more: 0 }, 'none')
const keys = farmerTodos({ assistance, crops, suggestions, loans }).map((t) => t.key)
eq(new Set(keys).size, keys.length, 'every item has its own key')
console.log(`ok - ${n} assertions`)
