import { Download, FileText, Printer } from 'lucide-react'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { SIGNATORY_ROLES, meSignatory, signatoryOptions } from '../../utils/signatories.js'

export const labelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// The pieces every report on the Reports page shares: the Signatories block, the Print / PDF / Excel button row, and the preview table.

// ── Signatories block ─────────────────────────────────────────────────────────────────────────────────────────────────────────

// The four signers of the printed report, picked from the saved list (Admin > Signatories). `signatories` is the result of useSignatories().
// Print and Preview PDF carry the picks; Download Excel has no signature block.
export function SignatoriesPanel({ signatories }) {
  const { list, user, choices, setChoice } = signatories
  const me = meSignatory(user)
  return (
    <fieldset className="rounded-xl border border-[#E2E8E2] bg-white p-4 print:hidden">
      <legend className="px-1 text-[13px] font-semibold text-[#1A2B1A]">Signatories</legend>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {SIGNATORY_ROLES.map(({ value, label }) => (
          <div key={value}>
            <label htmlFor={`signatory-${value}`} className={labelCls}>{label}</label>
            <select id={`signatory-${value}`} className={baseInputClasses} value={choices[value]} onChange={(e) => setChoice(value, e.target.value)}>
              <option value="">— None —</option>
              {value === 'prepared' && me && <option value="me">{me.name} (me)</option>}
              {signatoryOptions(list, value).map((s) => (
                <option key={s.id} value={String(s.id)}>{s.name}{s.position ? ` — ${s.position}` : ''}</option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-[#7A8E7A]">Filled in from Manage Signatories. Change a line here for this printout only.</p>
    </fieldset>
  )
}

// ── Shared: Action Buttons Row ─────────────────────────────────────────────────

// print:hidden on the whole row — action buttons have no business appearing
// on the printed page itself, same reason the filter panels and tab
// switcher below are hidden on print.
// `onPrint` prints the report itself: the same PDF as Preview PDF, formatted as an official document (see utils/printPdf.js).
// Without it the button falls back to printing the screen.
export function ActionButtons({ onPrint, onPdf, onExcel, isDownloading }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end print:hidden [&>*:last-child:nth-child(odd)]:col-span-2 [&>*]:justify-center max-md:[&>*]:min-h-[40px]">
      <button
        type="button"
        onClick={onPrint || (() => window.print())}
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
