import { Fish } from 'lucide-react'
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts'
import ChartTooltip from './ChartTooltip.jsx'
import DashboardCard from './DashboardCard.jsx'

const SECTOR_COLORS = ['#4CAF50', '#0d9488', '#64748b']

function FisherfolkSectorCard({ data, isLoading, error, onRetry }) {
  const chartData = [
    { name: 'Aquaculture', value: data?.aquaculture ?? 0 },
    { name: 'Capture', value: data?.capture ?? 0 },
    { name: 'Vendor', value: data?.vendor ?? 0 },
  ]

  const total = chartData.reduce((sum, d) => sum + d.value, 0)

  return (
    <DashboardCard
      title="Fisherfolk Sector Breakdown"
      icon={Fish}
      isLoading={isLoading}
      error={error}
      onRetry={onRetry}
      isEmpty={total === 0}
      emptyMessage="No fisherfolk registered yet."
      className="lg:col-span-2"
    >
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={chartData}
              cx="50%"
              cy="50%"
              innerRadius={55}
              outerRadius={80}
              paddingAngle={3}
              dataKey="value"
            >
              {chartData.map((entry, index) => (
                <Cell key={entry.name} fill={SECTOR_COLORS[index]} />
              ))}
            </Pie>
            <Tooltip content={<ChartTooltip />} />
            <Legend iconType="circle" wrapperStyle={{ fontSize: '11px', color: '#64748b' }} />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </DashboardCard>
  )
}

export default FisherfolkSectorCard
