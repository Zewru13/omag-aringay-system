import { useCallback, useEffect, useMemo, useState } from 'react'
import { Anchor, History, Plus } from 'lucide-react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import Button from '../../components/UI/Button.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import FisheriesRecordsPage from '../FisheriesRecords/FisheriesRecordsPage.jsx'
import FisheriesHistoryModal from './FisheriesHistoryModal.jsx'
import LogCatchModal from './LogCatchModal.jsx'
import LogFisheriesDisasterModal from './LogFisheriesDisasterModal.jsx'
import LogGovernmentAssistanceModal from './LogGovernmentAssistanceModal.jsx'
import LogVesselInspectionModal from './LogVesselInspectionModal.jsx'

const DISASTER_STATUS_TONES = { Reported: 'amber', Verified: 'green', Closed: 'slate' }
const VESSEL_STATUS_TONES  = { Valid: 'green', 'Expiring Soon': 'amber', Expired: 'rose' }
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

const VESSEL_COLUMNS = [
  { key: 'fisherfolk_name',        label: 'Fisherfolk' },
  { key: 'license_number',         label: 'License No.' },
  { key: 'inspection_date_fmt',    label: 'Inspection Date' },
  { key: 'license_expiry_date_fmt', label: 'License Expiry' },
  { key: 'vessel_condition',       label: 'Condition' },
  { key: 'license_status_pill',    label: 'License Status' },
  { key: 'remarks',                label: 'Remarks' },
]

const ASSISTANCE_COLUMNS = [
  { key: 'date_received_fmt',                 label: 'Date Received' },
  { key: 'fisherfolk_name',                   label: 'Fisherfolk Name' },
  { key: 'fisherfolk_lgu_registration_number', label: 'LGU Reg. No.' },
  { key: 'fisherfolk_barangay',               label: 'Barangay' },
  { key: 'assistance_type',                   label: 'Assistance Type' },
  { key: 'source_agency',                     label: 'Source of Assistance' },
  { key: 'quantity',                          label: 'Quantity / Amount' },
  { key: 'remarks',                           label: 'Remarks' },
  { key: 'recorded_by_name',                  label: 'Recorded By' },
  { key: 'date_recorded_fmt',                 label: 'Date Recorded' },
]

