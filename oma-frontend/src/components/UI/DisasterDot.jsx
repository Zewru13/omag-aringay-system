function DisasterDot({ activeCount, hasResolved }) {
  if (activeCount > 0) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500"
        title={`${activeCount} active disaster report${activeCount > 1 ? 's' : ''}`}
      />
    )
  }
  if (activeCount === 0 && hasResolved) {
    return (
      <span
        className="inline-block h-2.5 w-2.5 rounded-full bg-slate-300"
        title="Disaster resolved"
      />
    )
  }
  return null
}

export default DisasterDot
