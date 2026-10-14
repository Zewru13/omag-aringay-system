import { Loader2 } from 'lucide-react'

const VARIANT = {
  primary:   'bg-primary text-white shadow-sm hover:bg-primary-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
  accent:    'bg-accent text-white shadow-sm hover:bg-accent-hover hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-accent',
  secondary: 'border border-border-strong text-text-secondary bg-surface hover:bg-surface-2 hover:border-primary/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
  outline:   'border border-border-strong text-text-secondary bg-transparent hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
  danger:    'bg-[color:var(--color-semantic-critical)] text-white shadow-sm hover:brightness-95 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[color:var(--color-semantic-critical)]',
  ghost:     'text-primary hover:bg-primary-light focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary',
}

// A fixed height used to let a label that wraps onto a second line (long text, narrow phone) spill out of the button; on a phone
// the height is a minimum instead, so the button grows to hold its text.
const SIZE = {
  sm: 'h-9 px-3 text-[12px] min-w-9 max-sm:h-auto max-sm:min-h-9 max-sm:py-1.5 max-sm:leading-tight',
  md: 'h-10 px-4 text-[13px] min-w-10 max-sm:h-auto max-sm:min-h-10 max-sm:py-2 max-sm:leading-tight',
  lg: 'h-11 px-5 text-[13px] min-w-11 max-sm:h-auto max-sm:min-h-11 max-sm:py-2 max-sm:leading-tight',
}

function Button({
  children,
  variant = 'primary',
  size = 'md',
  icon: Icon,
  isLoading = false,
  className = '',
  disabled,
  ...props
}) {
  const base = 'press-scale inline-flex items-center justify-center gap-2 rounded-[var(--radius-sm)] font-medium transition-[background-color,box-shadow,border-color] duration-150 disabled:opacity-50 disabled:pointer-events-none cursor-pointer'

  return (
    <button
      className={`${base} ${VARIANT[variant] || VARIANT.primary} ${SIZE[size] || SIZE.md} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      ) : (
        Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
      )}
      {children}
    </button>
  )
}

export default Button
