import { Wheat } from 'lucide-react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
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

function CommodityRankingCard({ data, isLoading, error, onRetry }) {
  const chartData = (data ?? []).slice(0, 5).map((c) => ({
    crop_name: c.crop_name,
    total_volume_kg: Number(c.total_volume_kg),
  }))

  return (
    <DashboardCard
      title="Top Commodities by Volume"
      icon={Wheat}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={chartData.length === 0}
      emptyMessage="No production records this year."
      className="lg:col-span-2"
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="commodityGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#1B4D2E" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#1B4D2E" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F0" vertical={false} />
            <XAxis dataKey="crop_name" tick={{ fontSize: 10, fill: '#7A8E7A' }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={yAxisTick}
              tick={{ fontSize: 10, fill: '#7A8E7A' }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={formatKg} />}
              cursor={{ fill: '#F0F4F0' }}
            />
            <Bar
              dataKey="total_volume_kg"
              name="Volume"
              fill="url(#commodityGradient)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

export default CommodityRankingCard
