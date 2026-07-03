import { useCallback, useEffect, useMemo, useState } from 'react'
import { Eye, Plus, History } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import Tabs from '../../components/UI/Tabs.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import AddCropMonitoringModal from './AddCropMonitoringModal.jsx'
import AquacultureCycleDetailModal from './AquacultureCycleDetailModal.jsx'
import BarangayCropDetailModal from './BarangayCropDetailModal.jsx'
import CropHistoricalModal from './CropHistoricalModal.jsx'
import CropMonitoringDetailModal from './CropMonitoringDetailModal.jsx'
import EncodeBarangayReportModal from './EncodeBarangayReportModal.jsx'
import FisheriesHistoryModal from './FisheriesHistoryModal.jsx'
import LogCatchModal from './LogCatchModal.jsx'
import LogFisheriesDisasterModal from './LogFisheriesDisasterModal.jsx'
import StartProductionCycleModal from './StartProductionCycleModal.jsx'

const TABS = [
  { label: 'Crop Forecasting & Monitoring', value: 'crop' },
  { label: 'Fisheries Monitoring', value: 'fisheries' },
]

const STATUS_TONES = { Active: 'green', Harvested: 'blue', Damaged: 'rose', Abandoned: 'slate' }
const ALERT_COLORS = { None: '#757575', Low: '#2D7A4F', Medium: '#f57c00', High: '#E65100' }
const SUBMISSION_TONES = { Draft: 'slate', Submitted: 'amber', Verified: 'green', 'Not Submitted': 'rose' }
const CYCLE_STATUS_TONES = { Active: 'green', Harvested: 'blue', Failed: 'rose', Abandoned: 'slate' }
const DISASTER_STATUS_TONES = { Reported: 'amber', Verified: 'green', Closed: 'slate' }

const CURRENT_YEAR = new Date().getFullYear()
const SEASONS = ['Dry', 'Wet']
const YEARS = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

function formatDate(v) {
  if (!v) return '—'
  return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(v))
}

const BARANGAY_SUMMARY_COLUMNS = [
  { key: 'barangay', label: 'Barangay' },
  { key: 'crop_name', label: 'Crop' },
  { key: 'season_year', label: 'Season / Year' },
  { key: 'area_planted_ha', label: 'Area (ha)' },
  { key: 'number_of_farmers', label: 'Farmers' },
  { key: 'stage_pill', label: 'Stage' },
  { key: 'alert_chip', label: 'Alert' },
  { key: 'status_pill', label: 'Status' },
  { key: 'actions', label: '' },
]

const CROP_COLUMNS = [
  { key: 'farmer_name', label: 'Farmer' },
  { key: 'farmer_barangay', label: 'Barangay' },
  { key: 'crop_type_name', label: 'Crop' },
  { key: 'season_year', label: 'Season / Year' },
  { key: 'date_planted_fmt', label: 'Planted' },
  { key: 'expected_harvest_fmt', label: 'Expected Harvest' },
  { key: 'estimated_yield_cell', label: 'Est. Yield (kg)' },
  { key: 'status_pill', label: 'Status' },
  { key: 'condition_cell', label: 'Condition' },
  { key: 'variance_pct', label: 'Variance %' },
  { key: 'actions', label: '' },
]

const CATCH_COLUMNS = [
  { key: 'fisherfolk_name', label: 'Fisherfolk' },
  { key: 'fisherfolk_type', label: 'Type' },
  { key: 'trip_date_fmt', label: 'Trip Date' },
  { key: 'fishing_ground', label: 'Ground' },
  { key: 'gear_used', label: 'Gear' },
  { key: 'total_catch_kg', label: 'Catch (kg)' },
  { key: 'top_species_cell', label: 'Top Species' },
  { key: 'hours_at_sea_fmt', label: 'Hrs at Sea' },
  { key: 'fuel_liters_fmt', label: 'Fuel (L)' },
]

