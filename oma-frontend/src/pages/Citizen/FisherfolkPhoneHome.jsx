import { useEffect, useState } from 'react'
import { AlertTriangle, BarChart2, CloudLightning, Clock, Fish } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import WelcomeBand from '../../components/dashboard/WelcomeBand.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { DonutCard, HarvestBarsCard } from './HomeChartCards.jsx'
import fetchAllPages from './fetchAllPages.js'
import { disasterSlices, harvestBars, statusSlices } from './homeCharts.js'

// Home tab of the fisherfolk phone shell: four summary tiles, an attention card and one card per active
// production cycle, laid out like the farmer's home. Presentation only - it reads the same own-record-scoped
// endpoints the Fisheries pages already use (the backend limits every list to this fisherfolk's records),
// and each action opens the existing screen that does the work.

const ACTIVE_STATUSES = 'Stocked,Near Harvest'

const rows = (res) => (Array.isArray(res.data) ? res.data : (res.data?.results || []))
const total = (res, fallback) => (typeof res.data?.count === 'number' ? res.data.count : fallback)

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function StatTile({ value, label }) {
  return (
    <div className="rounded-[12px] border-[0.5px] border-cz-fish-300 bg-cz-fish-pale px-[15px] py-[16px]">
      <p className="text-[22px] font-bold leading-[1.15] text-cz-fish-header">{value}</p>
      <p className="mt-2.5 text-[11.5px] text-cz-text-2">{label}</p>
    </div>
  )
}

// One status chip per cycle: Force Harvest (a pond/cage awaits it) outranks Near Harvest, which outranks Stocked.
function StatusChip({ rec }) {
  const tone = rec.force_harvest
    ? { cls: 'bg-cz-status-bad-bg text-cz-status-bad-fg', text: 'Force harvest' }
    : rec.status === 'Near Harvest' || rec.is_near_harvest
      ? { cls: 'bg-cz-status-warn-bg text-cz-status-warn-fg', text: 'Near harvest' }
      : { cls: 'bg-cz-fish-pale text-cz-fish-header', text: rec.status || 'Stocked' }
  return (
    <span className={`inline-block rounded-full px-2.5 py-[3px] text-[10.5px] font-semibold ${tone.cls}`}>{tone.text}</span>
  )
}

function CycleCard({ rec, onOpen, onDisaster }) {
  const title = [rec.species_name, rec.production_cycle_no ? `Cycle #${rec.production_cycle_no}` : null].filter(Boolean).join(' — ')
  const units = rec.number_of_units
  const place = [rec.culture_type, rec.pond_location_barangay].filter(Boolean).join(' · ')
  const est = rec.estimated_harvest_kg != null ? `${Number(rec.estimated_harvest_kg).toLocaleString()} kg` : '—'
  return (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
      <div className="flex items-start gap-3 px-[16px] py-[16px]">
        <span className="flex h-[36px] w-[36px] shrink-0 items-center justify-center rounded-[9px] bg-cz-fish-pale">
          <Fish size={18} className="text-cz-fish-header" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[15px] font-semibold text-cz-text">{title || 'Production cycle'}</p>
          <p className="mt-0.5 truncate text-[11px] text-cz-text-2">
            {place || '—'}{units ? ` · ${units} ${units === 1 ? 'pond/cage' : 'ponds/cages'}` : ''}
          </p>
          <div className="mt-2"><StatusChip rec={rec} /></div>
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t-[0.5px] border-cz-border px-[16px] py-3 text-[11.5px]">
        <div>
          <dt className="text-cz-text-2">Expected harvest</dt>
          <dd className="mt-0.5 font-semibold text-cz-text">{formatDate(rec.expected_harvest_date)}</dd>
        </div>
        <div>
          <dt className="text-cz-text-2">Estimated harvest</dt>
          <dd className="mt-0.5 font-semibold text-cz-text">{est}</dd>
        </div>
      </dl>

      <div className="flex gap-2 border-t-[0.5px] border-cz-border px-[16px] py-3">
        <button
          type="button"
          onClick={() => onOpen(rec)}
          className="flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-2 py-[9px] transition-colors hover:bg-cz-page"
        >
          <span className="whitespace-nowrap text-[11.5px] font-semibold text-cz-text">Open cycle</span>
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
    </div>
  )
}

