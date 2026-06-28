import { Loader2 } from 'lucide-react'

const VARIANT = {
  primary:   'bg-[#1B4D2E] text-white hover:bg-[#235E38] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1B4D2E]',
  secondary: 'border border-[#C8D5C8] text-[#4A5E4A] hover:bg-[#F5F7F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1B4D2E]',
  outline:   'border border-[#C8D5C8] text-[#4A5E4A] hover:bg-[#F5F7F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1B4D2E]',
  danger:    'bg-[#C0392B] text-white hover:bg-[#A93226] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#C0392B]',
  ghost:     'text-[#1B4D2E] hover:bg-[#EBF5EE] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-[#1B4D2E]',
}

const SIZE = {
  sm: 'h-8 px-3 text-[12px]',
  md: 'h-9 px-4 text-[13px]',
  lg: 'h-10 px-5 text-[13px]',
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
  const base = 'inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors'

  return (
    <button
      className={`${base} ${VARIANT[variant] || VARIANT.primary} ${SIZE[size] || SIZE.md} ${className}`}
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
