function LoadingSpinner({ size = 'large', message = '', className = '' }) {
  const isSmall = size === 'small'
  const spinnerPx = typeof size === 'number' ? size : isSmall ? 20 : 32

  const spinner = (
    <div
      className="animate-spin rounded-full border-2 border-[#E2E8E2] border-t-[#1B4D2E]"
      style={{ width: spinnerPx, height: spinnerPx }}
    />
  )

  if (isSmall) {
    return (
      <div className={`flex items-center justify-center py-4 ${className}`}>
        {spinner}
        {message && <p className="ml-2 text-[13px] text-[#7A8E7A]">{message}</p>}
      </div>
    )
  }

  return (
    <div className={`flex flex-col items-center justify-center py-8 ${className}`}>
      {spinner}
      {message && <p className="mt-3 text-[13px] text-[#7A8E7A]">{message}</p>}
    </div>
  )
}

export default LoadingSpinner
