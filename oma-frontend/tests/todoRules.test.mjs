import assert from 'node:assert/strict'

// Home's to-do list: what a farmer, a fisherfolk or an organization can act on today, worked out from their own records.
const { farmerTodos, fisherfolkTodos, orgTodos, capTodos } = await import(new URL('../src/pages/Account/todoRules.js', import.meta.url).href)
let n = 0
const eq = (a, e, label) => { assert.deepEqual(a, e, `${label}: got ${JSON.stringify(a)}, wanted ${JSON.stringify(e)}`); n++ }
// An item's buttons: their labels, and what each does (the window it opens in place, or the page it links to).
const brief = (t) => [t.tone, t.title, t.actions.map((a) => a.label).join(' / '), t.actions.map((a) => a.act?.kind || a.to).join(' / ')]

const assistance = [
  { id: 7, status: 'AWAITING_CONFIRMATION', assistance_type: 'Fertilizer', quantity: '5 bags', date_given: '2026-11-14' },
  { id: 8, status: 'CONFIRMED', assistance_type: 'Seeds', quantity: '', date_given: '2026-10-01' },
  { id: 9, status: 'AWAITING_CONFIRMATION', assistance_type: 'Training', quantity: '', date_given: '2026-11-10' },
]
const crops = [{ id: 1, status: 'Planted', crop_type_name: 'Ginger' }, { id: 2, status: 'Near Harvest', crop_type_name: 'Rice' }, { id: 3, status: 'Harvested', crop_type_name: 'Corn' }]
const suggestions = { 1: [{ activity_name: 'Weeding', status: 'overdue', day_after_planting: 30 }, { activity_name: 'Fertilizing', status: 'due_now', day_after_planting: 45 }, { activity_name: 'Spraying', status: 'upcoming', day_after_planting: 60 }], 3: [{ activity_name: 'Old', status: 'overdue', day_after_planting: 5 }] }
const loans = [{ id: 4, status: 'BORROWED', overdue: true, equipment_name: 'Hand Tractor', due_date: '2026-11-01' }, { id: 5, status: 'BORROWED', overdue: false, equipment_name: 'Sprayer' }, { id: 6, status: 'RETURNED', overdue: true, equipment_name: 'Plow' }]

eq(farmerTodos({ assistance, crops, suggestions, loans }).map(brief), [
  ['red', 'Ginger: Weeding', 'Log activity', 'activity'],
  ['red', 'Hand Tractor is due back', 'View loan', '/my-equipment'],
  ['amber', 'Fertilizer, 5 bags', 'Received / Not received', 'received / not-received'],
  ['amber', 'Training', 'Received / Not received', 'received / not-received'],
  ['amber', 'Ginger: Fertilizing', 'Log activity', 'activity'],
  ['amber', 'Rice is ready to harvest', 'Record harvest', 'harvest'],
], 'a farmer: problems first, then what waits; harvested crops and returned loans never appear')
{
  const todos = farmerTodos({ assistance, crops, suggestions, loans })
  eq(todos[0].actions[0].act.record.id, 1, 'Log activity carries the crop')
  eq(todos[2].actions.map((a) => a.act.record.id), [7, 7], 'Received and Not received carry the assistance record')
  eq(todos[5].actions[0].act.record.id, 2, 'Record harvest carries the crop')
  eq(todos.map((t) => t.actions.filter((a) => a.primary).length), [1, 1, 1, 1, 1, 1], 'one main button on every item')
}
eq(farmerTodos({ assistance, crops, suggestions, loans })[0].detail, 'Past its suggested date', 'the overdue line')
eq(farmerTodos({ assistance, crops, suggestions, loans })[1].detail, 'Was due Nov 1, 2026', 'when the loan was due')
eq(farmerTodos({ assistance, crops, suggestions, loans })[2].detail, 'Given Nov 14, 2026', 'when it was given')
eq(farmerTodos({ assistance, crops, suggestions, loans })[4].detail, 'Due today', 'the due line')
eq(farmerTodos({ assistance: null, crops: null, suggestions: null, loans: null }), [], 'failed sources add nothing')
eq(farmerTodos({}), [], 'nothing loaded, nothing to do')
eq(farmerTodos({ crops, suggestions: {} }).map((t) => t.title), ['Rice is ready to harvest'], 'no suggestions still shows the harvest')
eq(farmerTodos({ loans: [{ id: 1, status: 'BORROWED', overdue: true, equipment_name: 'Pump' }] })[0].detail, 'Past its return date', 'an overdue loan with no date')

