// The PCIC insurance documents (photos of the PCIC form, or a PDF) shown inside the app by components/UI/PcicDocumentViewer.jsx, for crops and
// for fisheries alike. Pure helpers, no screen and no network.
//   a document: { id, url, name?, type?, kind? }   url = the signed link the logged-in API gave (or a blob: preview of a file just chosen);
//   name = the file name to show; type = a MIME type (a chosen file); kind = 'image' | 'pdf' | 'unsupported' to force how it is shown.

const IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'avif'])

// The file's own name, else the last part of its link without the signature, decoded; '' for a blob: preview or no link.
export function documentName(doc) {
  if (doc?.name) return doc.name
  const url = doc?.url || ''
  if (!url || url.startsWith('blob:')) return ''
  const path = url.split('?')[0].split('#')[0]
  const last = path.slice(path.lastIndexOf('/') + 1)
  try { return decodeURIComponent(last) } catch { return last }
}

// How the viewer draws it: a picture, a PDF, or something it cannot show (a message instead). No extension = try it as a picture.
export function documentKind(doc) {
  if (doc?.kind) return doc.kind
  const type = String(doc?.type || '').toLowerCase()
  if (type === 'application/pdf') return 'pdf'
  if (type.startsWith('image/')) return 'image'
  const name = documentName(doc)
  const dot = name.lastIndexOf('.')
  if (dot < 0) return 'image'
  const extension = name.slice(dot + 1).toLowerCase()
  if (extension === 'pdf') return 'pdf'
  return IMAGE_EXTENSIONS.has(extension) ? 'image' : 'unsupported'
}

// page = 1-based position, total = how many documents there are.
export const documentTitle = (page, total) => (total > 1 ? `PCIC insurance form · Page ${page} of ${total}` : 'PCIC insurance form')

export const ZOOM = { min: 1, max: 4, step: 0.5 }   // 1 = fit the width of the viewer
export const zoomIn = (zoom) => Math.min(ZOOM.max, zoom + ZOOM.step)
export const zoomOut = (zoom) => Math.max(ZOOM.min, zoom - ZOOM.step)

// A record's documents from its photo rows ({ id, url }) or, when it has none, its single photo (`url`); [] when it has no photo.
// `resolve` turns a stored path into a link the browser can load (utils/mediaUrl.js resolveMediaUrl).
export function pcicDocumentsFrom({ photos = null, url = null } = {}, resolve = (u) => u) {
  const rows = photos && photos.length ? photos : (url ? [{ id: 'main', url }] : [])
  return rows.map((p) => ({ id: p.id, url: resolve(p.url) })).filter((d) => d.url)
}
