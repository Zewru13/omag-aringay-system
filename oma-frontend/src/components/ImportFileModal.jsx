import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'
import StatTile from './UI/StatTile.jsx'
import StatusPill from './UI/StatusPill.jsx'
import StepIndicator from './UI/StepIndicator.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { downloadFile } from '../utils/fileDownload.js'

const STEPS = [
  { key: 'upload', label: 'Upload File' },
  { key: 'preview', label: 'Preview' },
  { key: 'done', label: 'Done' },
]
const STEP_INDEX = { upload: 0, preview: 1, done: 2 }

const STATUS_TONE = {
  ready: 'green',
  duplicate_in_file: 'amber',
  duplicate_in_database: 'amber',
  invalid: 'rose',
}
const STATUS_LABEL_PREVIEW = {
  ready: 'Will Create',
  duplicate_in_file: 'Duplicate In File',
  duplicate_in_database: 'Already Exists',
  invalid: 'Invalid',
}
const STATUS_LABEL_DONE = {
  ready: 'Created',
  duplicate_in_file: 'Skipped — Duplicate',
  duplicate_in_database: 'Skipped — Already Exists',
  invalid: 'Invalid',
}

const PAGE_SIZE = 25

// Shared "Import File" modal — Upload -> Preview -> Confirm, used across
// every create-new-records Excel import in the app (Organizations,
// Assistance, Crop Records, Fisheries Monitoring): one component, one visual
// language, driven entirely by which endpoint it's pointed at. Every one of
// those endpoints shares the same request/response contract (`dry_run`
// multipart field; `{created, summary, rows}` response, rows shaped as
// {row, status, label, detail, ...}) established by
// production.views.ForecastingImportView and mirrored by every import view
// since — see that view's docstring for the dry_run rationale. This is
// deliberately a different, create-new-records shape from
// RsbsaImportModal.jsx, which only ever previews updates to existing
// records and has no commit step at all.
export default function ImportFileModal({
  title, subtitle, importUrl, templateUrl, templateFilename, helpText, onClose, onImported,
}) {
  const { showToast } = useToast()
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [isDownloading, setIsDownloading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState(null) // last preview or confirm response
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setError('')
  }

  const handleDownloadTemplate = async () => {
    setIsDownloading(true)
    try {
      await downloadFile(api, templateUrl, templateFilename)
    } catch {
      showToast('Failed to download the template.', 'error')
    } finally {
      setIsDownloading(false)
    }
  }

  const runImport = async (dryRun) => {
    if (!file) { showToast('Choose a file first.', 'error'); return }
    setIsBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      formData.append('dry_run', dryRun ? 'true' : 'false')
      const r = await api.post(importUrl, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setResult(r.data)
      setStatusFilter('all')
      setPage(1)
      setStep(dryRun ? 'preview' : 'done')
      if (!dryRun) onImported?.()
    } catch (err) {
      setError(err?.response?.data?.error || err?.response?.data?.detail || 'Failed to process the file.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleStartOver = () => {
    setFile(null)
    setResult(null)
    setError('')
    setStep('upload')
  }

  const statusLabels = step === 'done' ? STATUS_LABEL_DONE : STATUS_LABEL_PREVIEW

  const filterTabs = result ? [
    { key: 'all', label: `All ${result.rows.length}` },
    { key: 'ready', label: `${result.summary.ready} ${statusLabels.ready}` },
    { key: 'duplicate_in_file', label: `${result.summary.duplicate_in_file} In-File Dupe` },
    { key: 'duplicate_in_database', label: `${result.summary.duplicate_in_database} Already Exists` },
    { key: 'invalid', label: `${result.summary.invalid} Invalid` },
  ].filter((t) => t.key === 'all' || t.label.charAt(0) !== '0') : []

  const filteredRows = useMemo(() => {
    if (!result) return []
    return statusFilter === 'all' ? result.rows : result.rows.filter((r) => r.status === statusFilter)
  }, [result, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ModalShell title={title} subtitle={subtitle} icon={FileSpreadsheet} onClose={onClose} maxWidth="max-w-4xl">
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'upload' && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            {helpText && <p className="mb-3 text-[13px] text-[#4A5A4C]">{helpText}</p>}
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={isDownloading}
              className="mb-3 inline-flex items-center gap-1.5 text-[12.5px] font-medium text-[#1B4D2E] hover:underline disabled:opacity-50"
            >
              <Download size={14} aria-hidden="true" />
              {isDownloading ? 'Downloading…' : 'Download the Excel template'}
            </button>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8E2D8] bg-[#F9FAF9] px-6 py-8 text-center transition-colors hover:bg-[#F0F4F0]">
              <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
              <span className="text-[13px] font-medium text-[#1A2B1A]">
                {file ? file.name : 'Click to choose a .xlsx file'}
              </span>
              <span className="text-[11px] text-[#7A8E7A]">Fill it in starting row 3, using the same columns as the template</span>
              <input type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" isLoading={isBusy} onClick={() => runImport(true)} disabled={!file}>
              Preview Import
            </Button>
          </div>
        </div>
      )}

      {(step === 'preview' || step === 'done') && result && (
        <div className="stagger-item mt-6 space-y-4">
          {step === 'preview' ? (
            <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
              <AlertTriangle size={18} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold text-sky-800">Preview only — nothing has been created yet</p>
                <p className="mt-0.5 text-[13px] text-sky-700">
                  Review the rows below, then click "Confirm Import" to actually create the ready rows.
                </p>
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
              <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-emerald-800" aria-hidden="true" />
              <div>
                <p className="text-[13px] font-semibold text-emerald-800">
                  {result.created} record{result.created === 1 ? '' : 's'} created
                </p>
                <p className="mt-0.5 text-[13px] text-emerald-700">
                  Duplicate and invalid rows below were not created — fix them and re-upload separately if needed.
                </p>
              </div>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={result.summary.ready} label={step === 'done' ? 'Created' : 'Ready to Create'} />
            <StatTile value={result.summary.duplicate_in_file} label="Duplicate in File" />
            <StatTile value={result.summary.duplicate_in_database} label="Already Exists" />
            <StatTile value={result.summary.invalid} label="Invalid Rows" />
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {filterTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setStatusFilter(t.key); setPage(1) }}
                  className={
                    'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors ' +
                    (statusFilter === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-[#F0F4F0] text-[#5A6B5C] hover:bg-[#E2E8E2]')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="-mx-5 divide-y divide-[#F0F4F0]">
              {paginatedRows.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-[#7A8E7A]">No rows in this category.</p>
              )}
              {paginatedRows.map((r) => (
                <div key={r.row} className="flex items-start gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#1A2B1A]">{r.label}</p>
                    <p className="mt-0.5 text-[11px] text-[#A8BCA8]">Row {r.row}</p>
                    <p className="mt-0.5 text-[12px] text-[#4A5A4C]">{r.detail}</p>
                  </div>
                  <StatusPill tone={STATUS_TONE[r.status]}>{statusLabels[r.status]}</StatusPill>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-between">
                <p className="text-[12px] text-[#7A8E7A]">
                  Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                </p>
                <div className="flex items-center gap-1">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-lg border border-[#E2E8E2] px-2.5 py-1 text-[12px] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
                    Previous
                  </button>
                  <span className="px-2 text-[12px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="rounded-lg border border-[#E2E8E2] px-2.5 py-1 text-[12px] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleStartOver}>Upload a Different File</Button>
            {step === 'preview' ? (
              <Button type="button" isLoading={isBusy} disabled={result.summary.ready === 0} onClick={() => runImport(false)}>
                Confirm Import ({result.summary.ready})
              </Button>
            ) : (
              <Button type="button" onClick={onClose}>Close</Button>
            )}
          </div>
        </div>
      )}
    </ModalShell>
  )
}
