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
    <div className={`rounded-3xl border border-slate-100 bg-white p-6 ${className}`}>
      <div className="mb-4 flex items-center justify-between">
        <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-[#f0f7f0]">
          {Icon && <Icon className="h-5 w-5 text-[#1E4620]" />}
        </div>
        {percentLabel && <StatusPill tone={percentTone}>{percentLabel}</StatusPill>}
      </div>
      <p className="text-3xl font-bold tracking-tight text-slate-900">{value}</p>
      <p className="mt-1 text-xs font-medium text-slate-400">{title}</p>
      {subLabel && <p className="mt-0.5 text-xs text-slate-400">{subLabel}</p>}
    </div>
  )
}

export default MetricHeroCard
