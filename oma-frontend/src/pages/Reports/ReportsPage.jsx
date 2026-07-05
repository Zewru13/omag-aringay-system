import { useEffect, useMemo, useState } from 'react'
import { Building2, Download, FileText, Fish, Leaf, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'

const labelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

const TABS = [
  { id: 'harvested',    icon: Wheat,     label: 'Harvested Crop Report' },
  { id: 'association',  icon: Building2, label: 'Association List Report' },
  { id: 'crop_options', icon: Leaf,      label: 'Crop Options Report' },
  { id: 'fisheries',    icon: Fish,      label: 'Fisheries Production Report' },
]

// ── Signature Modal ────────────────────────────────────────────────────────────

function SignatureModal({ purpose, onClose, onGenerate }) {
  const { user } = useAuth()
  const [showReviewer, setShowReviewer] = useState(false)
  const [showNotedBy,  setShowNotedBy]  = useState(false)
  const [preparedBy,   setPreparedBy]   = useState(user?.full_name || '')
  const [position,     setPosition]     = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [notedByName,  setNotedByName]  = useState('')

  const isPdf = purpose === 'pdf'
  const title = isPdf
    ? 'Enter Signature Information for PDF Preview'
    : 'Enter Signature Information for Excel Download'

  return (
    <ModalShell title={title} onClose={onClose} maxWidth="max-w-sm">
      <p className="text-[12px] text-[#7A8E7A] text-center mb-4">
        Please provide the names and positions for the signature section of the PDF report.
      </p>

      <p className="text-[13px] font-semibold text-[#1A2B1A] mb-2">* Prepared by</p>
      <div>
        <label className={labelCls}>Name:</label>
        <input
          type="text"
          value={preparedBy}
          onChange={e => setPreparedBy(e.target.value)}
          className={baseInputClasses}
        />
        <p className="text-[11px] text-[#A8BCA8] italic mt-0.5">Auto-filled with your name (editable)</p>
      </div>
      <div className="mt-2">
        <label className={labelCls}>Position/Designation:</label>
        <input
          type="text"
          value={position}
          onChange={e => setPosition(e.target.value)}
          placeholder="ENTER YOUR POSITION..."
          className={baseInputClasses}
        />
      </div>

      <div className="border-t border-[#F0F4F0] my-3" />

      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">
            * Reviewed by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
          </p>
          <button
            type="button"
            onClick={() => setShowReviewer(v => !v)}
            className="text-[12px] font-medium text-[#1B4D2E] hover:underline"
          >
            {showReviewer ? 'Remove' : 'Add'}
          </button>
        </div>
        {showReviewer && (
          <input
            type="text"
            value={reviewerName}
            onChange={e => setReviewerName(e.target.value)}
            placeholder="Enter reviewer name"
            className={`${baseInputClasses} mt-2`}
          />
        )}
      </div>

      <div className="border-t border-[#F0F4F0] my-3" />

      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">
            * Noted by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
          </p>
          <button
            type="button"
            onClick={() => setShowNotedBy(v => !v)}
            className="text-[12px] font-medium text-[#1B4D2E] hover:underline"
          >
            {showNotedBy ? 'Remove' : 'Add'}
          </button>
        </div>
        {showNotedBy && (
          <input
            type="text"
            value={notedByName}
            onChange={e => setNotedByName(e.target.value)}
            placeholder="Enter noted-by name"
            className={`${baseInputClasses} mt-2`}
          />
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4 mt-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={() => onGenerate({ prepared_by: preparedBy, position, reviewed_by: showReviewer ? reviewerName : '', noted_by: showNotedBy ? notedByName : '' })}
          className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white hover:bg-[#235E38] transition-colors"
        >
          {isPdf ? 'Generate PDF' : 'Generate Excel'}
        </button>
      </div>
    </ModalShell>
  )
}

// ── Shared: Action Buttons Row ─────────────────────────────────────────────────

function ActionButtons({ onPdf, onExcel, isDownloading }) {
  return (
    <div className="flex gap-2 justify-end">
      <button
        type="button"
        onClick={onPdf}
        disabled={isDownloading}
        className="flex items-center gap-1.5 bg-[#C0392B] hover:bg-[#A93226] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
      >
        <FileText className="w-4 h-4" />
        Preview PDF
      </button>
      <button
        type="button"
        onClick={onExcel}
        disabled={isDownloading}
        className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
      >
        <Download className="w-4 h-4" />
        Download Excel
      </button>
    </div>
  )
}

// ── Shared: Preview Table ──────────────────────────────────────────────────────

function PreviewTable({ headers, rows, isLoading, emptyText = 'No records found.' }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
      <table className="min-w-full text-sm">
        <thead className="bg-[#1B4D2E] text-white">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={headers.length} className="py-8 text-center text-[13px] text-[#7A8E7A]">Loading…</td></tr>
          ) : rows.length === 0 ? (
            <tr><td colSpan={headers.length} className="py-8 text-center text-[13px] text-[#7A8E7A]">{emptyText}</td></tr>
          ) : rows.map((row, i) => (
            <tr key={i} className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ── Harvested Crop Tab ─────────────────────────────────────────────────────────

function HarvestedCropTab() {
  const { showToast } = useToast()
  const [associations,  setAssociations]  = useState([])
  const [cropTypes,     setCropTypes]     = useState([])
  const [allRecords,    setAllRecords]    = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig,       setShowSig]       = useState(false)
  const [sigPurpose,    setSigPurpose]    = useState('pdf')
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', barangay: '', association: '', crop_name: '', yield_performance: '',
  })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get('/associations/farmers/'),
      api.get('/production/crop-types/'),
      api.get('/production/monitoring/'),
    ]).then(([aRes, cRes, mRes]) => {
      setAssociations(Array.isArray(aRes.data) ? aRes.data : (aRes.data.results || []))
      setCropTypes(Array.isArray(cRes.data) ? cRes.data : (cRes.data.results || []))
      const all = Array.isArray(mRes.data) ? mRes.data : (mRes.data.results || [])
      setAllRecords(all.filter(r => r.status === 'Harvested'))
    }).catch(() => showToast('Failed to load preview data.', 'error'))
      .finally(() => setIsLoading(false))
  }, [])

  const filteredRecords = useMemo(() => {
    return allRecords.filter(rec => {
      if (filters.barangay    && rec.farmer_barangay !== filters.barangay) return false
      if (filters.association && String(rec.farmers_association) !== String(filters.association)) return false
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
    rec.association_name,
    rec.association_name,
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
    if (filters.association)       p.set('association',       filters.association)
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
    'BARANGAY', 'FARMER', 'ASSOCIATION', 'CROP',
    'AREA PLANTED (HA)', 'AREA HARVESTED (HA)',
    'ESTIMATED HARVEST DATE', 'ACTUAL HARVEST DATE', 'ESTIMATED YIELD (KG)',
  ]

  return (
    <div className="space-y-5">
      {/* Filters */}
      <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <p className="text-[13px] font-semibold text-[#1A2B1A] mb-4">Filter Options</p>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={labelCls}>Harvest Start Date</label>
            <input type="date" className={baseInputClasses} value={filters.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Harvest End Date</label>
            <input type="date" className={baseInputClasses} value={filters.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
          <div className="w-44">
            <label className={labelCls}>Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div>
            <label className={labelCls}>Association</label>
            <select className={baseInputClasses} value={filters.association} onChange={e => set('association', e.target.value)}>
              <option value="">All Associations</option>
              {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Crop Type</label>
            <select className={baseInputClasses} value={filters.crop_name} onChange={e => set('crop_name', e.target.value)}>
              <option value="">All Crops</option>
              {cropTypes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Yield Performance</label>
            <select className={baseInputClasses} value={filters.yield_performance} onChange={e => set('yield_performance', e.target.value)}>
              <option value="">All</option>
              <option value="above">Above Average (≥110%)</option>
              <option value="average">Average (90–110%)</option>
              <option value="below">Below Average (&lt;90%)</option>
            </select>
          </div>
        </div>
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

// ── Association List Tab ───────────────────────────────────────────────────────

function AssociationListTab() {
  const { showToast } = useToast()
  const [allRecords,    setAllRecords]    = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig,       setShowSig]       = useState(false)
  const [sigPurpose,    setSigPurpose]    = useState('pdf')
  const [filters, setFilters] = useState({ barangay: '', type: 'all' })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get('/associations/farmers/'),
      api.get('/associations/fisherfolk/'),
    ]).then(([fRes, ffRes]) => {
      const farmers    = (Array.isArray(fRes.data)  ? fRes.data  : (fRes.data.results  || [])).map(a => ({ ...a, _type: 'farmers' }))
      const fisherfolk = (Array.isArray(ffRes.data) ? ffRes.data : (ffRes.data.results || [])).map(a => ({ ...a, _type: 'fisherfolk' }))
      const all = [...farmers, ...fisherfolk].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
      setAllRecords(all)
    }).catch(() => showToast('Failed to load association data.', 'error'))
      .finally(() => setIsLoading(false))
  }, [])

  const filteredRecords = useMemo(() => {
    return allRecords.filter(a => {
      if (filters.type !== 'all' && a._type !== filters.type) return false
      if (filters.barangay && a.barangay !== filters.barangay) return false
      return true
    })
  }, [allRecords, filters])

  const previewRows = filteredRecords.map(a => [a.name, a.barangay, a.contact_person, a.contact_number])

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ format: fmt, type: filters.type })
    if (filters.barangay) p.set('barangay', filters.barangay)
    return `/reports/associations/list/?${p}`
  }

  const handleGenerate = async (sigData) => {
    setShowSig(false)
    setIsDownloading(true)
    const fmt  = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    const file = sigPurpose === 'pdf' ? 'association_list.pdf' : 'association_list.xlsx'
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

  const HEADERS = ['ASSOCIATION NAME', 'BARANGAY', 'CONTACT PERSON', 'CONTACT NUMBER']

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <p className="text-[13px] font-semibold text-[#1A2B1A] mb-4">Filter Options</p>
        <div className="flex flex-wrap gap-3">
          <div className="w-44">
            <label className={labelCls}>Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div>
            <label className={labelCls}>Type</label>
            <select className={baseInputClasses} value={filters.type} onChange={e => set('type', e.target.value)}>
              <option value="all">All Associations</option>
              <option value="farmers">Farmers Only</option>
              <option value="fisherfolk">Fisherfolk Only</option>
            </select>
          </div>
        </div>
      </div>

      <ActionButtons
        onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
        onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
        isDownloading={isDownloading}
      />

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">Preview: Association List</p>
          {!isLoading && (
            <span className="text-[12px] text-[#7A8E7A]">Showing {filteredRecords.length} association{filteredRecords.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <PreviewTable headers={HEADERS} rows={previewRows} isLoading={isLoading} emptyText="No association records found." />
      </div>

      {showSig && (
        <SignatureModal purpose={sigPurpose} onClose={() => setShowSig(false)} onGenerate={handleGenerate} />
      )}
    </div>
  )
}

// ── Crop Options Tab ───────────────────────────────────────────────────────────

function CropOptionsTab() {
  const { showToast } = useToast()
  const [cropTypes,     setCropTypes]     = useState([])
  const [categories,    setCategories]    = useState([])
  const [subcategories, setSubcategories] = useState([])
  const [isLoading,     setIsLoading]     = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig,       setShowSig]       = useState(false)
  const [sigPurpose,    setSigPurpose]    = useState('pdf')
  const [filters, setFilters] = useState({ category: '', subcategory: '' })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get('/production/crop-types/'),
      api.get('/production/crop-categories/'),
      api.get('/production/crop-subcategories/'),
    ]).then(([ctRes, cRes, scRes]) => {
      const ct = Array.isArray(ctRes.data) ? ctRes.data : (ctRes.data.results || [])
      setCropTypes([...ct].sort((a, b) => (a.name || '').localeCompare(b.name || '')))
      setCategories(Array.isArray(cRes.data)  ? cRes.data  : (cRes.data.results  || []))
      setSubcategories(Array.isArray(scRes.data) ? scRes.data : (scRes.data.results || []))
    }).catch(() => showToast('Failed to load crop data.', 'error'))
      .finally(() => setIsLoading(false))
  }, [])

  const filteredSubcats = useMemo(() =>
    subcategories.filter(s => !filters.category || String(s.category) === String(filters.category)),
    [subcategories, filters.category]
  )

  const filteredCrops = useMemo(() => {
    return cropTypes.filter(c => {
      if (filters.category    && String(c.category)    !== String(filters.category))    return false
      if (filters.subcategory && String(c.subcategory) !== String(filters.subcategory)) return false
      return true
    })
  }, [cropTypes, filters])

  const previewRows = filteredCrops.map(c => [
    c.name,
    c.category_name    || '—',
    c.subcategory_name || '—',
    c.days_to_harvest,
    c.yield_per_ha_kg ? `${Number(c.yield_per_ha_kg).toLocaleString()} kg/ha` : '—',
  ])

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ format: fmt })
    if (filters.category)    p.set('category',    filters.category)
    if (filters.subcategory) p.set('subcategory', filters.subcategory)
    return `/reports/production/crop-options/?${p}`
  }

  const handleGenerate = async (sigData) => {
    setShowSig(false)
    setIsDownloading(true)
    const fmt  = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    const file = sigPurpose === 'pdf' ? 'crop_options_report.pdf' : 'crop_options_report.xlsx'
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

  const HEADERS = ['CROP NAME', 'CATEGORY', 'SUBCATEGORY', 'GROWTH DURATION (DAYS)', 'YIELD PER HA (KG)']

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <p className="text-[13px] font-semibold text-[#1A2B1A] mb-4">Filter Options</p>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={labelCls}>Category</label>
            <select
              className={baseInputClasses}
              value={filters.category}
              onChange={e => { set('category', e.target.value); set('subcategory', '') }}
            >
              <option value="">All Categories</option>
              {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Sub Category</label>
            <select
              className={baseInputClasses}
              value={filters.subcategory}
              onChange={e => set('subcategory', e.target.value)}
              disabled={!filters.category}
            >
              <option value="">All Subcategories</option>
              {filteredSubcats.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <ActionButtons
        onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
        onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
        isDownloading={isDownloading}
      />

      <div>
        <div className="flex items-center gap-2 mb-2">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">Preview: Crop Options</p>
          {!isLoading && (
            <span className="text-[12px] text-[#7A8E7A]">Showing {filteredCrops.length} crop option{filteredCrops.length !== 1 ? 's' : ''}</span>
          )}
        </div>
        <PreviewTable headers={HEADERS} rows={previewRows} isLoading={isLoading} emptyText="No crop options found." />
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
  const [associations,  setAssociations]  = useState([])
  const [speciesList,   setSpeciesList]   = useState([])
  const [previewRows,   setPreviewRows]   = useState([])
  const [isLoading,     setIsLoading]     = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig,       setShowSig]       = useState(false)
  const [sigPurpose,    setSigPurpose]    = useState('pdf')
  const [filters, setFilters] = useState({
    start_date: '', end_date: '', barangay: '', association: '', species: '', culture_type: '',
  })
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    Promise.all([
      api.get('/associations/fisherfolk/'),
      api.get('/fisheries/species/'),
    ]).then(([aRes, sRes]) => {
      setAssociations(Array.isArray(aRes.data) ? aRes.data : (aRes.data.results || []))
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
      if (filters.association)  p.set('association',  filters.association)
      if (filters.species)      p.set('species',      filters.species)
      if (filters.culture_type) p.set('culture_type', filters.culture_type)
      const r = await api.get(`/reports/fisheries/production/?${p}`)
      const records = r.data?.records || []
      setPreviewRows(records.map(rec => [
        rec.barangay, rec.fisherfolk, rec.association,
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
    if (filters.association)  p.set('association',  filters.association)
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
    'BARANGAY', 'FISHERFOLK', 'ASSOCIATION',
    'SPECIES', 'CULTURE TYPE',
    'DATE STOCKED', 'HARVEST DATE',
    'QUANTITY (KG)', 'FINAL?',
  ]

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <p className="text-[13px] font-semibold text-[#1A2B1A] mb-4">Filter Options</p>
        <div className="flex flex-wrap gap-3">
          <div>
            <label className={labelCls}>Harvest Start Date</label>
            <input type="date" className={baseInputClasses} value={filters.start_date} onChange={e => set('start_date', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Harvest End Date</label>
            <input type="date" className={baseInputClasses} value={filters.end_date} onChange={e => set('end_date', e.target.value)} />
          </div>
          <div className="w-44">
            <label className={labelCls}>Pond Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div>
            <label className={labelCls}>Association</label>
            <select className={baseInputClasses} value={filters.association} onChange={e => set('association', e.target.value)}>
              <option value="">All Associations</option>
              {associations.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Species</label>
            <select className={baseInputClasses} value={filters.species} onChange={e => set('species', e.target.value)}>
              <option value="">All Species</option>
              {speciesList.map(s => <option key={s.id} value={s.id}>{s.species_name}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Culture Type</label>
            <select className={baseInputClasses} value={filters.culture_type} onChange={e => set('culture_type', e.target.value)}>
              <option value="">All Types</option>
              <option value="Pond">Pond</option>
              <option value="Cage">Cage</option>
              <option value="Pen">Pen</option>
            </select>
          </div>
        </div>
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

export default function ReportsPage() {
  const [activeTab, setActiveTab] = useState('harvested')

  return (
    <PageLayout title="Report Generation" subtitle="Generate and export data from different modules">
      <div className="space-y-5">
        <div className="flex flex-wrap gap-2">
          {TABS.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-[13px] font-medium transition-colors flex items-center gap-1.5 ${
                activeTab === tab.id
                  ? 'bg-[#1B4D2E] text-white'
                  : 'bg-white border border-[#E2E8E2] text-[#4A5E4A] hover:bg-[#F5F7F5]'
              }`}
            >
              <tab.icon size={14} />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'harvested'    && <HarvestedCropTab />}
        {activeTab === 'association'  && <AssociationListTab />}
        {activeTab === 'crop_options' && <CropOptionsTab />}
        {activeTab === 'fisheries'    && <FisheriesProductionTab />}
      </div>
    </PageLayout>
  )
}
