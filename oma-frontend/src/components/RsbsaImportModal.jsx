import { useMemo, useState } from 'react'
import { AlertTriangle, CheckCircle2, FileSpreadsheet, Upload } from 'lucide-react'
import api from '../api/axiosInstance.js'
import Button from './UI/Button.jsx'
import ModalShell from './UI/ModalShell.jsx'
import StatTile from './UI/StatTile.jsx'
import StatusPill from './UI/StatusPill.jsx'
import StepIndicator from './UI/StepIndicator.jsx'
import { useToast } from '../context/ToastContext.jsx'

const STEPS = [
  { key: 'upload', label: 'Upload File' },
  { key: 'preview', label: 'Preview Changes' },
  { key: 'confirm', label: 'Confirm Commit' },
  { key: 'result', label: 'Commit Results' },
]
const STEP_INDEX = { upload: 0, preview: 1, confirm: 2, result: 3 }

const STATUS_TONE = {
  matched_with_changes: 'amber',
  matched_no_changes: 'green',
  unmatched: 'slate',
  duplicate_in_file: 'rose',
  invalid: 'rose',
}
const STATUS_LABEL = {
  matched_with_changes: 'Changes Found',
  matched_no_changes: 'No Changes',
  unmatched: 'Unmatched',
  duplicate_in_file: 'Duplicate In File',
  invalid: 'Invalid',
}
const HOLD_BACK_REASON_TEXT = {
  corrupted_rsbsa: 'RSBSA number has a non-numeric segment',
  all_flags_blank: 'Farmer/Farmworker/Fisherfolk flags are all blank',
  all_flags_no: 'Farmer/Farmworker/Fisherfolk flags are all No',
  unmatched_barangay: 'Barangay does not match any known barangay',
  unparseable_birthday: 'Birthdate could not be read',
}

const PAGE_SIZE = 25

// Only these two statuses have anything a commit could write — everything
// else (matched_no_changes: nothing differs; invalid: nothing to write to)
// is never selectable, matching the backend's own refusal of anything else.
const isCommittable = (r) => r.status === 'matched_with_changes' || r.status === 'unmatched'

