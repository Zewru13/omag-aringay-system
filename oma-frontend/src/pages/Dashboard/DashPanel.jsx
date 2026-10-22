// The one card every block of the staff dashboard is drawn in, so their headers are the same height and type and the cards
// in a row can stretch to the same height. `title` is sentence case, `icon` (optional) sits before it, `count` shows a small
// amber badge, `subtitle` is the one muted line under the title, and `right` / `action` sit at the end of the header.

const BASE = 'flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface shadow-sm'

const TONES = {
  neutral: 'text-text-muted',
  crop: 'text-primary',
  fisheries: 'text-[color:var(--color-semantic-info)]',
  critical: 'text-[color:var(--color-semantic-critical)]',
}

export function PanelHead({ title, icon: Icon, tone = 'neutral', count, subtitle, right, action, onAction }) {
  return (
    <div className="flex min-h-[56px] flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-4 py-3 md:px-5">
      <div className="min-w-[200px] flex-1">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={16} className={`shrink-0 ${TONES[tone]}`} aria-hidden="true" />}
          <h3 className="text-[15px] font-semibold leading-tight text-text-primary">{title}</h3>
          {count > 0 && (
            <span className="shrink-0 rounded-full bg-[color:var(--color-semantic-warning-bg)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[color:var(--color-semantic-warning)]">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-text-muted">{subtitle}</p>}
      </div>
      {right}
      {action && (
        <button type="button" onClick={onAction} className="flex min-h-[40px] shrink-0 cursor-pointer items-center text-[13px] text-text-secondary transition-colors hover:text-primary">
          {action}
        </button>
      )}
    </div>
  )
}

export default function DashPanel({ children, className = '', testId, ...head }) {
  return (
    <section className={`${BASE} ${className}`} data-testid={testId}>
      <PanelHead {...head} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}
