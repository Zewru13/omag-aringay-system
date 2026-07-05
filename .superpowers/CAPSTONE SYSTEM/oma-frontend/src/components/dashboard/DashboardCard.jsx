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
    <div className={`flex flex-col rounded-2xl border border-slate-100 bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-4 w-4 text-slate-400" />}
          <span className="text-xs font-medium uppercase tracking-wide text-slate-400">{title}</span>
        </div>
        {headerRight && <div>{headerRight}</div>}
      </div>

      {isLoading && (
        <div className="flex h-40 items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-slate-300" />
        </div>
      )}

      {!isLoading && error && (
        <div className="flex h-40 flex-col items-center justify-center gap-2">
          <AlertCircle className="h-5 w-5 text-slate-300" />
          <p className="text-xs text-slate-400">{error}</p>
          {onRetry && (
            <button
              className="text-xs font-medium text-[#1E4620] hover:underline"
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
          <p className="text-xs text-slate-400">{emptyMessage}</p>
        </div>
      )}

      {!isLoading && !error && !isEmpty && children}
    </div>
  )
}

export default DashboardCard
