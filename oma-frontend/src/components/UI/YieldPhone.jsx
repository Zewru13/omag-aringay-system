import { useState } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

// Phone-only pieces of the Yield analysis tabs (crop and fisheries). Everything here is built to stay inside the
// screen: each block is a plain stack with `min-w-0` / `break-words`, no tables and no fixed widths.

const BAR = { green: 'bg-emerald-400', amber: 'bg-amber-400', rose: 'bg-rose-400', brand: 'bg-[#1B4D2E]' }

function varianceBar(pct) {
  if (pct === null || pct === undefined) return 'bg-slate-200'
  return pct >= 0 ? BAR.green : pct >= -20 ? BAR.amber : BAR.rose
}

function Meter({ label, text, widthPct, barCls }) {
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-[#7A8E7A]">{label}</span>
        <span className="text-[13px] font-semibold text-[#1A2B1A]">{text}</span>
      </div>
      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${barCls}`} style={{ width: `${Math.max(0, Math.min(100, widthPct))}%` }} />
      </div>
    </div>
  )
}

const fmtPct = (v) => (v == null ? 'N/A' : `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`)

// The aggregate summary on a phone: one small card per group (barangay / crop type / species), the first few
// open, the rest behind "Show all". `countText(g)` is e.g. "580 crops"; `lossCount(g)` flags total-loss records.
export function PhoneGroupList({ groups, countText, lossCount, initialCount = 5 }) {
  const [showAll, setShowAll] = useState(false)
  const maxAbs = Math.max(10, ...groups.map((g) => Math.abs(g.avg_variance_pct ?? 0)))
  const shown = showAll ? groups : groups.slice(0, initialCount)
  return (
    <div className="space-y-2">
      {shown.map((g) => (
        <div key={g.group} className="rounded-lg border border-[#E8EEE8] bg-white p-3">
          <div className="flex items-baseline justify-between gap-2">
            <p className="min-w-0 truncate text-[14px] font-semibold text-[#1A2B1A]">{g.group}</p>
            <p className="shrink-0 text-[11px] text-[#7A8E7A]">
              {countText(g)}
              {lossCount(g) > 0 && <span className="text-rose-500"> · {lossCount(g)} loss</span>}
            </p>
          </div>
          <div className="mt-2.5 grid grid-cols-2 gap-4">
            <Meter
              label="Variance"
              text={fmtPct(g.avg_variance_pct)}
              widthPct={g.avg_variance_pct == null ? 0 : (Math.abs(g.avg_variance_pct) / maxAbs) * 100}
              barCls={varianceBar(g.avg_variance_pct)}
            />
            <Meter
              label="Activities"
              text={g.avg_activity_completion_pct == null ? 'N/A' : `${g.avg_activity_completion_pct.toFixed(1)}%`}
              widthPct={g.avg_activity_completion_pct ?? 0}
              barCls={BAR.brand}
            />
          </div>
        </div>
      ))}
      {groups.length > initialCount && (
        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          className="flex min-h-[40px] w-full items-center justify-center rounded-lg border border-[#C8D5C8] text-[13px] font-medium text-[#1B4D2E]"
        >
          {showAll ? 'Show fewer' : `Show all ${groups.length}`}
        </button>
      )}
    </div>
  )
}

export function ActivityBreakdown({ items, emptyText, disclaimer }) {
  return (
    <div>
      <p className="mb-2 text-[12px] font-semibold text-[#1A2B1A]">Activity completion breakdown</p>
      {items.length === 0 ? (
        <p className="text-[12px] text-[#7A8E7A]">{emptyText}</p>
      ) : (
        <div className="grid gap-1">
          {items.map((b, i) => (
            <div
              key={i}
              className={`flex min-w-0 items-center gap-1.5 rounded-lg border px-2 py-1 text-[12px] ${
                b.completed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
              }`}
            >
              <span className="shrink-0 font-medium">{b.completed ? '✓' : '✗'}</span>
              <span className="min-w-0 truncate">{b.activity} (Day {b.scheduled_day})</span>
              {b.priority === 'HIGH' && <span className="shrink-0 text-[10px] uppercase tracking-wide opacity-70">high</span>}
            </div>
          ))}
        </div>
      )}
      {disclaimer && <p className="mt-3 text-[11px] italic text-[#A8BCA8]">{disclaimer}</p>}
    </div>
  )
}

// One harvested crop / stocking: name and variance on top, who and where, three figures, tap for the rest.
export function PhoneYieldCard({ title, badge, subtitle, estimated, actual, activities, factors, expanded, onToggle, children }) {
  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-white p-3.5 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <button type="button" onClick={onToggle} aria-expanded={expanded} className="block w-full min-w-0 text-left">
        <div className="flex items-start justify-between gap-2">
          <p className="min-w-0 break-words text-[15px] font-semibold leading-snug text-[#1A2B1A]">{title}</p>
          <span className="flex shrink-0 items-center gap-1">
            {badge}
            {expanded ? <ChevronDown size={16} className="text-[#7A8E7A]" /> : <ChevronRight size={16} className="text-[#7A8E7A]" />}
          </span>
        </div>
        {subtitle && <p className="mt-0.5 break-words text-[12px] leading-snug text-[#7A8E7A]">{subtitle}</p>}
        <div className="mt-2.5 grid grid-cols-3 gap-2 rounded-lg bg-[#F5F8F5] p-2.5">
          {[['Estimated', estimated], ['Actual', actual], ['Activities', activities]].map(([label, value]) => (
            <div key={label} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7A8E7A]">{label}</p>
              <p className="mt-0.5 break-words text-[13px] font-semibold text-[#1A2B1A]">{value}</p>
            </div>
          ))}
        </div>
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-[#F0F4F0] pt-3">
          {factors && (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Possible factors</p>
              <p className="mt-0.5 break-words text-[12px] text-[#4A5E4A]">{factors}</p>
            </div>
          )}
          {children}
        </div>
      )}
    </div>
  )
}
