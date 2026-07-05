import { CloudRain } from 'lucide-react'
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

function SeasonalComparisonCard({ data, isLoading, error, onRetry }) {
  const dryVol = Number(data?.dry_season?.total_volume_kg ?? 0)
  const wetVol = Number(data?.wet_season?.total_volume_kg ?? 0)

  const chartData = [
    { season: 'Dry Season', volume: dryVol },
    { season: 'Wet Season', volume: wetVol },
  ]

  return (
    <DashboardCard
      title="Seasonal Comparison"
      icon={CloudRain}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={dryVol === 0 && wetVol === 0}
      emptyMessage="No seasonal production records this year."
      className="lg:col-span-2"
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="seasonGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#4CAF50" stopOpacity={0.9} />
                <stop offset="100%" stopColor="#4CAF50" stopOpacity={0.15} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
            <XAxis dataKey="season" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis
              tickFormatter={yAxisTick}
              tick={{ fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              width={40}
            />
            <Tooltip
              content={<ChartTooltip valueFormatter={formatKg} />}
              cursor={{ fill: '#f1f5f9' }}
            />
            <Bar
              dataKey="volume"
              name="Volume"
              fill="url(#seasonGradient)"
              radius={[8, 8, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

export default SeasonalComparisonCard
