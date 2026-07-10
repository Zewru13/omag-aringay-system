function GrowthProgressBar({ startLabel, startDate, expectedHarvestDate }) {
  if (!startDate || !expectedHarvestDate) return null

  const start = new Date(startDate + 'T00:00:00')
  const target = new Date(expectedHarvestDate + 'T00:00:00')
  const totalDays = Math.round((target - start) / 86400000)
  if (!totalDays || totalDays <= 0) return null

  const daysElapsed = Math.round((new Date(new Date().toDateString()) - start) / 86400000)
  const pct = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100))
  const barColor = pct < 70 ? 'bg-emerald-500' : pct < 100 ? 'bg-amber-500' : 'bg-slate-400'

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-700 mb-1.5">Day {daysElapsed} of {totalDays}</p>
      <div className="h-2 w-full overflow-hidden rounded-full bg-slate-200">
        <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1.5 text-[11px] text-slate-500">
        {startLabel} {startDate} · Expected harvest {expectedHarvestDate}
      </p>
    </div>
  )
}

export default GrowthProgressBar
