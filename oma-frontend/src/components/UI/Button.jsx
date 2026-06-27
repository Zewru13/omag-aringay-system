import { Loader2 } from 'lucide-react'

const VARIANT = {
  primary:   'bg-[#1E4620] text-white shadow-sm hover:bg-[#2D6A31] hover:shadow-md active:bg-[#163318] active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E4620]',
  secondary: 'bg-blue-900 text-white shadow-sm hover:bg-blue-950 hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-blue-900',
  outline:   'bg-white border border-slate-300 text-slate-700 hover:bg-[#f0f7f0] hover:border-slate-400 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E4620]',
  danger:    'bg-[#D32F2F] text-white shadow-sm hover:bg-[#B71C1C] hover:shadow-md active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#D32F2F]',
  ghost:     'bg-transparent text-slate-600 hover:bg-slate-100 hover:text-slate-800 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1E4620]',
}

const SIZE = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-sm min-h-[2.5rem]',
  lg: 'px-5 py-2.5 text-sm',
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
  const base = 'inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all'

  return (
    <button
      className={`${base} ${VARIANT[variant]} ${SIZE[size]} ${className}`}
      disabled={disabled || isLoading}
      {...props}
    >
      {isLoading ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : (
        Icon && <Icon className="h-4 w-4 shrink-0" />
      )}
      {children}
    </button>
  )
}

export default Button
