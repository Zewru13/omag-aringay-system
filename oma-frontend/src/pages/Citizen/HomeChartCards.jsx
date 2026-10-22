import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ChartTooltip from '../../components/dashboard/ChartTooltip.jsx'
import { hasBars, hasData, hasMonthly } from './homeCharts.js'

// The chart cards on the farmer, fisherfolk and organization Homes. Each is a small card in the Home's own style:
// a title, the chart, and a plain-text legend or summary under it so the numbers never depend on colour alone.

const GRID = '#E2E8E2'
const AXIS = '#4A5E4A'
const ESTIMATE_COLOR = '#B9C9B9'

function ChartCard({ title, hint, children }) {
  return (
    <section className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-[15px] py-[15px]">
      <h2 className="text-[13px] font-bold text-cz-text">{title}</h2>
      {hint && <p className="mt-0.5 text-[11px] text-cz-text-2">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  )
}

function Empty({ children }) {
  return <p className="rounded-[8px] bg-cz-page px-3 py-6 text-center text-[12px] italic text-cz-text-muted">{children}</p>
}

// A donut with its legend beside it (under it when the card is narrow). `slices` = [{ name, value, color }].
export function DonutCard({ title, hint, slices, emptyText, unit = '' }) {
  if (!hasData(slices)) return <ChartCard title={title} hint={hint}><Empty>{emptyText}</Empty></ChartCard>
  const total = slices.reduce((sum, s) => sum + s.value, 0)
  const summary = slices.map((s) => `${s.name} ${s.value}`).join(', ')
  return (
    <ChartCard title={title} hint={hint}>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div className="relative h-[132px] w-[132px] shrink-0" role="img" aria-label={`${title}: ${summary}`}>
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie data={slices} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={slices.length > 1 ? 2 : 0} stroke="none" isAnimationActive={false}>
                {slices.map((s) => <Cell key={s.name} fill={s.color} />)}
              </Pie>
              <Tooltip content={<ChartTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-[20px] font-bold leading-none text-cz-text">{total}</span>
            {unit && <span className="mt-0.5 text-[10px] text-cz-text-2">{unit}</span>}
          </div>
        </div>
        <ul className="min-w-[120px] flex-1 space-y-1.5">
          {slices.map((s) => (
            <li key={s.name} className="flex items-center gap-2 text-[12px] text-cz-text">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: s.color }} aria-hidden="true" />
              <span className="min-w-0 flex-1 truncate">{s.name}</span>
              <span className="font-semibold tabular-nums">{s.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </ChartCard>
  )
}

const fmtKg = (value) => `${Number(value).toLocaleString(undefined, { maximumFractionDigits: 1 })} kg`

// Estimated against actual harvest, a pair of bars per crop or cycle.
export function HarvestBarsCard({ title, hint, bars, color, emptyText }) {
  if (!hasBars(bars)) return <ChartCard title={title} hint={hint}><Empty>{emptyText}</Empty></ChartCard>
  const summary = bars.map((b) => `${b.name}: estimate ${fmtKg(b.estimate)}, actual ${fmtKg(b.actual)}`).join('; ')
  return (
    <ChartCard title={title} hint={hint}>
      <div className="h-[190px] w-full" role="img" aria-label={`${title}. ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={bars} margin={{ top: 4, right: 4, bottom: 0, left: -18 }} barGap={2}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval={0} tickFormatter={(v) => (v.length > 8 ? `${v.slice(0, 7)}…` : v)} />
            <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} />
            <Tooltip content={<ChartTooltip valueFormatter={fmtKg} />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="estimate" name="Estimate" fill={ESTIMATE_COLOR} radius={[3, 3, 0, 0]} isAnimationActive={false} />
            <Bar dataKey="actual" name="Actual" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="mt-2 flex items-center gap-4 text-[11px] text-cz-text-2">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: ESTIMATE_COLOR }} aria-hidden="true" />Estimate</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} aria-hidden="true" />Actual</span>
      </div>
    </ChartCard>
  )
}

// A count per month of one year.
export function MonthlyBarsCard({ title, hint, months, color, emptyText }) {
  if (!hasMonthly(months)) return <ChartCard title={title} hint={hint}><Empty>{emptyText}</Empty></ChartCard>
  const summary = months.filter((m) => m.value > 0).map((m) => `${m.month} ${m.value}`).join(', ')
  return (
    <ChartCard title={title} hint={hint}>
      <div className="h-[170px] w-full" role="img" aria-label={`${title}: ${summary}`}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={months} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={{ stroke: GRID }} interval={0} tickFormatter={(v) => v.slice(0, 1)} />
            <YAxis tick={{ fontSize: 10, fill: AXIS }} tickLine={false} axisLine={false} allowDecimals={false} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
            <Bar dataKey="value" name="Records" fill={color} radius={[3, 3, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  )
}
