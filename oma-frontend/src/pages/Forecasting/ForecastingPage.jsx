import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  BarChart2, ChevronDown, ChevronRight, Download, FileText,
  Info, Plus, Search, TrendingUp, Upload, User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import CropRecordImportModal from '../../components/CropRecordImportModal.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import BARANGAYS from '../../constants/barangays.js'
import DataTable from '../../components/UI/DataTable.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import ViewToggle from '../../components/UI/ViewToggle.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import GroupedForecast from './GroupedForecast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { countdownText, daysUntil, fmtShortDate } from '../../utils/forecastDates.js'
import { possibleFactorsText } from '../../utils/yieldAnalysis.js'

const filterLabelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// Same compact select style CropMonitoringPage.jsx/FisheriesRecordsPage.jsx
// already use for their FilterPanel children.
const filterSelectCls =
  'h-[38px] rounded-lg border border-[#E2E8E2] bg-white px-3 text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

const COLUMNS = [
  { key: 'crop_cell',         label: 'CROP' },
  { key: 'farmer_cell',       label: 'FARMER' },
  { key: 'area_cell',         label: 'AREA (HA)' },
  { key: 'yield_cell',        label: 'EST. YIELD (KG)' },
  { key: 'harvest_date_cell', label: 'EXPECTED HARVEST' },
  { key: 'status_cell',       label: 'STATUS' },
  { key: 'actions',           label: 'DETAILS' },
]

// A value label inside the detail dialog: plain sentence-case text.
const labelCls = 'text-[11px] font-medium text-[#7A8E7A]'

// ── Detail Modal ──────────────────────────────────────────────────────────────

function ForecastDetailModal({ record, onClose, onUpdated }) {
  const { showToast } = useToast()
  const { isFarmer } = useAuth()   // a farmer sees their crop's forecast but cannot edit staff remarks
  const originalNotes = record.notes || ''
  const [notes,    setNotes]    = useState(originalNotes)
  const [isSaving, setIsSaving] = useState(false)
  const hasChanges = notes !== originalNotes

  const handleSaveRemarks = async () => {
    setIsSaving(true)
    try {
      await api.patch(`/production/monitoring/${record.id}/`, { notes })
      showToast('Remarks saved.', 'success')
      onUpdated?.()
    } catch {
      showToast('Failed to save remarks.', 'error')
    } finally { setIsSaving(false) }
  }

  return (
    <ModalShell
      title={`${record.crop_type_name ?? '—'} Forecast Details`}
      subtitle={`${record.farmer_name || '—'} · Planted ${fmtShortDate(record.date_planted)}`}
      icon={TrendingUp}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] transition-colors hover:bg-[#F5F7F5]"
        >
          Close
        </button>
      }
    >
      <div className="space-y-4">
        {/* Two panels side by side */}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="mb-3 text-[12px] font-semibold text-[#4A5E4A] flex items-center gap-1.5"><BarChart2 size={13} />Crop</p>
            <dl className="space-y-2.5">
              <div>
                <dt className={labelCls}>Area planted</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">
                  {record.area_planted_ha ? `${Number(record.area_planted_ha).toFixed(2)} ha` : '—'}
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Expected harvest</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">
                  {fmtShortDate(record.expected_harvest_date)}
                  <span className="ml-1.5 text-[11px] font-normal text-[#7A8E7A]">{countdownText(record.expected_harvest_date)}</span>
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Estimated yield</dt>
                <dd className="text-[13px] font-semibold text-[#1B4D2E]">
                  {record.estimated_yield_kg ? `${Number(record.estimated_yield_kg).toLocaleString()} kg` : '—'}
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Status</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">{daysUntil(record.expected_harvest_date) < 0 ? 'Overdue' : (record.status || '—')}</dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="mb-3 text-[12px] font-semibold text-[#4A5E4A] flex items-center gap-1.5"><User size={13} />Farmer &amp; location</p>
            <dl className="space-y-2.5">
              <div>
                <dt className={labelCls}>Farmer</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">{record.farmer_name || '—'}</dd>
              </div>
              <div>
                <dt className={labelCls}>Organization</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">{record.organization_name || 'None'}</dd>
              </div>
              <div>
                <dt className={labelCls}>Barangay</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">{record.farmer_barangay || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {!isFarmer && <div className="border-t border-[#F0F4F0]" />}

        {/* Remarks & Notes (staff only) */}
        {!isFarmer && <div>
          <label className="mb-1.5 flex items-center gap-1.5 text-[12px] font-semibold text-[#4A5E4A]"><FileText size={13} />Remarks &amp; notes</label>
          <textarea
            rows={4}
            className={baseInputClasses}
            value={notes}
            onChange={e => setNotes(e.target.value)}
            placeholder="Add remarks or observations..."
          />
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={handleSaveRemarks}
              disabled={isSaving || !hasChanges}
              className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-50"
            >
              {isSaving ? 'Saving…' : 'Save remarks'}
            </button>
          </div>
        </div>}
      </div>
    </ModalShell>
  )
}

// ── Yield Analysis: disclaimer banner ──────────────────────────────────────────

const YIELD_DISCLAIMER = 'This analysis is descriptive. Yield is affected by many factors including weather, pests, and soil; missed activities are shown as possible contributing factors, not proven causes.'

function DisclaimerBanner() {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
      <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
      <p className="text-[12px] text-amber-800 leading-relaxed">{YIELD_DISCLAIMER}</p>
    </div>
  )
}

