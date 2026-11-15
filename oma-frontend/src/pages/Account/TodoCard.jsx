import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge.jsx'

// One thing on Home's to-do list (see todoRules.js): what it is, one line of detail, a badge that says whether it is a problem or only
// waiting, and one button that opens the page where it is done.
const BADGE = { red: 'Overdue', amber: 'Waiting' }

export default function TodoCard({ todo }) {
  return (
    <li className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex items-start justify-between gap-3 sm:justify-start">
          <p className="min-w-0 break-words text-[15px] font-semibold leading-snug text-text-primary">{todo.title}</p>
          <span className="shrink-0"><StatusBadge tone={todo.tone}>{BADGE[todo.tone]}</StatusBadge></span>
        </div>
        <p className="mt-1 break-words text-[13px] leading-snug text-text-secondary">{todo.detail}</p>
      </div>
      <Link
        to={todo.action.to}
        className="press-scale inline-flex min-h-[44px] shrink-0 items-center justify-center rounded-[var(--radius-sm)] bg-primary px-4 text-center text-[14px] font-semibold leading-tight text-white transition-colors hover:bg-primary-hover"
      >
        {todo.action.label}
      </Link>
    </li>
  )
}
