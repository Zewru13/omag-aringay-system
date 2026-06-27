import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Calendar, ChevronLeft, ChevronRight, Sprout, TrendingUp, Users } from 'lucide-react'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BARANGAYS from '../../constants/barangays.js'
import api from '../../api/axiosInstance.js'

// ── Stat Cards ────────────────────────────────────────────────────────────────

function StatCard({ icon: Icon, iconBg, iconColor, label, value, sub }) {
  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 flex items-start gap-3 shadow-sm">
      <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div>
        <p className="text-2xl font-bold text-slate-900">{value}</p>
        <p className="text-xs text-slate-500 mt-0.5">{label}</p>
        <p className="text-xs text-slate-400">{sub}</p>
      </div>
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
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      {/* Panel header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="w-3 h-3 rounded-sm bg-[#1E4620]" />
        <div>
          <p className="text-sm font-semibold text-slate-900">Harvest Calendar</p>
          <p className="text-xs text-slate-400">Upcoming harvest schedules</p>
        </div>
      </div>

      {/* Month navigation */}
      <div className="flex items-center justify-between mb-2">
        <button type="button" onClick={prevMonth} className="p-1 rounded hover:bg-slate-100">
          <ChevronLeft size={16} className="text-slate-500" />
        </button>
        <span className="text-sm font-semibold text-slate-900">{monthName} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="p-1 rounded hover:bg-slate-100">
          <ChevronRight size={16} className="text-slate-500" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map(d => (
          <div key={d} className="text-center text-xs text-slate-400 font-medium py-1">{d}</div>
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
                isToday(day) ? 'font-bold text-[#1E4620]' :
                'text-slate-600',
              ].join(' ')}
            >
              {day}
            </span>
            {day && upcomingDates.has(day) && (
              <span className="block w-1.5 h-1.5 rounded-full bg-[#4CAF50] mt-0.5" />
            )}
            {day && overdueDates.has(day) && !upcomingDates.has(day) && (
              <span className="block w-1.5 h-1.5 rounded-full bg-rose-500 mt-0.5" />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 border-t border-slate-100 pt-2">
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-[#4CAF50]" />
          Upcoming Harvest
        </span>
        <span className="flex items-center gap-1 text-xs text-slate-500">
          <span className="w-2 h-2 rounded-full bg-rose-500" />
          Overdue Harvest
        </span>
      </div>
    </div>
  )
}

// ── Crop Distribution Analysis ────────────────────────────────────────────────

const selectCls = 'rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#1E4620]/30'

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

  return (
    <div className="bg-white rounded-xl border border-slate-100 p-4 shadow-sm">
      {/* Header */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="w-3 h-3 flex-shrink-0 rounded-sm bg-[#1E4620]" />
          <p className="text-sm font-semibold text-slate-900">Crop Distribution Analysis</p>
        </div>
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
      </div>

      {/* Chart */}
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-400">No crop records yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#757575' }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#757575' }} allowDecimals={false} />
            <Tooltip formatter={(v) => [v, 'Crop Records']} contentStyle={{ fontSize: 12 }} />
            <Bar dataKey="count" fill="#1E4620" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      {/* Totals */}
      <p className="text-xs text-slate-500 mt-2">
        ● Total Barangays: <strong>{totalBarangays}</strong>
        &nbsp;&nbsp;
        ● Total Crops: <strong>{totalCrops}</strong>
      </p>
    </div>
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

  return (
    <PageLayout title="Dashboard" subtitle="Overview of agricultural data for Aringay, La Union">
      <div className="space-y-6">
        {/* 4 stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={Users}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            label="Total Associations"
            value={totalAssoc}
            sub="Active farmer groups"
          />
          <StatCard
            icon={Sprout}
            iconBg="bg-green-100"
            iconColor="text-green-600"
            label="Total Crop Records"
            value={totalCrop}
            sub="Planted crops"
          />
          <StatCard
            icon={Calendar}
            iconBg="bg-amber-100"
            iconColor="text-amber-600"
            label="Nearing Harvest"
            value={nearingHarvest}
            sub="Within 7 days"
          />
          <StatCard
            icon={TrendingUp}
            iconBg="bg-blue-100"
            iconColor="text-blue-600"
            label="Top Performing Barangay"
            value={topBarangay}
            sub="By area planted"
          />
        </div>

        {/* Calendar + Crop Distribution */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <HarvestCalendar events={harvestDates} />
          </div>
          <div className="lg:col-span-2">
            <CropDistributionAnalysisPanel detail={distDetail} />
          </div>
        </div>
      </div>
    </PageLayout>
  )
}