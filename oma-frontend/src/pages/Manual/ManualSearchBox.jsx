import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import { searchWords } from '../../utils/searchMatch.js'
import { searchManual } from './manualSearch.js'

const KIND_LABEL = { guide: 'Guide', screen: 'Picture', element: 'Button or field', step: 'Step' }
const KIND_TONE = {
  guide: 'bg-[#EBF5EE] text-[#1B4D2E]',
  screen: 'bg-sky-50 text-sky-800',
  element: 'bg-orange-50 text-orange-800',
  step: 'bg-slate-100 text-slate-700',
}

const escapeRegExp = (word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

// The typed words, marked inside a result so it is clear why it matched.
function Marked({ text, words }) {
  if (!words.length) return text
  const pattern = new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'gi')
  return text.split(pattern).map((part, i) => (i % 2 ? <mark key={i} className="rounded-sm bg-[#FEF3C7] px-px text-inherit">{part}</mark> : part))
}

// Scrolls the manual to the place a result points at and flashes it, so the eye finds it. No smooth scrolling under reduced motion.
function jumpTo(target) {
  const el = document.getElementById(target)
  if (!el) return
  const calm = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: calm ? 'auto' : 'smooth', block: 'start' })
  el.classList.add('manual-found')
  window.setTimeout(() => el.classList.remove('manual-found'), 1800)
}

// The search bar at the top of the User Manual: type what to do or a button's name, pick a result, the page scrolls there.
export default function ManualSearchBox({ guides }) {
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)
  const boxRef = useRef(null)
  const inputRef = useRef(null)
  const words = useMemo(() => searchWords(query), [query])
  const results = useMemo(() => searchManual(guides, query), [guides, query])

  // A different audience is a different manual: forget the old search.
  useEffect(() => { setQuery(''); setOpen(false) }, [guides])
  useEffect(() => { setActive(0) }, [query])
  useEffect(() => {
    const away = (e) => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', away)
    return () => document.removeEventListener('mousedown', away)
  }, [])

  const choose = (r) => { setOpen(false); jumpTo(r.target) }
  const onKeyDown = (e) => {
    if (e.key === 'Escape') { setOpen(false); return }
    if (!results.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setOpen(true); setActive((a) => (a + 1) % results.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => (a - 1 + results.length) % results.length) }
    else if (e.key === 'Enter' && open) { e.preventDefault(); choose(results[active]) }
  }
  const showList = open && words.length > 0

  return (
    <div ref={boxRef} className="relative">
      <div className="flex items-center gap-2 rounded-xl border border-[#D8E2D8] bg-white px-3 shadow-sm focus-within:border-[#1B4D2E] focus-within:ring-2 focus-within:ring-[#1B4D2E]/15">
        <Search size={16} className="flex-none text-[#7A8E7A]" aria-hidden="true" />
        <input ref={inputRef} type="search" value={query} role="combobox" aria-expanded={showList} aria-controls="manual-search-results" aria-autocomplete="list"
          aria-label="Search the manual" placeholder="Search the manual: a task, a screen, a button or a field…"
          onChange={(e) => { setQuery(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)} onKeyDown={onKeyDown}
          className="h-11 min-w-0 flex-1 bg-transparent text-[14px] text-[#1A2B1A] outline-none placeholder:text-[#A8BCA8] [&::-webkit-search-cancel-button]:hidden" />
        {query && (
          <button type="button" aria-label="Clear the search" onClick={() => { setQuery(''); inputRef.current?.focus() }}
            className="flex h-7 w-7 flex-none items-center justify-center rounded-full text-[#7A8E7A] hover:bg-[#F5F7F5]">
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      <p className="sr-only" role="status" aria-live="polite">
        {words.length ? (results.length ? `${results.length} result${results.length > 1 ? 's' : ''}` : 'No results') : ''}
      </p>

      {showList && (
        <div id="manual-search-results" className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-[min(70vh,26rem)] overflow-y-auto rounded-xl border border-[#E2E8E2] bg-white p-1.5 shadow-lg">
          {results.length === 0 ? (
            <p className="px-3 py-4 text-center text-[13px] text-[#7A8E7A]">Nothing in the manual matches “{query.trim()}”. Try a shorter word, such as the name of the screen.</p>
          ) : (
            <ul role="listbox" aria-label="Search results">
              {results.map((r, i) => (
                <li key={`${r.target}-${r.kind}-${i}`} role="option" aria-selected={i === active}>
                  <button type="button" onMouseEnter={() => setActive(i)} onClick={() => choose(r)}
                    className={`flex w-full flex-col gap-0.5 rounded-lg px-3 py-2 text-left ${i === active ? 'bg-[#F0F6F1]' : 'hover:bg-[#F5F7F5]'}`}>
                    <span className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-semibold ${KIND_TONE[r.kind]}`}>{KIND_LABEL[r.kind]}</span>
                      <span className="text-[13.5px] font-semibold text-[#1A2B1A]"><Marked text={r.title} words={words} /></span>
                      {r.context && <span className="text-[12px] text-[#7A8E7A]">in {r.context}</span>}
                    </span>
                    {r.snippet && r.snippet !== r.title && <span className="text-[12.5px] leading-snug text-[#4A5E4A]"><Marked text={r.snippet} words={words} /></span>}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
