// Every photo of a record as a thumbnail that opens the full image: the photo rows ({ id, url }) and, first, the
// older single photo (`legacy`, a URL) that records made before several photos were allowed may still carry.
export default function PhotoLinks({ photos = [], legacy = null, className = '' }) {
  const all = [...(legacy ? [{ id: 'legacy', url: legacy }] : []), ...(photos || [])]
  if (all.length === 0) return null
  return (
    <ul className={`flex flex-wrap gap-2 ${className}`} data-testid="photo-links">
      {all.map((p, i) => (
        <li key={p.id}>
          <a href={p.url} target="_blank" rel="noreferrer" title={`Open photo ${i + 1}`}
            className="block h-14 w-14 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
            <img src={p.url} alt={`Photo ${i + 1}`} className="h-full w-full object-cover" />
          </a>
        </li>
      ))}
    </ul>
  )
}
