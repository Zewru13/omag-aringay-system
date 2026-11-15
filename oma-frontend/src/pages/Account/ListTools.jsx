import { Search } from 'lucide-react'

// The tools above a list of an account page: a search box and, when the records span more than one year, a Year filter.
// The list itself narrows with accountSearch.js (searchRows, inYear).
export default function ListTools({ search, onSearch, placeholder = 'Search', years = [], year = '', onYear }) {
  return (
    <div className="mb-3 flex flex-col gap-2 sm:flex-row">
      <label className="relative block min-w-0 flex-1">
        <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input
          type="search"
          value={search}
          onChange={(event) => onSearch(event.target.value)}
          placeholder={placeholder}
          aria-label={placeholder}
          className="h-11 w-full rounded-[var(--radius-sm)] border border-border-strong bg-surface pl-10 pr-3 text-[15px] text-text-primary placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 md:h-10 md:text-[13px]"
        />
      </label>
      {onYear && years.length > 1 && (
        <select
          value={year}
          onChange={(event) => onYear(event.target.value)}
          aria-label="Year"
          className="h-11 rounded-[var(--radius-sm)] border border-border-strong bg-surface px-3 text-[15px] text-text-primary focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 md:h-10 md:text-[13px]"
        >
          <option value="">All years</option>
          {years.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
    </div>
  )
}
