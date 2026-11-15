import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'

// One thing on Home's to-do list (see todoRules.js): what it is, one line of detail, a badge that says whether it is a problem or only
// waiting, and its buttons. A button either opens the window for the work on Home itself (`onAct` gets the action's `act`) or links to
// the page that does it.
const BADGE = { red: 'Overdue', amber: 'Waiting' }

const BUTTON = 'press-scale inline-flex min-h-[44px] flex-1 items-center justify-center rounded-[var(--radius-sm)] px-4 text-center transition-colors sm:flex-none'
const TONE = {
  primary: 'bg-primary text-white hover:bg-primary-hover',
  plain: 'border border-border-strong bg-surface text-text-primary hover:bg-surface-2',
}

function ActionButton({ action, onAct }) {
  const className = `${BUTTON} ${action.primary ? TONE.primary : TONE.plain}`
  const label = <span className="text-[14px] font-semibold leading-tight">{action.label}</span>
  return action.to
    ? <Link to={action.to} className={className}>{label}</Link>
    : <button type="button" onClick={() => onAct(action.act)} className={className}>{label}</button>
}

export default function TodoCard({ todo, onAct }) {
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 sm:justify-start">
          <p className="min-w-0 break-words text-[15px] font-semibold leading-snug text-text-primary">{todo.title}</p>
          <span className="shrink-0"><StatusBadge tone={todo.tone}>{BADGE[todo.tone]}</StatusBadge></span>
        </div>
        <p className="mt-1 break-words text-[13px] leading-snug text-text-secondary">{todo.detail}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        {todo.actions.map((action) => <ActionButton key={action.label} action={action} onAct={onAct} />)}
      </div>
    </li>
  )
}
