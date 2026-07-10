function HarvestVarianceBadge({ days }) {
  if (days == null || Math.abs(days) <= 7) return null
  const isEarly = days < 0
  return (
    <span
      className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold whitespace-nowrap border ${
        isEarly
          ? 'bg-sky-50 text-sky-700 border-sky-200'
          : 'bg-amber-50 text-amber-700 border-amber-200'
      }`}
    >
      {Math.abs(days)} days {isEarly ? 'early' : 'late'}
    </span>
  )
}

export default HarvestVarianceBadge