// ── Yield Analysis: Signature Modal (mirrors ReportsPage.jsx) ──────────────────

function YASignatureModal({ purpose, onClose, onGenerate }) {
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
    <ModalShell
      title={title}
      onClose={onClose}
      maxWidth="max-w-sm"
      footer={
        <>
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
        </>
      }
    >
      <p className="text-[12px] text-[#7A8E7A] text-center mb-4">
        Please provide the names and positions for the signature section of the PDF report.
      </p>

      <p className="text-[13px] font-semibold text-[#1A2B1A] mb-2">* Prepared by</p>
      <div>
        <label className={filterLabelCls}>Name:</label>
        <input
          type="text"
          value={preparedBy}
          onChange={e => setPreparedBy(e.target.value)}
          className={baseInputClasses}
        />
        <p className="text-[11px] text-[#A8BCA8] italic mt-0.5">Auto-filled with your name (editable)</p>
      </div>
      <div className="mt-2">
        <label className={filterLabelCls}>Position/Designation:</label>
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

    </ModalShell>
  )
}

// The report buttons, shown at the right end of the toolbar (outline + primary, like every other page's actions).
function YAActionButtons({ onPdf, onExcel, isDownloading }) {
  return (
    <>
      <button
        type="button"
        onClick={onPdf}
        disabled={isDownloading}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E2E8E2] px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0] disabled:opacity-60"
      >
        <FileText className="h-4 w-4" />
        Preview PDF
      </button>
      <button
        type="button"
        onClick={onExcel}
        disabled={isDownloading}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-60"
      >
        <Download className="h-4 w-4" />
        Download Excel
      </button>
    </>
  )
}

// ── Yield Analysis: variance visual helpers ─────────────────────────────────────

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

// ── Yield Analysis: Aggregate Panel ─────────────────────────────────────────────

