import { AlertCircle, Loader2 } from 'lucide-react'

function DashboardCard({
  title,
  icon: Icon,
  isLoading,
  error,
  onRetry,
  isEmpty,
  emptyMessage,
  className = '',
  headerRight,
  children,
}) {
  return (
    <div className={`flex flex-col bg-white border border-[#E2E8E2] rounded-xl overflow-hidden ${className}`}>
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F4F0]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#1B4D2E]" />
          {Icon && <Icon className="h-3.5 w-3.5 text-[#1B4D2E]" />}
          <span className="text-[13px] font-semibold text-[#1A2B1A]">{title}</span>
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>

      <div className="p-5">
        {isLoading && (
          <div className="flex h-40 items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-[#7A8E7A]" />
          </div>
        )}

        {!isLoading && error && (
          <div className="flex h-40 flex-col items-center justify-center gap-2">
            <AlertCircle className="h-5 w-5 text-[#7A8E7A]" />
            <p className="text-xs text-[#7A8E7A]">{error}</p>
            {onRetry && (
              <button
                className="text-xs font-medium text-[#1B4D2E] hover:underline"
                onClick={onRetry}
                type="button"
              >
                Try again
              </button>
            )}
          </div>
        )}

        {!isLoading && !error && isEmpty && (
          <div className="flex h-40 items-center justify-center">
            <p className="text-xs text-[#7A8E7A]">{emptyMessage}</p>
          </div>
        )}

        {!isLoading && !error && !isEmpty && children}
      </div>
    </div>
  )
}

export default DashboardCard
