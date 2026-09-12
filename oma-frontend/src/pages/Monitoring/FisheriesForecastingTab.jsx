import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, BarChart2, ChevronDown, ChevronRight, Download, FileText,
  Info, Plus, Search, TrendingUp, Upload, User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import BARANGAYS from '../../constants/barangays.js'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import DataTable from '../../components/UI/DataTable.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import GroupedForecast from '../Forecasting/GroupedForecast.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { possibleFactorsText } from '../../utils/yieldAnalysis.js'

const filterLabelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// Same compact select style ForecastingPage.jsx (crop) uses for its FilterPanel children.
const filterSelectCls =
  'rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-[7px] text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

// Fisheries Forecasting "Forecast" tab scope: today <= expected_harvest_date
// <= today + FORECAST_WINDOW_DAYS. 7 was not picked arbitrarily for
// fisheries — it's the exact number crop's own Planted -> Near Harvest
// auto-transition already uses (CropMonitoringRecord.save(),
// production/models.py), and StockingRecord.save() independently already
// uses the same 7-day Stocked -> Near Harvest transition. Reusing it here
// keeps the two domains' notion of "upcoming" consistent.
const FORECAST_WINDOW_DAYS = 7

function fmtMDY(v) {
  if (!v) return '—'
  const d = new Date(v + 'T00:00:00')
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`
}

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

// ── Forecast Detail Modal (mirrors ForecastDetailModal in crop's ForecastingPage.jsx) ──

function StockingForecastDetailModal({ record, onClose, onUpdated }) {
  const { showToast } = useToast()
  const originalNotes = record.notes || ''
  const [notes,    setNotes]    = useState(originalNotes)
  const [isSaving, setIsSaving] = useState(false)
  const hasChanges = notes !== originalNotes

  const handleSaveRemarks = async () => {
    setIsSaving(true)
    try {
      await api.patch(`/fisheries/stocking/${record.id}/`, { notes })
      showToast('Remarks saved.', 'success')
      onUpdated?.()
    } catch {
      showToast('Failed to save remarks.', 'error')
    } finally { setIsSaving(false) }
  }

  return (
    <ModalShell
      title={`${record.species_name ?? '—'} Forecast Details`}
      subtitle={`${record.fisherfolk_name || '—'} — Stocked: ${record.date_stocked || '—'}`}
      icon={TrendingUp}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="mb-3 text-[11px] font-semibold text-[#4A5E4A] flex items-center gap-1"><BarChart2 size={12} />Basic Information</p>
            <dl className="space-y-2.5">
              <div>
                <dt className={labelCls}>Fingerlings Stocked</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">
                  {record.number_of_fingerlings ? Number(record.number_of_fingerlings).toLocaleString() : '—'}
                </dd>
              </div>
              <div>
                <dt className={labelCls}>Estimated Harvest</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">
                  {fmtMDY(record.expected_harvest_date)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] p-4">
            <p className="mb-3 text-[11px] font-semibold text-[#4A5E4A] flex items-center gap-1"><User size={12} />Fisherfolk & Location</p>
            <dl className="space-y-2.5">
              <div>
                <dt className={labelCls}>Fisherfolk</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">{record.fisherfolk_name || '—'}</dd>
              </div>
              <div>
                <dt className={labelCls}>Barangay</dt>
                <dd className="text-[13px] font-semibold text-[#1A2B1A]">{record.pond_location_barangay || '—'}</dd>
              </div>
            </dl>
          </div>
        </div>

        <div className="border-t border-[#F0F4F0]" />

        <div>
          <label className="mb-1.5 flex items-center gap-1 text-[12px] font-semibold text-[#4A5E4A]"><FileText size={12} />Remarks & Notes</label>
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
              {isSaving ? 'Saving…' : 'Save Remarks'}
            </button>
          </div>
        </div>

        <div className="flex justify-end border-t border-[#F0F4F0] pt-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#C8D5C8] px-4 py-2 text-[13px] font-medium text-[#4A5E4A] transition-colors hover:bg-[#F5F7F5]"
          >
            Close
          </button>
        </div>
      </div>
    </ModalShell>
  )
}

const labelCls = 'text-[10px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]'

// ── Import Errors Modal (mirrors ImportErrorsModal in crop's ForecastingPage.jsx) ──

function StockingImportErrorsModal({ errors, duplicates = [], created, onClose }) {
  const hasIssues = errors.length > 0 || duplicates.length > 0
  return (
    <ModalShell
      title="Import Results"
      subtitle={`${created} record${created !== 1 ? 's' : ''} created`}
      icon={AlertTriangle}
      onClose={onClose}
      maxWidth="max-w-lg"
    >
      {!hasIssues ? (
        <p className="text-sm text-[#1B4D2E] font-medium py-2">All rows imported successfully.</p>
      ) : (
        <div className="space-y-4 max-h-72 overflow-y-auto pr-1">
          {duplicates.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] text-[#7A8E7A]">
                {duplicates.length} row{duplicates.length !== 1 ? 's' : ''} skipped as duplicate{duplicates.length !== 1 ? 's' : ''} — not created:
              </p>
              {duplicates.map((d, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
                  <span className="text-xs font-semibold text-amber-700 shrink-0">Row {d.row}</span>
                  <span className="text-xs text-amber-800">{d.error}</span>
                </div>
              ))}
            </div>
          )}
          {errors.length > 0 && (
            <div className="space-y-2">
              <p className="text-[12px] text-[#7A8E7A]">{errors.length} row{errors.length !== 1 ? 's' : ''} had errors:</p>
              {errors.map((e, i) => (
                <div key={i} className="flex items-start gap-2 rounded-lg border border-rose-100 bg-rose-50 px-3 py-2">
                  <span className="text-xs font-semibold text-rose-600 shrink-0">Row {e.row}</span>
                  <span className="text-xs text-rose-700">{e.error}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
      <div className="flex justify-end pt-4 border-t border-[#F0F4F0] mt-4">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]"
        >
          Close
        </button>
      </div>
    </ModalShell>
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
  const navigate = useNavigate()
  const { showToast } = useToast()
  const [activeTab, setActiveTab] = useState('forecast') // 'forecast' | 'yield_analysis'

  // ── "Forecast" tab: upcoming stockings (additive — everything below this
  // block, through the existing "yield analysis" state, is unchanged) ──────
  const [fcRecords,        setFcRecords]        = useState([])
  const [fcTotalCount,     setFcTotalCount]     = useState(0)
  const [fcPage,           setFcPage]           = useState(1)
  const [fcLoading,        setFcLoading]        = useState(true)
  const [fcError,          setFcError]          = useState('')
  const [fcSearch,         setFcSearch]         = useState('')
  const [fcDetail,         setFcDetail]         = useState(null)
  const [fcImporting,      setFcImporting]      = useState(false)
  const [fcImportResults,  setFcImportResults]  = useState(null)
  const [fcView,           setFcView]           = useState('flat') // 'flat' | 'grouped'
  const [fcGrouped,        setFcGrouped]        = useState([])
  const [fcGroupedLoading, setFcGroupedLoading] = useState(false)
  const [fcSpeciesFilter,  setFcSpeciesFilter]  = useState('')
  const [fcBarangayFilter, setFcBarangayFilter] = useState('')
  const fcFileInputRef = useRef(null)

  const fetchForecastRecords = useCallback(async (pageNum = 1, isCancelled = () => false) => {
    setFcLoading(true); setFcError('')
    try {
      const today = new Date()
      const to = new Date(today)
      to.setDate(to.getDate() + FORECAST_WINDOW_DAYS)
      const fmtISO = (d) => d.toISOString().slice(0, 10)
      const params = { date_from: fmtISO(today), date_to: fmtISO(to), page: pageNum }
      if (fcBarangayFilter) params.barangay = fcBarangayFilter
      if (fcSpeciesFilter)  params.species  = fcSpeciesFilter
      const r = await api.get('/fisheries/stocking/', { params })
      if (isCancelled()) return
      setFcRecords(Array.isArray(r.data) ? r.data : (r.data.results || []))
      setFcTotalCount(typeof r.data?.count === 'number' ? r.data.count : 0)
    } catch {
      if (!isCancelled()) setFcError('Failed to load forecast records.')
    } finally {
      if (!isCancelled()) setFcLoading(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fcBarangayFilter, fcSpeciesFilter])

  useEffect(() => { setFcPage(1) }, [fcBarangayFilter, fcSpeciesFilter])
  useEffect(() => {
    let cancelled = false
    fetchForecastRecords(fcPage, () => cancelled)
    return () => { cancelled = true }
  }, [fetchForecastRecords, fcPage])

  // Grouped-by-fisherfolk view for the Forecast tab — reuses the same
  // /fisheries/stocking/history/ endpoint (all statuses, unpaginated)
  // and mapping shape the existing Analysis tab's own grouped view already
  // uses below, kept as a separate effect/state so that existing view is
  // left completely untouched.
  useEffect(() => {
    if (fcView !== 'grouped') return
    let cancelled = false
    setFcGroupedLoading(true)
    const params = {}
    if (fcBarangayFilter) params.barangay = fcBarangayFilter
    if (fcSpeciesFilter)  params.species  = fcSpeciesFilter
    api.get('/fisheries/stocking/history/', { params })
      .then(r => {
        if (cancelled) return
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setFcGrouped(list.map(rec => {
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
      .catch(() => { if (!cancelled) showToast('Failed to load grouped view.', 'error') })
      .finally(() => { if (!cancelled) setFcGroupedLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fcView, fcBarangayFilter, fcSpeciesFilter])

  const handleFcDownloadTemplate = async () => {
    try {
      await downloadFile(api, '/fisheries/stocking/forecasting/template/', 'stocking_forecasting_template.xlsx')
    } catch {
      showToast('Failed to download template.', 'error')
    }
  }

  const handleFcImportFile = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setFcImporting(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await api.post('/fisheries/stocking/forecasting/import/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setFcImportResults(r.data)
      if (r.data.created > 0) fetchForecastRecords(fcPage)
    } catch (err) {
      showToast(err?.response?.data?.error || 'Import failed.', 'error')
    } finally {
      setFcImporting(false)
    }
  }

  const fcQ = fcSearch.toLowerCase()
  const fcFiltered = fcRecords.filter(rec =>
    !fcQ
    || rec.species_name?.toLowerCase().includes(fcQ)
    || rec.fisherfolk_name?.toLowerCase().includes(fcQ)
  )

  const FC_COLUMNS = [
    { key: 'species_name',      label: 'SPECIES' },
    { key: 'fingerlings_cell',  label: 'FINGERLINGS' },
    { key: 'yield_cell',        label: 'ESTIMATED HARVEST YIELD (KG)' },
    { key: 'harvest_date_cell', label: 'ESTIMATED HARVEST DATE' },
    { key: 'actions',           label: 'DETAILS' },
  ]

  const fcRows = fcFiltered.map(rec => ({
    ...rec,
    fingerlings_cell: rec.number_of_fingerlings ? Number(rec.number_of_fingerlings).toLocaleString() : '—',
    harvest_date_cell: fmtMDY(rec.expected_harvest_date),
    yield_cell: rec.estimated_harvest_kg
      ? <span className="font-semibold text-[#1B4D2E]">{Number(rec.estimated_harvest_kg).toLocaleString()} kg</span>
      : '—',
    actions: (
      <button
        type="button"
        className="text-sm text-[#1B4D2E] hover:underline"
        onClick={() => setFcDetail(rec)}
      >
        View
      </button>
    ),
  }))

  // ── existing "Yield Analysis" state (UNCHANGED below this point) ─────────
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
  const [search, setSearch] = useState('')
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

  // Client-side quick filter over the already-fetched (unpaginated) records —
  // mirrors the crop Yield Analysis tab's search, same role as the
  // species/barangay/year/fisherfolk filters' server-side counterparts.
  const q = search.toLowerCase()
  const filteredRecords = records.filter(rec =>
    !q
    || rec.species?.toLowerCase().includes(q)
    || rec.fisherfolk?.toLowerCase().includes(q)
    || rec.barangay?.toLowerCase().includes(q)
  )

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

  const yieldAnalysisContent = (
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
          <div className="w-56">
            <label className={filterLabelCls}>Search</label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
              <input
                className={`${baseInputClasses} pl-7`}
                placeholder="Species, fisherfolk, or barangay..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
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
              ) : filteredRecords.length === 0 ? (
                <tr><td colSpan={10} className="py-8 text-center text-[13px] text-[#7A8E7A]">
                  {records.length === 0 ? 'No harvested or total-loss stockings found in scope.' : 'No stockings match your search.'}
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

  const forecastContent = (
    <div className="space-y-4">
      <div className="flex items-center justify-end gap-2">
        <input
          ref={fcFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFcImportFile}
        />
        <button
          type="button"
          onClick={() => navigate('/fisheries-monitoring/add')}
          className="flex items-center gap-1.5 rounded-lg border border-[#C8D5C8] px-3 py-[5px] text-[12px] font-medium text-[#4A5E4A] transition-colors hover:bg-[#F5F7F5]"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Stocking
        </button>
        <button
          type="button"
          disabled={fcImporting}
          onClick={() => fcFileInputRef.current?.click()}
          className="flex items-center gap-1.5 rounded-lg bg-[#1B4D2E] px-3 py-[5px] text-[12px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-60"
        >
          {fcImporting
            ? <span className="h-3 w-3 animate-spin rounded-full border-2 border-white border-t-transparent" />
            : <Upload className="h-3.5 w-3.5" />
          }
          {fcImporting ? 'Importing…' : 'Import Excel'}
        </button>
        <button
          type="button"
          onClick={handleFcDownloadTemplate}
          className="flex items-center gap-1.5 rounded-lg border border-[#C8D5C8] px-3 py-[5px] text-[12px] font-medium text-[#4A5E4A] transition-colors hover:bg-[#F5F7F5]"
        >
          <Download className="h-3.5 w-3.5" />
          Template
        </button>
      </div>

      <FilterPanel
        search={fcSearch}
        onSearchChange={setFcSearch}
        searchPlaceholder="Search by species or fisherfolk..."
        activeCount={[Boolean(fcBarangayFilter), Boolean(fcSpeciesFilter)].filter(Boolean).length}
      >
        <select className={filterSelectCls} value={fcSpeciesFilter} onChange={e => setFcSpeciesFilter(e.target.value)}>
          <option value="">All Species</option>
          {speciesList.map(s => <option key={s.id} value={s.id}>{s.species_name}</option>)}
        </select>
        <select className={filterSelectCls} value={fcBarangayFilter} onChange={e => setFcBarangayFilter(e.target.value)}>
          <option value="">All Barangays</option>
          {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </FilterPanel>

      {fcError && <ErrorMessage message={fcError} />}

      {/* View toggle: flat per-record table vs grouped by fisherfolk */}
      <div className="flex items-center gap-1 w-fit rounded-lg border border-[#E2E8E2] p-0.5">
        {[
          { id: 'flat',    label: 'Flat' },
          { id: 'grouped', label: 'Group by fisherfolk' },
        ].map(v => (
          <button
            key={v.id}
            type="button"
            onClick={() => setFcView(v.id)}
            className={`px-3 py-1 rounded-md text-[12px] font-medium transition-colors ${
              fcView === v.id ? 'bg-[#1B4D2E] text-white' : 'text-[#4A5E4A] hover:bg-[#F5F7F5]'
            }`}
          >
            {v.label}
          </button>
        ))}
      </div>

      {fcView === 'flat' ? (
        <>
          <DataTable columns={FC_COLUMNS} data={fcRows} isLoading={fcLoading} />
          <PaginationBar
            page={fcPage}
            totalCount={fcTotalCount}
            pageSize={10}
            onPageChange={setFcPage}
          />
        </>
      ) : (
        <GroupedForecast
          records={fcGrouped}
          isLoading={fcGroupedLoading}
          personLabel="Fisherfolk"
          commodityLabel="Species"
          dateLabel="Date Stocked"
        />
      )}
    </div>
  )

  const innerContent = (
    <div className="space-y-4">
      {/* Top-level tab bar — structural parity with crop's ForecastingPage.jsx.
          "Yield Analysis" wraps the pre-existing page content unchanged
          (Analysis/Grouped toggle, filters, AggregatePanel, Cycle Trend,
          Harvested/Total-Loss table); "Forecast" is new. */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'forecast',       icon: TrendingUp, label: 'Forecast' },
          { id: 'yield_analysis', icon: BarChart2,  label: 'Yield Analysis' },
        ].map(tab => (
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

      {activeTab === 'forecast' ? forecastContent : yieldAnalysisContent}

      {fcDetail && (
        <StockingForecastDetailModal
          record={fcDetail}
          onClose={() => setFcDetail(null)}
          onUpdated={() => fetchForecastRecords(fcPage)}
        />
      )}

      {fcImportResults && (
        <StockingImportErrorsModal
          created={fcImportResults.created}
          errors={fcImportResults.errors}
          duplicates={fcImportResults.duplicates}
          onClose={() => setFcImportResults(null)}
        />
      )}
    </div>
  )

  if (asTab) return innerContent

  return (
    <PageLayout
      title="Fisheries Forecasting"
      subtitle="Upcoming stockings and descriptive yield analysis based on recorded harvests versus stocking-time estimates."
    >
      {innerContent}
    </PageLayout>
  )
}
