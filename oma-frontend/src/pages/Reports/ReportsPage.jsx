import { useEffect, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, Fish, Users, Wheat } from 'lucide-react'
import { Link, useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { ActionButtons, PreviewTable, SignatureModal, labelCls } from './ReportParts.jsx'
import RegisteredReportTab from './RegisteredReportTab.jsx'

// One entry per report: `id` is the ?tab= value that opens it, and the rest feeds its card on the landing page.
// The agreed reports (the Reports page offers exactly these; more are added as they are built):
//   1. Registered Farmers / Fisherfolk / Organizations   2. Crop Records Harvested   3. Fisheries Production Harvested
const TABS = [
  { id: 'registered',          icon: Users,     label: 'Registered Farmers, Fisherfolk & Organizations', description: 'Registration records for everyone at once, filtered by barangay, status and date registered, or for one record.' },
  { id: 'harvested',           icon: Wheat,     label: 'Crop Records Harvested',        description: 'Harvested crop records with their yield, by farmer, crop, barangay and season.' },
  { id: 'fisheries',           icon: Fish,      label: 'Fisheries Production Harvested', description: 'Harvested aquaculture production, by fisherfolk, species, barangay and season.' },
]

// ── Harvested Crop Tab ─────────────────────────────────────────────────────────

function HarvestedCropTab() {
  const { showToast } = useToast()
  const [organizations,  setOrganizations]  = useState([])
  const [cropTypes,     setCropTypes]     = useState([])
  const [allRecords,    setAllRecords]    = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig,       setShowSig]       = useState(false)
  const [sigPurpose,    setSigPurpose]    = useState('pdf')
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', barangay: '', organization: '', crop_name: '', yield_performance: '',
  })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get('/organizations/farmers/'),
      api.get('/production/crop-types/'),
      api.get('/production/monitoring/'),
    ]).then(([aRes, cRes, mRes]) => {
      setOrganizations(Array.isArray(aRes.data) ? aRes.data : (aRes.data.results || []))
      setCropTypes(Array.isArray(cRes.data) ? cRes.data : (cRes.data.results || []))
      const all = Array.isArray(mRes.data) ? mRes.data : (mRes.data.results || [])
      setAllRecords(all.filter(r => r.status === 'Harvested'))
    }).catch(() => showToast('Failed to load preview data.', 'error'))
      .finally(() => setIsLoading(false))
  }, [])

  const filteredRecords = useMemo(() => {
    return allRecords.filter(rec => {
      if (filters.barangay    && rec.farmer_barangay !== filters.barangay) return false
      if (filters.organization && String(rec.farmers_organization) !== String(filters.organization)) return false
      if (filters.crop_name   && !rec.crop_type_name?.toLowerCase().includes(filters.crop_name.toLowerCase())) return false
      if (filters.start_date  && rec.actual_harvest_date && rec.actual_harvest_date < filters.start_date) return false
      if (filters.end_date    && rec.actual_harvest_date && rec.actual_harvest_date > filters.end_date)   return false
      if (filters.yield_performance) {
        const actual    = parseFloat(rec.actual_yield_kg   || 0)
        const estimated = parseFloat(rec.estimated_yield_kg || 0)
        if (estimated <= 0) return false
        const ratio = actual / estimated
        if (filters.yield_performance === 'above'  && ratio <  1.10) return false
        if (filters.yield_performance === 'average' && (ratio < 0.90 || ratio >= 1.10)) return false
        if (filters.yield_performance === 'below'  && ratio >= 0.90) return false
      }
      return true
    })
  }, [allRecords, filters])

  const yieldData = useMemo(() => {
    const byBarangay = {}
    let total = 0
    filteredRecords.forEach(r => {
      const b = r.farmer_barangay || '—'
      const y = parseFloat(r.estimated_yield_kg || 0)
      byBarangay[b] = (byBarangay[b] || 0) + y
      total += y
    })
    const top = Object.keys(byBarangay).reduce(
      (best, b) => (!best || byBarangay[b] > byBarangay[best]) ? b : best, null
    )
    return {
      top_barangay: top || '—',
      total_yield:  total.toLocaleString(undefined, { maximumFractionDigits: 2 }),
      count:        filteredRecords.length,
    }
  }, [filteredRecords])

  const previewRows = filteredRecords.map(rec => [
    rec.farmer_barangay,
    rec.farmer_name,
    rec.organization_name,
    rec.crop_type_name,
    rec.area_planted_ha,
    rec.area_planted_ha,
    rec.expected_harvest_date,
    rec.actual_harvest_date,
    rec.estimated_yield_kg,
  ])

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ format: fmt })
    if (filters.start_date)        p.set('start_date',        filters.start_date)
    if (filters.end_date)          p.set('end_date',          filters.end_date)
    if (filters.barangay)          p.set('barangay',          filters.barangay)
    if (filters.crop_name)         p.set('crop_name',         filters.crop_name)
    if (filters.organization)       p.set('organization',       filters.organization)
    if (filters.yield_performance) p.set('yield_performance', filters.yield_performance)
    return `/reports/production/harvested-crop/?${p}`
  }

  const handleGenerate = async (sigData) => {
    setShowSig(false)
    setIsDownloading(true)
    const fmt  = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    const file = sigPurpose === 'pdf' ? 'harvested_crop_report.pdf' : 'harvested_crop_report.xlsx'
    try {
      let url = buildUrl(fmt)
      if (sigData.prepared_by) url += `&prepared_by=${encodeURIComponent(sigData.prepared_by)}&prepared_role=${encodeURIComponent(sigData.position)}`
      if (sigData.reviewed_by) url += `&reviewed_by=${encodeURIComponent(sigData.reviewed_by)}`
      if (sigData.noted_by)    url += `&noted_by=${encodeURIComponent(sigData.noted_by)}`
      await downloadFile(api, url, file)
    } catch {
      showToast(`Failed to generate ${sigPurpose === 'pdf' ? 'PDF' : 'Excel'}.`, 'error')
    } finally { setIsDownloading(false) }
  }

  const HEADERS = [
    'BARANGAY', 'FARMER', 'ORGANIZATION', 'CROP',
    'AREA PLANTED (HA)', 'AREA HARVESTED (HA)',
    'ESTIMATED HARVEST DATE', 'ACTUAL HARVEST DATE', 'ESTIMATED YIELD (KG)',
  ]

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="print:hidden">
        <FilterPanel activeCount={Object.values(filters).filter(Boolean).length}>
          <div className="max-md:w-full">
            <label className={labelCls}>Harvest Start Date</label>
            <input type="date" className={baseInputClasses} value={filters.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Harvest End Date</label>
            <input type="date" className={baseInputClasses} value={filters.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
          <div className="w-full sm:w-44">
            <label className={labelCls}>Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Organization</label>
            <select className={baseInputClasses} value={filters.organization} onChange={e => set('organization', e.target.value)}>
              <option value="">All Organizations</option>
              {organizations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Crop Type</label>
            <select className={baseInputClasses} value={filters.crop_name} onChange={e => set('crop_name', e.target.value)}>
              <option value="">All Crops</option>
              {cropTypes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Yield Performance</label>
            <select className={baseInputClasses} value={filters.yield_performance} onChange={e => set('yield_performance', e.target.value)}>
              <option value="">All</option>
              <option value="above">Above Average (≥110%)</option>
              <option value="average">Average (90–110%)</option>
              <option value="below">Below Average (&lt;90%)</option>
            </select>
          </div>
        </FilterPanel>
      </div>

      {/* Yield Analysis */}
      <div>
        <div className="flex items-center gap-3 mb-3">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">Yield Analysis</p>
          {filters.yield_performance && (
            <span className="inline-flex items-center rounded-full bg-[#1B4D2E] px-2.5 py-0.5 text-[11px] font-medium text-white">
              Filtered by: {filters.yield_performance === 'above' ? 'Above Average' : filters.yield_performance === 'average' ? 'Average' : 'Below Average'}
            </span>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-[#EBF5EE] rounded-xl p-4">
            <p className="text-[11px] font-medium text-[#4A5E4A]">Barangay with Highest Yield</p>
            <p className="text-[15px] font-bold text-[#1B4D2E] mt-1 truncate">{yieldData.top_barangay}</p>
          </div>
          <div className="bg-[#EBF5EE] rounded-xl p-4">
            <p className="text-[11px] font-medium text-[#4A5E4A]">Total Estimated Yield</p>
            <p className="text-[20px] font-bold text-[#1B4D2E] mt-1">{yieldData.total_yield} kg</p>
          </div>
          <div className="bg-[#EBF5EE] rounded-xl p-4">
            <p className="text-[11px] font-medium text-[#4A5E4A]">Crop Records</p>
            <p className="text-[20px] font-bold text-[#1B4D2E] mt-1">{yieldData.count}</p>
            <p className="text-[11px] text-[#7A8E7A]">total records</p>
          </div>
        </div>
      </div>

      {/* Action Buttons */}
      <ActionButtons
        onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
        onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
        isDownloading={isDownloading}
      />

      {/* Preview Table */}
      <div>
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Preview: Harvested Crops</p>
        <p className="text-[12px] text-[#7A8E7A] mb-3">
          {filters.start_date || filters.end_date
            ? `Period: ${filters.start_date || '—'} to ${filters.end_date || '—'}`
            : 'All harvested records'}
        </p>
        <PreviewTable headers={HEADERS} rows={previewRows} isLoading={isLoading} emptyText="No harvested records found." />
      </div>

      {showSig && (
        <SignatureModal purpose={sigPurpose} onClose={() => setShowSig(false)} onGenerate={handleGenerate} />
      )}
    </div>
  )
}

// ── Fisheries Production Tab ──────────────────────────────────────────────────

function FisheriesProductionTab() {
  const { showToast } = useToast()
  const [organizations,  setOrganizations]  = useState([])
  const [speciesList,   setSpeciesList]   = useState([])
  const [previewRows,   setPreviewRows]   = useState([])
  const [isLoading,     setIsLoading]     = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig,       setShowSig]       = useState(false)
  const [sigPurpose,    setSigPurpose]    = useState('pdf')
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', barangay: '', organization: '', species: '', culture_type: '',
  })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get('/organizations/fisherfolk/'),
      api.get('/fisheries/species/'),
    ]).then(([aRes, sRes]) => {
      setOrganizations(Array.isArray(aRes.data) ? aRes.data : (aRes.data.results || []))
      setSpeciesList(Array.isArray(sRes.data) ? sRes.data : (sRes.data.results || []))
    }).catch(() => {})
  }, [])

  const loadPreview = async () => {
    setIsLoading(true)
    try {
      const p = new URLSearchParams({ format: 'json' })
      if (filters.start_date)   p.set('start_date',   filters.start_date)
      if (filters.end_date)     p.set('end_date',     filters.end_date)
      if (filters.barangay)     p.set('barangay',     filters.barangay)
      if (filters.organization)  p.set('organization',  filters.organization)
      if (filters.species)      p.set('species',      filters.species)
      if (filters.culture_type) p.set('culture_type', filters.culture_type)
      const r = await api.get(`/reports/fisheries/production/?${p}`)
      const records = r.data?.records || []
      setPreviewRows(records.map(rec => [
        rec.barangay, rec.fisherfolk, rec.organization,
        rec.species, rec.culture_type,
        rec.date_stocked, rec.harvest_date,
        rec.quantity_kg, rec.is_final,
      ]))
    } catch {
      showToast('Failed to load preview.', 'error')
    } finally { setIsLoading(false) }
  }

  useEffect(() => { loadPreview() }, [filters])

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ format: fmt })
    if (filters.start_date)   p.set('start_date',   filters.start_date)
    if (filters.end_date)     p.set('end_date',     filters.end_date)
    if (filters.barangay)     p.set('barangay',     filters.barangay)
    if (filters.organization)  p.set('organization',  filters.organization)
    if (filters.species)      p.set('species',      filters.species)
    if (filters.culture_type) p.set('culture_type', filters.culture_type)
    return `/reports/fisheries/production/?${p}`
  }

  const handleGenerate = async (sigData) => {
    setShowSig(false)
    setIsDownloading(true)
    const fmt  = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    const file = sigPurpose === 'pdf' ? 'fisheries_production_report.pdf' : 'fisheries_production_report.xlsx'
    try {
      let url = buildUrl(fmt)
      if (sigData.prepared_by) url += `&prepared_by=${encodeURIComponent(sigData.prepared_by)}&prepared_role=${encodeURIComponent(sigData.position)}`
      if (sigData.reviewed_by) url += `&reviewed_by=${encodeURIComponent(sigData.reviewed_by)}`
      if (sigData.noted_by)    url += `&noted_by=${encodeURIComponent(sigData.noted_by)}`
      await downloadFile(api, url, file)
    } catch {
      showToast(`Failed to generate ${sigPurpose === 'pdf' ? 'PDF' : 'Excel'}.`, 'error')
    } finally { setIsDownloading(false) }
  }

  const HEADERS = [
    'BARANGAY', 'FISHERFOLK', 'ORGANIZATION',
    'SPECIES', 'CULTURE TYPE',
    'DATE STOCKED', 'HARVEST DATE',
    'QUANTITY (KG)', 'FINAL?',
  ]

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <FilterPanel activeCount={Object.values(filters).filter(Boolean).length}>
          <div className="max-md:w-full">
            <label className={labelCls}>Harvest Start Date</label>
            <input type="date" className={baseInputClasses} value={filters.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Harvest End Date</label>
            <input type="date" className={baseInputClasses} value={filters.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
          <div className="w-full sm:w-44">
            <label className={labelCls}>Pond Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Organization</label>
            <select className={baseInputClasses} value={filters.organization} onChange={e => set('organization', e.target.value)}>
              <option value="">All Organizations</option>
              {organizations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Species</label>
            <select className={baseInputClasses} value={filters.species} onChange={e => set('species', e.target.value)}>
              <option value="">All Species</option>
              {speciesList.map(s => <option key={s.id} value={s.id}>{s.species_name}</option>)}
            </select>
          </div>
          <div className="max-md:w-full">
            <label className={labelCls}>Culture Type</label>
            <select className={baseInputClasses} value={filters.culture_type} onChange={e => set('culture_type', e.target.value)}>
              <option value="">All Types</option>
              <option value="Pond">Pond</option>
              <option value="Cage">Cage</option>
              <option value="Pen">Pen</option>
            </select>
          </div>
        </FilterPanel>
      </div>

      <ActionButtons
        onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
        onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
        isDownloading={isDownloading}
      />

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">Preview: Fisheries Harvest Records</p>
          {!isLoading && (
            <span className="text-[12px] text-[#7A8E7A]">
              Showing {previewRows.length} record{previewRows.length !== 1 ? 's' : ''}
            </span>
          )}
        </div>
        <PreviewTable headers={HEADERS} rows={previewRows} isLoading={isLoading} emptyText="No harvest records found." />
      </div>

      {showSig && (
        <SignatureModal purpose={sigPurpose} onClose={() => setShowSig(false)} onGenerate={handleGenerate} />
      )}
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// The sidebar's single Reports link opens /reports with no tab: a landing page of report cards. Each card links to
// /reports?tab=<id>, which renders that report with a link back here. Existing ?tab= deep links (notifications,
// bookmarks) open their report directly; an unknown tab falls back to the landing page.
function ReportSelection() {
  return (
    <div>
      <p className="text-[13px] text-[#4A5E4A] mb-4">Select a report to continue.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {TABS.map(({ id, icon: Icon, label, description }) => (
          <Link
            key={id}
            to={`/reports?tab=${id}`}
            className="group flex flex-col rounded-xl border border-[#E2E8E2] bg-white p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] transition-[border-color,box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:border-[#1B4D2E] hover:shadow-[0_4px_12px_rgba(27,77,46,0.12)] focus-visible:outline-none focus-visible:border-[#1B4D2E] focus-visible:ring-2 focus-visible:ring-[#1B4D2E]/30"
          >
            <span className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-[#EAF2EC] text-[#1B4D2E] transition-colors duration-200 group-hover:bg-[#1B4D2E] group-hover:text-white group-focus-visible:bg-[#1B4D2E] group-focus-visible:text-white">
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="text-[15px] font-semibold text-[#1A2B1A]">{label}</span>
            <span className="mt-1 flex-1 text-[13px] text-[#7A8E7A]">{description}</span>
            <span className="mt-4 inline-flex items-center gap-1 text-[13px] font-medium text-[#1B4D2E]">
              Open Report
              <ArrowRight size={14} aria-hidden="true" className="transition-transform duration-200 group-hover:translate-x-0.5" />
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default function ReportsPage() {
  const [searchParams] = useSearchParams()
  const activeTab = TABS.some(t => t.id === searchParams.get('tab')) ? searchParams.get('tab') : null

  return (
    <PageLayout title="Report Generation" subtitle="Generate and export data from different modules">
      {!activeTab && <ReportSelection />}
      {activeTab && (
        <Link
          to="/reports"
          className="mb-4 inline-flex items-center gap-1 text-[13px] text-[#1B4D2E] hover:underline print:hidden"
        >
          <ArrowLeft size={14} aria-hidden="true" /> Back to Reports
        </Link>
      )}
      <div className="space-y-5">
        {activeTab === 'registered'          && <RegisteredReportTab />}
        {activeTab === 'harvested'           && <HarvestedCropTab />}
        {activeTab === 'fisheries'           && <FisheriesProductionTab />}
      </div>
    </PageLayout>
  )
}
