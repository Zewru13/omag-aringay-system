// The one card every block of the staff dashboard is drawn in, so their headers are the same height and type and the cards
// in a row can stretch to the same height. `title` is sentence case, `icon` (optional) sits in a small tinted square before it,
// `count` shows a small amber badge, `subtitle` is the one muted line under the title, and `right` / `action` sit at the end of
// the header. `tone` colours a 3px line along the card's top edge and the icon square: crop (green), fisheries (blue), warn
// (amber), disaster (rust), critical (red) or neutral (theme green).

const BASE = 'flex h-full min-w-0 flex-col overflow-hidden rounded-[var(--radius-md)] border border-border border-t-[3px] bg-surface shadow-sm'

const TONES = {
  neutral: { line: 'border-t-[#2F5233]', chip: 'bg-[#E4EFE5] text-[#2F5233]' },
  crop: { line: 'border-t-[#2D7A4F]', chip: 'bg-[#E7F5EC] text-[#2D7A4F]' },
  fisheries: { line: 'border-t-[#275E63]', chip: 'bg-[#DCEEF0] text-[#275E63]' },
  warn: { line: 'border-t-[#C2740A]', chip: 'bg-[#FBEED6] text-[#C2740A]' },
  disaster: { line: 'border-t-[#B4531B]', chip: 'bg-[#FBE9DD] text-[#B4531B]' },
  critical: { line: 'border-t-[#B4271B]', chip: 'bg-[#FBE3E0] text-[#B4271B]' },
}

export function PanelHead({ title, icon: Icon, tone = 'neutral', count, subtitle, right, action, onAction, headClassName = '' }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-b border-border px-3 py-3 sm:px-4 md:px-5 ${headClassName || 'min-h-[56px]'}`}>
      <div className="min-w-0 flex-1 basis-[200px]">
        <div className="flex items-center gap-2.5">
          {Icon && (
            <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${(TONES[tone] || TONES.neutral).chip}`}>
              <Icon size={15} aria-hidden="true" />
            </span>
          )}
          <h3 className="text-[15px] font-semibold leading-tight text-text-primary">{title}</h3>
          {count > 0 && (
            <span className="shrink-0 rounded-full bg-[color:var(--color-semantic-warning-bg)] px-2 py-0.5 text-[11px] font-bold tabular-nums text-[color:var(--color-semantic-warning)]">
              {count}
            </span>
          )}
        </div>
        {subtitle && <p className={`mt-0.5 text-[12.5px] leading-snug text-text-muted ${Icon ? 'pl-[38px]' : ''}`}>{subtitle}</p>}
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

export default function DashPanel({ children, className = '', testId, tone = 'neutral', ...head }) {
  return (
    <section className={`${BASE} ${(TONES[tone] || TONES.neutral).line} ${className}`} data-testid={testId}>
      <PanelHead tone={tone} {...head} />
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  )
}
