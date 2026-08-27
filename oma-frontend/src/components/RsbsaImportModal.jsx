import { useMemo, useState } from 'react'
import { AlertTriangle, FileSpreadsheet, Upload } from 'lucide-react'
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
]
const STEP_INDEX = { upload: 0, preview: 1 }

const STATUS_TONE = {
  matched_with_changes: 'amber',
  matched_no_changes: 'green',
  unmatched: 'slate',
  invalid: 'rose',
}
const STATUS_LABEL = {
  matched_with_changes: 'Changes Found',
  matched_no_changes: 'No Changes',
  unmatched: 'Unmatched',
  invalid: 'Invalid',
}
const HOLD_BACK_REASON_TEXT = {
  corrupted_rsbsa: 'RSBSA number has a non-numeric segment',
  all_flags_blank: 'Farmer/Farmworker/Fisherfolk flags are all blank',
  all_flags_no: 'Farmer/Farmworker/Fisherfolk flags are all No',
  unmatched_barangay: 'Barangay does not match any known barangay',
  unparseable_birthday: 'Birthdate could not be read (expected DD/MM/YYYY)',
}

const PAGE_SIZE = 25

function formatLastUpdated(iso) {
  if (!iso) return 'never (no updated_at recorded)'
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

// Step 1 of the RSBSA update-import feature: file upload + preview only.
// Deliberately has NO commit action yet — this modal can only show what
// WOULD change, never write it. See farmers/rsbsa_import_views.py's module
// docstring for why "changed since last import" is implemented as "current
// value differs from the incoming sheet value" rather than a true history
// comparison (neither Farmer nor Fisherfolk tracks per-field edit history).
export default function RsbsaImportModal({ onClose }) {
  const { showToast } = useToast()
  const [step, setStep] = useState('upload')
  const [file, setFile] = useState(null)
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const [preview, setPreview] = useState(null)
  const [statusFilter, setStatusFilter] = useState('all')
  const [page, setPage] = useState(1)
  const [expandedRow, setExpandedRow] = useState(null)

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
    setError('')
    setStep('upload')
  }

  const FILTER_TABS = preview ? [
    { key: 'all', label: `All ${preview.total_rows}` },
    { key: 'matched_with_changes', label: `${preview.summary.matched_with_changes} Changes Found` },
    { key: 'matched_no_changes', label: `${preview.summary.matched_no_changes} No Changes` },
    { key: 'unmatched', label: `${preview.summary.unmatched} Unmatched` },
    { key: 'invalid', label: `${preview.summary.invalid} Invalid` },
  ] : []

  const filteredRows = useMemo(() => {
    if (!preview) return []
    return statusFilter === 'all'
      ? preview.rows
      : preview.rows.filter((r) => r.status === statusFilter)
  }, [preview, statusFilter])

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE))
  const paginatedRows = filteredRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  return (
    <ModalShell
      title="Import RSBSA File"
      subtitle="Upload a fresh RSBSA/BFAR export to preview updates to existing Farmer and Fisherfolk records."
      icon={FileSpreadsheet}
      onClose={onClose}
      maxWidth="max-w-4xl"
    >
      <StepIndicator steps={STEPS} currentIndex={STEP_INDEX[step]} />

      {step === 'upload' && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <p className="mb-3 text-[13px] text-[#4A5A4C]">
              This is an UPDATE tool for people already registered — it matches rows to existing records by
              RSBSA number and never creates new Farmer or Fisherfolk records. A row with no matching
              existing record is reported separately, not created.
            </p>
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[#D8E2D8] bg-[#F9FAF9] px-6 py-8 text-center transition-colors hover:bg-[#F0F4F0]">
              <Upload size={22} className="text-[#7A8E7A]" aria-hidden="true" />
              <span className="text-[13px] font-medium text-[#1A2B1A]">
                {file ? file.name : 'Click to choose a .xlsx file'}
              </span>
              <span className="text-[11px] text-[#7A8E7A]">Same 21-column RSBSA/BFAR export format as the original registry import</span>
              <input type="file" accept=".xlsx" className="hidden" onChange={handleFileChange} />
            </label>
          </div>

          {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" isLoading={isBusy} onClick={handlePreview} disabled={!file}>
              Preview Changes
            </Button>
          </div>
        </div>
      )}

      {step === 'preview' && preview && (
        <div className="stagger-item mt-6 space-y-4">
          <div className="flex items-start gap-3 rounded-2xl border border-sky-200 bg-sky-50 p-4">
            <AlertTriangle size={18} className="mt-0.5 shrink-0 text-sky-800" aria-hidden="true" />
            <div>
              <p className="text-[13px] font-semibold text-sky-800">Preview only — nothing has been changed</p>
              <p className="mt-0.5 text-[13px] text-sky-700">
                This screen shows what would change. No Farmer or Fisherfolk record has been updated by this preview.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatTile value={preview.summary.matched_with_changes} label="Changes Found" />
            <StatTile value={preview.summary.matched_no_changes} label="No Changes" />
            <StatTile value={preview.summary.unmatched} label="Unmatched" />
            <StatTile value={preview.summary.invalid} label="Invalid Rows" />
          </div>

          <p className="text-[11px] italic text-[#7A8E7A]">
            Note: "Record last updated" timestamps reflect the date this tracking feature was added if the
            record hasn't been edited since — they don't yet distinguish a genuine recent edit from a record
            that simply hasn't been touched.
          </p>

          <div className="rounded-2xl border border-[#E2E8E2] bg-white p-5">
            <div className="mb-3 flex flex-wrap gap-1.5">
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

            <div className="-mx-5 divide-y divide-[#F0F4F0]">
              {paginatedRows.length === 0 && (
                <p className="px-5 py-8 text-center text-[13px] text-[#7A8E7A]">No rows in this category.</p>
              )}
              {paginatedRows.map((r) => {
                const isExpanded = expandedRow === r.row_number
                const canExpand = r.status === 'matched_with_changes'
                return (
                  <div key={r.row_number}>
                    <button
                      type="button"
                      onClick={() => canExpand && setExpandedRow(isExpanded ? null : r.row_number)}
                      className={`flex w-full items-center gap-3 px-5 py-3 text-left transition-colors ${canExpand ? 'hover:bg-[#F9FAF9]' : ''}`}
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

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="outline" onClick={handleStartOver}>Upload a Different File</Button>
            <Button type="button" onClick={onClose}>Close</Button>
          </div>
        </div>
      )}
    </ModalShell>
  )
}
