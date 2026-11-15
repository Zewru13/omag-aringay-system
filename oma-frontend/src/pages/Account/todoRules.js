// Home's to-do list: the things a farmer, a fisherfolk or an organization can act on today, worked out from their own records.
// Each item is { key, tone: 'red' | 'amber', title, detail, actions }. An action is a button: { label, primary?, to } links to the
// page that does the work; { label, primary?, act: { kind, record } } opens the window for it on Home itself (a farmer's Received,
// Not received, Log activity and Record harvest: kind is 'received' | 'not-received' | 'activity' | 'harvest').
// Problems (red) come first, then what is waiting (amber); inside a tone: assistance, activities, harvest, loans.
// A source that failed to load is null (see loadState.js) and adds nothing: Home says separately that it could not be loaded.
// No screen and no network here, so the rules can be tested on their own.
import { formatDate } from '../../utils/dateFormat.js'

const list = (value) => (Array.isArray(value) ? value : [])
const redFirst = (todos) => [...todos.filter((t) => t.tone === 'red'), ...todos.filter((t) => t.tone === 'amber')]

const link = (label, to) => [{ label, primary: true, to }]
const window = (label, kind, record) => ({ label, act: { kind, record } })

// Assistance that has reached its date and waits for the person to say whether they received it. `actionsOf(record)` is its buttons.
const assistanceTodos = (assistance, actionsOf) => list(assistance)
  .filter((r) => r.status === 'AWAITING_CONFIRMATION')
  .map((r) => ({
    key: `assistance-${r.id}`,
    tone: 'amber',
    title: [r.assistance_type || 'Assistance', r.quantity].filter(Boolean).join(', '),
    detail: `Given ${formatDate(r.date_given)}`,
    actions: actionsOf(r),
  }))

// Equipment the person borrowed and still holds after its return-by date.
const loanTodos = (loans) => list(loans)
  .filter((loan) => loan.status === 'BORROWED' && loan.overdue)
  .map((loan) => ({
    key: `loan-${loan.id}`,
    tone: 'red',
    title: `${loan.equipment_name || 'Equipment'} is due back`,
    detail: loan.due_date ? `Was due ${formatDate(loan.due_date)}` : 'Past its return date',
    actions: link('View loan', '/my-equipment'),
  }))

const ACTIVE_CROP = ['Planted', 'Near Harvest']
const DUE = { overdue: { tone: 'red', detail: 'Past its suggested date' }, due_now: { tone: 'amber', detail: 'Due today' } }

// `suggestions` is { cropId: [{ activity_name, status, day_after_planting }] }, as the crop's suggestions endpoint answers.
export function farmerTodos({ assistance, crops, suggestions, loans } = {}) {
  const active = list(crops).filter((crop) => ACTIVE_CROP.includes(crop.status))
  const activities = active.flatMap((crop) => list(suggestions?.[crop.id])
    .filter((s) => DUE[s.status])
    .sort((a, b) => a.day_after_planting - b.day_after_planting)
    .map((s) => ({
      key: `activity-${crop.id}-${s.activity_name}-${s.day_after_planting}`,
      tone: DUE[s.status].tone,
      title: `${crop.crop_type_name || 'Crop'}: ${s.activity_name}`,
      detail: DUE[s.status].detail,
      actions: [{ ...window('Log activity', 'activity', crop), primary: true }],
    })))
  const harvest = active.filter((crop) => crop.status === 'Near Harvest').map((crop) => ({
    key: `harvest-${crop.id}`,
    tone: 'amber',
    title: `${crop.crop_type_name || 'Crop'} is ready to harvest`,
    detail: 'You can record the harvest now.',
    actions: [{ ...window('Record harvest', 'harvest', crop), primary: true }],
  }))
  // A farmer answers on Home itself: Received (the main button) or Not received.
  const answer = (record) => [{ ...window('Received', 'received', record), primary: true }, window('Not received', 'not-received', record)]
  return redFirst([...assistanceTodos(assistance, answer), ...activities, ...harvest, ...loanTodos(loans)])
}

export function fisherfolkTodos({ assistance, cycles, loans } = {}) {
  const harvest = list(cycles)
    .filter((cycle) => cycle.status === 'Near Harvest' || cycle.is_near_harvest || cycle.force_harvest)
    .map((cycle) => ({
      key: `harvest-${cycle.id}`,
      tone: 'amber',
      title: `${cycle.species_name || 'Cycle'} is ready to harvest`,
      detail: cycle.force_harvest ? 'A pond or cage is waiting for a force harvest.' : 'You can record the harvest now.',
      actions: link('Record harvest', `/fisheries-monitoring?cycle=${cycle.production_cycle}`),
    }))
  return redFirst([...assistanceTodos(assistance, () => link('Confirm', '/fisheries-assistance')), ...harvest, ...loanTodos(loans)])
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

// An organization gets one line per kind of work, with a count. `assistancePath` is its own Assistance page (crop or fisheries).
export function orgTodos({ confirmables, loans } = {}, { assistancePath }) {
  const todos = []
  // A member without a working account whose awaiting record still needs the organization (a request already sent waits on the office).
  const waiting = list(confirmables).filter((r) => r.latest_request_status !== 'PENDING').length
  if (waiting) {
    todos.push({
      key: 'confirm-for-members',
      tone: 'amber',
      title: `${count(waiting, 'member is', 'members are')} waiting for a confirmation`,
      detail: 'They have no working account, so you can confirm for them.',
      actions: link('Confirm for members', `${assistancePath}?tab=confirm`),
    })
  }
  const requests = list(loans).filter((loan) => loan.status === 'REQUESTED').length
  if (requests) {
    todos.push({
      key: 'borrow-requests',
      tone: 'amber',
      title: `${count(requests, 'borrow request', 'borrow requests')} to review`,
      detail: 'A member asked to borrow equipment.',
      actions: link('Review requests', '/my-organization?tab=borrowed'),
    })
  }
  const overdue = list(loans).filter((loan) => loan.status === 'BORROWED' && loan.overdue).length
  if (overdue) {
    todos.push({
      key: 'overdue-loans',
      tone: 'red',
      title: `${count(overdue, 'loan is', 'loans are')} overdue`,
      detail: 'Borrowed equipment is past its return date.',
      actions: link('View loans', '/my-organization?tab=borrowed'),
    })
  }
  return redFirst(todos)
}

// Home shows the first few; the rest are counted ("and 24 more").
export function capTodos(todos, limit = 6) {
  return { shown: todos.slice(0, limit), more: Math.max(0, todos.length - limit) }
}
