import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, History, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import AquacultureCycleDetailModal from './AquacultureCycleDetailModal.jsx'
import FisheriesHistoryModal from './FisheriesHistoryModal.jsx'
import LogCatchModal from './LogCatchModal.jsx'
import LogFisheriesDisasterModal from './LogFisheriesDisasterModal.jsx'
import StartProductionCycleModal from './StartProductionCycleModal.jsx'

const CYCLE_STATUS_TONES   = { Active: 'green', Harvested: 'blue', Failed: 'rose', Abandoned: 'slate' }
const DISASTER_STATUS_TONES = { Reported: 'amber', Verified: 'green', Closed: 'slate' }
const CURRENT_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

const CATCH_COLUMNS = [
  { key: 'fisherfolk_name',   label: 'Fisherfolk' },
  { key: 'fisherfolk_type',   label: 'Type' },
  { key: 'trip_date_fmt',     label: 'Trip Date' },
  { key: 'fishing_ground',    label: 'Ground' },
  { key: 'gear_used',         label: 'Gear' },
  { key: 'total_catch_kg',    label: 'Catch (kg)' },
  { key: 'top_species_cell',  label: 'Top Species' },
  { key: 'hours_at_sea_fmt',  label: 'Hrs at Sea' },
  { key: 'fuel_liters_fmt',   label: 'Fuel (L)' },
]

const CYCLE_COLUMNS = [
  { key: 'fisherfolk_name',       label: 'Fisherfolk' },
  { key: 'fisherfolk_barangay',   label: 'Barangay' },
  { key: 'species_farmed',        label: 'Species' },
  { key: 'stocking_date_fmt',     label: 'Date Stocked' },
  { key: 'target_harvest_fmt',    label: 'Expected Harvest' },
  { key: 'harvest_volume_cell',   label: 'Harvested (kg)' },
  { key: 'area_cage_harvested',   label: 'Area/Cage' },
  { key: 'status_pill',           label: 'Status' },
  { key: 'actions',               label: '' },
]

const ASSISTANCE_COLUMNS = [
  { key: 'fisherfolk_name',   label: 'Fisherfolk' },
  { key: 'fisherfolk_type',   label: 'Type' },
  { key: 'assistance_type',   label: 'Assistance Type' },
  { key: 'description',       label: 'Description' },
  { key: 'quantity',          label: 'Quantity' },
  { key: 'date_received_fmt', label: 'Date Received' },
  { key: 'source_agency',     label: 'Source Agency' },
  { key: 'season_year',       label: 'Season/Year' },
]

const DISASTER_COLUMNS = [
  { key: 'fisherfolk_name',      label: 'Fisherfolk' },
  { key: 'report_date_fmt',      label: 'Report Date' },
  { key: 'disaster_type',        label: 'Type' },
  { key: 'affected_barangay',    label: 'Barangay' },
  { key: 'estimated_loss_vol',   label: 'Vol. Lost (kg)' },
  { key: 'status_pill',          label: 'Status' },
]

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

function MetricCard({ label, value, sub, accent }) {
  return (
    <div className="flex-1 min-w-[130px] rounded-xl border border-slate-200 bg-white px-4 py-3.5">
      <div className="text-[11px] text-slate-400 mb-1">{label}</div>
      <div className="text-2xl font-bold" style={{ color: accent || '#212121' }}>{value}</div>
      {sub && <div className="text-xs text-slate-500 mt-0.5">{sub}</div>}
    </div>
  )
}

