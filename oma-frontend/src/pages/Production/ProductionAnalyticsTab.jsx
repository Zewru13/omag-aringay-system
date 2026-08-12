// The production analytics that used to live on the dashboard.
//
// Moved here when the dashboard was rebuilt to the staff reference, which has
// no analytics block. Not deleted: /production/dashboard/ and the four
// analytics endpoints below have no other consumer in the app, and the harvest
// calendar exists nowhere else — deleting would have put that data out of
// reach. It sits as a fourth tab on the page that already owns production
// records.

import { useEffect, useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { Calendar, ChevronLeft, ChevronRight, FileText, Fish, Leaf, Sprout, TrendingUp, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import BARANGAYS from '../../constants/barangays.js'
import api from '../../api/axiosInstance.js'
import { Panel, SectionHeading, StatCard } from '../Dashboard/DashboardParts.jsx'

// ── Panel wrapper ─────────────────────────────────────────────────────────────

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
        <button type="button" onClick={prevMonth} className="press-scale p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-2 cursor-pointer" aria-label="Previous month">
          <ChevronLeft size={16} className="text-text-muted" aria-hidden="true" />
        </button>
        <span className="font-display text-[14px] font-semibold text-text-primary">{monthName} {viewYear}</span>
        <button type="button" onClick={nextMonth} className="press-scale p-1.5 rounded-[var(--radius-sm)] hover:bg-surface-2 cursor-pointer" aria-label="Next month">
          <ChevronRight size={16} className="text-text-muted" aria-hidden="true" />
        </button>
      </div>

      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {dayLabels.map(d => (
          <div key={d} className="text-center text-[11px] text-text-muted font-medium py-1">{d}</div>
        ))}
      </div>

      {/* Date grid */}
      <div className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => (
          <div key={i} className="flex flex-col items-center py-1">
            <span
              className={[
                'text-[12px] rounded-[var(--radius-sm)] w-7 h-7 flex items-center justify-center tabular-nums',
                day === null ? '' :
                isToday(day) ? 'font-bold text-primary bg-primary-light' :
                'text-text-secondary',
              ].join(' ')}
            >
              {day}
            </span>
            {day && upcomingDates.has(day) && (
              <span className="block w-1.5 h-1.5 rounded-full bg-[color:var(--color-semantic-safe)] mt-0.5" aria-hidden="true" />
            )}
            {day && overdueDates.has(day) && !upcomingDates.has(day) && (
              <span className="block w-1.5 h-1.5 rounded-full bg-[color:var(--color-semantic-critical)] mt-0.5" aria-hidden="true" />
            )}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 mt-3 border-t border-border pt-2.5">
        <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="w-2 h-2 rounded-full bg-[color:var(--color-semantic-safe)]" aria-hidden="true" />
          Upcoming harvest
        </span>
        <span className="flex items-center gap-1.5 text-[11px] text-text-muted">
          <span className="w-2 h-2 rounded-full bg-[color:var(--color-semantic-critical)]" aria-hidden="true" />
          Overdue harvest
        </span>
      </div>
    </div>
  )
}

// ── Crop Distribution Analysis ────────────────────────────────────────────────

const selectCls = 'rounded-[var(--radius-sm)] border border-border bg-surface px-2 py-1 text-[12px] text-text-secondary focus:outline-none focus:ring-2 focus:ring-primary/30 cursor-pointer'

function CropDistributionAnalysisPanel({ detail, domainLabel = 'Crop', index = 0 }) {
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
        <option value="">{domainLabel}: All</option>
        {crops.map(c => <option key={c} value={c}>{c}</option>)}
      </select>
    </div>
  )

  return (
    <Panel title={`${domainLabel} Distribution Analysis`} headerRight={headerRight} index={index}>
      {chartData.length === 0 ? (
        <p className="py-10 text-center text-[13px] text-text-muted">No {domainLabel.toLowerCase()} records yet.</p>
      ) : (
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 4, right: 10, left: -10, bottom: 60 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#EDEBE3" />
            <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#6B7669' }} angle={-30} textAnchor="end" interval={0} />
            <YAxis tick={{ fontSize: 11, fill: '#6B7669' }} allowDecimals={false} />
            <Tooltip
              formatter={(v) => [v, `${domainLabel} Records`]}
              contentStyle={{
                fontSize: 13,
                fontFamily: 'Public Sans, sans-serif',
                background: '#FFFFFF',
                border: '1px solid #E7E5DE',
                borderRadius: 10,
                padding: '6px 12px',
                boxShadow: '0 4px 12px rgba(22,51,24,0.10)',
                color: '#1C2A1E',
              }}
            />
            <Bar dataKey="count" fill="#1B4D2E" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      )}

      <p className="text-[12px] text-text-muted mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <span>Total barangays: <strong className="text-text-primary font-semibold tabular-nums">{totalBarangays}</strong></span>
        <span>Total {domainLabel.toLowerCase()}s: <strong className="text-text-primary font-semibold tabular-nums">{totalCrops}</strong></span>
      </p>
    </Panel>
  )
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

const filterSelectCls = 'rounded-[var(--radius-sm)] border border-border bg-surface-2 px-3 py-[6px] text-[13px] text-text-secondary focus:border-primary focus:outline-none cursor-pointer'

export default function ProductionAnalyticsTab() {
  const navigate  = useNavigate()
  const [domain,  setDomain]  = useState('crops')
  const [data,    setData]    = useState(null)
  const [loading, setLoading] = useState(true)
  const [season,  setSeason]  = useState('')
  const [year,    setYear]    = useState('')

  useEffect(() => {
    setLoading(true)
    setData(null)
    const params = new URLSearchParams()
    if (domain === 'fisheries') params.set('domain', 'fisheries')
    if (season) params.set('season', season)
    if (year)   params.set('year', year)
    const qs = params.toString()
    api.get(`/production/dashboard/agri/${qs ? `?${qs}` : ''}`)
      .then(r => setData(r.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [domain, season, year])

  const totalAssoc     = loading ? '—' : (data?.total_organizations  ?? 0)
  const totalCrop      = loading ? '—' : (data?.total_crop_records  ?? 0)
  const nearingHarvest = loading ? '—' : (data?.nearing_harvest     ?? 0)
  const topBarangay    = loading ? '—' : (data?.top_barangay        || '—')
  const harvestDates   = data?.harvest_dates    || data?.harvest_calendar || []
  const distDetail     = data?.crop_distribution_detail || []
  const availableYears = data?.available_years || []

  const subtitle = new Date().toLocaleDateString('en-US', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })

  const isFish = domain === 'fisheries'

  return (
    <div className="space-y-6">

        {/* Production — same section rank as "Needs attention" and
            "Registry" above, with the domain/season controls carried in the
            heading row instead of floating as a separate bar. */}
        <SectionHeading
          title="Production"
          hint="Season and yield breakdown across the municipality"
        >
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex overflow-hidden rounded-[var(--radius-sm)] border border-border-strong">
            {[
              { value: 'crops',     label: 'Crops',     Icon: Leaf },
              { value: 'fisheries', label: 'Fisheries', Icon: Fish },
            ].map(({ value, label, Icon }) => (
              <button
                key={value}
                type="button"
                onClick={() => { setDomain(value); setSeason(''); setYear('') }}
                className={`flex items-center gap-1.5 border-none px-5 py-2 text-[13px] font-semibold transition-colors cursor-pointer ${
                  domain === value ? 'bg-primary text-white' : 'bg-surface text-text-secondary hover:bg-surface-2'
                }`}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>

          {/* Season / Year filter bar (no season filter for fisheries — stocking has no season filter) */}
          {!isFish && (
            <select className={filterSelectCls} value={season} onChange={e => setSeason(e.target.value)}>
              <option value="">All Seasons</option>
              <option value="Dry">Dry Season</option>
              <option value="Wet">Wet Season</option>
            </select>
          )}
          <select className={filterSelectCls} value={year} onChange={e => setYear(e.target.value)}>
            <option value="">All Years</option>
            {availableYears.map(y => <option key={y} value={y}>{y}</option>)}
          </select>
          {(season || year) && (
            <button
              type="button"
              className="text-[12px] text-text-muted hover:text-primary transition-colors cursor-pointer"
              onClick={() => { setSeason(''); setYear('') }}
            >
              Clear filters
            </button>
          )}
        </div>
        </SectionHeading>

        {/* 4 stat cards */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {isFish ? (<>
            <StatCard
              index={0}
              icon={Users}
              label="Fisherfolk Organizations"
              value={totalAssoc}
              sub="Active fisherfolk groups · Click to view"
              tone="primary"
              onClick={() => navigate('/fisherfolk?tab=organizations')}
            />
            <StatCard
              index={1}
              icon={Fish}
              label="Active Stocking Records"
              value={totalCrop}
              sub="Currently stocked or for harvest · Click to view"
              tone="accent"
              onClick={() => navigate('/fisheries-monitoring')}
            />
            <StatCard
              index={2}
              icon={Calendar}
              label="Near Harvest"
              value={nearingHarvest}
              sub="Within 14 days · Click to view"
              tone="warning"
              onClick={() => navigate('/fisheries-monitoring')}
            />
            <StatCard
              index={3}
              icon={TrendingUp}
              label="Top Pond Barangay"
              value={topBarangay}
              sub="By total stocking area"
              tone="info"
              onClick={topBarangay && topBarangay !== '—'
                ? () => navigate(`/fisheries-monitoring`)
                : undefined}
            />
          </>) : (<>
            <StatCard
              index={0}
              icon={Users}
              label="Total Organizations"
              value={totalAssoc}
              sub="Active farmer groups · Click to view"
              tone="primary"
              onClick={() => navigate('/farmers?tab=organizations')}
            />
            <StatCard
              index={1}
              icon={Sprout}
              label="Total Crop Records"
              value={totalCrop}
              sub="Active planted crops · Click to view"
              tone="accent"
              onClick={() => navigate('/crop-monitoring')}
            />
            <StatCard
              index={2}
              icon={Calendar}
              label="Nearing Harvest"
              value={nearingHarvest}
              sub="Within 7 days · Click to view"
              tone="warning"
              onClick={() => navigate('/crop-monitoring?filter=for_harvest')}
            />
            <StatCard
              index={3}
              icon={TrendingUp}
              label="Top Performing Barangay"
              value={topBarangay}
              sub="By area planted · Click to filter"
              tone="info"
              onClick={topBarangay && topBarangay !== '—'
                ? () => navigate(`/crop-monitoring?barangay=${encodeURIComponent(topBarangay)}`)
                : undefined}
            />
          </>)}
        </div>

        {/* Calendar + Distribution chart */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <Panel title={isFish ? 'Expected Harvest Calendar' : 'Harvest Calendar'} index={4}>
              <HarvestCalendar events={harvestDates} />
            </Panel>
          </div>
          <div className="lg:col-span-2">
            <CropDistributionAnalysisPanel
              detail={distDetail}
              domainLabel={isFish ? 'Species' : 'Crop'}
              index={5}
            />
          </div>
        </div>
    </div>
  )
}