function AggregatePanel({ groupBy, setGroupBy, groups, overall, isLoading }) {
  const maxAbsVariance = Math.max(10, ...groups.map(g => Math.abs(g.avg_variance_pct ?? 0)))

  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Aggregate summary</p>
        <ViewToggle
          ariaLabel="Group the summary by"
          options={[{ id: 'barangay', label: 'By barangay' }, { id: 'crop_type', label: 'By crop type' }]}
          value={groupBy}
          onChange={setGroupBy}
        />
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 lg:grid-cols-4">
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Harvested crops</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.harvested_crop_count ?? 0}</p>
        </div>
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Avg. estimated</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.avg_estimated_kg != null ? `${overall.avg_estimated_kg.toLocaleString()} kg` : 'N/A'}</p>
        </div>
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Avg. variance</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.avg_variance_pct != null ? `${overall.avg_variance_pct >= 0 ? '+' : ''}${overall.avg_variance_pct.toFixed(1)}%` : 'N/A'}</p>
          {overall.total_loss_count > 0 && (
            <p className="text-[10px] text-[#7A8E7A] mt-0.5">excl. {overall.total_loss_count} total loss</p>
          )}
        </div>
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Avg. activity completion</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.avg_activity_completion_pct != null ? `${overall.avg_activity_completion_pct.toFixed(1)}%` : 'N/A'}</p>
        </div>
      </div>

      <div className="space-y-2">
        {isLoading ? (
          <p className="text-[12px] text-[#7A8E7A] py-3 text-center">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-[12px] text-[#7A8E7A] py-3 text-center">No harvested crops in scope.</p>
        ) : groups.map(g => (
          <div key={g.group} className="flex items-center gap-3 text-[12px]">
            <span className="w-32 shrink-0 truncate text-[#4A5E4A] font-medium" title={g.group}>{g.group}</span>
            <span className="w-14 shrink-0 text-[#7A8E7A]" title={g.total_loss_count > 0 ? `Avg variance excludes ${g.total_loss_count} total-loss record${g.total_loss_count !== 1 ? 's' : ''}` : undefined}>
              {g.harvested_crop_count} crop{g.harvested_crop_count !== 1 ? 's' : ''}
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
            <span className="w-14 shrink-0" />
            <span className="flex-1 text-right pr-16">avg variance %</span>
            <span className="flex-1 text-right pr-16">avg activity completion %</span>
          </div>
        )}
      </div>

      <p className="text-[11px] text-[#A8BCA8] italic mt-3">
        Bars show whether groups with higher activity completion also tend to land closer to their own estimate — shown descriptively, not as proof of cause and effect.
      </p>
    </div>
  )
}

// ── Farmer filter (autocomplete search-select) ──────────────────────────────
// Mirrors FisheriesForecastingTab.jsx's FisherfolkFilterInput exactly, swapped
// to the farmers endpoint, so "Group by farmer" behaves identically to
// fisheries' "Group by fisherfolk".

