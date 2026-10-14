import { Fragment, useCallback, useEffect, useRef, useState } from 'react'
import {
  AlertTriangle, BarChart2, ChevronDown, ChevronRight, Download, FileText,
  Info, Plus, Search, TrendingUp, Upload, User,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import BARANGAYS from '../../constants/barangays.js'
import DataTable from '../../components/UI/DataTable.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import PillTabs from '../../components/UI/PillTabs.jsx'
import ViewToggle from '../../components/UI/ViewToggle.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import ErrorMessage from '../../components/UI/ErrorMessage.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import GroupedForecast from '../Forecasting/GroupedForecast.jsx'
import { fmtActualHarvestKg } from '../FisheriesRecords/stockingHelpers.js'
import { ProductionUnitsCards, ProductionUnitsTable } from '../FisheriesRecords/ProductionUnitsPanel.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { ForecastCard } from '../../components/UI/ForecastCard.jsx'
import { ActivityBreakdown, PhoneGroupList, PhoneYieldCard } from '../../components/UI/YieldPhone.jsx'
import useExpandableProductionUnits from '../FisheriesRecords/useExpandableProductionUnits.js'
import AquacultureCycleDetailModal from './AquacultureCycleDetailModal.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { downloadFile } from '../../utils/fileDownload.js'
import { fmtShortDate } from '../../utils/forecastDates.js'
import { possibleFactorsText } from '../../utils/yieldAnalysis.js'

const filterLabelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// Same compact select style ForecastingPage.jsx (crop) uses for its FilterPanel children.
const filterSelectCls =
  'h-[38px] rounded-lg border border-[#E2E8E2] bg-white px-3 text-[13px] text-[#4A5E4A] focus:border-[#1B4D2E] focus:outline-none'

// Fisheries Forecasting "Forecast" tab scope: the same stocking records as the Fisheries Monitoring
// table (Stocked, Near Harvest, Harvested; not Total Loss) - no date window.

// Dates read in the staff app's short style ("Oct 28, 2026") - see utils/forecastDates.js.
const fmtMDY = fmtShortDate

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
              {isSaving ? 'Saving…' : 'Save remarks'}
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
        <input type="text" value={position} onChange={e => setPosition(e.target.value)} placeholder="Your position or designation" className={baseInputClasses} />
      </div>

      <div className="border-t border-[#F0F4F0] my-3" />

      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">
            Reviewed by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
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
            Noted by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
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
    <>
      <button type="button" onClick={onPdf} disabled={isDownloading}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E2E8E2] px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0] disabled:opacity-60">
        <FileText className="h-4 w-4" /> Preview PDF
      </button>
      <button type="button" onClick={onExcel} disabled={isDownloading}
        className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-60">
        <Download className="h-4 w-4" /> Download Excel
      </button>
    </>
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

// ── Actual vs estimated harvest (Forecast table + Harvest Variance Details) ─────
// Same formula as fisheries.views.harvest_variance: ((actual - estimated) / estimated) * 100, from the
// record's own estimated_harvest_kg and cumulative total_harvested_kg. No harvest -> no variance; no or
// zero estimate -> no percentage. Wording stays neutral ("less", "above") - it is never a verdict.
const fmtKg2 = (v) => Number(v).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const fmtPctAbs = (pct) => String(Number(Math.abs(pct).toFixed(1)))

function rowVariance(rec) {
  // Shown whenever there is a recorded harvest and a valid estimate - also for a partially harvested
  // cycle, where it compares the harvest recorded so far (the cycle status is a separate concept).
  if (!rec.harvest_count || rec.estimated_harvest_kg == null) return null
  const est = Number(rec.estimated_harvest_kg)
  if (!(est > 0)) return null
  const diff = Number(rec.total_harvested_kg || 0) - est
  return { pct: (diff / est) * 100, diff }
}

// Short badge text: "+20% above" (always with the plus sign), "30% less", "On estimate".
function varianceShortLabel({ pct, diff }) {
  if (Math.abs(diff) < 0.005 || Number(pct.toFixed(1)) === 0) return 'On estimate'
  return pct > 0 ? `+${fmtPctAbs(pct)}% above` : `${fmtPctAbs(pct)}% less`
}

function varianceLongLabel({ pct, diff }) {
  if (Math.abs(diff) < 0.005 || Number(pct.toFixed(1)) === 0) return 'On estimate'
  return pct > 0 ? `+${fmtPctAbs(pct)}% above estimate` : `${fmtPctAbs(pct)}% less than estimate`
}

function varianceBadgeCls({ pct, diff }) {
  if (Math.abs(diff) < 0.005 || Number(pct.toFixed(1)) === 0) return VARIANCE_TONE_CLS.slate
  return pct > 0 ? VARIANCE_TONE_CLS.green : VARIANCE_TONE_CLS.amber
}

const vdTh = 'px-2.5 py-1.5 text-left text-[11px] font-semibold uppercase tracking-[0.05em] text-[#4A5E4A] whitespace-nowrap'
const vdTd = 'px-2.5 py-1.5 text-[12px] text-[#1A2B1A] align-top'

function VdSection({ title, children }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[13px] font-semibold text-[#1B4D2E]">{title}</p>
      {children}
    </div>
  )
}