function formatLastUpdated(iso) {
  if (!iso) return 'never (no updated_at recorded)'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

// Upload -> Preview -> Confirm -> Result. Preview and commit are two
// separate real endpoints (RsbsaUpdateImportPreviewView /
// RsbsaUpdateImportCommitView) — commit is handed the EXACT row objects
// the preview returned for whichever rows staff checked, never a re-upload
// or re-interpretation of the file (see rsbsa_import_views.py's module
// docstring). Selection is opt-in per row — nothing is pre-checked after a
// preview, by design: staff has to look at each row before it can be
// selected for commit, not just accept a "select all" default.
export default function RsbsaImportModal({ onClose, onCommitted }) {
  const { showToast } = useToast()
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedRow, setExpandedRow] = useState(null)
  const [selectedRows, setSelectedRows] = useState(() => new Set())
  const [commitResult, setCommitResult] = useState(null)

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
      const r = await api.post('/farmers/rsbsa-import/preview/', formData, {
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
    { key: 'matched_with_changes', label: `${preview.summary.matched_with_changes} Changes Found` },
    { key: 'matched_no_changes', label: `${preview.summary.matched_no_changes} No Changes` },
    { key: 'unmatched', label: `${preview.summary.unmatched} Unmatched` },
    { key: 'duplicate_in_file', label: `${preview.summary.duplicate_in_file} Duplicate In File` },
    { key: 'invalid', label: `${preview.summary.invalid} Invalid` },
  ] : []

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
  const selectedUpdateCount = selectedRowObjects.filter((r) => r.status === 'matched_with_changes').length
  const selectedCreateCount = selectedRowObjects.filter((r) => r.status === 'unmatched').length

  const goToConfirm = () => {
    if (selectedRowObjects.length === 0) { showToast('Select at least one row to commit.', 'error'); return }
    setError('')
    setStep('confirm')
  }

  const handleCommit = async () => {
    setIsBusy(true)
    setError('')
    try {
      const r = await api.post('/farmers/rsbsa-import/commit/', { rows: selectedRowObjects })
      setCommitResult(r.data)
      setStep('result')
      onCommitted?.()
    } catch (err) {
      setError(err?.response?.data?.detail || 'Failed to commit the selected rows. Nothing was saved.')
    } finally {
      setIsBusy(false)
    }
  }

  const footerContent = {
    upload: (
      <>
        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
        <Button type="button" isLoading={isBusy} onClick={handlePreview} disabled={!file}>
          Preview Changes
        </Button>
      </>
    ),
    preview: preview ? (
      <div className="flex w-full items-center justify-between gap-2">
        <Button type="button" variant="outline" onClick={handleStartOver}>Upload a Different File</Button>
        <div className="flex items-center gap-3">
          <span className="text-[12.5px] text-[#7A8E7A]">{selectedRows.size} row{selectedRows.size === 1 ? '' : 's'} selected</span>
          <Button type="button" onClick={goToConfirm} disabled={selectedRows.size === 0}>
            Continue to Confirm
          </Button>
        </div>
      </div>
    ) : null,
    confirm: (
      <div className="flex w-full items-center justify-between">
        <button type="button" onClick={() => setStep('preview')} className="text-[13px] font-medium text-[#7A8E7A] hover:text-[#1A2B1A] transition-colors">
          Back to Review
        </button>
        <Button type="button" isLoading={isBusy} onClick={handleCommit}>Confirm &amp; Commit</Button>
      </div>
    ),
    result: commitResult ? (
      <Button type="button" onClick={onClose}>Close</Button>
    ) : null,
  }[step]

  return (
    <ModalShell
      title="Import RSBSA File"
      subtitle="Upload a fresh RSBSA/BFAR export to review and commit updates to Farmer and Fisherfolk records."
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
              This is an UPDATE tool for people already registered, plus registration for anyone in the file who
              isn't in the system yet — it matches rows to existing records by RSBSA number. Nothing is written
              here; the next screen only ever shows what would change, and you choose exactly which rows to commit.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8E2D8] bg-[#F9FAF9] px-6 py-8 text-center transition-colors hover:bg-[#F0F4F0]">
              <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
              <span className="text-[13px] font-medium text-[#1A2B1A]">
                {file ? file.name : 'Click to choose a .csv, .xlsx, or .xls file'}
              </span>
              <span className="text-[11px] text-[#7A8E7A]">The real RSBSA/BFAR export format (.csv) or the older .xlsx/.xls shape</span>
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
              <p className="text-[13px] font-semibold text-sky-800">Preview only — nothing has been changed</p>
              <p className="mt-0.5 text-[13px] text-sky-700">
                Check the rows you want to commit below, then continue to confirm exactly what will be written.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <StatTile value={preview.summary.matched_with_changes} label="Changes Found" />
            <StatTile value={preview.summary.matched_no_changes} label="No Changes" />
            <StatTile value={preview.summary.unmatched} label="Unmatched" />
            <StatTile value={preview.summary.duplicate_in_file} label="Duplicate In File" />
            <StatTile value={preview.summary.invalid} label="Invalid Rows" />
          </div>

          <p className="text-[11px] italic text-[#7A8E7A]">
            Note: "Record last updated" timestamps reflect the date this tracking feature was added if the
            record hasn't been edited since — they don't yet distinguish a genuine recent edit from a record
            that simply hasn't been touched.
          </p>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {FILTER_TABS.map((t) => (
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
              {committableVisible.length > 0 && (
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-[12px] font-medium text-[#4A5E4A]">
                  <input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible}
                    className="h-3.5 w-3.5 rounded border-[#C8D5C8] text-[#1B4D2E] focus:ring-[#1B4D2E]/30" />
                  Select all shown ({committableVisible.length})
                </label>
              )}
            </div>

            <div className="-mx-5 divide-y divide-[#F0F4F0]">
              {paginatedRows.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-[#7A8E7A]">No rows in this category.</p>
              )}
              {paginatedRows.map((r) => {
                const isExpanded = expandedRow === r.row_number
                const canExpand = r.status === 'matched_with_changes'
                const committable = isCommittable(r)
                return (
                  <div key={r.row_number} className={selectedRows.has(r.row_number) ? 'bg-[#F5FAF6]' : ''}>
                    <div className="flex items-center gap-3 px-5 py-3">
                      <div className="w-5 shrink-0">
                        {committable && (
                          <input
                            type="checkbox"
                            checked={selectedRows.has(r.row_number)}
                            onChange={() => toggleRow(r.row_number)}
                            aria-label={`Select row ${r.row_number} for commit`}
                            className="h-3.5 w-3.5 rounded border-[#C8D5C8] text-[#1B4D2E] focus:ring-[#1B4D2E]/30"
                          />
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() => canExpand && setExpandedRow(isExpanded ? null : r.row_number)}
                        className={`flex min-w-0 flex-1 items-center gap-3 text-left transition-colors ${canExpand ? 'hover:opacity-80' : ''}`}
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-[13px] font-medium text-[#1A2B1A]">
                            {r.matched_record_name || r.rsbsa_number || `Row ${r.row_number}`}
                          </p>
                          <p className="mt-0.5 text-[11px] text-[#A8BCA8]">
                            Row {r.row_number} · {r.rsbsa_number || '(blank RSBSA no.)'}
                            {r.classification && r.classification !== 'HOLD-BACK' ? ` · ${r.classification === 'IMPORT-FARMER' ? 'Farmer' : 'Fisherfolk'}` : ''}
                          </p>
                          {r.status === 'invalid' && (
                            <p className="mt-0.5 text-[12px] text-rose-600">
                              {HOLD_BACK_REASON_TEXT[r.hold_back_reason] || r.hold_back_reason}
                            </p>
                          )}
                          {r.status === 'unmatched' && (
                            <p className="mt-0.5 text-[12px] text-[#5A6B5C]">Not yet in the system — commit will register this person as new.</p>
                          )}
                          {r.status === 'duplicate_in_file' && (
                            <p className="mt-0.5 text-[12px] text-rose-600">{r.detail}</p>
                          )}
                          {r.status === 'matched_with_changes' && (
                            <>
                              <p className="mt-0.5 text-[12px] text-[#8A5207]">
                                {r.changes.length} field{r.changes.length === 1 ? '' : 's'} differ — {isExpanded ? 'hide' : 'show'} details
                              </p>
                              <p className="mt-0.5 text-[11px] text-[#7A8E7A]">
                                Record last updated: {formatLastUpdated(r.matched_record_updated_at)}
                              </p>
                            </>
                          )}
                        </div>
                        <StatusPill tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</StatusPill>
                      </button>
                    </div>
                    {isExpanded && (
                      <div className="bg-[#F9FAF9] px-5 py-3">
                        <table className="w-full text-[12px]">
                          <thead>
                            <tr className="text-left text-[#7A8E7A]">
                              <th className="pb-1.5 font-medium">Field</th>
                              <th className="pb-1.5 font-medium">Current Value</th>
                              <th className="pb-1.5 font-medium">Incoming Value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {r.changes.map((c) => (
                              <tr key={c.field} className="border-t border-[#E2E8E2]">
                                <td className="py-1.5 pr-3 font-medium text-[#1A2B1A]">{c.label}</td>
                                <td className="py-1.5 pr-3 text-[#4A5A4C]">{c.current}</td>
                                <td className="py-1.5 font-medium text-[#8A5207]">{c.incoming}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )
              })}
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
        </div>
      )}

      {step === 'confirm' && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl bg-[#1B4D2E] p-6 text-white">
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#9DC2A8]">You Are About to Commit</p>
            <p className="mt-2 text-[26px] font-semibold leading-tight">{selectedRowObjects.length} row{selectedRowObjects.length === 1 ? '' : 's'}</p>
            <div className="my-4 border-t border-white/15" />
            <p className="text-[13px] text-[#B7CBBB]">
              <span className="font-semibold text-white">{selectedUpdateCount}</span> existing record{selectedUpdateCount === 1 ? '' : 's'} updated,{' '}
              <span className="font-semibold text-white">{selectedCreateCount}</span> new registrant{selectedCreateCount === 1 ? '' : 's'} created
            </p>
          </div>

          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-amber-700" aria-hidden="true" />
            <p className="text-[13px] text-amber-800">
              <span className="font-semibold">All-or-nothing:</span> if any selected row fails (e.g. a record changed
              since this preview was generated), none of the {selectedRowObjects.length} row{selectedRowObjects.length === 1 ? '' : 's'} will
              be saved. Only the fields shown below are ever touched — nothing else on these records changes.
            </p>
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white">
            <p className="border-b border-[#E2E8E2] px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">
              Rows to Commit
            </p>
            <div className="max-h-72 divide-y divide-[#F0F4F0] overflow-y-auto">
              {selectedRowObjects.map((r) => (
                <div key={r.row_number} className="px-4 py-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-[13px] font-medium text-[#1A2B1A]">
                      {r.matched_record_name || r.rsbsa_number}
                    </p>
                    <StatusPill tone={r.status === 'unmatched' ? 'slate' : 'amber'}>
                      {r.status === 'unmatched' ? 'Register New' : 'Update'}
                    </StatusPill>
                  </div>
                  <p className="mt-0.5 text-[12px] text-[#7A8E7A]">
                    Row {r.row_number} · {r.rsbsa_number} ·{' '}
                    {r.status === 'unmatched'
                      ? `${Object.keys(r.incoming_values || {}).length} field(s) will be set`
                      : r.changes.map((c) => c.label).join(', ')}
                  </p>
                </div>
              ))}
            </div>
          </div>

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
                <span className="font-semibold">{commitResult.committed}</span> row{commitResult.committed === 1 ? '' : 's'} committed.
              </p>
              <p className="mt-1 text-[11px] text-[#5A6B5C]">Batch ID: {commitResult.batch_id}</p>
            </div>
          </div>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <p className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">What Changed</p>
            <div className="-mx-5 divide-y divide-[#F0F4F0]">
              {commitResult.results.map((r) => (
                <div key={r.row_number} className="flex items-center gap-3 px-5 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[13px] font-medium text-[#1A2B1A]">{r.record_name}</p>
                    <p className="mt-0.5 text-[11px] text-[#7A8E7A]">
                      Row {r.row_number} · {r.fields_changed.length} field{r.fields_changed.length === 1 ? '' : 's'}: {r.fields_changed.join(', ')}
                    </p>
                  </div>
                  <StatusPill tone={r.action === 'CREATE' ? 'slate' : 'green'}>{r.action === 'CREATE' ? 'Registered' : 'Updated'}</StatusPill>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