function FarmerFilterInput({ selected, onSelect }) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [showDrop, setShowDrop] = useState(false)
  const debounceRef = useRef(null)
  const wrapperRef = useRef(null)

  const doSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return }
    try {
      const r = await api.get('/farmers/', { params: { search: q } })
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
          placeholder="All Farmers"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
        />
      </div>
      {showDrop && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto">
          {results.map((f) => (
            <button
              key={f.id}
              type="button"
              onMouseDown={() => { onSelect(f); setQuery(''); setShowDrop(false) }}
              className="flex flex-col w-full px-3 py-2 text-left hover:bg-[#F5F7F5] transition-colors"
            >
              <span className="text-xs font-semibold text-[#1A2B1A]">{f.full_name}</span>
              <span className="text-[11px] text-[#7A8E7A]">{f.barangay}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ── Yield Analysis Tab ───────────────────────────────────────────────────────

function YieldAnalysisTab() {
  const { showToast } = useToast()
  // A farmer sees only their own harvested crops: no farmer picker, no "by farmer" grouping, no aggregate
  // comparison and no report export (those are staff tools and the endpoints behind them are staff-only).
  const { isFarmer } = useAuth()
  const [cropTypes, setCropTypes] = useState([])
  const [records, setRecords] = useState([])
  const [groups, setGroups] = useState([])
  const [overall, setOverall] = useState({})
  const [groupBy, setGroupBy] = useState('barangay')
  const [isLoading, setIsLoading] = useState(true)
  const [isLoadingSummary, setIsLoadingSummary] = useState(true)
  const [isDownloading, setIsDownloading] = useState(false)
  const [showSig, setShowSig] = useState(false)
  const [sigPurpose, setSigPurpose] = useState('pdf')
  const [expanded, setExpanded] = useState(() => new Set())
  const [filters, setFilters] = useState({ crop_type: '', barangay: '', season: '', year: '' })
  const [farmerFilter, setFarmerFilter] = useState(null)
  const [search, setSearch] = useState('')
  const [viewMode, setViewMode] = useState('analysis') // 'analysis' | 'grouped'
  const [grouped, setGrouped] = useState([])
  const [isLoadingGrouped, setIsLoadingGrouped] = useState(false)
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    // is_active=true: this crop-types list feeds the crop-type filter
    // dropdown here, which scopes the Yield Analysis / forecast VIEW —
    // not a historical report export — so a retired crop type shouldn't
    // clutter the choices (matches the same reasoning as the Add Crop and
    // Add/Edit Variety crop-type selects).
    api.get('/production/crop-types/', { params: { is_active: 'true' } }).then(r => {
      setCropTypes(Array.isArray(r.data) ? r.data : (r.data.results || []))
    }).catch(() => {})
  }, [])

  const buildParams = (extra = {}) => {
    const p = { ...extra }
    if (filters.crop_type) p.crop_type = filters.crop_type
    if (filters.barangay)  p.barangay  = filters.barangay
    if (filters.season)    p.season    = filters.season
    if (filters.year)      p.year      = filters.year
    if (farmerFilter)      p.farmer    = farmerFilter.id
    return p
  }

  useEffect(() => {
    setIsLoading(true)
    api.get('/production/yield-analysis/', { params: buildParams() })
      .then(r => setRecords(r.data.records || []))
      .catch(() => showToast('Failed to load yield analysis.', 'error'))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.crop_type, filters.barangay, filters.season, filters.year, farmerFilter])

  useEffect(() => {
    if (isFarmer) { setIsLoadingSummary(false); return }
    setIsLoadingSummary(true)
    api.get('/production/yield-analysis/summary/', { params: buildParams({ group_by: groupBy }) })
      .then(r => {
        setGroups(r.data.groups || [])
        setOverall(r.data.overall || {})
      })
      .catch(() => showToast('Failed to load aggregate summary.', 'error'))
      .finally(() => setIsLoadingSummary(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.crop_type, filters.barangay, filters.season, filters.year, farmerFilter, groupBy])

  // Grouped-by-farmer view — reuses the Farmer Crop History report's JSON
  // query (all statuses, not just harvested), normalized to GroupedForecast's
  // shape. Same filters as the analysis view, mirroring FisheriesForecastingTab's
  // "Group by fisherfolk" grouped-view fetch.
  useEffect(() => {
    if (viewMode !== 'grouped') return
    setIsLoadingGrouped(true)
    api.get('/reports/farmer-crop-history/', { params: { ...buildParams(), format: 'json' } })
      .then(r => setGrouped((r.data.records || []).map(rec => ({
        id: rec.id,
        person: rec.farmer,
        commodity: rec.crop_type,
        landStatus: rec.land_status,
        dateField: rec.date_planted,
        status: rec.status,
        harvestDate: rec.actual_harvest_date,
        variancePct: rec.variance_pct,
        isTotalLoss: rec.is_total_loss,
      }))))
      .catch(() => showToast('Failed to load grouped view.', 'error'))
      .finally(() => setIsLoadingGrouped(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode, filters.crop_type, filters.barangay, filters.season, filters.year, farmerFilter])

  const toggleExpand = (id) => {
    setExpanded(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  // Client-side quick filter over the already-fetched (unpaginated) records —
  // the crop_type/barangay/season/year/farmer filters above are server-side
  // and also drive the aggregate summary + export; this one is a simple text
  // narrow-down of what's already on screen, same role as ForecastingPage's
  // Forecast-tab search and CropMonitoringPage's search.
  const q = search.toLowerCase()
  const filteredRecords = records.filter(rec =>
    !q
    || rec.crop_type?.toLowerCase().includes(q)
    || rec.farmer?.toLowerCase().includes(q)
    || rec.barangay?.toLowerCase().includes(q)
  )

  const buildUrl = (fmt) => {
    const p = new URLSearchParams({ ...buildParams({ group_by: groupBy }), format: fmt })
    return `/reports/yield-analysis/?${p}`
  }

  const handleGenerate = async (sigData) => {
    setShowSig(false)
    setIsDownloading(true)
    const fmt  = sigPurpose === 'pdf' ? 'pdf' : 'excel'
    const file = sigPurpose === 'pdf' ? 'yield_analysis_report.pdf' : 'yield_analysis_report.xlsx'
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

  return (
    <div className="space-y-5">
      {/* One toolbar: search, filters and (staff) the report downloads. */}
      <FilterPanel
        className=""
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder={isFarmer ? 'Search by crop or barangay...' : 'Search by crop, farmer, or barangay...'}
        activeCount={[filters.crop_type, filters.barangay, filters.season, filters.year, farmerFilter?.id].filter(Boolean).length}
        actions={!isFarmer && viewMode === 'analysis' ? (
          <YAActionButtons
            onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
            onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
            isDownloading={isDownloading}
          />
        ) : null}
      >
        <select className={filterSelectCls} value={filters.crop_type} onChange={e => set('crop_type', e.target.value)} aria-label="Crop type">
          <option value="">All crops</option>
          {cropTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select className={filterSelectCls} value={filters.barangay} onChange={e => set('barangay', e.target.value)} aria-label="Barangay">
          <option value="">All barangays</option>
          {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={filterSelectCls} value={filters.season} onChange={e => set('season', e.target.value)} aria-label="Season">
          <option value="">All seasons</option>
          <option value="Dry">Dry season</option>
          <option value="Wet">Wet season</option>
        </select>
        <input
          type="number"
          placeholder="Year"
          aria-label="Year"
          className={`${filterSelectCls} w-24`}
          value={filters.year}
          onChange={e => set('year', e.target.value)}
        />
        {!isFarmer && <div className="w-56"><FarmerFilterInput selected={farmerFilter} onSelect={setFarmerFilter} /></div>}
      </FilterPanel>

      {!isFarmer && (
        <ViewToggle
          ariaLabel="Show the yield analysis as"
          options={[{ id: 'analysis', label: 'Analysis' }, { id: 'grouped', label: 'By farmer' }]}
          value={viewMode}
          onChange={setViewMode}
        />
      )}

      {viewMode === 'analysis' && <DisclaimerBanner />}

      {viewMode === 'grouped' ? (
        <GroupedForecast
          records={grouped}
          isLoading={isLoadingGrouped}
          personLabel="Farmer"
          commodityLabel="Crop"
          dateLabel="Date Planted"
        />
      ) : (<>
      {!isFarmer && <AggregatePanel groupBy={groupBy} setGroupBy={setGroupBy} groups={groups} overall={overall} isLoading={isLoadingSummary} />}

      {/* Per-crop table */}
      <div>
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Harvested crops</p>
        <p className="text-[12px] text-[#7A8E7A] mb-3">Click a row to see the full activity completion breakdown.</p>
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          <table className="min-w-full text-sm">
            <thead className="bg-[#1B4D2E] text-white">
              <tr>
                {['', 'CROP', 'FARMER', 'BARANGAY', 'ESTIMATED (KG)', 'ACTUAL (KG)', 'VARIANCE', 'ACTIVITIES', 'POSSIBLE FACTORS'].map((h, i) => (
                  <th key={i} className="px-3 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                <tr><td colSpan={9} className="py-8 text-center text-[13px] text-[#7A8E7A]">Loading…</td></tr>
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={9} className="py-8 text-center text-[13px] text-[#7A8E7A]">
                  {records.length === 0 ? 'No harvested crops found in scope.' : 'No crops match your search.'}
                </td></tr>
              ) : filteredRecords.map(rec => (
                <Fragment key={rec.id}>
                  <tr
                    onClick={() => toggleExpand(rec.id)}
                    className="border-b border-[#F0F4F0] hover:bg-[#F9FAF9] cursor-pointer"
                  >
                    <td className="px-3 py-[11px] text-[#7A8E7A]">
                      {expanded.has(rec.id) ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">
                      {rec.crop_type}
                      {rec.is_total_loss && (
                        <span className="ml-1.5 rounded-full bg-rose-50 border border-rose-200 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">Total Loss</span>
                      )}
                    </td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.farmer}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.barangay}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.estimated_kg != null ? rec.estimated_kg.toLocaleString() : 'N/A'}</td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.actual_total_kg.toLocaleString()}</td>
                    <td className="px-3 py-[11px] whitespace-nowrap"><VarianceBadge pct={rec.variance_pct} /></td>
                    <td className="px-3 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap">{rec.activities_completed_count}/{rec.activities_total_count}</td>
                    <td className="px-3 py-[11px] text-[12px] text-[#4A5E4A] max-w-xs"><span className="line-clamp-2" title={possibleFactorsText(rec, 'crop')}>{possibleFactorsText(rec, 'crop')}</span></td>
                  </tr>
                  {expanded.has(rec.id) && (
                    <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
                      <td colSpan={9} className="px-6 py-4">
                        <p className="text-[12px] font-semibold text-[#1A2B1A] mb-2">Activity completion breakdown</p>
                        {rec.activity_breakdown.length === 0 ? (
                          <p className="text-[12px] text-[#7A8E7A]">No activity schedule defined for this crop.</p>
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
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function ForecastingPage() {
  const navigate = useNavigate()
  const { isFarmer } = useAuth()   // farmer account: own crops only, no staff tools (add, import, by-farmer grouping)
  const [activeTab,     setActiveTab]     = useState('forecast')
  const [records,       setRecords]       = useState([])
  const [totalCount,    setTotalCount]    = useState(0)
  const [page,          setPage]          = useState(1)
  const [isLoading,     setIsLoading]     = useState(true)
  const [error,         setError]         = useState('')
  const [search,        setSearch]        = useState('')
  // Searched on the server across every growing crop (farmer, RSBSA, crop,
  // organization, barangay), so it is debounced; the list is no longer
  // filtered after the fact on just the ten rows on screen.
  const debouncedSearch = useDebouncedValue(search.trim())
  const [detailRecord,  setDetailRecord]  = useState(null)
  const [showRsbsaImportModal, setShowRsbsaImportModal] = useState(false)
  const [forecastView,  setForecastView]  = useState('flat') // 'flat' | 'grouped'
  const [grouped,       setGrouped]       = useState([])
  const [isLoadingGrouped, setIsLoadingGrouped] = useState(false)
  const [cropTypes,     setCropTypes]     = useState([])
  const [barangayFilter, setBarangayFilter] = useState('')
  const [cropTypeFilter, setCropTypeFilter] = useState('')
  const { showToast } = useToast()

  useEffect(() => {
    // is_active=true — see the flat-view crop-types fetch above for why.
    api.get('/production/crop-types/', { params: { is_active: 'true' } }).then(r => {
      setCropTypes(Array.isArray(r.data) ? r.data : (r.data.results || []))
    }).catch(() => {})
  }, [])

  // Grouped-by-farmer view reuses the Farmer Crop History report's JSON query
  // (all statuses, not just harvested), normalized to GroupedForecast's shape.
  // Same barangay/crop-type filters as the flat view — FarmerCropHistoryReport
  // already accepts both.
  //
  // barangayFilter and cropTypeFilter each trigger their own state update, so
  // changing two filters in quick succession fires two overlapping requests
  // with no guarantee they resolve in the order they were sent. Guarded with
  // this codebase's own established cancelled-flag idiom (see e.g.
  // MyYieldAnalysisSection.jsx, StaffDashboard.jsx
  // — many files already use this exact pattern) rather than inventing a new
  // one: the effect's cleanup flips `cancelled` before the next run starts,
  // so a response that lands after a newer request has already begun is
  // discarded instead of applied.
  useEffect(() => {
    if (forecastView !== 'grouped') return
    let cancelled = false
    setIsLoadingGrouped(true)
    const params = { format: 'json' }
    if (barangayFilter) params.barangay = barangayFilter
    if (cropTypeFilter) params.crop_type = cropTypeFilter
    api.get('/reports/farmer-crop-history/', { params })
      .then(r => {
        if (cancelled) return
        setGrouped((r.data.records || []).map(rec => ({
          id: rec.id,
          person: rec.farmer,
          commodity: rec.crop_type,
          landStatus: rec.land_status,
          dateField: rec.date_planted,
          status: rec.status,
          harvestDate: rec.actual_harvest_date,
          variancePct: rec.variance_pct,
          isTotalLoss: rec.is_total_loss,
        })))
      })
      .catch(() => { if (!cancelled) showToast('Failed to load grouped view.', 'error') })
      .finally(() => { if (!cancelled) setIsLoadingGrouped(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forecastView, barangayFilter, cropTypeFilter])

  // Same cancelled-flag idiom as the grouped view above, for the flat view's
  // fetch. fetchRecords is also called imperatively elsewhere (after an
  // Excel import, after a record edit) — isCancelled defaults to "never
  // cancelled" for those call sites, since they aren't part of the rapid
  // filter-change sequence this guards against; only the page/filter-driven
  // effect below supplies a real one, tied to its own cleanup.
  const fetchRecords = useCallback(async (pageNum = 1, isCancelled = () => false) => {
    setIsLoading(true); setError('')
    try {
      // Soonest expected harvest first — the order a forecast is read in.
      const params = { status: 'Planted,Near Harvest', page: pageNum, ordering: 'expected_harvest_date' }
      if (barangayFilter) params.barangay = barangayFilter
      if (cropTypeFilter) params.crop_type = cropTypeFilter
      if (debouncedSearch) params.search = debouncedSearch
      const r = await api.get('/production/monitoring/', { params })
      if (isCancelled()) return
      setRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
      setTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      if (!isCancelled()) setError('Failed to load forecast records.')
    } finally {
      if (!isCancelled()) setIsLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barangayFilter, cropTypeFilter, debouncedSearch])

  useEffect(() => { setPage(1) }, [barangayFilter, cropTypeFilter, debouncedSearch])
  useEffect(() => {
    let cancelled = false
    fetchRecords(page, () => cancelled)
    return () => { cancelled = true }
  }, [fetchRecords, page])

  const rows = records.map(rec => {
    const days = daysUntil(rec.expected_harvest_date)
    const overdue = days !== null && days < 0
    return {
      ...rec,
      crop_cell: <span className="font-medium text-[#1A2B1A] whitespace-nowrap">{rec.crop_type_name}</span>,
      // Name, then barangay and organization on one truncated line (the full
      // text is on hover and in the detail dialog) so every row stays two lines.
      farmer_cell: (
        <span className="block w-[210px] max-w-[210px]">
          <span className="block truncate text-[#1A2B1A]" title={rec.farmer_name || ''}>{rec.farmer_name || '—'}</span>
          <span className="block truncate text-[11px] text-[#7A8E7A]" title={[rec.farmer_barangay, rec.organization_name].filter(Boolean).join(' · ')}>
            {[rec.farmer_barangay, rec.organization_name].filter(Boolean).join(' · ') || '—'}
          </span>
        </span>
      ),
      area_cell: rec.area_planted_ha ? Number(rec.area_planted_ha).toFixed(2) : '—',
      yield_cell: rec.estimated_yield_kg
        ? <span className="font-semibold text-[#1B4D2E]">{Number(rec.estimated_yield_kg).toLocaleString()}</span>
        : '—',
      harvest_date_cell: (
        <span className="block whitespace-nowrap">
          <span className="block text-[#1A2B1A]">{fmtShortDate(rec.expected_harvest_date)}</span>
          <span className={`block text-[11px] ${overdue ? 'text-rose-600' : 'text-[#7A8E7A]'}`}>{countdownText(rec.expected_harvest_date)}</span>
        </span>
      ),
      status_cell: (
        <StatusPill tone={overdue ? 'rose' : rec.status === 'Near Harvest' ? 'amber' : 'green'}>
          {overdue ? 'Overdue' : rec.status}
        </StatusPill>
      ),
      actions: (
        <button
          type="button"
          className="text-sm font-medium text-[#1B4D2E] hover:underline"
          onClick={() => setDetailRecord(rec)}
        >
          View
        </button>
      ),
    }
  })

  return (
    <PageLayout
      title="Crop Forecasting"
      subtitle="Expected harvest dates and yields for crops still growing, and how past harvests compared with their estimates."
    >
      <div className="space-y-4">
        <PillTabs
          ariaLabel="Forecasting views"
          tabs={[
            { id: 'forecast',       icon: TrendingUp, label: 'Forecast' },
            { id: 'yield_analysis', icon: BarChart2,  label: 'Yield analysis' },
          ]}
          value={activeTab}
          onChange={setActiveTab}
        />

        {activeTab === 'forecast' && (
          <div className="space-y-4">
            <FilterPanel
              className=""
              search={search}
              onSearchChange={setSearch}
              searchPlaceholder={isFarmer ? 'Search by crop or barangay...' : 'Search by farmer, RSBSA, crop, or organization...'}
              activeCount={[Boolean(barangayFilter), Boolean(cropTypeFilter)].filter(Boolean).length}
              actions={!isFarmer ? (
                <>
                  <button
                    type="button"
                    onClick={() => setShowRsbsaImportModal(true)}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E2E8E2] px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0]"
                  >
                    <Upload className="h-4 w-4" />
                    Import Crop Records
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate('/crop-records/add')}
                    className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]"
                  >
                    <Plus className="h-4 w-4" />
                    Add Crop Record
                  </button>
                </>
              ) : null}
            >
              <select className={filterSelectCls} value={cropTypeFilter} onChange={e => setCropTypeFilter(e.target.value)} aria-label="Crop type">
                <option value="">All crops</option>
                {cropTypes.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <select className={filterSelectCls} value={barangayFilter} onChange={e => setBarangayFilter(e.target.value)} aria-label="Barangay">
                <option value="">All barangays</option>
                {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </FilterPanel>

            {error && <ErrorMessage message={error} />}

            {/* How the crops are shown on the left, how many there are on the right. */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {isFarmer ? <span /> : (
                <ViewToggle
                  ariaLabel="Show crops as"
                  options={[{ id: 'flat', label: 'All crops' }, { id: 'grouped', label: 'By farmer' }]}
                  value={forecastView}
                  onChange={setForecastView}
                />
              )}
              {forecastView === 'flat' && !isLoading && (
                <p className="text-[12px] text-[#7A8E7A]">
                  {totalCount.toLocaleString()} growing crop{totalCount === 1 ? '' : 's'}, soonest harvest first
                </p>
              )}
            </div>

            {forecastView === 'flat' ? (
              <>
                <DataTable columns={isFarmer ? COLUMNS.filter(c => c.key !== 'farmer_cell') : COLUMNS} data={rows} isLoading={isLoading} />
                <PaginationBar
                  page={page}
                  totalCount={totalCount}
                  pageSize={10}
                  onPageChange={setPage}
                />
              </>
            ) : (
              <GroupedForecast
                records={grouped}
                isLoading={isLoadingGrouped}
                personLabel="Farmer"
                commodityLabel="Crop"
                dateLabel="Date Planted"
              />
            )}
          </div>
        )}

        {activeTab === 'yield_analysis' && <YieldAnalysisTab />}
      </div>

      {detailRecord && (
        <ForecastDetailModal
          record={detailRecord}
          onClose={() => setDetailRecord(null)}
          onUpdated={() => fetchRecords(page)}
        />
      )}

      {showRsbsaImportModal && !isFarmer && (
        <CropRecordImportModal
          onClose={() => setShowRsbsaImportModal(false)}
          onCommitted={() => fetchRecords(page)}
        />
      )}
    </PageLayout>
  )
}