const DISASTER_COLUMNS = [
  { key: 'fisherfolk_name',      label: 'Fisherfolk' },
  { key: 'report_date_fmt',      label: 'Report Date' },
  { key: 'disaster_type',        label: 'Type' },
  { key: 'affected_barangay',    label: 'Barangay' },
  { key: 'estimated_loss_php',   label: 'Est. Loss (₱)' },
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
  const [searchParams, setSearchParams] = useSearchParams()
  const subTab = searchParams.get('tab') || 'stocking'
  const setSubTab = (tab) => setSearchParams({ tab }, { replace: true })

  const [barangay, setBarangay] = useState('')
  const [year, setYear]     = useState('')

  const [catchLogs, setCatchLogs]       = useState([])
  const [catchSummary, setCatchSummary] = useState(null)
  const [isLoadingCatch, setIsLoadingCatch] = useState(false)
  const [errorCatch, setErrorCatch]     = useState('')

  const [vesselInspections, setVesselInspections]     = useState([])
  const [isLoadingVessel, setIsLoadingVessel]         = useState(false)
  const [errorVessel, setErrorVessel]                 = useState('')

  const [disasters, setDisasters]             = useState([])
  const [isLoadingDisasters, setIsLoadingDisasters] = useState(false)
  const [errorDisasters, setErrorDisasters]   = useState('')

  const [assistance, setAssistance]               = useState([])
  const [isLoadingAssistance, setIsLoadingAssistance] = useState(false)
  const [errorAssistance, setErrorAssistance]     = useState('')
  const [assistanceSearch, setAssistanceSearch]   = useState('')
  const [assistanceBarangay, setAssistanceBarangay] = useState('')
  const [assistanceSource, setAssistanceSource]   = useState('')
  const [assistanceType, setAssistanceType]       = useState('')

  const [showAddCatch, setShowAddCatch]         = useState(false)
  const [showFisheriesHistory, setShowFisheriesHistory] = useState(false)
  const [showLogVessel, setShowLogVessel]       = useState(false)
  const [showLogDisaster, setShowLogDisaster]   = useState(false)
  const [showLogAssistance, setShowLogAssistance] = useState(false)

  const fetchCatch = useCallback(async () => {
    setIsLoadingCatch(true); setErrorCatch('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const [logsRes, summaryRes] = await Promise.all([
        api.get(`/fisheries/fishing-trips/?${params}`),
        api.get(`/fisheries/fishing-trips/summary/?${params}`),
      ])
      setCatchLogs(Array.isArray(logsRes.data) ? logsRes.data : (logsRes.data.results || []))
      setCatchSummary(summaryRes.data)
    } catch { setErrorCatch('Failed to load catch logs.') }
    finally { setIsLoadingCatch(false) }
  }, [barangay, year])

  const fetchVesselInspections = useCallback(async () => {
    setIsLoadingVessel(true); setErrorVessel('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      const r = await api.get(`/fisheries/vessel-inspections/?${params}`)
      setVesselInspections(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorVessel('Failed to load vessel inspections.') }
    finally { setIsLoadingVessel(false) }
  }, [barangay])

  const fetchDisasters = useCallback(async () => {
    setIsLoadingDisasters(true); setErrorDisasters('')
    try {
      const params = new URLSearchParams()
      if (barangay) params.set('barangay', barangay)
      if (year) params.set('year', year)
      const r = await api.get(`/monitoring/fisherfolk-disasters/?${params}`)
      setDisasters(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorDisasters('Failed to load disaster reports.') }
    finally { setIsLoadingDisasters(false) }
  }, [barangay, year])

  const fetchAssistance = useCallback(async () => {
    setIsLoadingAssistance(true); setErrorAssistance('')
    try {
      const params = new URLSearchParams()
      if (year) params.set('year', year)
      if (assistanceBarangay) params.set('barangay', assistanceBarangay)
      if (assistanceSearch) params.set('search', assistanceSearch)
      if (assistanceSource) params.set('source_of_assistance', assistanceSource)
      if (assistanceType) params.set('assistance_type', assistanceType)
      const r = await api.get(`/fisheries/fisheries-assistance/?${params}`)
      setAssistance(Array.isArray(r.data) ? r.data : (r.data.results || []))
    } catch { setErrorAssistance('Failed to load assistance records.') }
    finally { setIsLoadingAssistance(false) }
  }, [year, assistanceBarangay, assistanceSearch, assistanceSource, assistanceType])

  useEffect(() => { if (subTab === 'capture') fetchCatch() }, [subTab, fetchCatch])
  useEffect(() => { if (subTab === 'capture') fetchVesselInspections() }, [subTab, fetchVesselInspections])
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

  const vesselData = useMemo(() => vesselInspections.map((v) => ({
    ...v,
    inspection_date_fmt: formatDate(v.inspection_date),
    license_expiry_date_fmt: formatDate(v.license_expiry_date),
    license_status_pill: (
      <StatusPill tone={VESSEL_STATUS_TONES[v.license_status] || 'slate'}>{v.license_status}</StatusPill>
    ),
  })), [vesselInspections])

  const assistanceData = useMemo(() => assistance.map((a) => ({
    ...a,
    quantity: a.quantity != null ? Number(a.quantity).toLocaleString() : '—',
    date_received_fmt: formatDate(a.date_received),
    date_recorded_fmt: formatDate(a.date_recorded),
  })), [assistance])

  const assistanceByType = useMemo(() => {
    const map = new Map()
    assistance.forEach((a) => {
      const key = a.assistance_type || 'Unknown'
      map.set(key, (map.get(key) || 0) + 1)
    })
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }))
  }, [assistance])

  const assistanceBySource = useMemo(() => {
    const map = new Map()
    assistance.forEach((a) => {
      const key = a.source_of_assistance || 'Unknown'
      map.set(key, (map.get(key) || 0) + 1)
    })
    return Array.from(map.entries()).map(([label, value]) => ({ label, value }))
  }, [assistance])

  const totalAssistanceQuantity = useMemo(
    () => assistance.reduce((sum, a) => sum + (parseFloat(a.quantity) || 0), 0),
    [assistance],
  )

  const disasterData = useMemo(() => disasters.map((d) => ({
    ...d,
    report_date_fmt:    formatDate(d.report_date),
    estimated_loss_php: d.estimated_loss_php ? `₱${Number(d.estimated_loss_php).toLocaleString()}` : '—',
    status_pill: <StatusPill tone={DISASTER_STATUS_TONES[d.status] || 'slate'}>{d.status}</StatusPill>,
  })), [disasters])

  return (
    <PageLayout
      title="Fisheries Monitoring"
      subtitle="Stocking & culture, capture fishing, vessel inspections, assistance, and disaster reports"
    >
      <div className="space-y-5">
        {/* Filters + Actions — not applicable to Stocking & Culture, which has its own filter bar */}
        {subTab !== 'stocking' && (
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
                  <Button variant="outline" onClick={() => setShowLogVessel(true)}>
                    <Anchor size={15} className="mr-1" /> Log Vessel Inspection
                  </Button>
                  <Button onClick={() => setShowAddCatch(true)}>
                    <Plus size={15} className="mr-1" /> Log Catch
                  </Button>
                </>
              )}
              {subTab === 'disasters' && (
                <Button onClick={() => setShowLogDisaster(true)}>
                  <Plus size={15} className="mr-1" /> Log Disaster
                </Button>
              )}
              {subTab === 'assistance' && (
                <Button onClick={() => setShowLogAssistance(true)}>
                  <Plus size={15} className="mr-1" /> Log Government Assistance
                </Button>
              )}
            </div>
          </div>
        )}

        <SubTabBar
          options={[
            { value: 'stocking',   label: 'Stocking & Culture' },
            { value: 'capture',    label: 'Capture & Vessels' },
            { value: 'assistance', label: 'Assistance' },
            { value: 'disasters',  label: 'Fisherfolk Disasters' },
          ]}
          value={subTab}
          onChange={setSubTab}
        />

        {/* Stocking & Culture — the existing FisheriesRecordsPage, mounted as-is */}
        {subTab === 'stocking' && <FisheriesRecordsPage asTab />}

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
                  label="Estimated Value"
                  value={`₱${Number(catchSummary.totals?.total_value_php || 0).toLocaleString()}`}
                  sub="Total market value"
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

            <div>
              <p className="text-sm font-semibold text-slate-700 mb-2">Vessel Inspections</p>
              {errorVessel
                ? <ErrorMessage message={errorVessel} />
                : <DataTable columns={VESSEL_COLUMNS} data={vesselData} isLoading={isLoadingVessel} />
              }
            </div>
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
                  label="Est. Total Loss"
                  value={`₱${Number(disasters.reduce((s, d) => s + (parseFloat(d.estimated_loss_php) || 0), 0)).toLocaleString()}`}
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
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-5">
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
                placeholder="Search fisherfolk or LGU no."
                value={assistanceSearch}
                onChange={(e) => setAssistanceSearch(e.target.value)}
              />
              <BarangaySelect value={assistanceBarangay} onChange={(e) => setAssistanceBarangay(e.target.value)} includeAllOption />
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
                placeholder="Source of assistance"
                value={assistanceSource}
                onChange={(e) => setAssistanceSource(e.target.value)}
              />
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
                placeholder="Assistance type"
                value={assistanceType}
                onChange={(e) => setAssistanceType(e.target.value)}
              />
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm focus:border-[#1E4620] focus:outline-none"
                value={year}
                onChange={(e) => setYear(e.target.value)}
              >
                <option value="">All Years</option>
                {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>

            {assistance.length > 0 && (
              <>
                <div className="flex flex-wrap gap-3">
                  <MetricCard label="Total Records" value={assistance.length} />
                  <MetricCard
                    label="Total Quantity Distributed"
                    value={totalAssistanceQuantity.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                  />
                </div>

                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">Beneficiaries by Assistance Type</p>
                    <div className="space-y-1">
                      {assistanceByType.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{item.label}</span>
                          <span className="font-semibold text-slate-800">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <p className="text-sm font-semibold text-slate-700 mb-2">Beneficiaries by Source of Assistance</p>
                    <div className="space-y-1">
                      {assistanceBySource.map((item) => (
                        <div key={item.label} className="flex items-center justify-between text-sm">
                          <span className="text-slate-600">{item.label}</span>
                          <span className="font-semibold text-slate-800">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </>
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
      {showLogVessel && (
        <LogVesselInspectionModal onClose={() => setShowLogVessel(false)} onSuccess={fetchVesselInspections} />
      )}
      {showLogDisaster && (
        <LogFisheriesDisasterModal onClose={() => setShowLogDisaster(false)} onSuccess={fetchDisasters} />
      )}
      {showLogAssistance && (
        <LogGovernmentAssistanceModal onClose={() => setShowLogAssistance(false)} onSuccess={fetchAssistance} />
      )}
    </PageLayout>
  )
}
