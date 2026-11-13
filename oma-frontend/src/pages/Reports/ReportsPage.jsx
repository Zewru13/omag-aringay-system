import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import { loadAllPages } from '../../utils/loadAllPages.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { printPdf } from '../../utils/printPdf.js'
import { ActionButtons, SignatoriesPanel, labelCls } from './ReportParts.jsx'
import { ReportPaper, SelectedReportBox } from './ReportPaper.jsx'
import { REPORT_TYPES, detailFromFilters, periodText, reportType, reportTypeFromParam } from './reportPaper.js'
import { useSignatories } from './useSignatories.js'
import DisasterReportTab from './DisasterReportTab.jsx'
import OrganizationAssistanceReportTab from './OrganizationAssistanceReportTab.jsx'
import RegisteredReportTab from './RegisteredReportTab.jsx'

// One page for all six reports (the list is REPORT_TYPES in reportPaper.js). The Report type dropdown at the top picks one; under it that
// report's filters, the Selected report box, the Signatories block, the Print / PDF / Excel buttons and the print-ready paper preview.

// ── Harvested Crop Tab ─────────────────────────────────────────────────────────

function HarvestedCropTab() {
  const { showToast } = useToast()
  const [organizations,  setOrganizations]  = useState([])
  const [cropTypes,     setCropTypes]     = useState([])
  const [allRecords,    setAllRecords]    = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const signatories = useSignatories()
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', barangay: '', organization: '', crop_name: '', yield_performance: '',
  })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      loadAllPages((u, o) => api.get(u, o), '/organizations/farmers/').then((data) => ({ data })),
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
    // The PDF carries the signers picked in the Signatories block; the Excel has no signature block.
    if (fmt === 'pdf') Object.entries(signatories.params).forEach(([k, v]) => p.set(k, v))
    return `/reports/production/harvested-crop/?${p}`
  }

  // Print: the same PDF Preview PDF gives (same filters and period), printed from a hidden frame.
  const handlePrint = async () => {
    setIsDownloading(true)
    try {
      await printPdf(api, buildUrl('pdf'))
    } catch {
      showToast('Failed to print the report.', 'error')
    } finally { setIsDownloading(false) }
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, buildUrl('pdf'), 'harvested_crop_report.pdf')
    } catch {
      showToast('Failed to download the report.', 'error')
    } finally { setIsDownloading(false) }
  }

  const HEADERS = [
    'BARANGAY', 'FARMER', 'ORGANIZATION', 'CROP',
    'AREA PLANTED (HA)', 'AREA HARVESTED (HA)',
    'ESTIMATED HARVEST DATE', 'ACTUAL HARVEST DATE', 'ESTIMATED YIELD (KG)',
  ]

  // What the paper preview and the Selected report box show: the same title, period and filters as the printed report.
  const yieldLabels = { above: 'Above Average', average: 'Average', below: 'Below Average' }
  const paperDoc = {
    heading: 'Crop Harvest Report',
    period: periodText(filters.start_date, filters.end_date),
    detail: detailFromFilters([
      ['Barangay', filters.barangay],
      ['Organization', organizations.find(a => String(a.id) === String(filters.organization))?.name],
      ['Crop', filters.crop_name],
      ['Yield performance', yieldLabels[filters.yield_performance]],
    ]),
    stats: [['Barangay with highest yield', yieldData.top_barangay], ['Total estimated yield', `${yieldData.total_yield} kg`], ['Crop records', yieldData.count]],
    sections: [{ title: '', headers: HEADERS, rows: previewRows, empty: 'No harvested records found.' }],
  }

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

      <SelectedReportBox type={reportType('harvested')} period={paperDoc.period} detail={paperDoc.detail} />

      <SignatoriesPanel signatories={signatories} />

      {/* Action Buttons */}
      <ActionButtons
        onPrint={handlePrint}
        onDownload={handleDownload}
        isDownloading={isDownloading}
      />

      <ReportPaper doc={paperDoc} signers={signatories.params} isLoading={isLoading} />
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
  const signatories = useSignatories()
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', barangay: '', organization: '', species: '', culture_type: '',
  })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      loadAllPages((u, o) => api.get(u, o), '/organizations/fisherfolk/').then((data) => ({ data })),
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
    if (fmt === 'pdf') Object.entries(signatories.params).forEach(([k, v]) => p.set(k, v))
    return `/reports/fisheries/production/?${p}`
  }

  const handlePrint = async () => {
    setIsDownloading(true)
    try {
      await printPdf(api, buildUrl('pdf'))
    } catch {
      showToast('Failed to print the report.', 'error')
    } finally { setIsDownloading(false) }
  }

  const handleDownload = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, buildUrl('pdf'), 'fisheries_production_report.pdf')
    } catch {
      showToast('Failed to download the report.', 'error')
    } finally { setIsDownloading(false) }
  }

  const HEADERS = [
    'BARANGAY', 'FISHERFOLK', 'ORGANIZATION',
    'SPECIES', 'CULTURE TYPE',
    'DATE STOCKED', 'HARVEST DATE',
    'QUANTITY (KG)', 'FINAL?',
  ]

  // What the paper preview and the Selected report box show: the same title, period and filters as the printed report.
  const paperDoc = {
    heading: 'Fisheries Production Report',
    period: periodText(filters.start_date, filters.end_date),
    detail: detailFromFilters([
      ['Pond barangay', filters.barangay],
      ['Organization', organizations.find(a => String(a.id) === String(filters.organization))?.name],
      ['Species', speciesList.find(sp => String(sp.id) === String(filters.species))?.species_name],
      ['Culture type', filters.culture_type],
    ]),
    stats: [['Harvest records', previewRows.length]],
    sections: [{ title: '', headers: HEADERS, rows: previewRows, empty: 'No harvest records found.' }],
  }

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

      <SelectedReportBox type={reportType('fisheries')} period={paperDoc.period} detail={paperDoc.detail} />

      <SignatoriesPanel signatories={signatories} />

      <ActionButtons
        onPrint={handlePrint}
        onDownload={handleDownload}
        isDownloading={isDownloading}
      />

      <ReportPaper doc={paperDoc} signers={signatories.params} isLoading={isLoading} />
    </div>
  )
}

