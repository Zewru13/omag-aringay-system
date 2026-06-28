import { TrendingUp } from 'lucide-react'
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import ChartTooltip from './ChartTooltip.jsx'
import DashboardCard from './DashboardCard.jsx'

function formatKg(v) {
  return `${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Number(v))} kg`
}

function yAxisTick(v) {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`
  return v
}

function ProductionTrendCard({ data, isLoading, error, onRetry }) {
  const chartData = (data ?? []).map((t) => ({
    year: t.year,
    total_volume_kg: Number(t.total_volume_kg),
  }))

  const isEmpty = chartData.length === 0 || chartData.every((d) => !d.total_volume_kg)

  return (
    <DashboardCard
      title="5-Year Production Trend"
      icon={TrendingUp}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={isEmpty}
      emptyMessage="No production records in the last 5 years."
      className="lg:col-span-4"
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="trendGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B4D2E" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#1B4D2E" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F0" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: '#7A8E7A' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={yAxisTick}
              tick={{ fontSize: 10, fill: '#7A8E7A' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={formatKg} />}
              cursor={{ stroke: '#E2E8E2' }}
            />
            <Area
              type="monotone"
              dataKey="total_volume_kg"
              name="Volume"
              stroke="#1B4D2E"
              strokeWidth={2.5}
              fill="url(#trendGradient)"
              dot={{ r: 4, fill: '#1B4D2E', strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#1B4D2E', strokeWidth: 0 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

export default ProductionTrendCard
