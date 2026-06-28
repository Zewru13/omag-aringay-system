import StatusPill from '../UI/StatusPill.jsx'

function MetricHeroCard({
  title,
  icon: Icon,
  value,
  subLabel,
  percentLabel,
  percentTone = 'green',
  className = '',
}) {
  return (
    <div className={`bg-white border border-[#E2E8E2] rounded-xl p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#EBF5EE]">
          {Icon && <Icon className="h-5 w-5 text-[#1B4D2E]" />}
        </div>
        {percentLabel && <StatusPill tone={percentTone}>{percentLabel}</StatusPill>}
      </div>
      <p className="text-3xl font-bold tracking-tight text-[#1A2B1A]">{value}</p>
      <p className="mt-1 text-xs font-medium text-[#7A8E7A]">{title}</p>
      {subLabel && <p className="mt-0.5 text-xs text-[#7A8E7A]">{subLabel}</p>}
    </div>
  )
}

export default MetricHeroCard