// ── Main Page ─────────────────────────────────────────────────────────────────

// The sidebar's Reports link opens /reports with the first report chosen. The Report type dropdown swaps the report (and its filters);
// the choice lives in the URL as ?tab=<id>, so existing links (notifications, bookmarks) open their report directly. An unknown tab opens the first.
export default function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const activeTab = reportTypeFromParam(searchParams.get('tab'))
  const active = reportType(activeTab)

  return (
    <PageLayout title="Report Generation" subtitle="Choose a report, set its filters, then print or download it">
      <div className="space-y-5">
        <div className="rounded-xl border border-[#E2E8E2] bg-white p-4 print:hidden">
          <label htmlFor="report-type" className={labelCls}>Report type</label>
          <select
            id="report-type"
            className={baseInputClasses}
            value={activeTab}
            onChange={e => setSearchParams({ tab: e.target.value }, { replace: true })}
          >
            {REPORT_TYPES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
          <p className="mt-1 text-[11.5px] text-[#7A8E7A]">Choose which report to generate. {active.description}</p>
        </div>

        {/* key: another report starts with its own filters */}
        <div key={activeTab} className="space-y-5">
          {activeTab === 'registered'          && <RegisteredReportTab />}
          {activeTab === 'harvested'           && <HarvestedCropTab />}
          {activeTab === 'fisheries'           && <FisheriesProductionTab />}
          {activeTab === 'disaster_fisheries'  && <DisasterReportTab kind="fisheries" />}
          {activeTab === 'disaster_crops'      && <DisasterReportTab kind="crops" />}
          {activeTab === 'organization_assistance' && <OrganizationAssistanceReportTab />}
        </div>
      </div>
    </PageLayout>
  )
}
