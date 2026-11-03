import logo from '../../assets/LOGO OMAg.jpg'
import { selectedReport, signatureSlots } from './reportPaper.js'

// The two things the Reports page shows under a report's filters: the Selected report box, and the print-ready paper preview.
// The paper is an on-screen copy of the printed report (the same letterhead, title, period, tables and signature lines); Print and
// Preview PDF stay the real output.

const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X']
const longToday = () => new Intl.DateTimeFormat('en-US', { month: 'long', day: '2-digit', year: 'numeric' }).format(new Date())

// ── Selected report box ───────────────────────────────────────────────────────────────────────────────────────────────────────

// `type` is the report's entry of REPORT_TYPES; `period` and `detail` are what is applied right now.
export function SelectedReportBox({ type, period, detail }) {
  const report = selectedReport(type, { period, detail })
  return (
    <section aria-label="Selected report" className="rounded-xl border border-[#E2E8E2] bg-[#F5F7F5] p-4 print:hidden">
      <p className="text-[12px] font-semibold text-[#4A5E4A]">Selected report</p>
      <p className="mt-0.5 text-[15px] font-semibold text-[#1B4D2E]">{report.name}</p>
      <p className="text-[12.5px] text-[#4A5E4A]">{report.description}</p>
      <dl className="mt-3 grid grid-cols-1 gap-x-6 gap-y-2 sm:grid-cols-2">
        {report.rows.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#7A8E7A]">{label}</dt>
            <dd className="break-words text-[13px] text-[#1A2B1A]">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  )
}

// ── Paper preview ─────────────────────────────────────────────────────────────────────────────────────────────────────────────

function PaperTable({ headers, rows, empty }) {
  if (!rows.length) return <p className="rounded border border-dashed border-slate-300 py-5 text-center text-[12px] text-slate-500">{empty || 'No records found.'}</p>
  return (
    <table className="w-full border-collapse text-[11px] text-slate-800">
      <thead>
        <tr>{headers.map((h, i) => <th key={i} className="border border-[#14703C] bg-[#16813F] px-2 py-1.5 text-left font-semibold text-white">{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((row, i) => (
          <tr key={i} className={i % 2 ? 'bg-[#F0F8F3]' : 'bg-white'}>
            {row.map((cell, j) => <td key={j} className="break-words border border-slate-200 px-2 py-1.5 align-top">{cell === null || cell === undefined || cell === '' ? '—' : String(cell)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PaperSection({ index, count, section, emptyText }) {
  return (
    <div className="mt-6">
      {(count > 1 || section.title) && (
        <p className="mb-2 border-b-2 border-[#16813F] pb-1 text-[12px] font-bold uppercase tracking-wide text-[#16813F]">
          Section {ROMAN[index] || index + 1}{section.title ? ` — ${section.title}` : ''}
        </p>
      )}
      {section.pairs ? (
        <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2">
          {section.pairs.map(([label, value]) => (
            <div key={label} className="flex min-w-0 gap-2 text-[11.5px]">
              <dt className="w-32 shrink-0 font-semibold text-slate-500">{label}</dt>
              <dd className="min-w-0 break-words text-slate-800">{value === '' || value === null || value === undefined ? '—' : String(value)}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <PaperTable headers={section.headers} rows={section.rows} empty={section.empty || emptyText} />
      )}
    </div>
  )
}

function SignatureLines({ params }) {
  const slots = signatureSlots(params)
  return (
    <div className="mt-10 grid gap-6" style={{ gridTemplateColumns: `repeat(${slots.length}, minmax(0, 1fr))` }}>
      {slots.map((slot) => (
        <div key={slot.label} className="min-w-0 text-[11px]">
          <p className="font-semibold text-slate-600">{slot.label}:</p>
          <div className="mt-6 border-b border-slate-700" />
          {slot.name && <p className="mt-1 break-words font-bold text-slate-900">{slot.name}</p>}
          {slot.role && <p className="break-words text-slate-500">{slot.role}</p>}
        </div>
      ))}
    </div>
  )
}

// `doc` is a paperDocument(): { heading, period, detail, stats: [[label, value]], sections: [{ title, headers, rows, empty } | { title, pairs }] }.
// `signers` is the Signatories block's parameters (useSignatories().params). `doc` null means the report is still loading. `emptyText` is
// what a table with no rows says when its section has no message of its own.
export function ReportPaper({ doc, signers, isLoading = false, emptyText }) {
  return (
    <section aria-label="Print-ready report preview template" className="space-y-3 print:hidden">
      <h2 className="text-[18px] font-semibold text-[#1A2B1A]">Print-ready report preview template</h2>
      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-[#F5F7F5] p-3 sm:p-5">
        {isLoading || !doc ? (
          <p className="py-10 text-center text-[13px] text-[#7A8E7A]">Loading report data…</p>
        ) : (
          <article className="mx-auto min-w-[640px] max-w-[860px] bg-white px-6 py-8 shadow-[0_1px_4px_rgba(0,0,0,0.12)] sm:px-10">
            <header className="text-center">
              <img src={logo} alt="" className="mx-auto h-16 w-16 object-contain" />
              <p className="mt-2 text-[11px] text-slate-600">Republic of the Philippines · Province of La Union · Municipality of Aringay</p>
              <p className="text-[13px] font-bold uppercase tracking-wide text-[#16813F]">Office of the Municipal Agriculturist</p>
              <div className="mt-3 border-t border-slate-300" />
              <h3 className="mt-4 text-[20px] font-extrabold uppercase tracking-wide text-slate-900">{doc.heading}</h3>
              {doc.period && <p className="text-[12px] font-medium text-slate-600">{doc.period}</p>}
              {doc.detail && <p className="text-[11.5px] text-slate-500">{doc.detail}</p>}
              <p className="mt-2 rounded border border-slate-200 px-3 py-1 text-[11px] text-slate-500">Date Generated: {longToday()}</p>
            </header>

            {doc.stats.length > 0 && (
              <p className="mt-4 rounded border border-[#CBE7D6] bg-[#EDF8F1] px-3 py-2 text-center text-[12px] font-bold text-[#16813F]">
                {doc.stats.map(([label, value]) => `${label}: ${value}`).join('   ·   ')}
              </p>
            )}

            {doc.sections.map((section, index) => <PaperSection key={index} index={index} count={doc.sections.length} section={section} emptyText={emptyText} />)}

            <SignatureLines params={signers} />
            <p className="mt-8 text-center text-[10.5px] italic text-slate-500">This is an official record of the Office of the Municipal Agriculturist.</p>
          </article>
        )}
      </div>
    </section>
  )
}