export default function FisherfolkPhoneHome() {
  const navigate = useNavigate()
  const { user } = useAuth()
  const { showToast } = useToast()
  const [isLoading, setIsLoading] = useState(true)
  const [active, setActive] = useState([])
  const [activeCount, setActiveCount] = useState(0)
  const [harvestedCount, setHarvestedCount] = useState(0)
  const [openDisasters, setOpenDisasters] = useState(0)
  const [stocks, setStocks] = useState([])           // every production cycle record, any status (the charts count them all)
  const [disasters, setDisasters] = useState([])

  useEffect(() => {
    let cancelled = false
    Promise.all([
      api.get('/fisheries/stocking/', { params: { status: ACTIVE_STATUSES } }),
      api.get('/fisheries/stocking/', { params: { status: 'Harvested' } }),
      api.get('/fisheries/disaster-reports/'),
      fetchAllPages('/fisheries/stocking/', { status: 'Stocked,Near Harvest,Late,Harvested,Total Loss' }),
    ]).then(([activeRes, harvestedRes, disasterRes, allStocks]) => {
      if (cancelled) return
      setStocks(allStocks)
      setDisasters(rows(disasterRes))
      const activeRows = rows(activeRes)
      setActive(activeRows)
      setActiveCount(total(activeRes, activeRows.length))
      setHarvestedCount(total(harvestedRes, rows(harvestedRes).length))
      setOpenDisasters(rows(disasterRes).filter((d) => d.status === 'Active').length)
    }).catch(() => {
      if (!cancelled) showToast('Failed to load your production cycles.', 'error')
    }).finally(() => {
      if (!cancelled) setIsLoading(false)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unitCount = active.reduce((sum, r) => sum + (Number(r.number_of_units) || 0), 0)
  const needsAttention = active.filter((r) => r.force_harvest || r.is_near_harvest || r.status === 'Near Harvest')
  const openCycle = (rec) => navigate(`/fisheries-monitoring?cycle=${rec.production_cycle}`)

  return (
    <PageLayout title="Home">
      <WelcomeBand
        className="mb-3"
        theme="fisheries"
        title={user?.linked_record?.label ? `Welcome, ${user.linked_record.label}` : 'Welcome'}
        subtitle={`Fisherfolk account · ${new Date().toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}`}
      />
      {isLoading ? (
        <p className="text-[15px] italic text-cz-text-2">Loading your production cycles…</p>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile value={activeCount} label="Active cycles" />
            <StatTile value={unitCount} label="Ponds and cages" />
            <StatTile value={harvestedCount} label="Harvested cycles" />
            <StatTile value={openDisasters} label="Open disasters" />
          </div>

          <div className="grid gap-3 lg:grid-cols-3">
            <DonutCard icon={Fish} accent="#155E82" title="My cycles by stage" slices={statusSlices(stocks)} unit="cycles" emptyText="No production cycles to chart yet." />
            <HarvestBarsCard
              icon={BarChart2}
              title="Harvest vs estimate"
              hint="Latest harvested cycles, in kg"
              bars={harvestBars(stocks.filter((r) => r.status === 'Harvested'), {
                nameOf: (r) => r.species_name || 'Cycle', estimateKey: 'estimated_harvest_kg', actualKey: 'total_harvested_kg', dateOf: (r) => r.actual_harvest_date,
              })}
              color="#155E82"
              emptyText="Harvest results appear here once a cycle is harvested."
            />
            <DonutCard icon={CloudLightning} accent="#B4531B" title="Disasters by type" slices={disasterSlices(disasters)} unit="reports" emptyText="You have not logged any disasters." />
          </div>

          {needsAttention.length > 0 && (
            <div className="rounded-[12px] border border-cz-fish-300 bg-cz-soft-info px-[15px] py-[15px]">
              <div className="flex items-center gap-3">
                <Clock size={20} className="shrink-0 text-cz-fish-header" aria-hidden="true" />
                <div className="min-w-0">
                  <p className="text-[15px] font-bold leading-[1.3] text-cz-text">
                    {needsAttention.length === 1 ? '1 cycle needs attention' : `${needsAttention.length} cycles need attention`}
                  </p>
                  <p className="mt-1 text-[11.5px] text-cz-text-2">Near harvest, or a pond or cage is waiting for a force harvest.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => openCycle(needsAttention[0])}
                className="mt-3 w-full rounded-[8px] bg-cz-fish-header px-5 py-[11px] transition-opacity hover:opacity-90"
              >
                <span className="text-[13px] font-semibold text-white">View</span>
              </button>
            </div>
          )}

          {active.length === 0 ? (
            <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4">
              <p className="text-[13px] italic text-cz-text-muted">You have no active production cycles yet.</p>
              <button
                type="button"
                onClick={() => navigate('/fisheries-monitoring')}
                className="mt-3 w-full rounded-[8px] bg-cz-fish-header px-5 py-[11px] transition-opacity hover:opacity-90"
              >
                <span className="text-[13px] font-semibold text-white">Start a production cycle</span>
              </button>
            </div>
          ) : (
            <div className="space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0">
              {active.map((rec) => (
                <CycleCard key={rec.id} rec={rec} onOpen={openCycle} onDisaster={() => navigate(`/disaster?stock=${rec.id}`)} />
              ))}
              {activeCount > active.length && (
                <button
                  type="button"
                  onClick={() => navigate('/fisheries-monitoring')}
                  className="w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-5 py-[11px] transition-colors hover:bg-cz-page lg:col-span-2"
                >
                  <span className="text-[13px] font-semibold text-cz-text">See all {activeCount} cycles</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </PageLayout>
  )
}
