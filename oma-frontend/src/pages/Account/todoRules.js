// Home's to-do list: the things a farmer, a fisherfolk or an organization can act on today, worked out from their own records.
// Each item is { key, tone: 'red' | 'amber', title, detail, actions }. An action is a button: { label, primary?, to } links to the
// page that does the work; { label, primary?, act: { kind, record } } opens the window for it on Home itself (a farmer's Log activity
// and Record harvest; a fisherfolk's Record harvest: kind is 'activity' | 'harvest', and domain is 'crop' or 'fisheries').
// Assistance to claim comes first: it has a fixed day and place, and Home shows only the first few lines. Then problems (red), then what
// is waiting (amber); inside a tone: activities, harvest, loans.
// A source that failed to load is null (see loadState.js) and adds nothing: Home says separately that it could not be loaded.
// No screen and no network here, so the rules can be tested on their own.
import { formatDate } from '../../utils/dateFormat.js'
import { formatAssistanceQuantity } from '../AssistanceManagement/assistanceFieldHelpers.js'
import { scheduleText } from '../AssistanceManagement/assistanceStatus.js'

const list = (value) => (Array.isArray(value) ? value : [])
const redFirst = (todos) => [...todos.filter((t) => t.tone === 'red'), ...todos.filter((t) => t.tone === 'amber')]

const link = (label, to) => [{ label, primary: true, to }]
// `domain` says which kind of window opens: the crop ones for a farmer, the fisheries ones for a fisherfolk.
const window = (label, kind, record, domain = 'crop') => ({ label, act: { kind, record, domain } })
// Assistance still to be claimed: what it is, and when and where. Nothing to answer; the button opens their Assistance page.
const assistanceTodos = (assistance, path) => list(assistance)
  .filter((r) => r.status === 'PENDING')
  .sort((a, b) => `${a.date_given} ${a.distribution_time || ''}`.localeCompare(`${b.date_given} ${b.distribution_time || ''}`))
  .map((r) => ({
    key: `assistance-${r.id}`,
    tone: 'amber',
    title: `Claim your assistance: ${[r.assistance_type || 'Assistance', formatAssistanceQuantity(r.assistance_type, r.quantity)].filter(Boolean).join(', ')}`,
    detail: scheduleText(r),
    actions: link('View assistance', path),
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
  return [...assistanceTodos(assistance, '/crop-assistance'), ...redFirst([...activities, ...harvest, ...loanTodos(loans)])]
}

export function fisherfolkTodos({ assistance, cycles, loans } = {}) {
  const harvest = list(cycles)
    .filter((cycle) => cycle.status === 'Near Harvest' || cycle.is_near_harvest || cycle.force_harvest)
    .map((cycle) => ({
      key: `harvest-${cycle.id}`,
      tone: 'amber',
      title: `${cycle.species_name || 'Cycle'} is ready to harvest`,
      detail: cycle.force_harvest ? 'A pond or cage is waiting for a force harvest.' : 'You can record the harvest now.',
      actions: [{ ...window('Record harvest', 'harvest', cycle, 'fisheries'), primary: true }],
    }))
  return [...assistanceTodos(assistance, '/fisheries-assistance'), ...redFirst([...harvest, ...loanTodos(loans)])]
}

const count = (n, one, many) => `${n} ${n === 1 ? one : many}`

// An organization gets one line per kind of work, with a count.
export function orgTodos({ loans } = {}) {
  const todos = []
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
