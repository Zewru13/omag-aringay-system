import { useEffect, useState } from 'react'
import { AlertTriangle, BarChart2, CloudLightning, Clock, Leaf, Sprout } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import WelcomeBand from '../../components/dashboard/WelcomeBand.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { DonutCard, HarvestBarsCard } from './HomeChartCards.jsx'
import fetchAllPages from './fetchAllPages.js'
import { disasterSlices, harvestBars, statusSlices } from './homeCharts.js'

// Home tab of the farmer phone shell: four summary tiles, an attention card and one card per active crop, laid
// out like the fisherfolk phone Home. Presentation only - it reads the own-record-scoped endpoints the Crop
// pages already use (the backend limits every list to this farmer's records), and each action opens the existing
// page that does the work. The figures are the ones the older farmer home showed.

const ACTIVE_CROPS = 'Planted,Near Harvest'
const rows = (res) => (Array.isArray(res.data) ? res.data : (res.data?.results || []))

function StatTile({ value, label }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-crop-300 bg-cz-crop-pale px-[15px] py-[16px]">
      <p className="text-[22px] font-bold leading-[1.15] text-cz-crop-header">{value}</p>
      <p className="mt-2.5 text-[11.5px] text-cz-text-2">{label}</p>
    </div>
  )
}

function CropCard({ rec, suggestion, onOpen, onDisaster }) {
  const season = [rec.season, rec.year].filter(Boolean).join(' ')
  const area = rec.area_planted_ha != null ? Number(rec.area_planted_ha).toFixed(2) : '—'
  const nearHarvest = rec.status === 'Near Harvest'
  return (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
      <div className="flex items-start gap-3 px-[16px] py-[16px]">
        <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px] bg-cz-crop-pale">
          <Leaf size={18} className="text-cz-crop-header" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-cz-text">{rec.crop_type_name || 'Crop'}{season ? ` — ${season}` : ''}</p>
          <p className="mt-0.5 truncate text-[11px] text-cz-text-2">{area} ha · {rec.farm_location_barangay || '—'}</p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold ${
            nearHarvest ? 'bg-cz-status-warn-bg text-cz-status-warn-fg' : 'bg-cz-crop-pale text-cz-crop-header'
          }`}>{nearHarvest ? 'Near harvest' : 'Active'}</span>
        </div>
      </div>

      <div className="flex gap-2 border-t-[0.5px] border-cz-border px-[16px] py-3">
        <button
          type="button"
          onClick={onOpen}
          className="flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-2 py-[9px] transition-colors hover:bg-cz-page"
        >
          <span className="whitespace-nowrap text-[11.5px] font-semibold text-cz-text">Open crop</span>
        </button>
        <button
          type="button"
          onClick={onDisaster}
          className="flex flex-1 items-center justify-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-2 py-[9px] transition-opacity hover:opacity-90"
        >
          <AlertTriangle size={13} className="shrink-0 text-cz-danger-accent" aria-hidden="true" />
          <span className="whitespace-nowrap text-[11.5px] font-semibold text-cz-danger-accent">Report disaster</span>
        </button>
      </div>

      {suggestion && (
        <div className="border-t border-cz-crop-300 bg-cz-soft-crop px-[16px] py-[12px]">
          <p className="text-[12px] font-bold text-cz-text">Activity suggestion</p>
          <p className="mt-1 text-[11px] leading-[1.4] text-cz-text-2">{suggestion.activity_name} is recommended next.</p>
        </div>
      )}
    </div>
  )
}

export default function FarmerPhoneHome() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [active, setActive] = useState([])
  const [harvestedThisMonth, setHarvestedThisMonth] = useState(0)
  const [harvestedArea, setHarvestedArea] = useState(0)
  const [parcelCount, setParcelCount] = useState(0)
  const [crops, setCrops] = useState([])             // every crop record, any status (the charts count them all)
  const [disasters, setDisasters] = useState([])
  const [suggestions, setSuggestions] = useState({})   // crop id -> [{ activity_name, status, day_after_planting }]

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [allCrops, parcelRes, disasterRes] = await Promise.all([
          fetchAllPages('/production/monitoring/', { status: 'Planted,Near Harvest,Harvested,Total Loss' }),
          api.get('/farmers/me/parcels/').catch(() => null),
          api.get('/production/disaster-logs/').catch(() => null),
        ])
        const activeRows = allCrops.filter((r) => ACTIVE_CROPS.split(',').includes(r.status))
        const harvestedRows = allCrops.filter((r) => r.status === 'Harvested')
        const found = await Promise.all(activeRows.map((rec) =>
          api.get(`/production/monitoring/${rec.id}/suggestions/`)
            .then((res) => [rec.id, res.data.suggestions || []])
            .catch(() => [rec.id, []])))
        if (cancelled) return
        const now = new Date()
        setActive(activeRows)
        setCrops(allCrops)
        setDisasters(disasterRes ? rows(disasterRes) : [])
        setHarvestedArea(harvestedRows.reduce((sum, r) => sum + (Number(r.area_planted_ha) || 0), 0))
        setHarvestedThisMonth(harvestedRows.filter((r) => {
          const d = r.actual_harvest_date ? new Date(r.actual_harvest_date) : null
          return d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
        }).length)
        setParcelCount(parcelRes ? rows(parcelRes).length : 0)
        setSuggestions(Object.fromEntries(found))
      } catch {
        if (!cancelled) showToast('Failed to load your crops.', 'error')
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Total area counts every crop record the farmer has (active and harvested), as the older farmer home did.
  const totalArea = active.reduce((sum, r) => sum + (Number(r.area_planted_ha) || 0), 0) + harvestedArea
  // One suggestion per crop: the most pressing not-yet-done activity (overdue, then due now, then upcoming).
  const ORDER = { overdue: 0, due_now: 1, upcoming: 2 }
  const suggestionFor = (rec) => (suggestions[rec.id] || [])
    .filter((s) => s.status in ORDER)
    .sort((x, y) => ORDER[x.status] - ORDER[y.status] || x.day_after_planting - y.day_after_planting)[0]
  const needsAttention = active.filter((rec) => (suggestions[rec.id] || []).some((s) => s.status === 'overdue' || s.status === 'due_now'))

  return (
    <PageLayout title="Home">
      <WelcomeBand
        className="mb-3"
        theme="crop"
        title={user?.linked_record?.label ? `Welcome, ${user.linked_record.label}` : 'Welcome'}
        subtitle={`Farmer account · ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
      />
      {isLoading ? (
        <p className="text-[15px] italic text-cz-text-2">Loading your crops…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={parcelCount} label="Farm parcels" />
            <StatTile value={active.length} label="Active crops" />
            <StatTile value={`${totalArea.toFixed(totalArea % 1 === 0 ? 0 : 1)} ha`} label="Total area" />
            <StatTile value={harvestedThisMonth} label="Harvests this month" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <DonutCard icon={Sprout} accent="#2D7A4F" title="My crops by stage" slices={statusSlices(crops)} unit="crops" emptyText="No crops to chart yet." />
            <HarvestBarsCard
              icon={BarChart2}
              title="Harvest vs estimate"
              hint="Latest harvested crops, in kg"
              bars={harvestBars(crops.filter((r) => r.status === 'Harvested'), {
                nameOf: (r) => r.crop_type_name || 'Crop', estimateKey: 'estimated_yield_kg', actualKey: 'actual_yield_kg', dateOf: (r) => r.actual_harvest_date,
              })}
              color="#1B4D2E"
              emptyText="Harvest results appear here once a crop is harvested."
            />
            <DonutCard icon={CloudLightning} accent="#B4531B" title="Disasters by type" slices={disasterSlices(disasters)} unit="reports" emptyText="You have not logged any disasters." />
          </div>

          {needsAttention.length > 0 && (
            <div className="rounded-[12px] border border-cz-crop-300 bg-cz-soft-crop px-[15px] py-[15px]">
              <div className="flex items-center gap-3">
                <Clock size={20} className="shrink-0 text-cz-crop-header" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[15px] font-bold leading-[1.3] text-cz-text">
                    {needsAttention.length === 1 ? '1 crop needs attention' : `${needsAttention.length} crops need attention`}
                  </p>
                  <p className="mt-1 text-[11.5px] text-cz-text-2">Some activities are due today or overdue.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => navigate('/crop-monitoring')}
                className="mt-3 w-full rounded-[8px] bg-cz-crop-header px-5 py-[11px] transition-opacity hover:opacity-90"
              >
                <span className="text-[13px] font-semibold text-white">View</span>
              </button>
            </div>
          )}

          {active.length === 0 ? (
            <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4 text-[13px] italic text-cz-text-muted">
              You have no active crops yet. Your crops appear here once the office registers them.
            </p>
          ) : (
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {active.map((rec) => (
                <CropCard
                  key={rec.id}
                  rec={rec}
                  suggestion={suggestionFor(rec)}
                  onOpen={() => navigate(`/crop-monitoring?record=${rec.id}`)}
                  onDisaster={() => navigate(`/disaster?crop=${rec.id}`)}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  )
}
