import { useEffect, useRef, useState } from 'react'
import { Search } from 'lucide-react'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

// A table of registered people or organizations to tick for an assistance distribution, with a search bar and pages. The ticked ones are
// kept by the caller as a Map of id -> record, so a tick on page 1 survives a look at page 2.
//   columns   [{ key, label }]: the cells of each row (the record's own fields)
//   load      ({ search, page }) => Promise<{ rows, count }>: one page of the table
//   picked    Map of id -> record;  onToggle(record);  onPickPage(rows) ticks every row of the page;  onClear()
//   noun      'farmers', 'organizations'... for the messages
const CELL = 'px-3 py-2.5 text-[13px] text-[#1A2B1A]'

export default function RecipientTable({ columns, load, picked, onToggle, onPickPage, onClear, noun, searchPlaceholder, pageSize = 10 }) {
  const [search, setSearch] = useState('')
  const [debounced, setDebounced] = useState('')
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ key: null, rows: [], count: 0, failed: false })
  const latest = useRef(0)

  useEffect(() => {
    const handle = setTimeout(() => { setDebounced(search.trim()); setPage(1) }, 300)
    return () => clearTimeout(handle)
  }, [search])

  const key = `${debounced}|${page}`
  const isLoading = state.key !== key

  useEffect(() => {
    const request = ++latest.current
    load({ search: debounced, page })
      .then(({ rows, count }) => { if (request === latest.current) setState({ key, rows, count, failed: false }) })
      .catch(() => { if (request === latest.current) setState({ key, rows: [], count: 0, failed: true }) })
  }, [load, debounced, page, key])

  const rows = isLoading ? [] : state.rows
  const allOnPage = rows.length > 0 && rows.every((r) => picked.has(r.id))

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="relative w-full sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A8BCA8]" aria-hidden="true" />
          <input type="search" className={`${baseInputClasses} pl-8`} placeholder={searchPlaceholder} value={search}
            onChange={(e) => setSearch(e.target.value)} aria-label={`Search ${noun}`} />
        </div>
        <p role="status" className="text-[13px] font-medium text-[#4A5E4A]">
          {picked.size} selected
          {picked.size > 0 && <button type="button" onClick={onClear} className="ml-3 text-[12px] font-medium text-rose-600 hover:underline">Clear</button>}
        </p>
      </div>

      <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
        <table className="min-w-full text-left">
          <thead className="bg-[#1B4D2E] text-white">
            <tr>
              <th className="w-10 px-3 py-2.5">
                <input type="checkbox" className="h-4 w-4 accent-white" checked={allOnPage} disabled={rows.length === 0}
                  onChange={() => (allOnPage ? rows.forEach((r) => picked.has(r.id) && onToggle(r)) : onPickPage(rows))}
                  aria-label={`Select every ${noun.replace(/s$/, '')} on this page`} />
              </th>
              {columns.map((c) => <th key={c.key} className="px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide">{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, i) => (
              <tr key={i} className="border-b border-[#F0F4F0]"><td colSpan={columns.length + 1} className="px-3 py-3"><div className="h-4 w-3/4 animate-pulse rounded bg-[#E8EEE8]" /></td></tr>
            ))}
            {!isLoading && rows.length === 0 && (
              <tr><td colSpan={columns.length + 1} className="px-3 py-8 text-center text-[13px] text-[#7A8E7A]">
                {state.failed ? `The ${noun} could not be loaded. Change the search to try again.` : `No ${noun} found.`}
              </td></tr>
            )}
            {rows.map((r) => {
              const on = picked.has(r.id)
              return (
                <tr key={r.id} className={`border-b border-[#F0F4F0] ${on ? 'bg-[#EBF5EE]' : 'hover:bg-[#F9FAF9]'}`}>
                  <td className="px-3 py-2.5">
                    <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={on} onChange={() => onToggle(r)} aria-label={`Select ${r.name}`} />
                  </td>
                  {columns.map((c) => <td key={c.key} className={CELL}>{r[c.key] ?? '—'}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <PaginationBar page={page} totalCount={isLoading ? 0 : state.count} pageSize={pageSize} onPageChange={setPage} />
    </div>
  )
}
