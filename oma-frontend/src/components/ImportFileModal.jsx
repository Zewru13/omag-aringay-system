import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, Download, FileSpreadsheet, Upload } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'
import StatTile from './UI/StatTile.jsx'
import StatusPill from './UI/StatusPill.jsx'
import StepIndicator from './UI/StepIndicator.jsx'
import ImportUndoPanel, { ImportUndoBanner } from './ImportUndoPanel.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useToast } from '../context/ToastContext.jsx'
import { downloadFile } from '../utils/fileDownload.js'
import { STATUS_META, filterTabs as buildFilterTabs, summaryTiles } from '../utils/importSummary.js'

const STEPS = [
  { key: 'upload', label: 'Upload File' },
  { key: 'preview', label: 'Preview' },
  { key: 'done', label: 'Done' },
]
const STEP_INDEX = { upload: 0, preview: 1, done: 2 }

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
  title, subtitle, importUrl, templateUrl, templateFilename, helpText, onClose, onImported, undoType,
}) {
  const { showToast } = useToast()
  const { isAdmin, isEvaluator } = useAuth()
  // Only OMAg staff can undo an import; an organization account importing its own members sees no undo.
  const canUndo = Boolean(undoType) && (isAdmin || isEvaluator)
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

  const filterTabs = result ? buildFilterTabs(result.summary, result.rows.length, step) : []

  const filteredRows = useMemo(() => {
    if (!result) return []
    return statusFilter === 'all' ? result.rows : result.rows.filter((r) => r.status === statusFilter)
  }, [result, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  // Phone: two equal-width buttons side by side (a row of two never runs past the screen); larger screens keep them at the right.
  const FOOT = 'flex w-full flex-col-reverse gap-2 min-[420px]:grid min-[420px]:grid-cols-2 sm:flex sm:flex-row sm:w-auto [&>*]:min-h-[44px] max-sm:[&>*]:h-auto max-sm:[&>*]:py-2 max-sm:[&>*]:leading-tight [&>*]:px-2 sm:[&>*]:min-h-0 sm:[&>*]:px-4'
  const footerContent = step === 'undo' ? (
    <div className={FOOT}>
      <Button type="button" variant="outline" onClick={() => setStep(result ? 'done' : 'upload')}>Back</Button>
      <Button type="button" onClick={onClose}>Close</Button>
    </div>
  ) : step === 'upload' ? (
    <div className={FOOT}>
      <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
      <Button type="button" isLoading={isBusy} onClick={() => runImport(true)} disabled={!file}>
        Preview Import
      </Button>
    </div>
  ) : result ? (
    <div className={FOOT}>
      <Button type="button" variant="outline" onClick={handleStartOver}>Upload a Different File</Button>
      {step === 'preview' ? (
        <Button type="button" isLoading={isBusy} disabled={result.summary.ready === 0} onClick={() => runImport(false)}>
          Confirm Import ({result.summary.ready})
        </Button>
      ) : (
        <Button type="button" onClick={onClose}>Close</Button>
      )}
    </div>
  ) : null

  return (
    <ModalShell title={title} subtitle={subtitle} icon={FileSpreadsheet} onClose={onClose} maxWidth="max-w-4xl" footer={footerContent}>
      {step !== 'undo' && <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />}

      {step === 'undo' && (
        <div className="mt-2">
          <ImportUndoPanel type={undoType} onChanged={() => onImported?.()} />
        </div>
      )}

      {step === 'upload' && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
            {helpText && <p className="mb-3 text-[13px] text-[#4A5A4C]">{helpText}</p>}
            <button
              type="button"
              onClick={handleDownloadTemplate}
              disabled={isDownloading}
              className="mb-3 inline-flex items-center justify-center gap-1.5 rounded-lg text-[12.5px] font-medium text-[#1B4D2E] hover:underline disabled:opacity-50 max-sm:min-h-[44px] max-sm:w-full max-sm:border max-sm:border-[#C8D5C8] max-sm:bg-white"
            >
              <Download size={14} aria-hidden="true" />
              {isDownloading ? 'Downloading…' : 'Download the Excel template'}
            </button>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8E2D8] bg-[#F9FAF9] px-4 py-8 text-center transition-colors hover:bg-[#F0F4F0] sm:px-6">
              <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
              <span className="text-[13px] font-medium text-[#1A2B1A]">
                <span className="break-all">{file ? file.name : 'Click to choose a .xlsx, .xls, or .csv file'}</span>
              </span>
              <span className="text-[11px] text-[#7A8E7A]">Fill it in under the header row, using the same columns as the template</span>
              <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {canUndo && <ImportUndoBanner onOpen={() => setStep('undo')} />}

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
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
            {summaryTiles(result.summary, step).map((tile) => (
              <StatTile key={tile.label} value={tile.value} label={tile.label} />
            ))}
          </div>

          {result.credentials_to_hand_over?.length > 0 && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5">
              <p className="text-[13px] font-semibold text-amber-900">Email could not be sent: hand these over in person</p>
              <p className="mt-0.5 text-[12px] text-amber-800">
                These accounts are active. The temporary passwords are shown only now and must be changed at first login.
              </p>
              <div className="mt-3 space-y-2 sm:hidden">
                {result.credentials_to_hand_over.map((c) => (
                  <div key={c.row} className="rounded-xl border border-amber-200 bg-white p-3 text-[12px] text-[#1A2B1A]">
                    <p className="break-words font-semibold">{c.label}</p>
                    <p className="mt-1 text-[#7A8E7A]">Login</p>
                    <p className="break-all font-medium">{c.login}</p>
                    <p className="mt-1 text-[#7A8E7A]">Temporary password</p>
                    <p className="break-all"><code className="text-[13px] font-semibold">{c.default_password}</code></p>
                    {c.expires_at && <p className="mt-1 text-[11px] text-amber-800">Stops working {new Date(c.expires_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })}</p>}
                  </div>
                ))}
              </div>
              <div className="mt-3 hidden overflow-x-auto sm:block">
                <table className="w-full text-left text-[12px] text-[#1A2B1A]">
                  <thead>
                    <tr className="text-[11px] uppercase tracking-wide text-amber-800">
                      <th className="py-1 pr-3">Organization</th>
                      <th className="py-1 pr-3">Login</th>
                      <th className="py-1 pr-3">Temporary password</th>
                      <th className="py-1">Stops working</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.credentials_to_hand_over.map((c) => (
                      <tr key={c.row} className="border-t border-amber-200">
                        <td className="py-1.5 pr-3">{c.label}</td>
                        <td className="py-1.5 pr-3 font-medium">{c.login}</td>
                        <td className="py-1.5 pr-3"><code className="font-semibold">{c.default_password}</code></td>
                        <td className="py-1.5">{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {filterTabs.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => { setStatusFilter(t.key); setPage(1) }}
                  className={
                    'rounded-full px-3 py-1 text-[11px] font-semibold transition-colors max-md:min-h-[36px] ' +
                    (statusFilter === t.key ? 'bg-[#1B4D2E] text-white' : 'bg-[#F0F4F0] text-[#5A6B5C] hover:bg-[#E2E8E2]')
                  }
                >
                  {t.label}
                </button>
              ))}
            </div>

            <div className="-mx-4 divide-y divide-[#F0F4F0] sm:-mx-5">
              {paginatedRows.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-[#7A8E7A]">No rows in this category.</p>
              )}
              {paginatedRows.map((r) => (
                <div key={r.row} className="flex flex-col items-start gap-1.5 px-4 py-3 sm:flex-row sm:gap-3 sm:px-5">
                  <div className="min-w-0 flex-1 max-sm:w-full">
                    <p className="break-words text-[13px] font-medium text-[#1A2B1A] sm:truncate">{r.label}</p>
                    <p className="mt-0.5 text-[11px] text-[#7A8E7A]">Row {r.row}</p>
                    <p className="mt-0.5 break-words text-[12px] text-[#4A5A4C]">
                      {r.detail}{r.activation?.email_sent ? ' Account activated; login details emailed.' : ''}
                    </p>
                  </div>
                  <span className="max-sm:order-first"><StatusPill tone={STATUS_META[r.status]?.tone}>{STATUS_META[r.status]?.[step === 'done' ? 'done' : 'preview'] || r.status}</StatusPill></span>
                </div>
              ))}
            </div>

            {totalPages > 1 && (
              <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-[12px] text-[#7A8E7A]">
                  Showing {((page - 1) * PAGE_SIZE) + 1}–{Math.min(page * PAGE_SIZE, filteredRows.length)} of {filteredRows.length}
                </p>
                <div className="flex items-center gap-1 max-sm:justify-between">
                  <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}
                    className="rounded-lg border border-[#E2E8E2] px-2.5 py-1 text-[12px] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40 max-sm:min-h-[44px] max-sm:px-5">
                    Previous
                  </button>
                  <span className="px-2 text-[12px] font-medium text-[#1A2B1A]">{page} / {totalPages}</span>
                  <button type="button" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}
                    className="rounded-lg border border-[#E2E8E2] px-2.5 py-1 text-[12px] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40 max-sm:min-h-[44px] max-sm:px-5">
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </div>
      )}
    </ModalShell>
  )
}