const cycles = [{ id: 11, production_cycle: 3, status: 'Stocked', species_name: 'Tilapia' }, { id: 12, production_cycle: 4, status: 'Near Harvest', species_name: 'Bangus' }, { id: 13, production_cycle: 5, status: 'Stocked', species_name: 'Shrimp', force_harvest: true }, { id: 14, production_cycle: 6, status: 'Stocked', species_name: 'Carp', is_near_harvest: true }]
eq(fisherfolkTodos({ assistance, cycles, loans }).map(brief), [
  ['red', 'Hand Tractor is due back', 'View loan', '/my-equipment'],
  ['amber', 'Fertilizer, 5 bags', 'Received / Not received', 'received / not-received'],
  ['amber', 'Training', 'Received / Not received', 'received / not-received'],
  ['amber', 'Bangus is ready to harvest', 'Record harvest', 'harvest'],
  ['amber', 'Shrimp is ready to harvest', 'Record harvest', 'harvest'],
  ['amber', 'Carp is ready to harvest', 'Record harvest', 'harvest'],
], 'a fisherfolk answers and harvests on Home too')
{
  const todos = fisherfolkTodos({ assistance, cycles, loans })
  eq(todos.flatMap((t) => t.actions.filter((a) => a.act).map((a) => a.act.domain)), ['fisheries', 'fisheries', 'fisheries', 'fisheries', 'fisheries', 'fisheries', 'fisheries'], 'every window a fisherfolk opens is the fisheries one')
  eq(todos[1].actions.map((a) => a.act.record.id), [7, 7], 'Received and Not received carry the assistance record')
  eq(todos[3].actions[0].act.record.id, 12, 'Record harvest carries the cycle')
  eq(farmerTodos({ assistance, crops, suggestions, loans }).flatMap((t) => t.actions.filter((a) => a.act).map((a) => a.act.domain)).every((d) => d === 'crop'), true, "a farmer's windows are the crop ones")
}
eq(fisherfolkTodos({ cycles: null }), [], 'failed cycles add nothing')

const confirmables = [{ latest_request_status: null }, { latest_request_status: 'PENDING' }, { latest_request_status: 'REJECTED' }]
const orgLoans = [{ status: 'REQUESTED' }, { status: 'REQUESTED' }, { status: 'BORROWED', overdue: true }, { status: 'RETURNED', overdue: true }]
eq(orgTodos({ confirmables, loans: orgLoans }, { assistancePath: '/crop-assistance' }).map(brief), [
  ['red', '1 loan is overdue', 'View loans', '/my-organization?tab=borrowed'],
  ['amber', '2 members are waiting for a confirmation', 'Confirm for members', '/crop-assistance?tab=confirm'],
  ['amber', '2 borrow requests to review', 'Review requests', '/my-organization?tab=borrowed'],
], 'an organization: one line per kind, with a count')
eq(orgTodos({ confirmables: [{ latest_request_status: null }], loans: [{ status: 'REQUESTED' }] }, { assistancePath: '/fisheries-assistance' }).map((t) => t.title), ['1 member is waiting for a confirmation', '1 borrow request to review'], 'singular wording')
eq(orgTodos({ confirmables: null, loans: null }, { assistancePath: '/crop-assistance' }), [], 'failed sources add nothing')
eq(orgTodos({ confirmables: [], loans: [] }, { assistancePath: '/crop-assistance' }), [], 'nothing waiting')

const many = Array.from({ length: 30 }, (_, i) => ({ key: `k${i}` }))
eq([capTodos(many).shown.length, capTodos(many).more], [6, 24], 'six shown, the rest counted')
eq([capTodos(many.slice(0, 6)).shown.length, capTodos(many.slice(0, 6)).more], [6, 0], 'exactly six: nothing hidden')
eq(capTodos([]), { shown: [], more: 0 }, 'none')
const keys = farmerTodos({ assistance, crops, suggestions, loans }).map((t) => t.key)
eq(new Set(keys).size, keys.length, 'every item has its own key')
console.log(`ok - ${n} assertions`)
