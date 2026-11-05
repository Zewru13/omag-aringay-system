import { useEffect, useState } from 'react'
import { Search, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { personLine } from './multiFisherfolkDisaster.js'

// A multi-select of fisherfolk for Log Disaster: search the registry by name or registration number (RSBSA / FishR), tick the ones the disaster
// hit, and see them as chips that can each be removed. Same look and behavior as the stock picker of the single Log Disaster form.
//   selected: [{ id, full_name, barangay, rsbsa_number, fishr_number }]    onToggle(person): add or remove    max: how many may be chosen
const listOf = (data) => (Array.isArray(data) ? data : (data?.results || []))

export default function FisherfolkMultiSelect({ selected, onToggle, max = 100, searchUrl = '/fisheries/fisherfolk/' }) {
  const [query, setQuery] = useState('')
  const debounced = useDebouncedValue(query.trim())
  // The last answer, with the search it answers: while it is for another search than the one typed, the new one is still loading.
  const [answer, setAnswer] = useState({ query: '', results: [], failed: false })

  useEffect(() => {
    let cancelled = false
    if (!debounced) return undefined
    api.get(searchUrl, { params: { search: debounced } })
      .then((r) => { if (!cancelled) setAnswer({ query: debounced, results: listOf(r.data).slice(0, 20), failed: false }) })
      .catch(() => { if (!cancelled) setAnswer({ query: debounced, results: [], failed: true }) })
    return () => { cancelled = true }
  }, [debounced, searchUrl])

  const answered = Boolean(debounced) && answer.query === debounced
  const loading = Boolean(debounced) && !answered
  const failed = answered && answer.failed
  const shown = answered ? answer.results : []
  const full = selected.length >= max

  return (
    <div className="space-y-2" data-testid="fisherfolk-multiselect">
      {selected.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Selected fisherfolk">
          {selected.map((p) => (
            <li key={p.id} className="inline-flex items-center gap-1 rounded-full border border-green-300 bg-[#f0f7f0] py-0.5 pl-2.5 pr-1 text-xs font-medium text-[#1E4620]">
              {p.full_name}
              <button type="button" onClick={() => onToggle(p)} className="rounded-full p-0.5 hover:bg-green-200" aria-label={`Remove ${p.full_name}`}>
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <div className="relative">
        <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input type="search" className={`${baseInputClasses} pl-8`} value={query} onChange={(e) => setQuery(e.target.value)}
          placeholder="Search fisherfolk by name or registration number…" aria-label="Search fisherfolk" />
      </div>
      <ul className="max-h-56 min-h-[6rem] overflow-y-auto rounded-lg border border-slate-200" role="listbox" aria-multiselectable="true" aria-label="Fisherfolk found">
        {!debounced && <li className="px-3 py-3 text-xs text-slate-500">Type a name or registration number to find fisherfolk. Tick every fisherfolk the disaster affected.</li>}
        {debounced && loading && <li className="px-3 py-3 text-xs text-slate-500">Searching…</li>}
        {debounced && !loading && failed && <li className="px-3 py-3 text-xs text-rose-600">The search failed. Please try again.</li>}
        {debounced && !loading && !failed && shown.length === 0 && <li className="px-3 py-3 text-xs text-slate-500">No fisherfolk matches “{debounced}”.</li>}
        {shown.map((p) => {
          const checked = selected.some((s) => s.id === p.id)
          const blocked = !checked && full
          return (
            <li key={p.id} role="option" aria-selected={checked} className="border-b border-slate-100 last:border-b-0">
              <label className={`flex min-h-[44px] items-start gap-2.5 px-3 py-2 ${blocked ? 'cursor-not-allowed opacity-60' : `cursor-pointer ${checked ? 'bg-[#f0f7f0]' : 'hover:bg-slate-50'}`}`}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#1E4620]" checked={checked} disabled={blocked} onChange={() => onToggle(p)} />
                <span className="min-w-0 text-sm font-medium text-slate-800">{personLine(p)}</span>
              </label>
            </li>
          )
        })}
      </ul>
      {full && <p className="text-xs text-amber-700">At most {max} fisherfolk can be logged at once.</p>}
    </div>
  )
}