const CYCLE_COLUMNS = [
  { key: 'fisherfolk_name', label: 'Fisherfolk' },
  { key: 'fisherfolk_barangay', label: 'Barangay' },
  { key: 'species_farmed', label: 'Species' },
  { key: 'stocking_date_fmt', label: 'Date Stocked' },
  { key: 'target_harvest_fmt', label: 'Expected Harvest' },
  { key: 'harvest_volume_cell', label: 'Harvested (kg)' },
  { key: 'status_pill', label: 'Status' },
  { key: 'actions', label: '' },
]

const DISASTER_COLUMNS = [
  { key: 'fisherfolk_name', label: 'Fisherfolk' },
  { key: 'report_date_fmt', label: 'Report Date' },
  { key: 'disaster_type', label: 'Type' },
  { key: 'affected_barangay', label: 'Barangay' },
  { key: 'estimated_loss_vol', label: 'Vol. Lost (kg)' },
  { key: 'status_pill', label: 'Status' },
]

function MetricCard({ label, value, sub, accent }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 10, padding: '14px 18px',
      border: '1px solid #e0e0e0', flex: 1, minWidth: 130,
    }}>
      <div style={{ fontSize: 11, color: '#9e9e9e', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: accent || '#212121' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#757575', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function PillToggle({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 0, borderRadius: 10, overflow: 'hidden', border: '1px solid #e0e0e0', width: 'fit-content' }}>
      {options.map(opt => (
        <button
          key={opt.value}
          onClick={() => onChange(opt.value)}
          style={{
            padding: '8px 20px', fontSize: 13, fontWeight: 600, border: 'none', cursor: 'pointer',
            background: value === opt.value ? '#1B4D2E' : '#fff',
            color: value === opt.value ? '#fff' : '#555',
            transition: 'background 0.15s',
          }}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}

export default function MonitoringPage() {
  const { isAdmin } = useAuth()
  const [tab, setTab] = useState('crop')
  const [barangay, setBarangay] = useState('')
  const [year, setYear] = useState('')

  // Crop sub-tab
  const [cropSubTab, setCropSubTab] = useState('barangay')
  const [cropStatusFilter, setCropStatusFilter] = useState('All')

  // Barangay crop filter state
  const [bcsFilterSeason, setBcsFilterSeason] = useState('')
  const [bcsFilterYear, setBcsFilterYear] = useState(CURRENT_YEAR)
  const [bcsFilterCrop, setBcsFilterCrop] = useState('')

  const [barangaySummaries, setBarangaySummaries] = useState([])
  const [municipalityDashboard, setMunicipalityDashboard] = useState(null)
  const [isLoadingBcs, setIsLoadingBcs] = useState(false)
  const [errorBcs, setErrorBcs] = useState('')

  const [cropRecords, setCropRecords] = useState([])
  const [isLoadingCrop, setIsLoadingCrop] = useState(false)
  const [errorCrop, setErrorCrop] = useState('')

  // Fisheries sub-tab
  const [fisheriesSubTab, setFisheriesSubTab] = useState('capture')

  const [catchLogs, setCatchLogs] = useState([])
  const [catchSummary, setCatchSummary] = useState(null)
  const [isLoadingCatch, setIsLoadingCatch] = useState(false)
  const [errorCatch, setErrorCatch] = useState('')

  const [aquaCycles, setAquaCycles] = useState([])
  const [isLoadingAqua, setIsLoadingAqua] = useState(false)
  const [errorAqua, setErrorAqua] = useState('')

  const [disasters, setDisasters] = useState([])
  const [isLoadingDisasters, setIsLoadingDisasters] = useState(false)
  const [errorDisasters, setErrorDisasters] = useState('')

  // Modal state
  const [showAddCrop, setShowAddCrop] = useState(false)
  const [showAddBarangay, setShowAddBarangay] = useState(false)
  const [showAddCatch, setShowAddCatch] = useState(false)
  const [showCropHistory, setShowCropHistory] = useState(false)
  const [showFisheriesHistory, setShowFisheriesHistory] = useState(false)
  const [showStartCycle, setShowStartCycle] = useState(false)
  const [showLogDisaster, setShowLogDisaster] = useState(false)
  const [detailRecord, setDetailRecord] = useState(null)
  const [detailBarangay, setDetailBarangay] = useState(null)
  const [detailCycle, setDetailCycle] = useState(null)

  // ── Fetch: Barangay Crop Summaries ──────────────────────────────────────────
  const fetchBarangaySummaries = useCallback(async () => {
    setIsLoadingBcs(true); setErrorBcs('')
    try {
      const params = new URLSearchParams()
      if (bcsFilterSeason) params.set('season', bcsFilterSeason)
      if (bcsFilterYear) params.set('year', bcsFilterYear)
      if (bcsFilterCrop) params.set('crop_name', bcsFilterCrop)
      if (barangay) params.set('barangay', barangay)
      const r = await api.get(`/production/barangay-crop-summary/?${params}`)
      setBarangaySummaries(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorBcs('Failed to load barangay crop summaries.') }
    finally { setIsLoadingBcs(false) }
  }, [bcsFilterSeason, bcsFilterYear, bcsFilterCrop, barangay])

  const fetchMunicipalityDashboard = useCallback(async () => {
    try {
      const params = new URLSearchParams()
      if (bcsFilterSeason) params.set('season', bcsFilterSeason)
      if (bcsFilterYear) params.set('year', bcsFilterYear)
      const r = await api.get(`/production/analytics/municipality-crops/?${params}`)
      setMunicipalityDashboard(r.data)
    } catch { /* non-blocking */ }
  }, [bcsFilterSeason, bcsFilterYear])

  const fetchCrop = useCallback(async () => {
    setIsLoadingCrop(true); setErrorCrop('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      if (cropStatusFilter !== 'All') params.set('status', cropStatusFilter)
      const r = await api.get(`/production/monitoring/?${params}`)
      setCropRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorCrop('Failed to load crop monitoring records.') }
    finally { setIsLoadingCrop(false) }
  }, [barangay, year, cropStatusFilter])

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
      const r = await api.get(`/monitoring/aquaculture-cycles/?${params}`)
      setAquaCycles(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorAqua('Failed to load aquaculture cycles.') }
    finally { setIsLoadingAqua(false) }
  }, [barangay])

  const fetchDisasters = useCallback(async () => {
    setIsLoadingDisasters(true); setErrorDisasters('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      const r = await api.get(`/monitoring/disasters/?${params}`)
      setDisasters(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorDisasters('Failed to load disaster reports.') }
    finally { setIsLoadingDisasters(false) }
  }, [barangay])

  useEffect(() => {
    if (tab === 'crop' && cropSubTab === 'barangay') {
      fetchBarangaySummaries()
      fetchMunicipalityDashboard()
    }
  }, [tab, cropSubTab, fetchBarangaySummaries, fetchMunicipalityDashboard])

  useEffect(() => {
    if (tab === 'crop' && cropSubTab === 'individual') fetchCrop()
  }, [tab, cropSubTab, fetchCrop])

  useEffect(() => {
    if (tab === 'fisheries' && fisheriesSubTab === 'capture') fetchCatch()
  }, [tab, fisheriesSubTab, fetchCatch])

  useEffect(() => {
    if (tab === 'fisheries' && fisheriesSubTab === 'aquaculture') fetchAquaCycles()
  }, [tab, fisheriesSubTab, fetchAquaCycles])

  useEffect(() => {
    if (tab === 'fisheries' && fisheriesSubTab === 'disasters') fetchDisasters()
  }, [tab, fisheriesSubTab, fetchDisasters])

  // ── Summary cards computed from individual crop records ──────────────────────
  const cropSummaryCards = useMemo(() => {
    const planted = cropRecords.filter(r => r.status === 'Active').length
    const forHarvest = cropRecords.filter(r => r.is_near_harvest).length
    const variances = cropRecords
      .filter(r => r.yield_variance_pct != null)
      .map(r => parseFloat(r.yield_variance_pct))
    const avgVariance = variances.length
      ? (variances.reduce((a, b) => a + b, 0) / variances.length).toFixed(1)
      : null
    return { planted, forHarvest, total: cropRecords.length, avgVariance }
  }, [cropRecords])

  // ── Memoized table data ──────────────────────────────────────────────────────
  const barangaySummaryData = useMemo(() => barangaySummaries.map(r => ({
    ...r,
    season_year: `${r.season} ${r.year}`,
    area_planted_ha: Number(r.area_planted_ha).toFixed(4),
    stage_pill: r.current_growth_stage
      ? <StatusPill tone="blue">{r.current_growth_stage}</StatusPill>
      : '—',
    alert_chip: (
      <span style={{
        fontSize: 11, padding: '2px 8px', borderRadius: 12, fontWeight: 600,
        background: (ALERT_COLORS[r.alert_level] || '#757575') + '22',
        color: ALERT_COLORS[r.alert_level] || '#757575',
      }}>
        {r.alert_level}
      </span>
    ),
    status_pill: (
      <StatusPill tone={SUBMISSION_TONES[r.submission_status] || 'slate'}>
        {r.submission_status}
      </StatusPill>
    ),
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1B4D2E] hover:bg-[#EBF5EE]"
        onClick={() => setDetailBarangay(r)}
      >
        <Eye size={13} /> View
      </button>
    ),
  })), [barangaySummaries])

  const COND_COLORS = { Good: '#2D7A4F', Fair: '#FFB300', Poor: '#D32F2F' }

  const cropData = useMemo(() => cropRecords.map((r) => ({
    ...r,
    season_year: `${r.season} ${r.year}`,
    date_planted_fmt: formatDate(r.date_planted),
    expected_harvest_fmt: r.expected_harvest_date ? (
      <span className={r.is_near_harvest ? 'font-semibold text-amber-600' : ''}>
        {formatDate(r.expected_harvest_date)}
        {r.is_near_harvest && ' ⚠'}
      </span>
    ) : '—',
    estimated_yield_cell: r.estimated_yield_kg
      ? `${Number(r.estimated_yield_kg).toLocaleString()} kg`
      : '—',
    status_pill: <StatusPill tone={STATUS_TONES[r.status] || 'slate'}>{r.status}</StatusPill>,
    condition_cell: r.latest_condition ? (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12 }}>
        <span style={{ width: 8, height: 8, borderRadius: '50%', background: COND_COLORS[r.latest_condition] || '#9e9e9e', display: 'inline-block' }} />
        {r.latest_condition}
      </span>
    ) : <span style={{ color: '#bdbdbd' }}>—</span>,
    variance_pct: r.yield_variance_pct != null ? (
      <span style={{ color: parseFloat(r.yield_variance_pct) >= 0 ? '#2D7A4F' : '#D32F2F', fontWeight: 600 }}>
        {parseFloat(r.yield_variance_pct).toFixed(1)}%
      </span>
    ) : '—',
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1B4D2E] hover:bg-[#EBF5EE]"
        onClick={() => setDetailRecord(r)}
      >
        <Eye size={13} /> View
      </button>
    ),
  })), [cropRecords])

  const catchData = useMemo(() => catchLogs.map((c) => {
    const entries = c.species_entries || []
    const extra = entries.length > 1 ? entries.length - 1 : 0
    return {
      ...c,
      trip_date_fmt: formatDate(c.trip_date),
      total_catch_kg: c.total_catch_kg != null
        ? `${Number(c.total_catch_kg).toLocaleString()} kg` : '—',
      top_species_cell: c.top_species ? (
        <span style={{ fontSize: 12 }}>
          {c.top_species}
          {extra > 0 && (
            <span style={{
              marginLeft: 5, background: '#EBF5EE', color: '#1B4D2E',
              borderRadius: 10, padding: '1px 6px', fontSize: 10, fontWeight: 600,
            }}>
              +{extra} more
            </span>
          )}
        </span>
      ) : '—',
      hours_at_sea_fmt: c.hours_at_sea != null ? `${Number(c.hours_at_sea).toFixed(1)} h` : '—',
      fuel_liters_fmt: c.fuel_consumption_liters != null
        ? `${Number(c.fuel_consumption_liters).toFixed(1)} L`
        : '—',
    }
  }), [catchLogs])

  const aquaData = useMemo(() => aquaCycles.map(c => ({
    ...c,
    stocking_date_fmt: formatDate(c.stocking_date),
    target_harvest_fmt: c.target_harvest_date ? formatDate(c.target_harvest_date) : '—',
    harvest_volume_cell: c.harvest_volume_kg
      ? `${Number(c.harvest_volume_kg).toLocaleString()} kg`
      : '—',
    status_pill: <StatusPill tone={CYCLE_STATUS_TONES[c.status] || 'slate'}>{c.status}</StatusPill>,
    actions: (
      <button
        type="button"
        className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-[#1B4D2E] hover:bg-[#EBF5EE]"
        onClick={() => setDetailCycle(c)}
      >
        <Eye size={13} /> View
      </button>
    ),
  })), [aquaCycles])

  const disasterData = useMemo(() => disasters.map(d => ({
    ...d,
    report_date_fmt: formatDate(d.report_date),
    estimated_loss_vol: d.volume_lost_kg ? `${Number(d.volume_lost_kg).toLocaleString()} kg` : '—',
    status_pill: <StatusPill tone={DISASTER_STATUS_TONES[d.status] || 'slate'}>{d.status}</StatusPill>,
  })), [disasters])

  const md = municipalityDashboard
  const highAlerts = md?.alerts?.filter(a => a.alert_level === 'High') || []
  const yearOptions = Array.from({ length: 6 }, (_, i) => CURRENT_YEAR - i)

  return (
    <PageLayout title="Monitoring" subtitle="Monitor crop growth, aquaculture cycles, and field activities">
      <div className="space-y-5">
        {/* Global Filters */}
        <div className="flex flex-wrap items-end gap-3">
          <div className="w-48">
            <BarangaySelect value={barangay} onChange={(e) => setBarangay(e.target.value)} includeAllOption />
          </div>
          {tab === 'fisheries' && (
            <div>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1B4D2E] focus:outline-none"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All Years</option>
                {yearOptions.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          )}
          <div className="ml-auto flex gap-2">
            {tab === 'crop' && cropSubTab === 'barangay' && (
              <>
                <Button variant="outline" icon={History} onClick={() => setShowCropHistory(true)}>
                  Historical
                </Button>
                {isAdmin && (
                  <Button icon={Plus} onClick={() => setShowAddBarangay(true)}>Encode Report</Button>
                )}
              </>
            )}
            {tab === 'crop' && cropSubTab === 'individual' && (
              <Button icon={Plus} onClick={() => setShowAddCrop(true)}>Add Record</Button>
            )}
            {tab === 'fisheries' && fisheriesSubTab === 'capture' && (
              <>
                <Button variant="outline" icon={History} onClick={() => setShowFisheriesHistory(true)}>
                  Historical
                </Button>
                <Button icon={Plus} onClick={() => setShowAddCatch(true)}>Log Catch</Button>
              </>
            )}
            {tab === 'fisheries' && fisheriesSubTab === 'aquaculture' && (
              <Button icon={Plus} onClick={() => setShowStartCycle(true)}>Start Cycle</Button>
            )}
            {tab === 'fisheries' && fisheriesSubTab === 'disasters' && (
              <Button icon={Plus} onClick={() => setShowLogDisaster(true)}>Log Disaster</Button>
            )}
          </div>
        </div>

        <Tabs tabs={TABS} activeTab={tab} onChange={setTab} />

        {/* ── Crop Forecasting & Monitoring Tab ─────────────────────────────── */}
        {tab === 'crop' && (
          <div className="space-y-4">
            <PillToggle
              options={[
                { value: 'barangay', label: 'Barangay Reports' },
                { value: 'individual', label: 'Individual Farm Records' },
              ]}
              value={cropSubTab}
              onChange={setCropSubTab}
            />

            {cropSubTab === 'barangay' && (
              <div className="space-y-4">
                {md && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <MetricCard
                      label="Barangays Reported"
                      value={`${md.submission_tracker.submitted} / ${md.submission_tracker.total_barangays}`}
                      sub={`${md.submission_tracker.not_submitted} not submitted`}
                      accent="#1B4D2E"
                    />
                    <MetricCard
                      label="Total Area Planted"
                      value={`${Number(md.total_area_planted_ha || 0).toLocaleString(undefined, { maximumFractionDigits: 2 })} ha`}
                      sub={`${md.by_crop?.length || 0} crops tracked`}
                    />
                    <MetricCard
                      label="Est. Total Yield"
                      value={`${Number(md.total_estimated_yield_kg || 0).toLocaleString()} kg`}
                      sub={md.total_actual_yield_kg != null ? `Actual: ${Number(md.total_actual_yield_kg).toLocaleString()} kg` : 'No harvest data yet'}
                    />
                    <MetricCard
                      label="High Alerts"
                      value={highAlerts.length}
                      sub={highAlerts.length > 0 ? highAlerts.map(a => a.barangay).join(', ') : 'No high alerts'}
                      accent={highAlerts.length > 0 ? '#E65100' : undefined}
                    />
                  </div>
                )}

                {highAlerts.length > 0 && (
                  <div style={{
                    background: '#fff3e0', border: '1px solid #E65100', borderRadius: 8,
                    padding: '10px 16px', fontSize: 13, color: '#E65100',
                  }}>
                    <b>⚠ High Alerts:</b>{' '}
                    {highAlerts.map(a => `${a.barangay} — ${a.crop_name}`).join(' | ')}
                  </div>
                )}

                <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div>
                    <label style={{ fontSize: 11, color: '#9e9e9e', display: 'block', marginBottom: 3 }}>Season</label>
                    <select value={bcsFilterSeason} onChange={e => setBcsFilterSeason(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                      <option value="">All Seasons</option>
                      {SEASONS.map(s => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={{ fontSize: 11, color: '#9e9e9e', display: 'block', marginBottom: 3 }}>Year</label>
                    <select value={bcsFilterYear} onChange={e => setBcsFilterYear(e.target.value)} className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm">
                      <option value="">All Years</option>
                      {YEARS.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </div>

                {errorBcs
                  ? <ErrorMessage message={errorBcs} />
                  : <DataTable columns={BARANGAY_SUMMARY_COLUMNS} data={barangaySummaryData} isLoading={isLoadingBcs} />
                }
              </div>
            )}

            {cropSubTab === 'individual' && (
              <div className="space-y-4">
                {/* Summary cards */}
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  <MetricCard label="Total Records" value={cropSummaryCards.total} sub="All statuses" />
                  <MetricCard label="Planted / Active" value={cropSummaryCards.planted} accent="#1B4D2E" />
                  <MetricCard label="For Harvest (≤14 days)" value={cropSummaryCards.forHarvest} accent="#f57c00" />
                  <MetricCard
                    label="Avg. Yield Variance"
                    value={cropSummaryCards.avgVariance != null ? `${cropSummaryCards.avgVariance}%` : '—'}
                    sub="Harvested records only"
                    accent={cropSummaryCards.avgVariance < 0 ? '#D32F2F' : '#2D7A4F'}
                  />
                </div>

                {/* Status filter pills */}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {['All', 'Active', 'Harvested', 'Damaged', 'Abandoned'].map(s => (
                    <button
                      key={s}
                      onClick={() => setCropStatusFilter(s)}
                      style={{
                        padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
                        border: '1px solid',
                        borderColor: cropStatusFilter === s ? '#1B4D2E' : '#e0e0e0',
                        background: cropStatusFilter === s ? '#EBF5EE' : '#fff',
                        color: cropStatusFilter === s ? '#1B4D2E' : '#555',
                        cursor: 'pointer',
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>

                {errorCrop
                  ? <ErrorMessage message={errorCrop} />
                  : <DataTable columns={CROP_COLUMNS} data={cropData} isLoading={isLoadingCrop} />
                }
              </div>
            )}
          </div>
        )}

        {/* ── Fisheries Monitoring Tab ──────────────────────────────────────── */}
        {tab === 'fisheries' && (
          <div className="space-y-4">
            <PillToggle
              options={[
                { value: 'capture', label: 'Capture Fishing' },
                { value: 'aquaculture', label: 'Aquaculture' },
                { value: 'disasters', label: 'Disasters' },
              ]}
              value={fisheriesSubTab}
              onChange={setFisheriesSubTab}
            />

            {/* Capture Fishing */}
            {fisheriesSubTab === 'capture' && (
              <div className="space-y-4">
                {catchSummary && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
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
                  <div style={{ background: '#fff', borderRadius: 10, padding: '14px 18px', border: '1px solid #e0e0e0' }}>
                    <div style={{ fontWeight: 600, fontSize: 13, marginBottom: 10 }}>Top Species by Volume</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {catchSummary.top_species.slice(0, 10).map((sp, i) => (
                        <div key={sp.species_name} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: '#9e9e9e', width: 16, textAlign: 'right' }}>{i + 1}</span>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 13, fontWeight: 500 }}>{sp.species_name}</div>
                            <div style={{ height: 5, borderRadius: 3, background: '#EBF5EE', marginTop: 3 }}>
                              <div style={{ height: '100%', borderRadius: 3, background: '#2D7A4F', width: `${sp.pct_of_total_catch}%` }} />
                            </div>
                          </div>
                          <span style={{ fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                            {Number(sp.total_volume_kg).toLocaleString()} kg
                          </span>
                          <span style={{ fontSize: 11, color: '#9e9e9e', width: 36, textAlign: 'right' }}>
                            {sp.pct_of_total_catch}%
                          </span>
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
            {fisheriesSubTab === 'aquaculture' && (
              <div className="space-y-4">
                {aquaCycles.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <MetricCard label="Total Cycles" value={aquaCycles.length} />
                    <MetricCard label="Active" value={aquaCycles.filter(c => c.status === 'Active').length} accent="#1B4D2E" />
                    <MetricCard label="Harvested" value={aquaCycles.filter(c => c.status === 'Harvested').length} accent="#1565c0" />
                  </div>
                )}
                {errorAqua
                  ? <ErrorMessage message={errorAqua} />
                  : <DataTable columns={CYCLE_COLUMNS} data={aquaData} isLoading={isLoadingAqua} />
                }
              </div>
            )}

            {/* Disasters */}
            {fisheriesSubTab === 'disasters' && (
              <div className="space-y-4">
                {disasters.length > 0 && (
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                    <MetricCard label="Total Reports" value={disasters.length} />
                    <MetricCard label="Reported" value={disasters.filter(d => d.status === 'Reported').length} accent="#f57c00" />
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
          </div>
        )}
      </div>

      {/* Modals */}
      {showAddBarangay && (
        <EncodeBarangayReportModal
          onClose={() => setShowAddBarangay(false)}
          onSaved={() => { fetchBarangaySummaries(); fetchMunicipalityDashboard(); }}
        />
      )}
      {showCropHistory && (
        <CropHistoricalModal onClose={() => setShowCropHistory(false)} />
      )}
      {showAddCrop && (
        <AddCropMonitoringModal onClose={() => setShowAddCrop(false)} onSuccess={fetchCrop} />
      )}
      {showAddCatch && (
        <LogCatchModal onClose={() => setShowAddCatch(false)} onSuccess={fetchCatch} />
      )}
      {showFisheriesHistory && (
        <FisheriesHistoryModal onClose={() => setShowFisheriesHistory(false)} />
      )}
      {showStartCycle && (
        <StartProductionCycleModal
          onClose={() => setShowStartCycle(false)}
          onSuccess={fetchAquaCycles}
        />
      )}
      {showLogDisaster && (
        <LogFisheriesDisasterModal
          onClose={() => setShowLogDisaster(false)}
          onSuccess={fetchDisasters}
        />
      )}
      {detailRecord && (
        <CropMonitoringDetailModal
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onRefresh={fetchCrop}
        />
      )}
      {detailBarangay && (
        <BarangayCropDetailModal
          record={detailBarangay}
          onClose={() => setDetailBarangay(null)}
          onSaved={() => { fetchBarangaySummaries(); fetchMunicipalityDashboard(); setDetailBarangay(null); }}
        />
      )}
      {detailCycle && (
        <AquacultureCycleDetailModal
          cycle={detailCycle}
          onClose={() => setDetailCycle(null)}
          onRefresh={fetchAquaCycles}
        />
      )}
    </PageLayout>
  )
}
