import { useEffect, useRef, useState } from 'react'

// "Search as you type" for a server-backed suggestion list: waits `delay` ms
// after the last keystroke, asks `fetcher(query)` once, and ignores any answer
// that a newer keystroke has already made stale.
//
// The state only ever changes inside the timer's async callback (never
// synchronously in the effect body), and everything a caller renders is
// derived from it, so a query below `minLength` simply yields no results with
// nothing to reset.
//
//   const { results, isSearching, hasSearched, failed } =
//     useSuggestSearch(term, (q) => api.get(url, { params: { search: q } }).then(r => r.data))
//
// `fetcher` may be an inline function: it is held in a ref, so a new function
// each render does not restart the timer.
export default function useSuggestSearch(term, fetcher, { minLength = 2, delay = 250 } = {}) {
  const [settled, setSettled] = useState({ query: '', results: [], failed: false })
  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher })

  const query = term.trim()
  const active = query.length >= minLength

  useEffect(() => {
    if (!active) return undefined
    let cancelled = false
    const timer = setTimeout(async () => {
      try {
        const results = await fetcherRef.current(query)
        if (!cancelled) setSettled({ query, results: Array.isArray(results) ? results : [], failed: false })
      } catch {
        if (!cancelled) setSettled({ query, results: [], failed: true })
      }
    }, delay)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [query, active, delay])

  const isCurrent = active && settled.query === query
  return {
    // While a newer query is still in flight the previous results stay on
    // screen (callers dim them) so the list does not flash empty per keystroke.
    results: active ? settled.results : [],
    isSearching: active && !isCurrent,
    hasSearched: isCurrent,
    failed: isCurrent && settled.failed,
    active,
  }
}
