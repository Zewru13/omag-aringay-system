import { CircleAlert, Inbox } from 'lucide-react'

// The three things a list or a Home section can be besides its rows: still loading, failed, or empty. They look different on purpose:
// a failure must never read as "none".

export function LoadingRows({ count = 3 }) {
  return (
    <div role="status" aria-label="Loading" className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-[var(--radius-md)] border border-border bg-surface px-4 py-4">
          <div className="skeleton-shimmer h-4 w-1/2 rounded" />
          <div className="skeleton-shimmer mt-2.5 h-3.5 w-3/4 rounded" />
        </div>
      ))}
    </div>
  )
}

// `what` names what could not be loaded ("your crops"); without it the line is general.
export function LoadFailed({ what, onRetry }) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-[var(--radius-md)] border border-[#F5C6C6] bg-[#FCEBEB] px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
      <p className="flex items-start gap-2 text-[14px] leading-snug text-[#791F1F]">
        <CircleAlert size={18} className="mt-px shrink-0" aria-hidden="true" />
        <span>Couldn't load {what || 'this'}. Check your connection, then try again.</span>
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="press-scale min-h-[44px] shrink-0 rounded-[var(--radius-sm)] border border-[#A32D2D] bg-white px-4 transition-colors hover:bg-[#FCEBEB]"
        >
          <span className="text-[14px] font-semibold text-[#791F1F]">Try again</span>
        </button>
      )}
    </div>
  )
}

// `title` says there is nothing; `hint` says what to do next; `children` is an optional button or link.
export function EmptyNote({ title, hint, children }) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-[var(--radius-md)] border border-border bg-surface px-4 py-8 text-center">
      <Inbox size={28} className="text-border-strong" aria-hidden="true" />
      <p className="text-[14px] font-semibold text-text-primary">{title}</p>
      {hint && <p className="max-w-[420px] text-[13px] leading-snug text-text-secondary">{hint}</p>}
      {children && <div className="mt-2">{children}</div>}
    </div>
  )
}
