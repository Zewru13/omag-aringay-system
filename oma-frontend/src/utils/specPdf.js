// The Download Report of the list reports the browser builds and prints (Crop Records, Crop Monitoring, Aquaculture and Capture Monitoring):
// the very document Print shows is sent to POST /reports/spec-pdf/, which lays it out as a PDF. No screen and no network here.

// The printable document as the server takes it: plain JSON (a Set of bold rows becomes a list; photos are never sent).
export function specPdfBody(spec) {
  return {
    title: spec.title,
    reference: spec.reference,
    pageSize: spec.pageSize,
    landscape: Boolean(spec.landscape),
    footerLabel: spec.footerLabel,
    header: spec.header || [],
    signatures: spec.signatures || [],
    sections: (spec.sections || []).map((sec) => (sec.table
      ? { title: sec.title, table: { head: sec.table.head, rows: sec.table.rows, bold_rows: [...(sec.table.boldRows || [])] } }
      : { title: sec.title, rows: sec.rows || [] })),
  }
}

// The saved file's name when the server does not name it: letters, digits, '-' and '_' only.
export function specPdfFilename(spec) {
  const safe = [spec.title, spec.reference].filter(Boolean).join('_').replace(/[^A-Za-z0-9-]+/g, '_').replace(/^_+|_+$/g, '')
  return `${safe || 'Report'}.pdf`
}
