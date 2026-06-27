import { AlertCircle } from 'lucide-react'

function ErrorMessage({ message, onRetry }) {
  return (
    <div className="flex flex-col items-center justify-center py-8">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-rose-50">
        <AlertCircle className="h-5 w-5 text-rose-500" />
      </div>
      <p className="mt-3 text-sm text-slate-600">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-lg px-3 py-1.5 text-sm font-medium text-[#1E4620] transition hover:bg-[#f0f7f0]"
          type="button"
        >
          Try Again
        </button>
      )}
    </div>
  )
}

export default ErrorMessage