function SubTabBar({ options, value, onChange }) {
  return (
    <div className="flex w-fit overflow-hidden rounded-xl border border-slate-200">
      {options.map((opt) => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          className={`border-none px-5 py-2 text-sm font-semibold transition-colors cursor-pointer ${
            value === opt.value ? 'bg-[#1E4620] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function FisheriesMonitoringPage() {
  const [subTab, setSubTab] = useState('capture')
  const [barangay, setBarangay] = useState('')
  const [year, setYear]     = useState('')

  const [catchLogs, setCatchLogs]       = useState([])
  const [catchSummary, setCatchSummary] = useState(null)
  const [isLoadingCatch, setIsLoadingCatch] = useState(false)
  const [errorCatch, setErrorCatch]     = useState('')

  const [aquaCycles, setAquaCycles]       = useState([])
  const [isLoadingAqua, setIsLoadingAqua] = useState(false)
  const [errorAqua, setErrorAqua]         = useState('')

  const [disasters, setDisasters]             = useState([])
  const [isLoadingDisasters, setIsLoadingDisasters] = useState(false)
  const [errorDisasters, setErrorDisasters]   = useState('')

  const [assistance, setAssistance]               = useState([])
  const [isLoadingAssistance, setIsLoadingAssistance] = useState(false)
  const [errorAssistance, setErrorAssistance]     = useState('')

  const [showAddCatch, setShowAddCatch]         = useState(false)
  const [showFisheriesHistory, setShowFisheriesHistory] = useState(false)
  const [showStartCycle, setShowStartCycle]     = useState(false)
  const [showLogDisaster, setShowLogDisaster]   = useState(false)
  const [detailCycle, setDetailCycle]           = useState(null)

  const fetchCatch = useCallback(async () => {
    setIsLoadingCatch(true); setErrorCatch('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const [logsRes, summaryRes] = await Promise.all([
        api.get(`/monitoring/fishing-trips/?${params}`),
        api.get(`/monitoring/fishing-trips/summary/?${params}`),
      ])
      setCatchLogs(Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data.results || []))
      setCatchSummary(summaryRes.data)
    } catch { setErrorCatch('Failed to load catch logs.') }
    finally { setIsLoadingCatch(false) }
  }, [barangay, year])

  const fetchAquaCycles = useCallback(async () => {
    setIsLoadingAqua(true); setErrorAqua('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const r = await api.get(`/monitoring/aquaculture-cycles/?${params}`)
      setAquaCycles(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorAqua('Failed to load aquaculture cycles.') }
    finally { setIsLoadingAqua(false) }
  }, [barangay, year])

  const fetchDisasters = useCallback(async () => {
    setIsLoadingDisasters(true); setErrorDisasters('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const r = await api.get(`/monitoring/disasters/?${params}`)
      setDisasters(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorDisasters('Failed to load disaster reports.') }
    finally { setIsLoadingDisasters(false) }
  }, [barangay, year])

  const fetchAssistance = useCallback(async () => {
    setIsLoadingAssistance(true); setErrorAssistance('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const r = await api.get(`/monitoring/fisheries-assistance/?${params}`)
      setAssistance(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorAssistance('Failed to load assistance records.') }
    finally { setIsLoadingAssistance(false) }
  }, [barangay, year])

  useEffect(() => { if (subTab === 'capture') fetchCatch() }, [subTab, fetchCatch])
  useEffect(() => { if (subTab === 'aquaculture') fetchAquaCycles() }, [subTab, fetchAquaCycles])
  useEffect(() => { if (subTab === 'disasters') fetchDisasters() }, [subTab, fetchDisasters])
  useEffect(() => { if (subTab === 'assistance') fetchAssistance() }, [subTab, fetchAssistance])

  const catchData = useMemo(() => catchLogs.map((c) => {
    const entries = c.species_entries || []
    const extra = entries.length > 1 ? entries.length - 1 : 0
    return {
      ...c,
      trip_date_fmt: formatDate(c.trip_date),
      total_catch_kg: c.total_catch_kg != null ? `${Number(c.total_catch_kg).toLocaleString()} kg` : '—',
      top_species_cell: c.top_species ? (
        <span className="text-sm">
          {c.top_species}
          {extra > 0 && (
            <span className="ml-1 rounded-full bg-[#f0f7f0] px-1.5 py-0.5 text-[10px] font-semibold text-[#1E4620]">
              +{extra} more
            </span>
          )}
        </span>
      ) : '—',
      hours_at_sea_fmt: c.hours_at_sea != null ? `${Number(c.hours_at_sea).toFixed(1)} h` : '—',
      fuel_liters_fmt: c.fuel_consumption_liters != null ? `${Number(c.fuel_consumption_liters).toFixed(1)} L` : '—',
    }
  }), [catchLogs])

  const aquaData = useMemo(() => aquaCycles.map((c) => ({
    ...c,
    stocking_date_fmt:   formatDate(c.stocking_date),
    target_harvest_fmt:  c.target_harvest_date ? formatDate(c.target_harvest_date) : '—',
    harvest_volume_cell: c.harvest_volume_kg ? `${Number(c.harvest_volume_kg).toLocaleString()} kg` : '—',
    status_pill: <StatusPill tone={CYCLE_STATUS_TONES[c.status] || 'slate'}>{c.status}</StatusPill>,
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1E4620] hover:bg-[#f0f7f0]"
        onClick={() => setDetailCycle(c)}
      >
        <Eye size={13} /> View
      </button>
    ),
  })), [aquaCycles])

  const assistanceData = useMemo(() => assistance.map((a) => ({
    ...a,
    date_received_fmt: formatDate(a.date_received),
    season_year: a.season ? `${a.season} ${a.year}` : String(a.year),
  })), [assistance])

  const disasterData = useMemo(() => disasters.map((d) => ({
    ...d,
    report_date_fmt:    formatDate(d.report_date),
    estimated_loss_vol: d.volume_lost_kg ? `${Number(d.volume_lost_kg).toLocaleString()} kg` : '—',
    status_pill: <StatusPill tone={DISASTER_STATUS_TONES[d.status] || 'slate'}>{d.status}</StatusPill>,
  })), [disasters])

  return (
    <PageLayout title="Fisheries Monitoring" subtitle="Monitor capture fishing, aquaculture cycles, and disaster reports">
      <div className="space-y-5">
        {/* Filters + Actions */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
          </div>
          <div>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
              value={year}
              onChange={(e) => setYear(e.target.value)}
            >
              <option value="">All Years</option>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div className="ml-auto flex gap-2">
            {subTab === 'capture' && (
              <>
                <Button variant="outline" onClick={() => setShowFisheriesHistory(true)}>
                  <History size={15} className="mr-1" /> Historical
                </Button>
                <Button onClick={() => setShowAddCatch(true)}>
                  <Plus size={15} className="mr-1" /> Log Catch
                </Button>
              </>
            )}
            {subTab === 'aquaculture' && (
              <Button onClick={() => setShowStartCycle(true)}>
                <Plus size={15} className="mr-1" /> Start Cycle
              </Button>
            )}
            {subTab === 'disasters' && (
              <Button onClick={() => setShowLogDisaster(true)}>
                <Plus size={15} className="mr-1" /> Log Disaster
              </Button>
            )}
          </div>
        </div>

        <SubTabBar
          options={[
            { value: 'capture',    label: 'Capture Fishing' },
            { value: 'aquaculture', label: 'Aquaculture' },
            { value: 'disasters',  label: 'Disasters' },
            { value: 'assistance', label: 'Assistance' },
          ]}
          value={subTab}
          onChange={setSubTab}
        />

        {/* Capture Fishing */}
        {subTab === 'capture' && (
          <div className="space-y-4">
            {catchSummary && (
              <div className="flex flex-wrap gap-3">
                <MetricCard
                  label="Total Catch"
                  value={`${Number(catchSummary.totals?.total_volume_kg || 0).toLocaleString()} kg`}
                  sub={`${catchSummary.totals?.trip_count || 0} trips`}
                  accent="#1565c0"
                />
                <MetricCard
                  label="Active Fisherfolk"
                  value={catchSummary.totals?.active_fisherfolk || 0}
                  sub="Unique fisherfolk"
                />
              </div>
            )}

            {catchSummary?.top_species?.length > 0 && (
              <div className="rounded-xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-700 mb-3">Top Species by Volume</p>
                <div className="space-y-2">
                  {catchSummary.top_species.slice(0, 10).map((sp, i) => (
                    <div key={sp.species_name} className="flex items-center gap-2">
                      <span className="w-5 text-right text-[11px] text-slate-400">{i + 1}</span>
                      <div className="flex-1">
                        <div className="text-sm font-medium text-slate-700">{sp.species_name}</div>
                        <div className="mt-1 h-1.5 rounded-full bg-[#e8f5e9]">
                          <div className="h-full rounded-full bg-[#4CAF50]" style={{ width: `${sp.pct_of_total_catch}%` }} />
                        </div>
                      </div>
                      <span className="text-xs text-slate-600 whitespace-nowrap">
                        {Number(sp.total_volume_kg).toLocaleString()} kg
                      </span>
                      <span className="w-9 text-right text-[11px] text-slate-400">{sp.pct_of_total_catch}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {errorCatch
              ? <ErrorMessage message={errorCatch} />
              : <DataTable columns={CATCH_COLUMNS} data={catchData} isLoading={isLoadingCatch} />
            }
          </div>
        )}

        {/* Aquaculture */}
        {subTab === 'aquaculture' && (
          <div className="space-y-4">
            {aquaCycles.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <MetricCard label="Total Cycles" value={aquaCycles.length} />
                <MetricCard label="Active"    value={aquaCycles.filter((c) => c.status === 'Active').length}    accent="#1E4620" />
                <MetricCard label="Harvested" value={aquaCycles.filter((c) => c.status === 'Harvested').length} accent="#1565c0" />
              </div>
            )}
            {errorAqua
              ? <ErrorMessage message={errorAqua} />
              : <DataTable columns={CYCLE_COLUMNS} data={aquaData} isLoading={isLoadingAqua} />
            }
          </div>
        )}

        {/* Disasters */}
        {subTab === 'disasters' && (
          <div className="space-y-4">
            {disasters.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <MetricCard label="Total Reports" value={disasters.length} />
                <MetricCard label="Reported" value={disasters.filter((d) => d.status === 'Reported').length} accent="#f57c00" />
                <MetricCard
                  label="Vol. Lost (kg)"
                  value={Number(disasters.reduce((s, d) => s + (parseFloat(d.volume_lost_kg) || 0), 0)).toLocaleString()}
                />
              </div>
            )}
            {errorDisasters
              ? <ErrorMessage message={errorDisasters} />
              : <DataTable columns={DISASTER_COLUMNS} data={disasterData} isLoading={isLoadingDisasters} />
            }
          </div>
        )}

        {/* Government Assistance */}
        {subTab === 'assistance' && (
          <div className="space-y-4">
            {assistance.length > 0 && (
              <div className="flex flex-wrap gap-3">
                <MetricCard label="Total Records" value={assistance.length} />
                {['Fishing Gear','Boat/Vessel','Fingerlings/Seeds','Feed','Equipment','Cash Assistance','Training'].map((type) => {
                  const count = assistance.filter((a) => a.assistance_type === type).length
                  return count > 0 ? <MetricCard key={type} label={type} value={count} /> : null
                })}
              </div>
            )}
            {errorAssistance
              ? <ErrorMessage message={errorAssistance} />
              : <DataTable columns={ASSISTANCE_COLUMNS} data={assistanceData} isLoading={isLoadingAssistance} />
            }
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddCatch && (
        <LogCatchModal onClose={() => setShowAddCatch(false)} onSuccess={fetchCatch} />
      )}
      {showFisheriesHistory && (
        <FisheriesHistoryModal onClose={() => setShowFisheriesHistory(false)} />
      )}
      {showStartCycle && (
        <StartProductionCycleModal onClose={() => setShowStartCycle(false)} onSuccess={fetchAquaCycles} />
      )}
      {showLogDisaster && (
        <LogFisheriesDisasterModal onClose={() => setShowLogDisaster(false)} onSuccess={fetchDisasters} />
      )}
      {detailCycle && (
        <AquacultureCycleDetailModal cycle={detailCycle} onClose={() => setDetailCycle(null)} onRefresh={fetchAquaCycles} />
      )}
    </PageLayout>
  )
}
