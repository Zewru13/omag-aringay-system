import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Calendar, ChevronLeft, ChevronRight, Sprout, TrendingUp, Users } from 'lucide-react'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BARANGAYS from '../../constants/barangays.js'
import api from '../../api/axiosInstance.js'

// ── Panel wrapper ─────────────────────────────────────────────────────────────

function Panel({ title, headerRight, children }) {
  return (
    <div className="bg-white border border-[#E2E8E2] rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[#F0F4F0]">
        <div className="flex items-center gap-2">
          <span className="w-2.5 h-2.5 rounded-sm bg-[#1B4D2E]" />
          <h3 className="text-[13px] font-semibold text-[#1A2B1A]">{title}</h3>
        </div>
        {headerRight}
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

// ── Stat Cards ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, label, value, sub, accentColor }) {
  return (
    <div
      className="bg-white border border-[#E2E8E2] rounded-xl p-[18px_20px] border-l-4"
      style={{ borderLeftColor: accentColor }}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="w-8 h-8 rounded-lg bg-[#EBF5EE] flex items-center justify-center flex-shrink-0">
          <Icon size={16} className="text-[#1B4D2E]" />
        </div>
        <span className="text-[12px] text-[#7A8E7A]">{label}</span>
      </div>
      <p className="text-[28px] font-bold text-[#1A2B1A] leading-none">{value}</p>
      <p className="text-[12px] text-[#7A8E7A] mt-1.5">{sub}</p>
    </div>
  )
}

// ── Harvest Calendar ──────────────────────────────────────────────────────────

function HarvestCalendar({ events }) {
  const today = new Date()
  const [viewYear,  setViewYear]  = useState(today.getFullYear())
  const [viewMonth, setViewMonth] = useState(today.getMonth())

  const firstDayOfWeek = new Date(viewYear, viewMonth, 1).getDay()
  const daysInMonth    = new Date(viewYear, viewMonth + 1, 0).getDate()

  const todayStr = today.toISOString().slice(0, 10)

  const upcomingDates = useMemo(() => new Set(
    events
      .filter(e => e.type === 'upcoming'
        && new Date(e.date).getFullYear() === viewYear
        && new Date(e.date).getMonth()    === viewMonth)
      .map(e => new Date(e.date).getDate())
  ), [events, viewYear, viewMonth])

  const overdueDates = useMemo(() => new Set(
    events
      .filter(e => e.type === 'overdue'
        && new Date(e.date).getFullYear() === viewYear
        && new Date(e.date).getMonth()    === viewMonth)
      .map(e => new Date(e.date).getDate())
  ), [events, viewYear, viewMonth])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1) }
    else setViewMonth(m => m + 1)
  }

  const monthName = new Date(viewYear, viewMonth, 1).toLocaleDateString('en-US', { month: 'long' })

  const cells = []
  for (let i = 0; i < firstDayOfWeek; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)

  const dayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  const isToday = (d) => {
    if (!d) return false
    const cellStr = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    return cellStr === todayStr
  }

  return (
    <div>
      {/* Month navigation */}
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-[#F0F4F0]">
          <ChevronLeft size={16} className="text-[#7A8E7A]" />
        </button>
        <span className="text-sm font-semibold text-[#1A2B1A]">{monthName} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-[#F0F4F0]">
          <ChevronRight size={16} className="text-[#7A8E7A]" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map(d => (
          <div key={d} className="text-center text-xs text-[#7A8E7A] font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => (
          <div key={i} className="flex flex-col items-center py-1">
            <span
              className={[
                'text-xs rounded-lg w-7 h-7 flex items-center justify-center',
                day === null ? '' :
                isToday(day) ? 'font-bold text-[#1B4D2E]' :
                'text-[#4A5E4A]',
              ].join(' ')}
            >
              {day}
            </span>
            {day && upcomingDates.has(day) && (
              <span className="block w-1.5 h-1.5 rounded-full bg-[#2D7A4F] mt-0.5" />
            )}
            {day && overdueDates.has(day) && !upcomingDates.has(day) && (
              <span className="block w-1.5 h-1.5 rounded-full bg-[#C0392B] mt-0.5" />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 border-t border-[#F0F4F0] pt-2">
        <span className="flex items-center gap-1 text-xs text-[#7A8E7A]">
          <span className="w-2 h-2 rounded-full bg-[#2D7A4F]" />
          Upcoming Harvest
        </span>
        <span className="flex items-center gap-1 text-xs text-[#7A8E7A]">
          <span className="w-2 h-2 rounded-full bg-[#C0392B]" />
          Overdue Harvest
        </span>
      </div>
    </div>
  )
}

// ── Crop Distribution Analysis ────────────────────────────────────────────────

const selectCls = 'rounded-lg border border-[#E2E8E2] bg-white px-2 py-1 text-xs text-[#4A5E4A] focus:outline-none focus:ring-2 focus:ring-[#1B4D2E]/30'

function CropDistributionAnalysisPanel({ detail }) {
  const crops = useMemo(() => [...new Set(detail.map(d => d.crop))].sort(), [detail])

  const [selBarangay, setSelBarangay] = useState('')
  const [selCrop,     setSelCrop]     = useState('')

  const chartData = useMemo(() => {
    let filtered = detail
    if (selBarangay) filtered = filtered.filter(d => d.barangay === selBarangay)
    if (selCrop)     filtered = filtered.filter(d => d.crop === selCrop)
    const groups = {}
    filtered.forEach(d => {
      const key = selBarangay ? d.crop : d.barangay.replace('Brgy. ', '').replace('Barangay ', '')
      groups[key] = (groups[key] || 0) + d.count
    })
    return Object.entries(groups).map(([label, count]) => ({ label, count }))
  }, [detail, selBarangay, selCrop])

  const totalBarangays = selBarangay ? 1 : (selCrop
    ? new Set(detail.filter(d => d.crop === selCrop).map(d => d.barangay)).size
    : new Set(detail.map(d => d.barangay)).size)
  const totalCrops = selCrop ? 1 : (selBarangay
    ? new Set(detail.filter(d => d.barangay === selBarangay).map(d => d.crop)).size
    : crops.length)

  const headerRight = (
    <div className="flex items-center gap-2">
      <select value={selBarangay} onChange={e => setSelBarangay(e.target.value)} className={selectCls}>
        <option value="">Barangay: All</option>
        {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <select value={selCrop} onChange={e => setSelCrop(e.target.value)} className={selectCls}>
        <option value="">Crop: All</option>
        {crops.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )

  return (
    <Panel title="Crop Distribution Analysis" headerRight={headerRight}>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-[#7A8E7A]">No crop records yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#F0F4F0" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#7A8E7A' }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#7A8E7A' }} allowDecimals={false} />
            <Tooltip
              formatter={(v) => [v, 'Crop Records']}
              contentStyle={{
                fontSize: 13,
                background: '#fff',
                border: '1px solid #E2E8E2',
                borderRadius: 8,
                padding: '6px 12px',
                boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
                color: '#1A2B1A',
              }}
            />
            <Bar dataKey="count" fill="#1B4D2E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <p className="text-xs text-[#7A8E7A] mt-2">
        ● Total Barangays: <strong className="text-[#1A2B1A]">{totalBarangays}</strong>
        &nbsp;&nbsp;
        ● Total Crops: <strong className="text-[#1A2B1A]">{totalCrops}</strong>
      </p>
    </Panel>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/production/dashboard/agri/')
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  const totalAssoc     = loading ? '—' : (data?.total_associations  ?? 0)
  const totalCrop      = loading ? '—' : (data?.total_crop_records  ?? 0)
  const nearingHarvest = loading ? '—' : (data?.nearing_harvest     ?? 0)
  const topBarangay    = loading ? '—' : (data?.top_barangay        || '—')
  const harvestDates   = data?.harvest_dates    || data?.harvest_calendar || []
  const distDetail     = data?.crop_distribution_detail || []

  const subtitle = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  return (
    <PageLayout title="Dashboard" subtitle={subtitle}>
      <div className="space-y-6">
        {/* 4 stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            label="Total Associations"
            value={totalAssoc}
            sub="Active farmer groups"
            accentColor="#1B4D2E"
          />
          <StatCard
            icon={Sprout}
            label="Total Crop Records"
            value={totalCrop}
            sub="Planted crops"
            accentColor="#2D7A4F"
          />
          <StatCard
            icon={Calendar}
            label="Nearing Harvest"
            value={nearingHarvest}
            sub="Within 7 days"
            accentColor="#D97706"
          />
          <StatCard
            icon={TrendingUp}
            label="Top Performing Barangay"
            value={topBarangay}
            sub="By area planted"
            accentColor="#4B6EA8"
          />
        </div>

        {/* Calendar + Crop Distribution */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Panel title="Harvest Calendar">
              <HarvestCalendar events={harvestDates} />
            </Panel>
          </div>
          <div className="lg:col-span-2">
            <CropDistributionAnalysisPanel detail={distDetail} />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}
