import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import { ChevronDown, ChevronRight, Download, FileText, Info, Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import GroupedForecast from '../Forecasting/GroupedForecast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { possibleFactorsText } from '../../utils/yieldAnalysis.js'

const filterLabelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// Identical framing/tone to the crop Yield Analysis module — adapted wording only.
const YIELD_DISCLAIMER = 'This analysis is descriptive. Harvest yield is affected by many factors including water quality, disease, and weather; missed activities are shown as possible contributing factors, not proven causes.'

function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <p className="text-[12px] text-amber-800 leading-relaxed">{YIELD_DISCLAIMER}</p>
    </div>
  )
}

// ── Fisherfolk Search Filter (debounced, same pattern used elsewhere in the app) ──

function FisherfolkFilterInput({ selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDrop, setShowDrop] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    try {
      const r = await api.get('/fisheries/fisherfolk/', { params: { search: q } })
      const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
      setResults(list.slice(0, 8))
    } catch { setResults([]) }
  }, [])

  const handleChange = (e) => {
    const v = e.target.value
    setQuery(v)
    setShowDrop(true)
    if (!v.trim()) onSelect(null)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => doSearch(v), 300)
  }

  useEffect(() => {
    const handler = (e) => { if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const displayValue = selected ? selected.full_name : query

  return (
    <div ref={wrapperRef} className="relative">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          className={`${baseInputClasses} pl-7`}
          placeholder="All Fisherfolk"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
        />
      </div>
      {showDrop && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto">
          {results.map((ff) => (
            <button
              key={ff.id}
              type="button"
              onMouseDown={() => { onSelect(ff); setQuery(''); setShowDrop(false) }}
              className="flex flex-col w-full px-3 py-2 text-left hover:bg-[#F5F7F5] transition-colors"
            >
              <span className="text-xs font-semibold text-[#1A2B1A]">{ff.full_name}</span>
              <span className="text-[11px] text-[#7A8E7A]">{ff.barangay}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Signature Modal (mirrors ReportsPage.jsx / crop ForecastingPage.jsx) ────────

function YASignatureModal({ purpose, onClose, onGenerate }) {
  const { user } = useAuth()
  const [showReviewer, setShowReviewer] = useState(false)
  const [showNotedBy,  setShowNotedBy]  = useState(false)
  const [preparedBy,   setPreparedBy]   = useState(user?.full_name || '')
  const [position,     setPosition]     = useState('')
  const [reviewerName, setReviewerName] = useState('')
  const [notedByName,  setNotedByName]  = useState('')

  const isPdf = purpose === 'pdf'
  const title = isPdf ? 'Enter Signature Information for PDF Preview' : 'Enter Signature Information for Excel Download'

  return (
    <ModalShell title={title} onClose={onClose} maxWidth="max-w-sm">
      <p className="text-[12px] text-[#7A8E7A] text-center mb-4">
        Please provide the names and positions for the signature section of the PDF report.
      </p>

      <p className="text-[13px] font-semibold text-[#1A2B1A] mb-2">* Prepared by</p>
      <div>
        <label className={filterLabelCls}>Name:</label>
        <input type="text" value={preparedBy} onChange={e => setPreparedBy(e.target.value)} className={baseInputClasses} />
        <p className="text-[11px] text-[#A8BCA8] italic mt-0.5">Auto-filled with your name (editable)</p>
      </div>
      <div className="mt-2">
        <label className={filterLabelCls}>Position/Designation:</label>
        <input type="text" value={position} onChange={e => setPosition(e.target.value)} placeholder="ENTER YOUR POSITION..." className={baseInputClasses} />
      </div>

      <div className="border-t border-[#F0F4F0] my-3" />

      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">
            * Reviewed by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
          </p>
          <button type="button" onClick={() => setShowReviewer(v => !v)} className="text-[12px] font-medium text-[#1B4D2E] hover:underline">
            {showReviewer ? 'Remove' : 'Add'}
          </button>
        </div>
        {showReviewer && (
          <input type="text" value={reviewerName} onChange={e => setReviewerName(e.target.value)} placeholder="Enter reviewer name" className={`${baseInputClasses} mt-2`} />
        )}
      </div>

      <div className="border-t border-[#F0F4F0] my-3" />

      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">
            * Noted by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
          </p>
          <button type="button" onClick={() => setShowNotedBy(v => !v)} className="text-[12px] font-medium text-[#1B4D2E] hover:underline">
            {showNotedBy ? 'Remove' : 'Add'}
          </button>
        </div>
        {showNotedBy && (
          <input type="text" value={notedByName} onChange={e => setNotedByName(e.target.value)} placeholder="Enter noted-by name" className={`${baseInputClasses} mt-2`} />
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4 mt-3">
        <button type="button" onClick={onClose} className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors">
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

function YAActionButtons({ onPdf, onExcel, isDownloading }) {
  return (
    <div className="flex gap-2 justify-end">
      <button type="button" onClick={onPdf} disabled={isDownloading}
        className="flex items-center gap-1.5 bg-[#C0392B] hover:bg-[#A93226] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
        <FileText className="w-4 h-4" /> Preview PDF
      </button>
      <button type="button" onClick={onExcel} disabled={isDownloading}
        className="flex items-center gap-1.5 bg-[#1B4D2E] hover:bg-[#235E38] text-white text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60">
        <Download className="w-4 h-4" /> Download Excel
      </button>
    </div>
  )
}

// ── Variance visual helpers (color-coded bands, never a verdict) ────────────────

function varianceTone(pct) {
  if (pct === null || pct === undefined) return 'slate'
  if (pct >= 0) return 'green'
  if (pct >= -20) return 'amber'
  return 'rose'
}

const VARIANCE_TONE_CLS = {
  green: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  amber: 'text-amber-700 bg-amber-50 border-amber-200',
  rose:  'text-rose-700 bg-rose-50 border-rose-200',
  slate: 'text-slate-500 bg-slate-100 border-slate-200',
}

function VarianceBadge({ pct }) {
  const tone = varianceTone(pct)
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${VARIANCE_TONE_CLS[tone]}`}>
      {pct === null || pct === undefined ? 'N/A' : `${pct >= 0 ? '+' : ''}${pct.toFixed(1)}%`}
    </span>
  )
}

// ── Aggregate Panel (barangay/species toggle + cycle-trend note) ────────────────

function AggregatePanel({ groupBy, setGroupBy, groups, overall, cycleTrend, isLoading }) {
  const maxAbsVariance = Math.max(10, ...groups.map(g => Math.abs(g.avg_variance_pct ?? 0)))

  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Aggregate Summary</p>
        <div className="flex items-center gap-1 rounded-lg border border-[#E2E8E2] p-0.5">
          {['barangay', 'species'].map(opt => (
            <button
              key={opt}
              type="button"
              onClick={() => setGroupBy(opt)}
              className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
                groupBy === opt ? 'bg-[#1B4D2E] text-white' : 'text-[#4A5E4A] hover:bg-[#F5F7F5]'
              }`}
            >
              {opt === 'barangay' ? 'By Barangay' : 'By Species'}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-3 mb-4">
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Stockings</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.stocking_count ?? 0}</p>
        </div>
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Avg Estimated</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.avg_estimated_kg != null ? `${overall.avg_estimated_kg.toLocaleString()} kg` : 'N/A'}</p>
        </div>
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Avg Variance</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.avg_variance_pct != null ? `${overall.avg_variance_pct >= 0 ? '+' : ''}${overall.avg_variance_pct.toFixed(1)}%` : 'N/A'}</p>
          {overall.total_loss_count > 0 && (
            <p className="text-[10px] text-[#7A8E7A] mt-0.5">excl. {overall.total_loss_count} total loss</p>
          )}
        </div>
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Avg Activity Completion</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.avg_activity_completion_pct != null ? `${overall.avg_activity_completion_pct.toFixed(1)}%` : 'N/A'}</p>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-[12px] text-[#7A8E7A] py-3 text-center">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-[12px] text-[#7A8E7A] py-3 text-center">No harvested or total-loss stockings in scope.</p>
        ) : groups.map(g => (
          <div key={g.group} className="flex items-center gap-3 text-[12px]">
            <span className="w-32 shrink-0 truncate text-[#4A5E4A] font-medium" title={g.group}>{g.group}</span>
            <span className="w-16 shrink-0 text-[#7A8E7A]" title={g.total_loss_count > 0 ? `Avg variance excludes ${g.total_loss_count} total-loss record${g.total_loss_count !== 1 ? 's' : ''}` : undefined}>
              {g.stocking_count} stocking{g.stocking_count !== 1 ? 's' : ''}
              {g.total_loss_count > 0 && <span className="text-rose-500"> ({g.total_loss_count} loss)</span>}
            </span>
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                {g.avg_variance_pct != null && (
                  <div
                    className={`h-full ${g.avg_variance_pct >= 0 ? 'bg-emerald-400' : g.avg_variance_pct >= -20 ? 'bg-amber-400' : 'bg-rose-400'}`}
                    style={{ width: `${Math.min(100, (Math.abs(g.avg_variance_pct) / maxAbsVariance) * 100)}%` }}
                  />
                )}
              </div>
              <span className="w-16 shrink-0 text-right font-medium text-[#1A2B1A]">
                {g.avg_variance_pct != null ? `${g.avg_variance_pct >= 0 ? '+' : ''}${g.avg_variance_pct.toFixed(1)}%` : 'N/A'}
              </span>
            </div>
            <div className="flex-1 flex items-center gap-1.5">
              <div className="flex-1 h-2 rounded-full bg-slate-100 overflow-hidden">
                {g.avg_activity_completion_pct != null && (
                  <div className="h-full bg-[#1B4D2E]" style={{ width: `${Math.min(100, g.avg_activity_completion_pct)}%` }} />
                )}
              </div>
              <span className="w-16 shrink-0 text-right font-medium text-[#1A2B1A]">
                {g.avg_activity_completion_pct != null ? `${g.avg_activity_completion_pct.toFixed(1)}%` : 'N/A'}
              </span>
            </div>
          </div>
        ))}
        {groups.length > 0 && (
          <div className="flex items-center gap-3 text-[11px] text-[#A8BCA8] pt-1">
            <span className="w-32 shrink-0" />
            <span className="w-16 shrink-0" />
            <span className="flex-1 text-right pr-16">avg variance %</span>
            <span className="flex-1 text-right pr-16">avg activity completion %</span>
          </div>
        )}
      </div>

      {cycleTrend && cycleTrend.length > 0 && (
        <div className="mt-4 border-t border-[#F0F4F0] pt-4">
          <p className="text-[12px] font-semibold text-[#1A2B1A] mb-2">Cycle Trend (Repeat Stockings)</p>
          <div className="flex flex-wrap gap-3">
            {cycleTrend.map((c) => (
              <div key={c.cycle} className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2">
                <p className="text-[11px] text-[#7A8E7A]">Cycle {c.cycle}</p>
                <p className="text-[14px] font-bold text-[#1A2B1A]">
                  {c.avg_variance_pct >= 0 ? '+' : ''}{c.avg_variance_pct.toFixed(1)}%
                </p>
                <p className="text-[10px] text-[#A8BCA8]">{c.stocking_count} stocking{c.stocking_count !== 1 ? 's' : ''}</p>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-[#A8BCA8] italic mt-2">
            Shows whether repeat cycles for the same fisherfolk and species tend to land closer to or further from their own estimate — descriptive only, not a claim about why.
          </p>
        </div>
      )}

      <p className="text-[11px] text-[#A8BCA8] italic mt-3">
        Bars show whether groups with higher activity completion also tend to land closer to their own estimate — shown descriptively, not as proof of cause and effect.
      </p>
    </div>
  )
}

// ── Forecasting Tab (fisheries yield analysis) ───────────────────────────────

export default function ForecastingTab({ asTab = false }) {
  const { showToast } = useToast()
  const [speciesList, setSpeciesList] = useState([])
  const [records, setRecords] = useState([])
  const [groups, setGroups] = useState([])
  const [overall, setOverall] = useState({})
  const [cycleTrend, setCycleTrend] = useState(null)
  const [groupBy, setGroupBy] = useState('barangay')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig, setShowSig] = useState(false)
  const [sigPurpose, setSigPurpose] = useState('pdf')
  const [expanded, setExpanded] = useState(() => new Set())
  const [filters, setFilters] = useState({ species: '', barangay: '', year: '' })
  const [fisherfolkFilter, setFisherfolkFilter] = useState(null)
  const [viewMode, setViewMode] = useState('analysis') // 'analysis' | 'grouped'
  const [grouped, setGrouped] = useState([])
  const [isLoadingGrouped, setIsLoadingGrouped] = useState(false)
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    api.get('/fisheries/species/').then(r => {
      setSpeciesList(Array.isArray(r.data) ? r.data : (r.data.results || []))
    }).catch(() => {})
  }, [])

  const buildParams = (extra = {}) => {
    const p = { ...extra }
    if (filters.species)  p.species  = filters.species
    if (filters.barangay) p.barangay = filters.barangay
    if (filters.year)     p.year     = filters.year
    if (fisherfolkFilter) p.fisherfolk = fisherfolkFilter.id
    return p
  }

  useEffect(() => {
    setIsLoading(true)
    api.get('/fisheries/yield-analysis/', { params: buildParams() })
      .then(r => setRecords(r.data.records || []))
      .catch(() => showToast('Failed to load yield analysis.', 'error'))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.species, filters.barangay, filters.year, fisherfolkFilter])

  useEffect(() => {
    setIsLoadingSummary(true)
    api.get('/fisheries/yield-analysis/summary/', { params: buildParams({ group_by: groupBy }) })
      .then(r => {
        setGroups(r.data.groups || [])
        setOverall(r.data.overall || {})
        setCycleTrend(r.data.cycle_trend || null)
      })
      .catch(() => showToast('Failed to load aggregate summary.', 'error'))
      .finally(() => setIsLoadingSummary(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.species, filters.barangay, filters.year, fisherfolkFilter, groupBy])

  // Grouped-by-fisherfolk view — reuses StockingRecordSerializer via the
  // unpaginated /fisheries/stocking/history/ endpoint (all statuses), computing
  // per-record variance client-side (harvested only) against each record's own
  // estimate. Same filters as the analysis view.
  useEffect(() => {
    if (viewMode !== 'grouped') return
    setIsLoadingGrouped(true)
    api.get('/fisheries/stocking/history/', { params: buildParams() })
      .then(r => {
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setGrouped(list.map(rec => {
          const est = Number(rec.estimated_harvest_kg)
          const actual = Number(rec.total_harvested_kg)
          const variancePct = (rec.status === 'Harvested' && est > 0)
            ? ((actual - est) / est) * 100
            : null
          return {
            id: rec.id,
            person: rec.fisherfolk_name,
            commodity: rec.species_name,
            landStatus: rec.land_status,
            dateField: rec.date_stocked,
            status: rec.status,
            harvestDate: rec.final_harvest_date,
            variancePct,
            isTotalLoss: rec.status === 'Total Loss',
          }
        }))
      })
      .catch(() => showToast('Failed to load grouped view.', 'error'))
      .finally(() => setIsLoadingGrouped(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filters.species, filters.barangay, filters.year, fisherfolkFilter])

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ ...buildParams({ group_by: groupBy }), format: fmt })
    return `/reports/fisheries-yield-analysis/?${p}`
  }

  const handleGenerate = async (sigData) => {
    setShowSig(false)
    setIsDownloading(true)
    const fmt  = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    const file = sigPurpose === 'pdf' ? 'fisheries_yield_analysis_report.pdf' : 'fisheries_yield_analysis_report.xlsx'
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

  const innerContent = (
    <div className="space-y-5">
      {/* View toggle: existing analysis vs grouped by fisherfolk */}
      <div className="flex items-center gap-1 w-fit rounded-lg border border-[#E2E8E2] p-0.5">
        {[{ id: 'analysis', label: 'Analysis' }, { id: 'grouped', label: 'Group by fisherfolk' }].map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setViewMode(v.id)}
            className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${viewMode === v.id ? 'bg-[#1B4D2E] text-white' : 'text-[#4A5E4A] hover:bg-[#F5F7F5]'}`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {viewMode === 'analysis' && <DisclaimerBanner />}

      {/* Filters */}
      <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
        <p className="text-[13px] font-semibold text-[#1A2B1A] mb-4">Filter Options</p>
        <div className="flex flex-wrap gap-3">
          <div className="w-44">
            <label className={filterLabelCls}>Species</label>
            <select className={baseInputClasses} value={filters.species} onChange={e => set('species', e.target.value)}>
              <option value="">All Species</option>
              {speciesList.map(s => <option key={s.id} value={s.id}>{s.species_name}</option>)}
            </select>
          </div>
          <div className="w-44">
            <label className={filterLabelCls}>Barangay</label>
            <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
          </div>
          <div className="w-28">
            <label className={filterLabelCls}>Year</label>
            <input type="number" placeholder="e.g. 2026" className={baseInputClasses} value={filters.year} onChange={e => set('year', e.target.value)} />
          </div>
          <div className="w-56">
            <label className={filterLabelCls}>Fisherfolk</label>
            <FisherfolkFilterInput selected={fisherfolkFilter} onSelect={setFisherfolkFilter} />
          </div>
        </div>
      </div>

      {viewMode === 'grouped' ? (
        <GroupedForecast
          records={grouped}
          isLoading={isLoadingGrouped}
          personLabel="Fisherfolk"
          commodityLabel="Species"
          dateLabel="Date Stocked"
        />
      ) : (<>
      <AggregatePanel groupBy={groupBy} setGroupBy={setGroupBy} groups={groups} overall={overall} cycleTrend={cycleTrend} isLoading={isLoadingSummary} />

      <YAActionButtons
        onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
        onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
        isDownloading={isDownloading}
      />

      {/* Per-stocking table */}
      <div>
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Harvested / Total-Loss Stockings</p>
        <p className="text-[12px] text-[#7A8E7A] mb-3">Click a row to see the full activity completion breakdown.</p>
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {['', 'SPECIES', 'FISHERFOLK', 'BARANGAY', 'CYCLE #', 'ESTIMATED (KG)', 'ACTUAL (KG)', 'VARIANCE', 'ACTIVITIES', 'POSSIBLE FACTORS'].map((h, i) => (
                  <th key={i} className="px-3 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={10} className="py-8 text-center text-[13px] text-[#7A8E7A]">Loading…</td></tr>
              ) : records.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-[13px] text-[#7A8E7A]">No harvested or total-loss stockings found in scope.</td></tr>
              ) : records.map(rec => (
                <Fragment key={rec.id}>
                  <tr
                    onClick={() => toggleExpand(rec.id)}
                    className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] cursor-pointer"
                  >
                    <td className="px-3 py-[11px] text-[#7A8E7A]">
                      {expanded.has(rec.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">
                      {rec.species}
                      {rec.is_total_loss && (
                        <span className="ml-1.5 rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Total Loss</span>
                      )}
                    </td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.fisherfolk}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.barangay}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">#{rec.production_cycle_no}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.estimated_kg != null ? rec.estimated_kg.toLocaleString() : 'N/A'}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.actual_total_kg.toLocaleString()}</td>
                    <td className="px-3 py-[11px] whitespace-nowrap"><VarianceBadge pct={rec.variance_pct} /></td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.activities_completed_count}/{rec.activities_total_count}</td>
                    <td className="px-3 py-[11px] text-[12px] text-[#4A5E4A] max-w-xs">{possibleFactorsText(rec, 'fisheries')}</td>
                  </tr>
                  {expanded.has(rec.id) && (
                    <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
                      <td colSpan={10} className="px-6 py-4">
                        <p className="text-[12px] font-semibold text-[#1A2B1A] mb-2">Activity Completion Breakdown</p>
                        {rec.activity_breakdown.length === 0 ? (
                          <p className="text-[12px] text-[#7A8E7A]">No activity schedule defined for this species.</p>
                        ) : (
                          <div className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                            {rec.activity_breakdown.map((b, i) => (
                              <div key={i} className={`flex items-center gap-1.5 text-[12px] rounded-lg border px-2 py-1 ${
                                b.completed ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-rose-200 bg-rose-50 text-rose-700'
                              }`}>
                                <span className="font-medium">{b.completed ? '✓' : '✗'}</span>
                                <span className="truncate">{b.activity} (Day {b.scheduled_day})</span>
                                {b.priority === 'HIGH' && <span className="text-[10px] uppercase tracking-wide opacity-70 shrink-0">high</span>}
                              </div>
                            ))}
                          </div>
                        )}
                        <p className="text-[11px] text-[#A8BCA8] italic mt-3">{YIELD_DISCLAIMER}</p>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      </>)}

      {showSig && (
        <YASignatureModal purpose={sigPurpose} onClose={() => setShowSig(false)} onGenerate={handleGenerate} />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fisheries Forecasting"
      subtitle="Descriptive yield analysis based on recorded harvests versus planting-time estimates."
    >
      {innerContent}
    </PageLayout>
  )
}
