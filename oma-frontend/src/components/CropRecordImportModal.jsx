import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, HelpCircle, Upload } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'
import StatTile from './UI/StatTile.jsx'
import StatusPill from './UI/StatusPill.jsx'
import StepIndicator from './UI/StepIndicator.jsx'
import { useToast } from '../context/ToastContext.jsx'

const STEPS = [
  { key: 'upload', label: 'Upload File' },
  { key: 'preview', label: 'Preview Rows' },
  { key: 'confirm', label: 'Confirm Commit' },
  { key: 'result', label: 'Commit Results' },
]
const STEP_INDEX = { upload: 0, preview: 1, confirm: 2, result: 3 }

const STATUS_TONE = {
  ready: 'green',
  duplicate_in_file: 'amber',
  duplicate_in_database: 'amber',
  farmer_not_found: 'rose',
  invalid: 'rose',
}
const STATUS_LABEL = {
  ready: 'Will Create',
  duplicate_in_file: 'Duplicate In File',
  duplicate_in_database: 'Already Exists',
  farmer_not_found: 'Farmer Not Found',
  invalid: 'Invalid',
}

const PAGE_SIZE = 25
const COMMIT_BATCH_SIZE = 50

// This importer never updates an existing record — it only ever creates a
// new CropMonitoringRecord — so unlike RsbsaImportModal (update-or-create),
// exactly one status is ever committable, matching the backend's own
// CropRecordImportCommitView refusal of anything else.
const isCommittable = (r) => r.status === 'ready'

