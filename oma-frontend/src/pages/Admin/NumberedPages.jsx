import { ChevronLeft, ChevronRight } from 'lucide-react'
import { pageNumbers, showingText } from './auditLog.js'

// "Showing 1 to 10 of 1,363 entries" with Previous, the page numbers and Next. Nothing to show means nothing to page through.
const BUTTON = 'flex h-8 min-w-8 items-center justify-center gap-1 rounded-lg border px-2 text-[13px] font-medium transition-colors max-md:h-10 max-md:min-w-10'
const PLAIN = `${BUTTON} border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-white`
const CURRENT = `${BUTTON} border-[#1B4D2E] bg-[#1B4D2E] text-white`

export default function NumberedPages({ page, pageSize = 10, total, onPage }) {
  if (!total) return null
  const pages = Math.max(1, Math.ceil(total / pageSize))
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3">
      <p className="text-[13px] text-[#4A5E4A]">{showingText(page, pageSize, total)}</p>
      <nav aria-label="Pages" className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={PLAIN} disabled={page <= 1} onClick={() => onPage(page - 1)}>
          <ChevronLeft size={14} aria-hidden="true" /> Previous
        </button>
        {pageNumbers(page, pages).map((number, i) => (number === '…'
          ? <span key={`gap-${i}`} className="px-1 text-[13px] text-[#7A8E7A]">…</span>
          : (
            <button key={number} type="button" className={number === page ? CURRENT : PLAIN} aria-label={`Page ${number}`}
              aria-current={number === page ? 'page' : undefined} onClick={() => onPage(number)}>
              {number.toLocaleString('en-US')}
            </button>
          )))}
        <button type="button" className={PLAIN} disabled={page >= pages} onClick={() => onPage(page + 1)}>
          Next <ChevronRight size={14} aria-hidden="true" />
        </button>
      </nav>
    </div>
  )
}
