function LoadingSpinner({ size = 'large', message = '' }) {
  if (size === 'small') {
    return (
      <div className="flex items-center justify-center py-4">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-slate-100 border-t-green-600" />
        {message && <p className="ml-2 text-sm text-slate-600">{message}</p>}
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-100 bg-white py-12">
      <div className="h-10 w-10 animate-spin rounded-full border-4 border-slate-100 border-t-green-600" />
      {message && (
        <p className="mt-4 text-sm text-slate-500">{message}</p>
      )}
    </div>
  )
}

export default LoadingSpinner
