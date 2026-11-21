import { useState } from 'react'
import { Download, PenLine, Printer } from 'lucide-react'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { SIGNATORY_ROLES, meSignatory, savedChoiceOf, signatoryOptions, signerSummary } from '../../utils/signatories.js'
import { EntryCell, EntryHead, EntryRow, EntryTable, EntryTh } from '../../components/UI/EntryTable.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'

export const labelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

// The pieces every report on the Reports page shares: the Signatories block, the Print / PDF / Excel button row, and the preview table.

// ── Signatories block ────────────────────────────────────────────────────────────────

// The four signers of the printed report. The block shows who signs each line and one button; the button opens a floating table with a row
// per role: pick a saved signer (Admin > Signatories) or type the name, and the Position / Designation, which starts filled in by the kind
// of account and can be edited. `signatories` is the result of useSignatories(). Print and Preview PDF carry the rows; Download Excel has
// no signature block.
export function SignatoriesPanel({ signatories }) {
  const [open, setOpen] = useState(false)
  const { rows } = signatories
  return (
    <fieldset className="rounded-xl border border-[#E2E8E2] bg-white p-4 print:hidden">
      <legend className="px-1 text-[13px] font-semibold text-[#1A2B1A]">Signatories</legend>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <dl className="grid min-w-0 flex-1 grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {SIGNATORY_ROLES.map(({ value, label }) => (
            <div key={value} className="min-w-0">
              <dt className="text-[11px] font-semibold uppercase tracking-wide text-[#7A8E7A]">{label}</dt>
              <dd className="truncate text-[13px] text-[#1A2B1A]">{signerSummary(rows[value]) || '—'}</dd>
            </div>
          ))}
        </dl>
        <Button type="button" variant="outline" icon={PenLine} onClick={() => setOpen(true)}>Enter Signatories</Button>
      </div>
      {open && <SignatoriesWindow signatories={signatories} onClose={() => setOpen(false)} />}
    </fieldset>
  )
}

function SignatoriesWindow({ signatories, onClose }) {
  const { list, user, rows, setField, pickSaved } = signatories
  const me = meSignatory(user)
  return (
    <ModalShell
      title="Signatories"
      subtitle="Who signs this report. Pick a saved signer or type a name; the position can be changed."
      icon={PenLine}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={<Button type="button" onClick={onClose}>Done</Button>}
    >
      <EntryTable label="Signatories" testId="signatories-window">
        <EntryHead>
          <EntryTh>Signing line</EntryTh>
          <EntryTh>Saved signer</EntryTh>
          <EntryTh>Name</EntryTh>
          <EntryTh>Position / Designation</EntryTh>
        </EntryHead>
        <tbody>
          {SIGNATORY_ROLES.map(({ value, label }) => (
            <EntryRow key={value}>
              <EntryCell className="text-[13px] font-semibold text-[#1A2B1A] md:w-36">{label}</EntryCell>
              <EntryCell label="Saved signer">
                <select
                  aria-label={`${label}: saved signer`}
                  className={baseInputClasses}
                  value={savedChoiceOf(rows[value], list, value, user)}
                  onChange={(e) => pickSaved(value, e.target.value)}
                >
                  <option value="">{savedChoiceOf(rows[value], list, value, user) === '' && rows[value].name ? 'Typed by hand' : '— None —'}</option>
                  {value === 'prepared' && me && <option value="me">{me.name} (me)</option>}
                  {signatoryOptions(list, value).map((s) => (
                    <option key={s.id} value={String(s.id)}>{s.name}{s.position ? ` — ${s.position}` : ''}</option>
                  ))}
                </select>
              </EntryCell>
              <EntryCell label="Name">
                <input
                  type="text"
                  aria-label={`${label}: name`}
                  className={baseInputClasses}
                  value={rows[value].name}
                  onChange={(e) => setField(value, 'name', e.target.value)}
                  placeholder="Full name"
                />
              </EntryCell>
              <EntryCell label="Position / Designation">
                <input
                  type="text"
                  aria-label={`${label}: position or designation`}
                  className={baseInputClasses}
                  value={rows[value].position}
                  onChange={(e) => setField(value, 'position', e.target.value)}
                  placeholder="Position or designation"
                />
              </EntryCell>
            </EntryRow>
          ))}
        </tbody>
      </EntryTable>
      <p className="mt-3 text-[11.5px] text-[#7A8E7A]">A line with no name is left off the printout. Changes here apply to this printout only; saved signers are kept in Manage Signatories.</p>
    </ModalShell>
  )
}

// ── Shared: Action Buttons Row ─────────────────────────────────────────────────

// print:hidden on the whole row: the buttons have no business on the printed page itself.
// Print Report prints the report itself and Download Report saves it as a PDF: both are the same PDF, with the signers picked in the
// Signatories block (see utils/printPdf.js and utils/fileDownload.js). The buttons are named like the ones on the registry tables.
export function ActionButtons({ onPrint, onDownload, isDownloading }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:justify-end print:hidden [&>*]:justify-center max-md:[&>*]:min-h-[40px]">
      <button
        type="button"
        onClick={onPrint}
        disabled={isDownloading}
        className="flex items-center gap-1.5 bg-white border border-[#C8D5C8] hover:bg-[#F5F7F5] text-[#1B4D2E] text-[13px] font-medium px-4 py-2 rounded-lg transition-colors disabled:cursor-wait disabled:opacity-60"
      >
        <Printer className="w-4 h-4" aria-hidden="true" />
        Print Report
      </button>
      <Button type="button" onClick={onDownload} disabled={isDownloading} variant="primary">
        <Download className="w-4 h-4" aria-hidden="true" />
        Download Report
      </Button>
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
