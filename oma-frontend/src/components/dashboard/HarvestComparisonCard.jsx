import { useEffect, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../../api/axiosInstance.js'
import DashPanel from '../../pages/Dashboard/DashPanel.jsx'
import { comparisonUrl, pieNote, pieSlices, yearChoices } from './harvestPie.js'

// A pie on the staff dashboard: of all the farmers (or fisherfolk), how many harvested MORE than estimated, less, or exactly the
// estimate, in the chosen year. `url` is the comparison endpoint, `noun` / `nounOne` what the pie is of ("farmers" / "farmer",
// "fisherfolk" / "fisherfolk"), `icon` and `tone` the panel's header icon.

const COLORS = { increased: '#2D7A4F', decreased: '#C2410C', on_target: '#6F9FC8' }

function SliceTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const s = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] shadow-md">
      <p className="font-semibold text-text-primary">{s.label}</p>
      <p className="text-text-secondary">{s.value} · {s.percent}%</p>
    </div>
  )
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function HarvestComparisonCard({ url, title, noun, nounOne, icon, tone }) {
  const choices = yearChoices(new Date().getFullYear())
  const [year, setYear] = useState(choices[0].value)
  const requestUrl = comparisonUrl(url, '', year)
  const [result, setResult] = useState({ key: '', counts: null, failed: false })

  useEffect(() => {
    let alive = true
    api.get(requestUrl)
      .then((r) => { if (alive) setResult({ key: requestUrl, counts: r.data, failed: false }) })
      .catch(() => { if (alive) setResult({ key: requestUrl, counts: null, failed: true }) })
    return () => { alive = false }
  }, [requestUrl])

  const isLoading = result.key !== requestUrl
  const counts = isLoading ? null : result.counts
  const slices = pieSlices(counts)
  const animate = !prefersReducedMotion()

  return (
    <DashPanel
      testId="harvest-comparison-card"
      title={title}
      icon={icon}
      tone={tone}
      subtitle={`Actual harvest against the estimate made when it was ${nounOne === 'farmer' ? 'planted' : 'stocked'}`}
      right={(
        <label className="flex items-center gap-1.5 text-[12px] font-medium text-text-secondary">
          Year
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label={`Year compared, ${noun}`}
            className="min-h-[36px] rounded-lg border border-border bg-surface-2 px-2 text-[13px] text-text-primary focus:border-primary focus:outline-none">
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      )}
    >
      {isLoading ? (
        <p className="px-5 py-10 text-center text-[13px] italic text-text-muted">Loading…</p>
      ) : result.failed || !counts ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-muted">Could not load the comparison.</p>
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center gap-4 px-5 py-4 sm:flex-row sm:gap-6">
          {slices.length > 0 && (
            <div className="h-36 w-36 shrink-0" role="img"
              aria-label={`Harvest compared with the estimate: ${slices.map((s) => `${s.label} ${s.percent}%`).join(', ')}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="label" innerRadius={34} outerRadius={64} paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={animate}>
                    {slices.map((s) => <Cell key={s.key} fill={COLORS[s.key]} />)}
                  </Pie>
                  <Tooltip content={<SliceTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
          <div className="min-w-0 w-full flex-1">
            {slices.length > 0 && (
              <ul className="space-y-1.5">
                {slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-[13px]">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[s.key] }} aria-hidden="true" />
                    <span className="text-text-secondary">{s.label}</span>
                    <span className="ml-auto font-bold tabular-nums text-text-primary">{s.value} <span className="font-medium text-text-muted">({s.percent}%)</span></span>
                  </li>
                ))}
              </ul>
            )}
            <p className={`${slices.length > 0 ? 'mt-2' : ''} text-[12px] text-text-muted`}>{pieNote(counts, counts.total === 1 ? nounOne : noun)}</p>
          </div>
        </div>
      )}
    </DashPanel>
  )
}
