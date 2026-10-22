import { useState } from 'react'
import { Download, FileText, Printer } from 'lucide-react'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useAuth } from '../../context/AuthContext.jsx'

export const labelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// The pieces every report on the Reports page shares: the signature pop-up for the PDF / Excel, the Print / PDF /
// Excel button row, and the preview table.

// ── Signature Modal ────────────────────────────────────────────────────────────

export function SignatureModal({ purpose, onClose, onGenerate }) {
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
      <div className="max-md:w-full">
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
          placeholder="Your position or designation"
          className={baseInputClasses}
        />
      </div>

      <div className="border-t border-[#F0F4F0] my-3" />

      <div className="mb-1">
        <div className="flex items-center justify-between">
          <p className="text-[13px] font-semibold text-[#1A2B1A]">
            Reviewed by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
          </p>
          <button
            type="button"
            onClick={() => setShowReviewer(v => !v)}
            className="text-[12px] font-medium text-[#1B4D2E] hover:underline max-md:min-h-[40px] max-md:px-2"
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
            Noted by <span className="text-[11px] text-[#A8BCA8] font-normal">(optional)</span>
          </p>
          <button
            type="button"
            onClick={() => setShowNotedBy(v => !v)}
            className="text-[12px] font-medium text-[#1B4D2E] hover:underline max-md:min-h-[40px] max-md:px-2"
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

// ── Shared: Action Buttons Row ─────────────────────────────────────────────────

// print:hidden on the whole row — action buttons have no business appearing
// on the printed page itself, same reason the filter panels and tab
// switcher below are hidden on print.
export function ActionButtons({ onPdf, onExcel, isDownloading }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end print:hidden [&>*:last-child:nth-child(odd)]:col-span-2 [&>*]:justify-center max-md:[&>*]:min-h-[40px]">
      <button
        type="button"
        onClick={() => window.print()}
        disabled={isDownloading}
        className="flex items-center gap-1.5 bg-white border border-[#C8D5C8] hover:bg-[#F5F7F5] text-[#4A5E4A] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
      >
        <Printer className="w-4 h-4" />
        Print
      </button>
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

export function PreviewTable({ headers, rows, isLoading, emptyText = 'No records found.' }) {
  return (
    // print:overflow-visible — the screen version scrolls a too-wide table
    // sideways, which on paper would just clip the overflow instead of
    // scrolling; print:text-[10px]/px-2/py-1 shrink cells so wide tables
    // (e.g. Farmer Crop History's 12 columns) have a real chance of fitting
    // the page width instead of being cut off.
    <div className="overflow-x-auto print:overflow-visible rounded-xl border border-[#E2E8E2] print:border-slate-300 bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] print:shadow-none">
      <table className="min-w-full text-sm print:w-full print:table-fixed">
        <thead className="bg-[#1B4D2E] text-white print:bg-[#1B4D2E]">
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="px-4 py-[11px] text-left text-[11px] font-semibold uppercase tracking-[0.06em] whitespace-nowrap print:whitespace-normal print:text-[9px] print:px-2 print:py-1">
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
            <tr key={i} className="border-b border-[#F0F4F0] print:border-slate-300 hover:bg-[#F9FAF9]">
              {row.map((cell, j) => (
                <td key={j} className="px-4 py-[11px] text-[13px] text-[#1A2B1A] whitespace-nowrap print:whitespace-normal print:text-[9px] print:px-2 print:py-1 print:break-words">{cell ?? '—'}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
