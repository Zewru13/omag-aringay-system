// Helpers shared by the Reports page reports that are built from a backend "document" (title, stats, sections):
// the query string for the preview / PDF / Excel, and the signature fields the PDF carries.

// `format` first, then every filter that has a value (blank, null and whitespace-only values are left out).
export function reportQuery(params, format) {
  const q = new URLSearchParams({ format })
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value === null || value === undefined) return
    const text = String(value).trim()
    if (text !== '') q.set(key, text)
  })
  return q.toString()
}

// Appends the signature block's names. The position is sent as `prepared_role`, which is what the PDF builders read.
export function withSignature(query, sig) {
  if (!sig || !sig.prepared_by) return query
  const q = new URLSearchParams(query)
  q.set('prepared_by', sig.prepared_by)
  if (sig.position) q.set('prepared_role', sig.position)
  if (sig.reviewed_by) q.set('reviewed_by', sig.reviewed_by)
  if (sig.noted_by) q.set('noted_by', sig.noted_by)
  return q.toString()
}

export function reportFileName(stem, format) {
  return `${stem}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
}
