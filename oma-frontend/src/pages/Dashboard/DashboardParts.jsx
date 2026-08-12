// Shared dashboard furniture.
//
// These were previously defined inside DashboardPage while the triage band
// carried its own near-identical copies — two card systems on one page, which
// is exactly why the dashboard read as two products stitched together. One
// definition, imported by both halves, is what keeps them looking like one
// page. Extracted to its own module rather than exported from DashboardPage
// so the two screens don't import each other in a cycle.

const STAT_TONE = {
  primary: { rail: 'var(--color-primary)',           iconBg: 'bg-primary-light', iconColor: 'text-primary' },
  accent:  { rail: 'var(--color-accent)',            iconBg: 'bg-accent-light',  iconColor: 'text-[color:var(--color-accent)]' },
  warning: { rail: 'var(--color-semantic-warning)',  iconBg: 'bg-[color:var(--color-semantic-warning-bg)]', iconColor: 'text-[color:var(--color-semantic-warning)]' },
  info:    { rail: 'var(--color-semantic-info)',     iconBg: 'bg-[color:var(--color-semantic-info-bg)]',    iconColor: 'text-[color:var(--color-semantic-info)]' },
}

export function StatCard({ icon: Icon, label, value, sub, tone = 'primary', onClick, index = 0 }) {
  const t = STAT_TONE[tone] || STAT_TONE.primary
  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === 'Enter' || e.key === ' ') onClick() } : undefined}
      className={`stagger-item relative bg-surface border border-border rounded-[var(--radius-md)] shadow-xs px-5 py-[18px] overflow-hidden ${
        onClick ? 'cursor-pointer hover:shadow-md hover:border-border-strong transition-[box-shadow,border-color] press-scale select-none' : ''
      }`}
      style={{ '--stagger-index': index }}
    >
      <span className="absolute left-0 top-0 bottom-0 w-[3px]" style={{ backgroundColor: t.rail }} aria-hidden="true" />
      <div className="flex items-start justify-between mb-3">
        <div className={`w-9 h-9 rounded-[10px] flex items-center justify-center flex-shrink-0 ${t.iconBg}`}>
          <Icon size={17} className={t.iconColor} aria-hidden="true" />
        </div>
        <span className="text-[12px] text-text-muted text-right">{label}</span>
      </div>
      <p className="text-[30px] font-semibold text-text-primary leading-none tabular-nums">{value}</p>
      {sub && <p className="text-[12px] text-text-muted mt-2">{sub}</p>}
    </div>
  )
}

// `count` puts a number beside the title (pending items); `action` is the
// right-hand text link. Both optional, so the same panel serves the analytics
// panels that need neither.
export function Panel({ title, count, headerRight, action, onAction, children, index = 0, bodyClassName = 'p-5' }) {
  return (
    <div
      className="stagger-item bg-surface border border-border rounded-[var(--radius-md)] shadow-sm overflow-hidden"
      style={{ '--stagger-index': index }}
    >
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-border gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="w-2.5 h-2.5 rounded-sm bg-primary flex-shrink-0" aria-hidden="true" />
          <h3 className="text-[13px] font-semibold text-text-primary truncate">{title}</h3>
          {count > 0 && (
            <span className="shrink-0 rounded-full bg-[color:var(--color-semantic-warning-bg)] px-2 py-0.5 text-[11px] font-bold text-[color:var(--color-semantic-warning)] tabular-nums">
              {count}
            </span>
          )}
        </div>
        {headerRight}
        {action && (
          <button
            type="button"
            onClick={onAction}
            className="shrink-0 text-text-secondary transition-colors hover:text-primary cursor-pointer"
          >
            <span className="text-[13px]">{action}</span>
          </button>
        )}
      </div>
      <div className={bodyClassName}>{children}</div>
    </div>
  )
}

// One section rule for the whole page, so "Needs attention", "Registry" and
// "Production" are visibly the same rank instead of one being a divider and
// another being a heading.
export function SectionHeading({ title, hint, children }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
      <div className="min-w-0">
        <h2 className="text-[11px] font-semibold uppercase tracking-[0.07em] text-text-muted">{title}</h2>
        {hint && <p className="text-[12px] text-text-muted mt-0.5">{hint}</p>}
      </div>
      {children}
    </div>
  )
}
