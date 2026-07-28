import { useState } from 'react'
import { ChevronDown, SlidersHorizontal } from 'lucide-react'
import SearchBar from './SearchBar.jsx'

// Search-first toolbar: the search input stays primary and always visible,
// while secondary filters collapse behind a "Filters" toggle so they don't
// crowd out the search box. `activeCount` drives the badge so users can tell
// filters are applied even while the panel is collapsed. Pages with search
// only (no secondary filters at all) simply omit `children` — the toggle
// itself is skipped rather than opening onto an empty strip.
function FilterPanel({ search, onSearchChange, searchPlaceholder, activeCount = 0, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen)
  const hasFilters = Boolean(children)

  return (
    <div className="bg-white border border-[#E2E8E2] rounded-xl px-4 py-[10px] mb-4">
      <div className="flex items-center gap-2.5">
        <div className="flex-1 min-w-0">
          <SearchBar onChange={onSearchChange} placeholder={searchPlaceholder} value={search} />
        </div>
        {hasFilters && (
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className={`flex shrink-0 items-center gap-1.5 rounded-lg border px-3 py-[7px] text-[13px] font-medium transition-colors ${
              open
                ? 'border-[#1B4D2E] bg-[#EBF5EE] text-[#1B4D2E]'
                : 'border-[#E2E8E2] bg-[#F9FAF9] text-[#4A5E4A] hover:bg-[#F0F4F0]'
            }`}
          >
            <SlidersHorizontal size={14} />
            Filters
            {activeCount > 0 && (
              <span className="flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#1B4D2E] px-1 text-[10px] font-semibold text-white">
                {activeCount}
              </span>
            )}
            <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
          </button>
        )}
      </div>
      {hasFilters && open && (
        <div className="mt-3 flex flex-wrap items-center gap-2.5 border-t border-[#F0F4F0] pt-3">
          {children}
        </div>
      )}
    </div>
  )
}

export default FilterPanel
