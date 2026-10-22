import { useEffect, useState } from 'react'
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import api from '../../api/axiosInstance.js'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { comparisonUrl, pieNote, pieSlices, yearChoices } from './harvestPie.js'

// A pie above the Farmers / Fisherfolk list: of the people the list is showing (its filters apply), how many harvested MORE than
// estimated, less, or exactly the estimate, in the chosen year. `url` is the comparison endpoint, `listQuery` the list's own
// filters as a query string, `noun` what the list is of ("farmers", "fisherfolk").

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

export default function HarvestComparisonCard({ url, listQuery, noun, nounOne }) {
  const choices = yearChoices(new Date().getFullYear())
  const [year, setYear] = useState(choices[0].value)
  const query = useDebouncedValue(listQuery)
  const requestUrl = comparisonUrl(url, query, year)
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
    <div className="mb-4 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 shadow-[0_1px_3px_rgba(0,0,0,0.04)]" data-testid="harvest-comparison-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[14px] font-semibold text-[#1A2B1A]">Harvest compared with the estimate</h3>
          <p className="text-[12px] text-[#7A8E7A]">Actual harvest against the estimate made when it was {nounOne === 'farmer' ? 'planted' : 'stocked'}, for the {noun} listed below.</p>
        </div>
        <label className="text-[12px] font-medium text-[#4A5E4A]">
          Year{' '}
          <select value={year} onChange={(e) => setYear(e.target.value)} aria-label="Year compared"
            className="ml-1 min-h-[36px] rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-2 text-[13px] focus:border-[#1B4D2E] focus:outline-none">
            {choices.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </select>
        </label>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-[13px] italic text-[#7A8E7A]">Loading…</p>
      ) : result.failed || !counts ? (
        <p className="py-6 text-center text-[13px] text-[#7A8E7A]">Could not load the comparison.</p>
      ) : (
        <div className="mt-2 flex flex-col items-center gap-3 sm:flex-row sm:gap-6">
          {slices.length > 0 ? (
            <div className="h-40 w-40 shrink-0" role="img"
              aria-label={`Harvest compared with the estimate: ${slices.map((s) => `${s.label} ${s.percent}%`).join(', ')}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={slices} dataKey="value" nameKey="label" innerRadius={38} outerRadius={70} paddingAngle={slices.length > 1 ? 2 : 0} isAnimationActive={animate}>
                    {slices.map((s) => <Cell key={s.key} fill={COLORS[s.key]} />)}
                  </Pie>
                  <Tooltip content={<SliceTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : null}
          <div className="min-w-0 flex-1">
            {slices.length > 0 && (
              <ul className="space-y-1.5">
                {slices.map((s) => (
                  <li key={s.key} className="flex items-center gap-2 text-[13px]">
                    <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: COLORS[s.key] }} aria-hidden="true" />
                    <span className="text-[#4A5E4A]">{s.label}</span>
                    <span className="ml-auto font-bold tabular-nums text-[#1A2B1A]">{s.value} <span className="font-medium text-[#7A8E7A]">({s.percent}%)</span></span>
                  </li>
                ))}
              </ul>
            )}
            <p className={`${slices.length > 0 ? 'mt-2' : ''} text-[12px] text-[#7A8E7A]`}>{pieNote(counts, counts.total === 1 ? nounOne : noun)}</p>
          </div>
        </div>
      )}
    </div>
  )
}
