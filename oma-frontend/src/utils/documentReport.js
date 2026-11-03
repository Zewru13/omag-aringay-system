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

// Appends the signers picked on the page (the output of signatureParams in utils/signatories.js); blank values are left out.
export function withSignature(query, params) {
  const q = new URLSearchParams(query)
  Object.entries(params || {}).forEach(([key, value]) => {
    if (String(value ?? '').trim() !== '') q.set(key, value)
  })
  return q.toString()
}

export function reportFileName(stem, format) {
  return `${stem}.${format === 'pdf' ? 'pdf' : 'xlsx'}`
}
