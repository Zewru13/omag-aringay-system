function LoadingSpinner({ size = 'large', message = '', className = '' }) {
  const isSmall = size === 'small'
  const spinnerPx = typeof size === 'number' ? size : isSmall ? 20 : 32

  const spinner = (
    <div
      className="animate-spin rounded-full border-2 border-border border-t-primary"
      style={{ width: spinnerPx, height: spinnerPx }}
      role="status"
      aria-label={message || 'Loading'}
    />
  )

  if (isSmall) {
    return (
      <div className={`flex items-center justify-center py-4 ${className}`}>
        {spinner}
        {message && <p className="ml-2 text-[13px] text-text-muted">{message}</p>}
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
      {spinner}
      {message && <p className="mt-3 text-[13px] text-text-muted">{message}</p>}
    </div>
  )
}

export default LoadingSpinner
