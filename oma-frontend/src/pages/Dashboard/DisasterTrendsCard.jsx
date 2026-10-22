import { useEffect, useMemo, useState } from 'react'
import { CloudLightning } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import api from '../../api/axiosInstance.js'
import DashPanel from './DashPanel.jsx'
import { chartData, defaultRange, rangeProblem, rangeTitle, typeBars } from './disasterChart.js'

// Disaster reports per month between a From and a To month (default: this calendar year), crop and fisheries stacked, with the
// same range broken down by disaster type. Changing either month redraws the chart. Counts of the reports as saved.

const CROP = '#2D7A4F'
const FISH = '#4E8DB8'
const MONTH_INPUT = 'min-h-[36px] rounded-lg border border-border bg-surface-2 px-2.5 text-[13px] text-text-primary focus:border-primary focus:outline-none'

function CountTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] shadow-md">
      <p className="font-semibold text-text-primary">{label}</p>
      <p className="text-text-secondary">Crop: <span className="font-semibold text-text-primary">{row.crop}</span></p>
      <p className="text-text-secondary">Fisheries: <span className="font-semibold text-text-primary">{row.fisheries}</span></p>
    </div>
  )
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

export default function DisasterTrendsCard() {
  const [{ from, to }, setRange] = useState(() => defaultRange())
  const problem = rangeProblem(from, to)
  const key = `${from}|${to}`
  const [result, setResult] = useState({ key: '', data: null, failed: false })

  useEffect(() => {
    if (rangeProblem(from, to)) return undefined
    let alive = true
    api.get('/production/dashboard/disaster-trends/', { params: { from, to } })
      .then((r) => { if (alive) setResult({ key, data: r.data, failed: false }) })
      .catch(() => { if (alive) setResult({ key, data: null, failed: true }) })
    return () => { alive = false }
  }, [from, to, key])

  const isLoading = !problem && result.key !== key
  const data = result.key === key ? result.data : null
  const rows = useMemo(() => (data ? chartData(data.months) : []), [data])
  const bars = useMemo(() => (data ? typeBars(data.by_type) : []), [data])
  const animate = !prefersReducedMotion()

  return (
    <DashPanel
      testId="disaster-trends-card"
      title="Disaster Reports Over Time"
      icon={CloudLightning}
      tone="disaster"
      subtitle={problem ? 'Choose a range of months.' : rangeTitle(from, to)}
      right={(
        <div className="grid w-full grid-cols-2 gap-2 sm:flex sm:w-auto sm:items-center sm:gap-x-3">
          <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-text-secondary sm:flex-row sm:items-center sm:gap-1.5">
            From
            <input type="month" className={`${MONTH_INPUT} w-full`} value={from} max={to || undefined} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} aria-label="From month" />
          </label>
          <label className="flex min-w-0 flex-col gap-1 text-[12px] font-medium text-text-secondary sm:flex-row sm:items-center sm:gap-1.5">
            To
            <input type="month" className={`${MONTH_INPUT} w-full`} value={to} min={from || undefined} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} aria-label="To month" />
          </label>
        </div>
      )}
    >
      {problem ? (
        <p role="alert" className="px-5 py-8 text-center text-[13px] font-medium text-[color:var(--color-semantic-critical)]">{problem}</p>
      ) : isLoading ? (
        <p className="px-5 py-10 text-center text-[13px] italic text-text-muted">Loading…</p>
      ) : result.failed || !data ? (
        <p className="px-5 py-10 text-center text-[13px] text-text-muted">Could not load the disaster reports.</p>
      ) : (
        <div className="space-y-4 px-3 pb-5 pt-4 md:px-5">
          <ul className="flex flex-wrap gap-2" aria-label="Totals for the chosen months">
            {[['Reports', data.totals.reports, null], ['Still active', data.totals.active, null], ['Crop', data.totals.crop, CROP], ['Fisheries', data.totals.fisheries, FISH]].map(([label, value, color]) => (
              <li key={label} className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1 text-[12.5px]">
                {color && <span className="h-2.5 w-2.5 rounded-sm" style={{ background: color }} aria-hidden="true" />}
                <span className="text-text-secondary">{label}</span>
                <span className="font-bold tabular-nums text-text-primary">{value}</span>
              </li>
            ))}
          </ul>

          {data.totals.reports === 0 ? (
            <p className="py-8 text-center text-[13px] italic text-text-muted">No disaster reports between {rangeTitle(from, to)}.</p>
          ) : (
            <>
              <div className="overflow-x-auto">
                <div style={{ minWidth: Math.max(rows.length * 32, 280) }} className="h-56" role="img"
                  aria-label={`Disaster reports per month, ${rangeTitle(from, to)}: ${data.totals.crop} crop and ${data.totals.fisheries} fisheries.`}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barCategoryGap="25%">
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #E2E8E2)" vertical={false} />
                      <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#5C6F5C' }} axisLine={false} tickLine={false} interval={0} />
                      <YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#7A8E7A' }} axisLine={false} tickLine={false} width={32} />
                      <Tooltip content={<CountTooltip />} cursor={{ fill: 'rgba(27,77,46,0.06)' }} />
                      <Bar dataKey="crop" name="Crop" stackId="d" fill={CROP} isAnimationActive={animate} />
                      <Bar dataKey="fisheries" name="Fisheries" stackId="d" fill={FISH} radius={[3, 3, 0, 0]} isAnimationActive={animate} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div>
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">By type of disaster</p>
                <ul className="space-y-1.5">
                  {bars.map((b) => (
                    <li key={b.type} className="grid grid-cols-[minmax(0,9rem)_1fr_2.5rem] items-center gap-2 text-[12.5px]">
                      <span className="truncate text-text-secondary" title={b.type}>{b.type}</span>
                      <span className="h-2.5 overflow-hidden rounded-full bg-surface-2"><span className="block h-full rounded-full" style={{ width: `${b.percent}%`, background: '#B7791F' }} /></span>
                      <span className="text-right font-semibold tabular-nums text-text-primary">{b.total}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </div>
      )}
    </DashPanel>
  )
}
