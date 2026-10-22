import { useMemo, useState } from 'react'
import { BarChart2 } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import DashPanel from './DashPanel.jsx'
import { axisMax, chartRows, formatValue, rowDescription, varianceChip } from './yieldChart.js'

// Season Snapshot: estimated vs actual yield as a 3D column chart, for crops (metric tons per hectare) or for fisheries
// species (total kg), switched with the tabs in the header. Each crop or species has a pair of columns (Target = the estimate
// made at planting or stocking, Actual = the harvest) with a variance chip underneath. The depth is drawn on the columns
// (front, top and side faces) with the charting library already in the app, so nothing heavier is loaded; the numbers are
// also available to screen readers as a table, and animation is off for people who ask their device for reduced motion.

const TARGET = '#6F9FC8'
const ACTUAL = '#2D7A4F'
const DEPTH = 9

// Scales a #rrggbb colour lighter (factor > 1) or darker (factor < 1).
function shade(hex, factor) {
  const n = parseInt(hex.slice(1), 16)
  const channel = (shift) => Math.max(0, Math.min(255, Math.round(((n >> shift) & 255) * factor)))
  return `rgb(${channel(16)}, ${channel(8)}, ${channel(0)})`
}

// One 3D column: the front face is the bar itself; the top and right faces are drawn at an angle behind it.
function Column3D({ x, y, width, height, color }) {
  if (!(height > 0) || !(width > 0)) return null
  const d = Math.min(DEPTH, width * 0.45)
  return (
    <g>
      <polygon points={`${x + width},${y} ${x + width + d},${y - d} ${x + width + d},${y + height - d} ${x + width},${y + height}`} fill={shade(color, 0.7)} />
      <polygon points={`${x},${y} ${x + d},${y - d} ${x + width + d},${y - d} ${x + width},${y}`} fill={shade(color, 1.25)} />
      <rect x={x} y={y} width={width} height={height} fill={color} />
    </g>
  )
}

const CHIP_TONES = {
  safe: 'bg-[color:var(--color-semantic-safe-bg)] text-[color:var(--color-semantic-safe)]',
  critical: 'bg-[color:var(--color-semantic-critical-bg)] text-[color:var(--color-semantic-critical)]',
  neutral: 'bg-surface-2 text-text-muted',
}

function PairTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-lg border border-border bg-surface px-3 py-2 text-[12.5px] shadow-md">
      <p className="font-semibold text-text-primary">{row.name}</p>
      {row.season && <p className="text-text-muted">{row.season}</p>}
      <p className="mt-1 text-text-secondary">Target: <span className="font-semibold text-text-primary">{formatValue(row.target, row.unit)}</span></p>
      <p className="text-text-secondary">Actual: <span className="font-semibold text-text-primary">{formatValue(row.actual, row.unit)}</span></p>
    </div>
  )
}

const prefersReducedMotion = () => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const TABS = [
  { value: 'crop', label: 'Crop', title: 'Crop Yield Variance', note: 'Estimated at planting vs actual harvest · metric tons per hectare', empty: 'No harvested records with both an estimate and an actual yield.' },
  { value: 'fisheries', label: 'Fisheries', title: 'Fisheries Yield Variance', note: 'Estimated at stocking vs actual harvest · total kg per species', empty: 'No harvested stockings with both an estimate and a recorded harvest.' },
]

export default function YieldVarianceCard({ crop, fisheries, isLoading }) {
  const [domain, setDomain] = useState('crop')
  const tab = TABS.find((t) => t.value === domain)
  const rows = useMemo(() => chartRows(domain, domain === 'crop' ? crop : fisheries), [domain, crop, fisheries])
  const unit = rows[0]?.unit || (domain === 'crop' ? 'mt/ha' : 'kg')
  const animate = !prefersReducedMotion()

  return (
    <DashPanel
      testId="yield-variance-card"
      title={`Season Snapshot — ${tab.title}`}
      icon={BarChart2}
      subtitle={tab.note}
      right={(
        <div role="tablist" aria-label="Yield variance for" className="inline-flex shrink-0 rounded-lg border border-border bg-surface-2 p-0.5">
          {TABS.map((t) => (
            <button
              key={t.value} type="button" role="tab" aria-selected={domain === t.value}
              onClick={() => setDomain(t.value)}
              className={`min-h-[36px] rounded-md px-3 text-[12.5px] font-semibold transition-colors ${domain === t.value ? 'bg-surface text-primary shadow-sm' : 'text-text-muted hover:text-text-primary'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}
    >
      {rows.length === 0 ? (
        <p className="px-5 py-10 text-center text-[13px] italic text-text-muted">{isLoading ? 'Loading…' : tab.empty}</p>
      ) : (
        <div className="flex flex-1 flex-col px-3 pb-4 pt-3 md:px-5">
          <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[12px] text-text-secondary" aria-hidden="true">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: TARGET }} />Target</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: ACTUAL }} />Actual</span>
            <span className="text-text-muted">{unit}</span>
          </div>

          <div className="relative min-h-[256px] flex-1">
            <div className="absolute inset-0 overflow-x-auto">
            <div style={{ minWidth: Math.max(rows.length * 96, 300) }} className="h-full" role="img" aria-label={`Estimated versus actual yield. ${rows.map(rowDescription).join('. ')}.`}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={rows} margin={{ top: DEPTH + 6, right: DEPTH + 6, left: 0, bottom: 0 }} barGap={4} barCategoryGap="22%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border, #E2E8E2)" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: '#5C6F5C' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis domain={[0, axisMax(rows)]} tick={{ fontSize: 10, fill: '#7A8E7A' }} axisLine={false} tickLine={false} width={42} />
                  <Tooltip content={<PairTooltip />} cursor={{ fill: 'rgba(27,77,46,0.06)' }} />
                  <Bar dataKey="target" name="Target" isAnimationActive={animate} shape={(props) => <Column3D {...props} color={TARGET} />} />
                  <Bar dataKey="actual" name="Actual" isAnimationActive={animate} shape={(props) => <Column3D {...props} color={ACTUAL} />} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            </div>
          </div>

          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Variance against target">
            {rows.map((r) => {
              const chip = varianceChip(r.variancePct)
              return (
                <li key={r.name} className="inline-flex items-center gap-1.5 rounded-full border border-border px-2.5 py-1 text-[12px]">
                  <span className="font-medium text-text-primary">{r.name}</span>
                  <span className={`rounded-full px-1.5 py-0.5 text-[11px] font-bold tabular-nums ${CHIP_TONES[chip.tone]}`}>{chip.text}</span>
                </li>
              )
            })}
          </ul>

          <table className="sr-only">
            <caption>{tab.title}: {tab.note}</caption>
            <thead><tr><th>{domain === 'crop' ? 'Crop' : 'Species'}</th><th>Target ({unit})</th><th>Actual ({unit})</th><th>Variance</th><th>Season</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.name}><td>{r.name}</td><td>{r.target}</td><td>{r.actual}</td><td>{varianceChip(r.variancePct).text}</td><td>{r.season}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </DashPanel>
  )
}
