import { useEffect, useRef, useState } from 'react'
import { Search, User } from 'lucide-react'
import api from '../api/axiosInstance.js'
import useSuggestSearch from '../hooks/useSuggestSearch.js'

// ── Farmer Search (top-level, shared) ─────────────────────────────────────────

export default function FarmerSearchInput({ onSelect, selected }) {
  const [query,     setQuery]     = useState('')
  const [showDrop,  setShowDrop]  = useState(false)
  const wrapperRef  = useRef(null)

  // Shared search-as-you-type hook: an answer made stale by newer typing is
  // thrown away. The server can take seconds, so an older, slower answer used
  // to land after (and overwrite) the one the user was actually waiting for.
  const { results, isSearching: searching, failed, active } = useSuggestSearch(
    selected.farmer_id ? '' : query,
    (q) => api.get('/farmers/', { params: { search: q } })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data.results || [])).slice(0, 10)),
  )

  const handleChange = (e) => {
    setQuery(e.target.value)
    setShowDrop(true)
  }

  useEffect(() => {
    const handler = (e) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setShowDrop(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const handleSelect = (farmer) => {
    onSelect({
      farmer_id: farmer.id,
      farmer_full_name: farmer.full_name,
      farmer_home_barangay: farmer.barangay || '',
      farmer_assoc_id: farmer.farmers_organization || null,
      farmer_assoc_name: farmer.farmers_organization_name || '',
    })
    setQuery(farmer.full_name)
    setShowDrop(false)
  }

  const handleClear = () => {
    setQuery('')
    onSelect({ farmer_id: null, farmer_full_name: '', farmer_home_barangay: '', farmer_assoc_id: null, farmer_assoc_name: '' })
  }

  const displayValue = selected.farmer_id ? selected.farmer_full_name : query

  return (
    <div ref={wrapperRef} className="relative">
      <label className="mb-1.5 block text-[13px] font-medium text-[#4A5E4A]">
        Farmer <span className="text-rose-500">*</span>
      </label>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#A8BCA8] pointer-events-none" />
        <input
          type="text"
          placeholder="Search by name or RSBSA number…"
          value={displayValue}
          onChange={handleChange}
          onFocus={() => { if (results.length > 0) setShowDrop(true) }}
          className={`w-full h-[38px] px-3 pl-8 border border-[#C8D5C8] rounded-lg text-[13px] text-[#1A2B1A] bg-white placeholder-[#8AA08A] focus:outline-none focus:border-[#1B4D2E] focus:ring-2 focus:ring-[#1B4D2E]/20 transition-colors ${selected.farmer_id ? 'pr-16' : ''}`}
        />
        {selected.farmer_id && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-rose-500 hover:text-rose-700 px-1"
          >
            Clear
          </button>
        )}
      </div>

      {showDrop && (
        <div className={`absolute z-50 mt-1 w-full rounded-xl border border-[#E2E8E2] bg-white shadow-lg max-h-52 overflow-y-auto transition-opacity ${searching && results.length > 0 ? 'opacity-60' : ''}`}>
          {results.length === 0 ? (
            <p className="px-4 py-3 text-xs text-[#7A8E7A]">
              {!active ? 'Type at least 2 characters.' : searching ? 'Searching…' : failed ? 'Search failed — please try again.' : 'No farmers found.'}
            </p>
          ) : (
            results.map(f => (
              <button
                key={f.id}
                type="button"
                onMouseDown={() => handleSelect(f)}
                className="flex items-start gap-3 w-full px-4 py-2.5 text-left hover:bg-[#F5F7F5] transition-colors"
              >
                <User className="w-3.5 h-3.5 mt-0.5 text-[#A8BCA8] shrink-0" />
                <div>
                  <p className="text-xs font-semibold text-[#1A2B1A]">{f.full_name}</p>
                  <p className="text-[11px] text-[#7A8E7A]">
                    {f.rsbsa_number && `${f.rsbsa_number} · `}{f.barangay || ''}
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  )
}
