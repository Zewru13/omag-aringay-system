import { Leaf } from 'lucide-react'

// "Day 40 of 110 days" with a thin progress bar: how long a crop or pond has been growing. `progress` comes from
// utils/cycleActivity.js cycleProgress(); `stage` (optional) names the growth stage.
function CycleDayBanner({ progress, stage = '', icon: Icon = Leaf }) {
  if (!progress) return null
  const { day, total, percent } = progress
  return (
    <div className="rounded-lg border border-[#C8E6D0] bg-[#EBF5EE] px-3 py-2 text-xs text-[#1B4D2E]" data-testid="cycle-day-banner">
      <div className="flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 flex-shrink-0" aria-hidden="true" />
        <span>
          <strong>Day {day}</strong>{total ? ` of ${total} days` : ''}{stage ? ` \u2014 ${stage} stage` : ''}
        </span>
      </div>
      {total ? (
        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/70" aria-hidden="true">
          <div className="h-full rounded-full bg-[#1B4D2E]" style={{ width: `${percent}%` }} />
        </div>
      ) : null}
    </div>
  )
}

export default CycleDayBanner
