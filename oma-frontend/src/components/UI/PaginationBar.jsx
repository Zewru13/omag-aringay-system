import { ChevronLeft, ChevronRight } from 'lucide-react'

/**
 * PaginationBar — server-side pagination controls.
 * Props:
 *   page        (number) — current 1-based page
 *   totalCount  (number) — total record count from API
 *   pageSize    (number) — records per page (default 10)
 *   onPageChange(newPage) — called when user clicks prev/next
 */
export default function PaginationBar({ page, totalCount, pageSize = 10, onPageChange }) {
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const start = totalCount === 0 ? 0 : (page - 1) * pageSize + 1
  const end = Math.min(page * pageSize, totalCount)

  return (
    <div className="flex items-center justify-between bg-white border border-[#E2E8E2] rounded-xl px-4 py-3 mt-4">
      <p className="text-[13px] text-[#4A5E4A]">
        {totalCount === 0
          ? 'No results'
          : `Showing ${start}–${end} of ${totalCount} results`}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#C8D5C8] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
          aria-label="Previous page"
        >
          <ChevronLeft size={15} />
        </button>
        <span className="text-[13px] text-[#4A5E4A] min-w-[90px] text-center">
          Page {page} of {totalPages}
        </span>
        <button
          type="button"
          className="flex items-center justify-center w-8 h-8 rounded-lg border border-[#C8D5C8] text-[#4A5E4A] hover:bg-[#F5F7F5] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
          aria-label="Next page"
        >
          <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}