function VdTable({ head, children, foot }) {
  return (
    <div className="overflow-x-auto rounded-lg border border-[#E2E8E2]">
      <table className="min-w-full">
        <thead className="bg-[#F5F7F5]"><tr>{head.map(h => <th key={h} className={vdTh}>{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-[#F0F4F0]">{children}</tbody>
        {foot}
      </table>
    </div>
  )
}

// Harvest Variance Details: summary + the harvest records, Health Log and Feeding Log entries of THIS
// record's production cycle, from GET /fisheries/stocking/<id>/variance-details/ (read-only). It only
// lists what was recorded; it does not attribute the variance to any activity.
function HarvestVarianceDetailsModal({ record, onClose }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.get(`/fisheries/stocking/${record.id}/variance-details/`)
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [record.id])

  const v = data && data.variance_pct != null && data.difference_kg != null
    ? { pct: data.variance_pct, diff: Number(data.difference_kg) } : null
  // Partially harvested: some harvest recorded, cycle not closed. The variance is still shown, but it
  // compares the harvest recorded SO FAR - it is never presented as a final shortfall or a loss.
  const partial = Boolean(data && data.harvest_count > 0 && !data.is_fully_harvested)
  const stillStocked = (data?.production_units || []).filter(u => u.status === 'still_stocked')
  // "Pond 3, Pond 4, and Pond 5"
  const joinNames = (names) => (names.length <= 2 ? names.join(' and ') : `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`)
  const cycleStatusText = !data?.harvest_count ? 'Not yet harvested' : data.is_fully_harvested ? 'Fully Harvested' : 'Partially Harvested'

  // One row per harvested unit when the record has per-unit kg; an older combined record stays one row.
  const harvestRows = (data?.harvests || []).flatMap(h => {
    const perUnit = h.units.length > 0 && h.units.every(u => u.quantity_kg != null)
    const reasonFor = (u) => (h.harvest_type === 'Force' && u?.health_reasons?.length ? u.health_reasons.join('; ') : h.reason) || '—'
    if (perUnit) {
      return h.units.map(u => ({ key: `${h.id}-${u.production_unit}`, unit: u.label, type: h.harvest_type,
        kg: fmtKg2(u.quantity_kg), date: h.harvest_date, reason: reasonFor(u) }))
    }
    return [{ key: `${h.id}`, unit: h.units.length ? h.units.map(u => u.label).join(', ') : (h.area_or_units_harvested || '—'),
      type: h.harvest_type, kg: `${fmtKg2(h.quantity_kg)}${h.units.length > 1 ? ' (combined)' : ''}`, date: h.harvest_date,
      reason: reasonFor(h.units.length === 1 ? h.units[0] : null) }]
  })

  return (
    <ModalShell
      title="Harvest Variance Details"
      subtitle={`${record.species_name || ''}${record.fisherfolk_name ? ` · ${record.fisherfolk_name}` : ''}`}
      icon={BarChart2}
      onClose={onClose}
      maxWidth="max-w-3xl"
    >
      <div className="space-y-5" data-testid="harvest-variance-details">
        {failed && <p className="text-[12px] text-rose-600">Failed to load the variance details.</p>}
        {!data && !failed && <p className="text-[12px] text-[#7A8E7A]">Loading…</p>}
        {data && (<>
          <VdSection title="Summary">
            <VdTable head={['Detail', 'Value']}>
              <tr><td className={vdTd}>Estimated Harvest</td><td className={`${vdTd} font-semibold`}>{data.estimated_kg != null ? `${fmtKg2(data.estimated_kg)} kg` : '—'}</td></tr>
              <tr><td className={vdTd}>{partial ? 'Actual Harvest Recorded So Far' : 'Actual Harvest'}</td><td className={`${vdTd} font-semibold`}>{data.harvest_count ? `${fmtKg2(data.actual_total_kg)} kg` : '—'}</td></tr>
              <tr><td className={vdTd}>Difference</td><td className={`${vdTd} font-semibold`}>
                {data.difference_kg != null ? `${Number(data.difference_kg) > 0 ? '+' : ''}${fmtKg2(data.difference_kg)} kg` : '—'}
              </td></tr>
              <tr><td className={vdTd}>Variance</td><td className={`${vdTd} font-semibold`} data-testid="variance-text">
                {v ? `${varianceLongLabel(v)}${partial ? ' based on harvest recorded so far' : ''}`
                  : (data.harvest_count ? 'Not calculated (no estimated harvest)' : '—')}
              </td></tr>
              <tr><td className={vdTd}>Status</td><td className={`${vdTd} font-semibold`} data-testid="cycle-harvest-status">
                {partial ? <span className="text-amber-700">{cycleStatusText}</span> : cycleStatusText}
              </td></tr>
              {data.period?.from && (
                <tr><td className={vdTd}>Period</td><td className={vdTd}>{fmtMDY(data.period.from)} – {data.period.to ? fmtMDY(data.period.to) : '—'}</td></tr>
              )}
            </VdTable>
            {partial && (
              <p className="text-[11px] font-medium text-amber-700" data-testid="cycle-not-fully-harvested">
                Actual harvest recorded so far.
                {stillStocked.length > 0 && ` ${joinNames(stillStocked.map(u => u.name))} ${stillStocked.length === 1 ? 'is' : 'are'} still stocked.`}
              </p>
            )}
          </VdSection>

          {data.production_units.length > 0 && (
            // Every pond/cage of the cycle - harvested or not - with its own recorded kg.
            <VdSection title="Production Unit Status">
              <VdTable head={['Production Unit', 'Status', 'Actual Harvest (kg)']}>
                {data.production_units.map(u => (
                  <tr key={u.id} data-testid={`unit-status-${u.id}`}>
                    <td className={`${vdTd} font-medium`}>{u.name}</td>
                    <td className={vdTd}>
                      {u.status === 'force_harvested'
                        ? <span className="rounded-md border border-red-200 bg-red-50 px-1.5 py-[1px] text-[11px] font-semibold text-red-700">Force Harvested</span>
                        : u.status === 'harvested'
                          ? <span className="rounded-md border border-emerald-200 bg-emerald-50 px-1.5 py-[1px] text-[11px] font-semibold text-emerald-700">Harvested</span>
                          : <span className="text-[#7A8E7A]">Still Stocked</span>}
                    </td>
                    <td className={vdTd}>
                      {u.actual_harvest_kg != null
                        ? fmtKg2(u.actual_harvest_kg)
                        : u.in_combined_harvest
                          ? <span className="text-[#7A8E7A]">In a combined harvest record</span>
                          : '—'}
                    </td>
                  </tr>
                ))}
              </VdTable>
            </VdSection>
          )}

          {stillStocked.length > 0 && data.harvest_count > 0 && (
            // The ponds/cages with no harvest yet, listed explicitly (no harvest value - never 0).
            <VdSection title="Still Stocked / Not Yet Harvested">
              <VdTable head={['Production Unit', 'Status', 'Actual Harvest (kg)']}>
                {stillStocked.map(u => (
                  <tr key={u.id} data-testid={`still-stocked-${u.id}`}>
                    <td className={`${vdTd} font-medium`}>{u.name}</td>
                    <td className={`${vdTd} text-[#7A8E7A]`}>Still Stocked</td>
                    <td className={vdTd}>—</td>
                  </tr>
                ))}
              </VdTable>
            </VdSection>
          )}

          <VdSection title="Harvest Records">
            {harvestRows.length === 0 ? <p className="text-[12px] text-[#7A8E7A]">No harvest recorded yet.</p> : (
              <VdTable
                head={['Production Unit', 'Harvest Type', 'Actual kg', 'Harvest Date', 'Reason']}
                foot={<tfoot><tr className="border-t-2 border-[#E2E8E2] bg-[#F9FAF9]">
                  <td className={`${vdTd} font-semibold`} colSpan={2}>{partial ? 'Total Actual Harvest Recorded' : 'Total Actual Harvest'}</td>
                  <td className={`${vdTd} font-semibold`} colSpan={3}>{fmtKg2(data.actual_total_kg)} kg</td>
                </tr></tfoot>}
              >
                {harvestRows.map(r => (
                  <tr key={r.key}>
                    <td className={`${vdTd} font-medium`}>{r.unit}</td>
                    <td className={vdTd}>{r.type === 'Force'
                      ? <span className="rounded-md border border-red-200 bg-red-50 px-1.5 py-[1px] text-[11px] font-semibold text-red-700">Force Harvest</span>
                      : 'Normal'}</td>
                    <td className={vdTd}>{r.kg}</td>
                    <td className={`${vdTd} whitespace-nowrap`}>{fmtMDY(r.date)}</td>
                    <td className={vdTd}>{r.reason}</td>
                  </tr>
                ))}
              </VdTable>
            )}
          </VdSection>

          <VdSection title="Health Log Activities">
            {data.health_logs.length === 0 ? <p className="text-[12px] text-[#7A8E7A]">No Health Log entries for this production cycle.</p> : (
              <VdTable head={['Date', 'Production Unit', 'Observation', 'Mortality', 'Force Harvest', 'Resulting Harvest']}>
                {data.health_logs.map(l => (
                  <tr key={l.id}>
                    <td className={`${vdTd} whitespace-nowrap`}>{fmtMDY(l.log_date)}</td>
                    <td className={vdTd}>{l.unit_label || '—'}</td>
                    <td className={vdTd}>{l.observation}{l.treatment_applied ? <span className="block text-[11px] text-[#7A8E7A]">Treatment: {l.treatment_applied}</span> : null}</td>
                    <td className={vdTd}>{l.mortality_count > 0 ? l.mortality_count.toLocaleString() : '—'}</td>
                    <td className={vdTd}>{l.force_harvest ? <span className="font-semibold text-red-700">Yes</span> : 'No'}</td>
                    <td className={vdTd}>
                      {l.force_harvest_record
                        ? `Force Harvest${l.force_harvest_record.quantity_kg != null ? ` · ${fmtKg2(l.force_harvest_record.quantity_kg)} kg` : ''} · ${fmtMDY(l.force_harvest_record.harvest_date)}`
                        : (l.force_harvest ? 'Not yet harvested' : '—')}
                    </td>
                  </tr>
                ))}
              </VdTable>
            )}
          </VdSection>

          <VdSection title="Feeding Log Activities">
            {data.feeding_logs.length === 0 ? <p className="text-[12px] text-[#7A8E7A]">No Feeding Log entries for this production cycle.</p> : (
              <VdTable head={['Date', 'Production Unit', 'Feed Type', 'Quantity']}>
                {data.feeding_logs.flatMap(f => (f.units.length > 0
                  ? f.units.map(u => (
                    <tr key={`${f.id}-${u.production_unit}`}>
                      <td className={`${vdTd} whitespace-nowrap`}>{fmtMDY(f.feeding_date)}</td>
                      <td className={vdTd}>{u.label}</td>
                      <td className={vdTd}>{f.feed_type}</td>
                      <td className={vdTd}>{fmtKg2(u.quantity_kg)} kg</td>
                    </tr>
                  ))
                  : [(
                    <tr key={f.id}>
                      <td className={`${vdTd} whitespace-nowrap`}>{fmtMDY(f.feeding_date)}</td>
                      <td className={vdTd}>—</td>
                      <td className={vdTd}>{f.feed_type}</td>
                      <td className={vdTd}>{fmtKg2(f.quantity_kg)} kg</td>
                    </tr>
                  )]))}
              </VdTable>
            )}
          </VdSection>

          <p className="text-[11px] italic text-[#A8BCA8]">
            Recorded activities are listed for reference only; they are not presented as the cause of the difference.
          </p>
        </>)}
      </div>
    </ModalShell>
  )
}

// ── Harvest timing (Early / On-Time / Late) ─────────────────────────────────────
// Display only: the timing itself always comes from the backend (fisheries.models.harvest_timing via
// actual_harvest_timing on the row and harvest_timing on each harvest record) - nothing is recomputed here.
const TIMING_SHORT = { early: 'Early', on_time: 'On-Time', late: 'Late' }
const TIMING_BADGE_CLS = {
  early:   'text-sky-700 bg-sky-50 border-sky-200',
  on_time: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  late:    'text-amber-700 bg-amber-50 border-amber-200',
}

function timingDifferenceText(timing, days) {
  if (timing === 'on_time') return 'On the estimated harvest date.'
  if (days == null) return ''
  const n = Math.abs(days)
  return `${n} day${n !== 1 ? 's' : ''} ${timing === 'early' ? 'earlier' : 'later'} than expected.`
}

// Reason for a harvest's timing: its stored early_late_reason (a Force Harvest's Health Log reason
// included). None shown for on time; "Not recorded" for an early/late record saved without one.
function timingReasonText(timing, reason) {
  if (timing === 'on_time' || !timing) return null
  return (reason || '').trim() || 'Not recorded'
}

// Harvest Timing Details for one stocking record: the timing of the harvest shown in the table (the
// latest one), every harvest record with its own timing and reason, and the status of every pond/cage.
// Data: GET /fisheries/stocking/<id>/variance-details/ (read-only; the same records as the variance modal).
function HarvestTimingDetailsModal({ record, onClose }) {
  const [data, setData] = useState(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let cancelled = false
    api.get(`/fisheries/stocking/${record.id}/variance-details/`)
      .then(r => { if (!cancelled) setData(r.data) })
      .catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true }
  }, [record.id])

  // The table's Actual Harvest Date is the latest harvest; its record(s) give the headline reason.
  const latestDate = record.actual_harvest_date
  const latest = (data?.harvests || []).filter(h => h.harvest_date === latestDate)
  const timing = record.actual_harvest_timing
  // `reason` in this response is the record's stored early_late_reason.
  const headlineReasons = [...new Set(latest.map(h => timingReasonText(h.harvest_timing, h.reason)).filter(Boolean))]
  const reasonFromHealthLog = latest.some(h => h.harvest_type === 'Force')
  // One row per harvested unit (an older record without units stays one row).
  const recordRows = (data?.harvests || []).flatMap(h => {
    const unitReason = (u) => (h.harvest_type === 'Force' && u?.health_reasons?.length ? u.health_reasons.join('; ') : h.reason)
    const base = { date: h.harvest_date, timing: h.harvest_timing, type: h.harvest_type }
    if (h.units.length === 0) return [{ ...base, key: `${h.id}`, unit: h.area_or_units_harvested || '—', reason: timingReasonText(h.harvest_timing, h.reason) }]
    return h.units.map(u => ({ ...base, key: `${h.id}-${u.production_unit}`, unit: u.label, reason: timingReasonText(h.harvest_timing, unitReason(u)) }))
  })
  const UNIT_STATUS = { force_harvested: 'Force Harvested', harvested: 'Harvested', still_stocked: 'Still Stocked' }

  return (
    <ModalShell
      title="Harvest Timing Details"
      subtitle={`${record.species_name || ''}${record.fisherfolk_name ? ` · ${record.fisherfolk_name}` : ''}`}
      icon={Info}
      onClose={onClose}
      maxWidth="max-w-xl"
    >
      <div className="space-y-5" data-testid="harvest-timing-details">
        {failed && <p className="text-[12px] text-rose-600">Failed to load the harvest timing details.</p>}
        {!data && !failed && <p className="text-[12px] text-[#7A8E7A]">Loading…</p>}
        {data && (<>
          <VdTable head={['Detail', 'Value']}>
            <tr><td className={vdTd}>Timing</td><td className={`${vdTd} font-semibold`}>{record.actual_harvest_timing_label || '—'}</td></tr>
            {timing !== 'on_time' && (
              <tr><td className={vdTd}>Difference</td><td className={vdTd}>{timingDifferenceText(timing, record.actual_harvest_timing_days)}</td></tr>
            )}
            <tr><td className={vdTd}>Estimated Harvest Date</td><td className={vdTd}>{fmtMDY(data.estimated_harvest_date)}</td></tr>
            <tr><td className={vdTd}>Actual Harvest Date</td><td className={vdTd}>{fmtMDY(latestDate)}</td></tr>
            {headlineReasons.length > 0 && (
              <tr><td className={vdTd}>Reason</td><td className={`${vdTd} font-semibold`}>
                {headlineReasons.join('; ')}
                {reasonFromHealthLog && <span className="block text-[11px] font-normal text-[#7A8E7A]">Force Harvest — reason from the Health Log.</span>}
              </td></tr>
            )}
          </VdTable>

          {recordRows.length > 1 && (
            <VdSection title="Harvest Records">
              <VdTable head={['Production Unit', 'Harvest Date', 'Timing', 'Reason']}>
                {recordRows.map(r => (
                  <tr key={r.key}>
                    <td className={`${vdTd} font-medium`}>{r.unit}</td>
                    <td className={`${vdTd} whitespace-nowrap`}>{fmtMDY(r.date)}</td>
                    <td className={vdTd}>{r.timing ? TIMING_SHORT[r.timing] : '—'}{r.type === 'Force' ? ' · Force' : ''}</td>
                    <td className={vdTd}>{r.reason || '—'}</td>
                  </tr>
                ))}
              </VdTable>
            </VdSection>
          )}

          {data.production_units.length > 0 && (
            <VdSection title="Production Unit Status">
              <VdTable head={['Production Unit', 'Status']}>
                {data.production_units.map(u => (
                  <tr key={u.id}>
                    <td className={`${vdTd} font-medium`}>{u.name}</td>
                    <td className={`${vdTd} ${u.status === 'still_stocked' ? 'text-[#7A8E7A]' : ''}`}>{UNIT_STATUS[u.status]}</td>
                  </tr>
                ))}
              </VdTable>
            </VdSection>
          )}
        </>)}
      </div>
    </ModalShell>
  )
}

// ── Aggregate Panel (barangay/species toggle + cycle-trend note) ────────────────

// showGroupToggle: the By Barangay / By Species switch (hidden for fisherfolk accounts, which keep the
// default grouping in a view-only analysis).
function AggregatePanel({ groupBy, setGroupBy, groups, overall, cycleTrend, isLoading, showGroupToggle = true }) {
  const maxAbsVariance = Math.max(10, ...groups.map(g => Math.abs(g.avg_variance_pct ?? 0)))

  return (
    <div className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] p-5">
      <div className="flex items-center justify-between mb-4">
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Aggregate summary</p>
        {showGroupToggle && (
        <ViewToggle
          ariaLabel="Group the summary by"
          options={[{ id: 'barangay', label: 'By barangay' }, { id: 'species', label: 'By species' }]}
          value={groupBy}
          onChange={setGroupBy}
        />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4 md:grid-cols-4">
        <div className="bg-[#EBF5EE] rounded-xl p-3">
          <p className="text-[11px] font-medium text-[#4A5E4A]">Stockings</p>
          <p className="text-[18px] font-bold text-[#1B4D2E] mt-0.5">{overall.stocking_count ?? 0}</p>
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

      {/* Phone: one small card per group, the first few open. */}
      {!isLoading && groups.length > 0 && (
        <div className="md:hidden">
          <PhoneGroupList
            groups={groups}
            countText={g => `${g.stocking_count} stocking${g.stocking_count !== 1 ? 's' : ''}`}
            lossCount={g => g.total_loss_count || 0}
          />
        </div>
      )}

      <div className={`space-y-2 ${!isLoading && groups.length > 0 ? 'max-md:hidden' : ''}`}>
        {isLoading ? (
          <p className="text-[12px] text-[#7A8E7A] py-3 text-center">Loading…</p>
        ) : groups.length === 0 ? (
          <p className="text-[12px] text-[#7A8E7A] py-3 text-center">No harvested or total-loss stockings in scope.</p>
        ) : groups.map(g => (
          // Phones: name + count on one line, each bar on its own labelled line; md and up: one row, as before.
          <div key={g.group} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] md:flex-nowrap">
            <span className="min-w-0 flex-1 truncate text-[#4A5E4A] font-medium md:w-32 md:flex-none md:shrink-0" title={g.group}>{g.group}</span>
            <span className="shrink-0 text-[#7A8E7A] md:w-16" title={g.total_loss_count > 0 ? `Avg variance excludes ${g.total_loss_count} total-loss record${g.total_loss_count !== 1 ? 's' : ''}` : undefined}>
              {g.stocking_count} stocking{g.stocking_count !== 1 ? 's' : ''}
              {g.total_loss_count > 0 && <span className="text-rose-500"> ({g.total_loss_count} loss)</span>}
            </span>
            <div className="flex basis-full items-center gap-1.5 md:flex-1">
              <span className="w-16 shrink-0 text-[11px] text-[#A8BCA8] md:hidden">Variance</span>
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
            <div className="flex basis-full items-center gap-1.5 md:flex-1">
              <span className="w-16 shrink-0 text-[11px] text-[#A8BCA8] md:hidden">Activities</span>
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
          <div className="hidden items-center gap-3 text-[11px] text-[#A8BCA8] pt-1 md:flex">
            <span className="w-32 shrink-0" />
            <span className="w-16 shrink-0" />
            <span className="flex-1 text-right pr-16">avg variance %</span>
            <span className="flex-1 text-right pr-16">avg activity completion %</span>
          </div>
        )}
      </div>

      {cycleTrend && cycleTrend.length > 0 && (
        <div className="mt-4 border-t border-[#F0F4F0] pt-4">
          <p className="text-[12px] font-semibold text-[#1A2B1A] mb-2">Cycle trend (repeat stockings)</p>
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
  // Fisherfolk accounts use this same page; the backend returns only their own records.
  const { isFisherfolk } = useAuth()
  const [activeTab, setActiveTab] = useState('forecast') // 'forecast' | 'yield_analysis'
  // Yield Analysis data is loaded only once its tab has been opened (not while Forecast is the active tab);
  // after that it reloads only when its own filters change, not on every tab switch.
  const [yieldOpened, setYieldOpened] = useState(false)

  // ── "Forecast" tab: upcoming stockings (additive — everything below this
  // block, through the existing "yield analysis" state, is unchanged) ──────
  const [fcRecords,        setFcRecords]        = useState([])
  const [fcTotalCount,     setFcTotalCount]     = useState(0)
  const [fcPage,           setFcPage]           = useState(1)
  const [fcLoading,        setFcLoading]        = useState(true)
  const [fcError,          setFcError]          = useState('')
  const [fcSearch,         setFcSearch]         = useState('')
  const [fcSearchDebounced, setFcSearchDebounced] = useState('')
  const [fcDetail,         setFcDetail]         = useState(null)
  const [varianceRec,      setVarianceRec]      = useState(null)   // row whose Harvest Variance Details is open
  const [timingRec,        setTimingRec]        = useState(null)   // row whose Harvest Timing Details is open
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
      // The same records and status scope as the Fisheries Monitoring table ("All Status": Stocked,
      // Near Harvest, Harvested; Total Loss excluded). Without an explicit status the endpoint drops
      // Harvested records, so a cycle closed by its final harvest vanished from Forecasting.
      // Search is applied server-side so it spans every page.
      const params = { page: pageNum, status: 'Stocked,Near Harvest,Harvested' }
      if (fcBarangayFilter) params.barangay = fcBarangayFilter
      if (fcSpeciesFilter)  params.species  = fcSpeciesFilter
      if (fcSearchDebounced.trim()) params.search = fcSearchDebounced.trim()
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
  }, [fcBarangayFilter, fcSpeciesFilter, fcSearchDebounced])

  useEffect(() => {
    const t = setTimeout(() => setFcSearchDebounced(fcSearch), 300)
    return () => clearTimeout(t)
  }, [fcSearch])
  useEffect(() => { setFcPage(1) }, [fcBarangayFilter, fcSpeciesFilter, fcSearchDebounced])
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
    if (fcSearchDebounced.trim()) params.search = fcSearchDebounced.trim()   // same server-side search as the flat list
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
            status: rec.display_status || rec.status,   // same displayed status as the flat table (Late included)
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
  }, [fcView, fcBarangayFilter, fcSpeciesFilter, fcSearchDebounced])

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

  // Both views are searched server-side (name, RSBSA, species, barangay), so they always agree.
  const fcFiltered = fcRecords
  const fcGroupedFiltered = fcGrouped

  // Clicking a forecast row expands that stock's ponds/cages under it (one row at a time) - the same endpoint,
  // hook and panel as Fisheries Monitoring.
  const {
    expandedId: fcExpandedId, unitsState: fcUnitsState, toggle: toggleFcRow, retry: retryFcUnits,
  } = useExpandableProductionUnits(fcRecords)

  const FC_STATUS_TONE = { Stocked: 'green', 'Near Harvest': 'amber', Late: 'rose', Harvested: 'teal', 'Total Loss': 'rose' }

  const FC_COLUMNS = [
    { key: 'species_cell',      label: 'SPECIES' },
    { key: 'fisherfolk_name',   label: 'FISHERFOLK' },
    { key: 'culture_type',      label: 'CULTURE TYPE' },
    { key: 'stocked_cell',      label: 'DATE STOCKED' },
    { key: 'fingerlings_cell',  label: 'FINGERLINGS' },
    { key: 'yield_cell',        label: 'ESTIMATED HARVEST YIELD (KG)' },
    { key: 'actual_harvest_cell', label: 'ACTUAL HARVEST (KG)' },
    { key: 'harvest_date_cell', label: 'ESTIMATED HARVEST DATE' },
    { key: 'actual_harvest_date_cell', label: 'ACTUAL HARVEST DATE' },
    { key: 'status_cell',       label: 'STATUS' },
  ]

  const fcRows = fcFiltered.map(rec => ({
    ...rec,
    _rec: rec,   // the untouched record for the row click / expanded panel
    species_cell: (
      <span className="inline-flex items-center gap-1.5">
        {fcExpandedId === rec.id
          ? <ChevronDown size={15} className="shrink-0 text-[#1B4D2E]" aria-hidden="true" />
          : <ChevronRight size={15} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />}
        <span>{rec.species_name}</span>
      </span>
    ),
    // Same backend display_status as Fisheries Monitoring (Stocked / Near Harvest / Late from today's date;
    // Harvested / Total Loss as stored). A completed harvest's own timing is the badge in Actual Harvest Date.
    status_cell: rec.display_status || rec.status,
    stocked_cell: fmtMDY(rec.date_stocked),
    fingerlings_cell: rec.number_of_fingerlings ? Number(rec.number_of_fingerlings).toLocaleString() : '—',
    harvest_date_cell: fmtMDY(rec.expected_harvest_date),
    // Backend actual_harvest_date: the latest recorded harvest_date ("—" while nothing is harvested),
    // with that harvest's backend timing as a clickable badge (none without a harvest or an estimate).
    actual_harvest_date_cell: rec.actual_harvest_date ? (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
        <span>{fmtMDY(rec.actual_harvest_date)}</span>
        {rec.actual_harvest_timing && (
          <button
            type="button"
            data-testid="timing-indicator"
            title="View Harvest Timing Details"
            onClick={() => setTimingRec(rec)}
            className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4D2E]/30 ${TIMING_BADGE_CLS[rec.actual_harvest_timing]}`}
          >
            {TIMING_SHORT[rec.actual_harvest_timing]}
          </button>
        )}
      </span>
    ) : '—',
    yield_cell: rec.estimated_harvest_kg
      ? <span className="font-semibold text-[#1B4D2E]">{Number(rec.estimated_harvest_kg).toLocaleString()} kg</span>
      : '—',
    // Same helper/source as the Fisheries Monitoring table, so both show the same cumulative actual kg.
    actual_harvest_cell: (() => {
      const v = rowVariance(rec)
      return (
        <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
          <span>{fmtActualHarvestKg(rec)}</span>
          {v && (
            <button
              type="button"
              data-testid="variance-indicator"
              title={rec.status === 'Harvested'
                ? 'View Harvest Variance Details'
                : 'Based on harvest recorded so far - view Harvest Variance Details'}
              onClick={() => setVarianceRec(rec)}
              className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold transition-opacity hover:opacity-80 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4D2E]/30 ${varianceBadgeCls(v)}`}
            >
              {varianceShortLabel(v)}
            </button>
          )}
        </span>
      )
    })(),
  }))

  // The cycle-details action lives in Fisheries Monitoring's expanded row only; nothing on this page opens
  // these two modals at present (state kept so the existing modal wiring below stays intact).
  const [fcCycle, setFcCycle] = useState(null)
  const refreshFcCycle = async () => {
    if (!fcCycle) return
    try {
      const r = await api.get(`/monitoring/aquaculture-cycles/${fcCycle.id}/`)
      setFcCycle(r.data)
    } catch (err) {
      showToast(err?.response?.data?.detail || 'Failed to refresh production cycle.', 'error')
    }
  }

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
    if (!yieldOpened) return
    setIsLoading(true)
    api.get('/fisheries/yield-analysis/', { params: buildParams() })
      .then(r => setRecords(r.data.records || []))
      .catch(() => showToast('Failed to load yield analysis.', 'error'))
      .finally(() => setIsLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [yieldOpened, filters.species, filters.barangay, filters.year, fisherfolkFilter])

  useEffect(() => {
    if (!yieldOpened) return
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
  }, [yieldOpened, filters.species, filters.barangay, filters.year, fisherfolkFilter, groupBy])

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
            status: rec.display_status || rec.status,   // same displayed status as the Forecast table
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

  // The harvested list can run to thousands of records, so it is shown 25 at a time (the page resets whenever the
  // filters or the search change, without an effect: the page number is remembered together with the filters it was for).
  const YIELD_PAGE_SIZE = 25
  const yieldPageKey = JSON.stringify([[filters, fisherfolkFilter?.id], search])
  const [yieldPageState, setYieldPageState] = useState({ key: '', n: 1 })
  const yieldPage = yieldPageState.key === yieldPageKey ? yieldPageState.n : 1
  const setYieldPage = (n) => setYieldPageState({ key: yieldPageKey, n })
  const pagedRecords = filteredRecords.slice((yieldPage - 1) * YIELD_PAGE_SIZE, yieldPage * YIELD_PAGE_SIZE)


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
      {/* One toolbar: search, filters and the report downloads. A fisherfolk account gets a view-only analysis of its
          own records (the backend scopes them), so it has no search or filters - just the downloads. */}
      {!isFisherfolk ? (
        <FilterPanel
          className=""
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search by species, fisherfolk, or barangay..."
          activeCount={[filters.species, filters.barangay, filters.year, fisherfolkFilter?.id].filter(Boolean).length}
          actions={viewMode === 'analysis' ? (
            <YAActionButtons
              onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
              onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
              isDownloading={isDownloading}
            />
          ) : null}
        >
          <select className={filterSelectCls} value={filters.species} onChange={e => set('species', e.target.value)} aria-label="Species">
            <option value="">All species</option>
            {speciesList.map(s => <option key={s.id} value={s.id}>{s.species_name}</option>)}
          </select>
          <select className={filterSelectCls} value={filters.barangay} onChange={e => set('barangay', e.target.value)} aria-label="Barangay">
            <option value="">All barangays</option>
            {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
          <input type="number" placeholder="Year" aria-label="Year" className={`${filterSelectCls} w-24`} value={filters.year} onChange={e => set('year', e.target.value)} />
          <div className="w-56"><FisherfolkFilterInput selected={fisherfolkFilter} onSelect={setFisherfolkFilter} /></div>
        </FilterPanel>
      ) : (
        <div className="flex justify-end gap-2">
          <YAActionButtons
            onPdf={() => { setSigPurpose('pdf'); setShowSig(true) }}
            onExcel={() => { setSigPurpose('excel'); setShowSig(true) }}
            isDownloading={isDownloading}
          />
        </div>
      )}

      {!isFisherfolk && (
        <ViewToggle
          ariaLabel="Show the yield analysis as"
          options={[{ id: 'analysis', label: 'Analysis' }, { id: 'grouped', label: 'By fisherfolk' }]}
          value={viewMode}
          onChange={setViewMode}
        />
      )}

      {viewMode === 'analysis' && <DisclaimerBanner />}

      {viewMode === 'grouped' ? (
        <GroupedForecast
          records={grouped}
          isLoading={isLoadingGrouped}
          personLabel="Fisherfolk"
          commodityLabel="Species"
          dateLabel="Date Stocked"
        />
      ) : (<>
      <AggregatePanel groupBy={groupBy} setGroupBy={setGroupBy} groups={groups} overall={overall} cycleTrend={cycleTrend} isLoading={isLoadingSummary}
        showGroupToggle={!isFisherfolk} />

      {/* Per-stocking table */}
      <div>
        <p className="text-[13px] font-semibold text-[#1A2B1A]">Harvested / Total-Loss Stockings</p>
        <p className="text-[12px] text-[#7A8E7A] mb-3">
          {isFisherfolk ? <><span className="md:hidden">Tap a card</span><span className="hidden md:inline">Click a row</span></> : 'Click a row'} to see the full activity completion breakdown.
        </p>
        {/* Phones: one card per stocking (the table returns at md and up). */}
        <div className="space-y-3 md:hidden" data-testid="yield-cards">
          {isLoading ? (
            <p className="rounded-xl border border-[#E2E8E2] bg-white py-8 text-center text-[13px] text-[#7A8E7A]">Loading…</p>
          ) : pagedRecords.length === 0 ? (
            <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-8 text-center text-[13px] text-[#7A8E7A]">No harvested or total-loss stockings found in scope.</p>
          ) : pagedRecords.map(rec => (
            <PhoneYieldCard
              key={rec.id}
              title={rec.species}
              badge={rec.is_total_loss ? <StatusPill tone="rose">Total loss</StatusPill> : <VarianceBadge pct={rec.variance_pct} />}
              subtitle={[!isFisherfolk && rec.fisherfolk, `Cycle #${rec.production_cycle_no}`, rec.barangay].filter(Boolean).join(' · ')}
              estimated={rec.estimated_kg != null ? `${rec.estimated_kg.toLocaleString()} kg` : 'N/A'}
              actual={`${rec.actual_total_kg.toLocaleString()} kg`}
              activities={`${rec.activities_completed_count}/${rec.activities_total_count}`}
              factors={possibleFactorsText(rec, 'fisheries')}
              expanded={expanded.has(rec.id)}
              onToggle={() => toggleExpand(rec.id)}
            >
              <ActivityBreakdown items={rec.activity_breakdown} emptyText="No activity schedule defined for this species." disclaimer={YIELD_DISCLAIMER} />
            </PhoneYieldCard>
          ))}
        </div>
        <div className={`overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] max-md:hidden`}>
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
              ) : pagedRecords.map(rec => (
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
                    <td className="px-3 py-[11px] text-[12px] text-[#4A5E4A] max-w-xs"><span className="line-clamp-2" title={possibleFactorsText(rec, 'fisheries')}>{possibleFactorsText(rec, 'fisheries')}</span></td>
                  </tr>
                  {expanded.has(rec.id) && (
                    <tr className="border-b border-[#F0F4F0] bg-[#F9FAF9]">
                      <td colSpan={10} className="px-6 py-4">
                        <p className="text-[12px] font-semibold text-[#1A2B1A] mb-2">Activity completion breakdown</p>
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
        <PaginationBar page={yieldPage} totalCount={filteredRecords.length} pageSize={YIELD_PAGE_SIZE} onPageChange={setYieldPage} />
      </div>
      </>)}

      {showSig && (
        <YASignatureModal purpose={sigPurpose} onClose={() => setShowSig(false)} onGenerate={handleGenerate} />
      )}
    </div>
  )

  const forecastContent = (
    <div className="space-y-4">
      {/* The spreadsheet picker behind Import Excel (staff only). */}
      {!isFisherfolk && (
        <input
          ref={fcFileInputRef}
          type="file"
          accept=".xlsx,.xls,.csv"
          className="hidden"
          onChange={handleFcImportFile}
        />
      )}

      {/* Search, filters and the stocking tools are staff tools; a fisherfolk account sees only its own stockings
          (and starts its cycles from Aquaculture Monitoring), so it gets the plain table (fcView stays 'flat'). */}
      {!isFisherfolk && (
      <FilterPanel
        className=""
        search={fcSearch}
        onSearchChange={setFcSearch}
        searchPlaceholder="Search by fisherfolk, species, or barangay..."
        activeCount={[Boolean(fcBarangayFilter), Boolean(fcSpeciesFilter)].filter(Boolean).length}
        actions={(
          <>
            <button
              type="button"
              onClick={handleFcDownloadTemplate}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E2E8E2] px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0]"
            >
              <Download className="h-4 w-4" />
              Import Template
            </button>
            <button
              type="button"
              disabled={fcImporting}
              onClick={() => fcFileInputRef.current?.click()}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#E2E8E2] px-4 py-2 text-[13px] font-medium text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0] disabled:opacity-60"
            >
              {fcImporting
                ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-[#1B4D2E] border-t-transparent" />
                : <Upload className="h-4 w-4" />
              }
              {fcImporting ? 'Importing…' : 'Import Stockings'}
            </button>
            <button
              type="button"
              onClick={() => navigate('/fisheries-monitoring/add')}
              className="flex items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]"
            >
              <Plus className="h-4 w-4" />
              Add Stocking
            </button>
          </>
        )}
      >
        <select className={filterSelectCls} value={fcSpeciesFilter} onChange={e => setFcSpeciesFilter(e.target.value)} aria-label="Species">
          <option value="">All species</option>
          {speciesList.map(s => <option key={s.id} value={s.id}>{s.species_name}</option>)}
        </select>
        <select className={filterSelectCls} value={fcBarangayFilter} onChange={e => setFcBarangayFilter(e.target.value)} aria-label="Barangay">
          <option value="">All barangays</option>
          {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
      </FilterPanel>
      )}

      {fcError && <ErrorMessage message={fcError} />}

      {/* How the stockings are shown (staff only, see above) */}
      {!isFisherfolk && (
        <ViewToggle
          ariaLabel="Show stockings as"
          options={[{ id: 'flat', label: 'All stockings' }, { id: 'grouped', label: 'By fisherfolk' }]}
          value={fcView}
          onChange={setFcView}
        />
      )}

      {fcView === 'flat' ? (
        <>
          {/* Phone: one compact card per stocking (tap to show its ponds / cages); the table stays for larger screens. */}
          {!fcLoading && fcRows.length > 0 && (
            <div className="space-y-3 md:hidden" data-testid="forecast-cards">
              {fcRows.map(row => (
                <ForecastCard
                  key={row.id}
                  title={row.species_name}
                  status={<StatusPill tone={FC_STATUS_TONE[row.status_cell] || 'slate'}>{row.status_cell}</StatusPill>}
                  subtitle={[row.fisherfolk_name, row.culture_type].filter(Boolean).join(' · ')}
                  stats={[
                    { label: 'Stocked', value: row.stocked_cell },
                    { label: 'Fingerlings', value: row.fingerlings_cell },
                    { label: 'Est. yield', value: row.yield_cell },
                    { label: 'Est. harvest', value: row.harvest_date_cell },
                    { label: 'Actual (kg)', value: row.actual_harvest_cell },
                    { label: 'Harvested on', value: row.actual_harvest_date_cell },
                  ]}
                  onOpen={() => toggleFcRow(row._rec)}
                  expanded={fcExpandedId === row.id}
                  openLabel={fcExpandedId === row.id ? 'Hide ponds / cages' : 'Show ponds / cages'}
                >
                  {fcExpandedId === row.id && (
                    <div className="mt-3 border-t border-[#F0F4F0] pt-3">
                      <ProductionUnitsCards
                        forecast
                        state={fcUnitsState(row.id)}
                        speciesName={row.species_name}
                        estimatedHarvestDate={row.expected_harvest_date}
                        onRetry={() => retryFcUnits(row.id)}
                      />
                    </div>
                  )}
                </ForecastCard>
              ))}
            </div>
          )}
          <div className={!fcLoading && fcRows.length > 0 ? 'max-md:hidden' : ''}>
          <DataTable
            columns={FC_COLUMNS}
            data={fcRows}
            isLoading={fcLoading}
            onRowClick={row => toggleFcRow(row._rec)}
            rowClickLabel={row => `${fcExpandedId === row.id ? 'Hide' : 'Show'} ponds/cages: ${row.species_name || 'stock'}`}
            expandedRowId={fcExpandedId}
            renderExpanded={row => (
              <ProductionUnitsTable
                forecast
                state={fcUnitsState(row.id)}
                speciesName={row.species_name}
                estimatedHarvestDate={row.expected_harvest_date}
                onRetry={() => retryFcUnits(row.id)}
              />
            )}
            renderExpandedMobile={row => (
              <ProductionUnitsCards
                forecast
                state={fcUnitsState(row.id)}
                speciesName={row.species_name}
                estimatedHarvestDate={row.expected_harvest_date}
                onRetry={() => retryFcUnits(row.id)}
              />
            )}
          />
          </div>
          <PaginationBar
            page={fcPage}
            totalCount={fcTotalCount}
            pageSize={10}
            onPageChange={setFcPage}
          />
        </>
      ) : (
        <GroupedForecast
          records={fcGroupedFiltered}
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
      <PillTabs
        ariaLabel="Forecasting views"
        tabs={[
          { id: 'forecast',       icon: TrendingUp, label: 'Forecast' },
          { id: 'yield_analysis', icon: BarChart2,  label: 'Yield analysis' },
        ]}
        value={activeTab}
        onChange={(id) => { setActiveTab(id); if (id === 'yield_analysis') setYieldOpened(true) }}
      />

      {activeTab === 'forecast' ? forecastContent : yieldAnalysisContent}

      {varianceRec && (
        <HarvestVarianceDetailsModal record={varianceRec} onClose={() => setVarianceRec(null)} />
      )}

      {timingRec && (
        <HarvestTimingDetailsModal record={timingRec} onClose={() => setTimingRec(null)} />
      )}

      {fcCycle && (
        <AquacultureCycleDetailModal
          cycle={fcCycle}
          onClose={() => setFcCycle(null)}
          onRefresh={refreshFcCycle}
          onHealthChanged={() => fetchForecastRecords(fcPage)}
        />
      )}

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