// Upload -> Preview -> Confirm -> Result, mirroring RsbsaImportModal.jsx's
// structure exactly (see that file for the pattern this is built from).
// Preview and commit are two separate real endpoints
// (CropRecordImportPreviewView / CropRecordImportCommitView) — commit is
// handed back the EXACT row objects the preview returned for whichever
// rows staff checked, never a re-upload or re-interpretation of the file
// (see crop_record_import_views.py's module docstring). Every row this
// import can ever create gets date_planted_is_estimated=True (Decision 2
// from that same build) — the Confirm step below warns about this
// explicitly, before commit, not after.
export default function CropRecordImportModal({ onClose, onCommitted }) {
  const { showToast } = useToast()
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [selectedRows, setSelectedRows] = useState(() => new Set())
  const [commitResult, setCommitResult] = useState(null)
  const [commitProgress, setCommitProgress] = useState(null)

  const handleFileChange = (e) => {
    const f = e.target.files?.[0] || null
    setFile(f)
    setError('')
  }

  const handlePreview = async () => {
    if (!file) { showToast('Choose a file first.', 'error'); return }
    setIsBusy(true)
    setError('')
    try {
      const formData = new FormData()
      formData.append('file', file)
      const r = await api.post('/production/crop-record-import/preview/', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPreview(r.data)
      setStatusFilter('all')
      setPage(1)
      setSelectedRows(new Set())
      setStep('preview')
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to preview the file.')
    } finally {
      setIsBusy(false)
    }
  }

  const handleStartOver = () => {
    setFile(null)
    setPreview(null)
    setSelectedRows(new Set())
    setCommitResult(null)
    setError('')
    setStep('upload')
  }

  const toggleRow = (rowNumber) => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (next.has(rowNumber)) next.delete(rowNumber)
      else next.add(rowNumber)
      return next
    })
  }

  const FILTER_TABS = preview ? [
    { key: 'all', label: `All ${preview.total_rows}` },
    { key: 'ready', label: `${preview.summary.ready} Will Create` },
    { key: 'duplicate_in_file', label: `${preview.summary.duplicate_in_file} In-File Dupe` },
    { key: 'duplicate_in_database', label: `${preview.summary.duplicate_in_database} Already Exists` },
    { key: 'farmer_not_found', label: `${preview.summary.farmer_not_found} Farmer Not Found` },
    { key: 'invalid', label: `${preview.summary.invalid} Invalid` },
  ].filter((t) => t.key === 'all' || !t.label.startsWith('0 ')) : []

  const filteredRows = useMemo(() => {
    if (!preview) return []
    return statusFilter === 'all'
      ? preview.rows
      : preview.rows.filter((r) => r.status === statusFilter)
  }, [preview, statusFilter])

  const committableVisible = filteredRows.filter(isCommittable)
  const allVisibleSelected = committableVisible.length > 0 && committableVisible.every((r) => selectedRows.has(r.row_number))

  const toggleSelectAllVisible = () => {
    setSelectedRows((prev) => {
      const next = new Set(prev)
      if (allVisibleSelected) {
        committableVisible.forEach((r) => next.delete(r.row_number))
      } else {
        committableVisible.forEach((r) => next.add(r.row_number))
      }
      return next
    })
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  const selectedRowObjects = useMemo(
    () => (preview ? preview.rows.filter((r) => selectedRows.has(r.row_number)) : []),
    [preview, selectedRows],
  )

  const goToConfirm = () => {
    if (selectedRowObjects.length === 0) { showToast('Select at least one row to commit.', 'error'); return }
    setError('')
    setStep('confirm')
  }

  // Sequential batches, each all-or-nothing on the server: one big request
  // for thousands of rows would outlast any proxy/browser timeout (each row
  // is several database round-trips) and could be cut off mid-way with no
  // clear result. See RsbsaImportModal.jsx for the same approach.
  const handleCommit = async () => {
    const rows = selectedRowObjects
    const results = []
    const batchIds = []
    setIsBusy(true)
    setError('')
    setCommitProgress({ done: 0, total: rows.length })
    try {
      for (let i = 0; i < rows.length; i += COMMIT_BATCH_SIZE) {
        const r = await api.post('/production/crop-record-import/commit/', { rows: rows.slice(i, i + COMMIT_BATCH_SIZE) })
        results.push(...r.data.results)
        batchIds.push(r.data.batch_id)
        setCommitProgress({ done: results.length, total: rows.length })
      }
      setCommitResult({
        batch_id: batchIds.length > 1 ? `${batchIds[0]} (+${batchIds.length - 1} more batches)` : batchIds[0],
        committed: results.length,
        results,
      })
      setStep('result')
      onCommitted?.()
    } catch (err) {
      const detail = err?.response?.data?.detail || 'Failed to commit the selected rows.'
      setError(results.length > 0
        ? `${detail} ${results.length} row${results.length === 1 ? '' : 's'} in earlier batches WERE saved — close this window and run the preview again to see what is left.`
        : `${detail} Nothing was saved.`)
      if (results.length > 0) onCommitted?.()
    } finally {
      setIsBusy(false)
      setCommitProgress(null)
    }
  }

  const footerContent = {
    upload: (
      <div className="flex w-full flex-col-reverse gap-2 min-[420px]:grid min-[420px]:grid-cols-2 sm:flex sm:flex-row sm:w-auto [&>*]:min-h-[44px] max-sm:[&>*]:h-auto max-sm:[&>*]:py-2 max-sm:[&>*]:leading-tight sm:[&>*]:min-h-0">
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" isLoading={isBusy} onClick={handlePreview} disabled={!file}>
          Preview Rows
        </Button>
      </div>
    ),
    preview: preview ? (
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
        <span className="text-center text-[12.5px] text-[#7A8E7A] sm:order-2 sm:ml-auto">{selectedRows.size} row{selectedRows.size === 1 ? '' : 's'} selected</span>
        <div className="flex flex-col-reverse gap-2 min-[420px]:grid min-[420px]:grid-cols-2 sm:contents [&>*]:min-h-[44px] max-sm:[&>*]:h-auto max-sm:[&>*]:py-2 max-sm:[&>*]:leading-tight [&>*]:px-2 sm:[&>*]:min-h-0 sm:[&>*]:px-4">
          <Button type="button" variant="outline" onClick={handleStartOver} className="sm:order-1">Upload a Different File</Button>
          <Button type="button" onClick={goToConfirm} disabled={selectedRows.size === 0} className="sm:order-3">
            Continue to Confirm
          </Button>
        </div>
      </div>
    ) : null,
    confirm: (
      <div className="flex w-full flex-col-reverse gap-2 min-[420px]:grid min-[420px]:grid-cols-2 sm:flex sm:flex-row sm:items-center sm:justify-between [&>*]:min-h-[44px] max-sm:[&>*]:h-auto max-sm:[&>*]:py-2 max-sm:[&>*]:leading-tight sm:[&>*]:min-h-0">
        <Button type="button" variant="outline" onClick={() => setStep('preview')} className="sm:border-transparent sm:text-[#7A8E7A]">Back to Review</Button>
        <Button type="button" isLoading={isBusy} onClick={handleCommit}>Confirm &amp; Create</Button>
      </div>
    ),
    result: commitResult ? (
      <Button type="button" onClick={onClose} className="max-sm:min-h-[44px] max-sm:w-full">Close</Button>
    ) : null,
  }[step]

  return (
    <ModalShell
      title="Import Crop Records by RSBSA"
      subtitle="Upload a per-commodity RSBSA/BFAR export to create crop planting records for individual farmers — no Organization required."
      icon={FileSpreadsheet}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={footerContent}
    >
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'upload' && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <p className="mb-3 text-[13px] text-[#4A5A4C]">
              Each row logs one crop planting for an individual farmer, matched by RSBSA number — this is the
              real RSBSA/BFAR per-commodity export shape (corn, rice, tobacco-native, tobacco-virginia, etc.),
              not the Organization-based template. Nothing is written here; the next screen only ever shows
              what would be created, and you choose exactly which rows to commit.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8E2D8] bg-[#F9FAF9] px-6 py-8 text-center transition-colors hover:bg-[#F0F4F0]">
              <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
              <span className="text-[13px] font-medium text-[#1A2B1A]">
                {file ? file.name : 'Click to choose a .csv, .xlsx, or .xls file'}
              </span>
              <span className="text-[11px] text-[#7A8E7A]">The real RSBSA/BFAR per-commodity export format</span>
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-semibold text-sky-800">Preview only — nothing has been created</p>
              <p className="mt-0.5 text-[13px] text-sky-700">
                Check the rows you want to commit below, then continue to confirm exactly what will be created.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <StatTile value={preview.summary.ready} label="Will Create" />
            <StatTile value={preview.summary.duplicate_in_file} label="Duplicate In File" />
            <StatTile value={preview.summary.duplicate_in_database} label="Already Exists" />
            <StatTile value={preview.summary.farmer_not_found} label="Farmer Not Found" />
            <StatTile value={preview.summary.invalid} label="Invalid Rows" />
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_TABS.map((t) => (
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
              {committableVisible.length > 0 && (
                <label className="flex shrink-0 cursor-pointer items-center gap-2 text-[12px] font-medium text-[#4A5E4A] max-sm:min-h-[44px] max-sm:w-full max-sm:rounded-lg max-sm:bg-[#F5F8F5] max-sm:px-3">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible}
                    className="h-5 w-5 rounded border-[#C8D5C8] text-[#1B4D2E] focus:ring-[#1B4D2E]/30 sm:h-3.5 sm:w-3.5" />
                  Select all shown ({committableVisible.length})
                </label>
              )}
            </div>

            <div className="-mx-5 divide-y divide-[#F0F4F0]">
              {paginatedRows.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-[#7A8E7A]">No rows in this category.</p>
              )}
              {paginatedRows.map((r) => {
                const committable = isCommittable(r)
                return (
                  <div key={r.row_number} className={`flex items-start gap-2 px-3 py-3 sm:items-center sm:gap-3 sm:px-5 ${selectedRows.has(r.row_number) ? 'bg-[#F5FAF6]' : ''}`}>
                    <div className="flex w-8 shrink-0 justify-center pt-0.5 sm:w-5 sm:pt-0">
                      {committable && (
                        <input
                          type="checkbox"
                          checked={selectedRows.has(r.row_number)}
                          onChange={() => toggleRow(r.row_number)}
                          aria-label={`Select row ${r.row_number} for commit`}
                          className="h-6 w-6 rounded border-[#C8D5C8] text-[#1B4D2E] focus:ring-[#1B4D2E]/30 sm:h-3.5 sm:w-3.5"
                        />
                      )}
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col items-start gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                    <div className="min-w-0 flex-1 max-sm:w-full">
                      <p className="break-words text-[13px] font-medium text-[#1A2B1A] sm:truncate">
                        {r.farmer_name || r.fisherfolk_name || r.rsbsa_number || `Row ${r.row_number}`}
                      </p>
                      <p className="mt-0.5 break-words text-[11px] text-[#7A8E7A]">
                        Row {r.row_number} · {r.rsbsa_number || '(blank RSBSA no.)'}
                        {r.crop_type_name ? ` · ${r.crop_type_name}${r.variety_used ? ` (${r.variety_used})` : ''}` : ''}
                        {r.date_planted ? ` · ${r.date_planted}` : ''}
                      </p>
                      {r.status === 'ready' && r.date_planted_is_estimated && (
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] font-medium text-amber-700">
                          <HelpCircle className="h-3 w-3" aria-hidden="true" /> Planting date is estimated (see warning before commit)
                        </p>
                      )}
                      <p className="mt-0.5 break-words text-[12px] text-[#5A6B5C]">{r.detail}</p>
                    </div>
                    <span className="max-sm:order-first"><StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill></span>
                    </div>
                  </div>
                )
              })}
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

      {step === 'confirm' && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl bg-[#1B4D2E] p-5 text-white sm:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">You Are About to Create</p>
            <p className="mt-2 text-[26px] font-semibold leading-tight">
              {selectedRowObjects.length} crop record{selectedRowObjects.length === 1 ? '' : 's'}
            </p>
            <div className="my-4 border-t border-white/15" />
            <p className="text-[13px] text-[#B7CBBB]">
              Every one of these is a brand-new record — this importer never updates an existing one.
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <HelpCircle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-semibold text-amber-800">
                Planting date will be marked "Estimated" on all {selectedRowObjects.length} record{selectedRowObjects.length === 1 ? '' : 's'}
              </p>
              <p className="mt-0.5 text-[13px] text-amber-800">
                This import has no real field-confirmed planting date — the date shown is taken from the
                registry's own record-creation timestamp. Every record created here gets
                {' '}<span className="font-semibold">date_planted_is_estimated = True</span>, which already
                blocks the Activity Suggestion Engine, the 50%-duration harvest gate, and the automatic
                Planted → Near Harvest transition until staff confirms or corrects the real planting date on
                that record later.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-700" aria-hidden="true" />
            <p className="text-[13px] text-rose-800">
              {selectedRowObjects.length <= COMMIT_BATCH_SIZE ? (
                <>
                  <span className="font-semibold">All-or-nothing:</span> if any selected row fails (e.g. a matching
                  record was created since this preview was generated), none of the {selectedRowObjects.length}{' '}
                  row{selectedRowObjects.length === 1 ? '' : 's'} will be saved.
                </>
              ) : (
                <>
                  <span className="font-semibold">Saved in batches of {COMMIT_BATCH_SIZE}:</span> each batch is all-or-nothing,
                  but if one fails, the batches before it stay saved and the rest are not attempted. Keep this window open
                  until it finishes.
                </>
              )}
            </p>
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white">
            <p className="border-b border-[#E2E8E2] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
              Rows to Commit
            </p>
            <div className="divide-y divide-[#F0F4F0] sm:max-h-72 sm:overflow-y-auto">
              {selectedRowObjects.map((r) => (
                <div key={r.row_number} className="px-4 py-2.5">
                  <div className="flex flex-col items-start gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                    <p className="min-w-0 break-words text-[13px] font-medium text-[#1A2B1A] sm:truncate">
                      {r.farmer_name || r.rsbsa_number}
                    </p>
                    <StatusPill tone="green">Register New</StatusPill>
                  </div>
                  <p className="mt-0.5 break-words text-[12px] text-[#7A8E7A]">
                    Row {r.row_number} · {r.crop_type_name}{r.variety_used ? ` (${r.variety_used})` : ''} · {r.date_planted} (estimated)
                  </p>
                </div>
              ))}
            </div>
          </div>

          {commitProgress && (
            <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-[13px] font-medium text-sky-800">
              Committing… {commitProgress.done} of {commitProgress.total} rows saved. Please keep this window open.
            </p>
          )}
          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </div>
      )}

      {step === 'result' && commitResult && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-[#BFE3CC] bg-[#EBF5EE] p-4">
            <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#1E5637]" aria-hidden="true" />
            <div>
              <p className="text-[14px] font-semibold text-[#1E5637]">Commit Complete</p>
              <p className="mt-0.5 text-[13px] text-[#1A2B1A]">
                <span className="font-semibold">{commitResult.committed}</span> record{commitResult.committed === 1 ? '' : 's'} created.
              </p>
              <p className="mt-1 break-all text-[11px] text-[#5A6B5C]">Batch ID: {commitResult.batch_id}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-4 sm:p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">Records Created</p>
            <div className="-mx-4 divide-y divide-[#F0F4F0] sm:-mx-5">
              {commitResult.results.map((r) => (
                <div key={r.row_number} className="flex flex-col items-start gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
                  <div className="min-w-0 flex-1 max-sm:w-full">
                    <p className="break-words text-[13px] font-medium text-[#1A2B1A] sm:truncate">{r.farmer_name}</p>
                    <p className="mt-0.5 break-words text-[11px] text-[#7A8E7A]">
                      Row {r.row_number} · {r.crop_type_name}{r.variety_used ? ` (${r.variety_used})` : ''} · {r.date_planted}
                    </p>
                  </div>
                  <StatusPill tone="green">Created</StatusPill>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
