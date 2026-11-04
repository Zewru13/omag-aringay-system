import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, FileWarning, Loader2, RotateCcw, ShieldCheck, X, ZoomIn, ZoomOut } from 'lucide-react'
import { ZOOM, documentKind, documentName, documentTitle, zoomIn, zoomOut } from '../../utils/pcicDocuments.js'
import Button from './Button.jsx'

// The window that shows an uploaded PCIC insurance document INSIDE the app (crops and fisheries share it): a picture, or a PDF in an embedded
// viewer. It never opens another tab or window and never navigates away; the link it draws is the signed, short-lived one the logged-in API gave.
// A PDF is first read into the app and shown from a local blob, so the file host's own frame rules (X-Frame-Options and the like) cannot blank the
// viewer; only if that read fails is the link itself used as the frame's source.
//   documents: [{ id, url, name?, type?, kind? }] (utils/pcicDocuments.js)    startIndex: which one opens first    onClose(): close
// With several documents (the pages of one form) Previous / Next move between them. A picture can be zoomed (the window scrolls); a PDF has its own
// viewer controls. While the document loads a spinner shows; if it cannot be loaded, a message says so (the link may have expired).

function Notice({ icon: Icon, tone = 'text-[#4A5E4A]', children }) {
  return (
    <div className={`flex min-h-[40vh] flex-col items-center justify-center gap-3 px-6 py-10 text-center text-[13px] ${tone}`} role="status">
      <Icon size={28} aria-hidden="true" />
      <p className="max-w-sm leading-relaxed">{children}</p>
    </div>
  )
}

export default function PcicDocumentViewer({ documents, startIndex = 0, onClose }) {
  const [index, setIndex] = useState(Math.min(Math.max(startIndex, 0), Math.max(documents.length - 1, 0)))
  const [zoom, setZoom] = useState(1)
  const [status, setStatus] = useState('loading')   // 'loading' | 'ready' | 'error', for the document on show
  const [pdf, setPdf] = useState({ link: null, src: null })   // the PDF on show: its link and what the frame should load
  const closeRef = useRef(null)
  const doc = documents[index]
  const docUrl = doc?.url
  const kind = doc ? documentKind(doc) : 'unsupported'
  const name = doc ? documentName(doc) : ''
  const many = documents.length > 1

  const go = (next) => {
    if (next < 0 || next >= documents.length) return
    setIndex(next)
    setZoom(1)
    setStatus('loading')
  }

  // A PDF page: read the file, then hand the frame a local blob of it.
  useEffect(() => {
    if (!docUrl || kind !== 'pdf') return undefined
    let cancelled = false
    let made = null
    fetch(docUrl)
      .then((response) => { if (!response.ok) throw new Error(`HTTP ${response.status}`); return response.arrayBuffer() })
      .then((bytes) => {
        if (cancelled) return
        made = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }))
        setPdf({ link: docUrl, src: made })
      })
      .catch(() => { if (!cancelled) setPdf({ link: docUrl, src: docUrl }) })
    return () => { cancelled = true; if (made) URL.revokeObjectURL(made) }
  }, [docUrl, kind])

  // Escape closes, the arrow keys turn the pages; focus goes to Close and comes back to what opened the window.
  useEffect(() => {
    const opener = document.activeElement
    closeRef.current?.focus()
    return () => { if (opener && typeof opener.focus === 'function') opener.focus() }
  }, [])
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose() }
      else if (event.key === 'ArrowLeft') go(index - 1)
      else if (event.key === 'ArrowRight') go(index + 1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const toolButton = 'flex h-9 w-9 items-center justify-center rounded-lg border border-[#C8D5C8] bg-white text-[#1B4D2E] transition-colors hover:bg-[#F0F4F0] disabled:cursor-not-allowed disabled:opacity-40 max-sm:h-10 max-sm:w-10'

  return createPortal(
    // The window sits inside table rows and other clickable areas in the React tree: its clicks must not reach them.
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/55 p-3 sm:p-4" onClick={(e) => { e.stopPropagation(); onClose() }} data-no-row-click>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={documentTitle(index + 1, documents.length)}
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--radius-lg)] bg-surface shadow-[var(--shadow-modal)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-shrink-0 items-center gap-3 border-b border-border px-4 pb-3 pt-4 sm:px-6">
          <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-[10px] bg-primary-light">
            <ShieldCheck size={18} className="text-primary" aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[15px] font-semibold text-text-primary">{documentTitle(index + 1, documents.length)}</h2>
            {name && <p className="mt-0.5 truncate text-[12px] text-text-muted" title={name}>{name}</p>}
          </div>
          <button type="button" aria-label="Close" onClick={onClose}
            className="press-scale flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-md text-text-muted transition-colors hover:bg-surface-2 hover:text-text-primary max-sm:h-10 max-sm:w-10">
            <X size={16} aria-hidden="true" />
          </button>
        </div>

        {(many || kind === 'image') && (
          <div className="flex flex-shrink-0 flex-wrap items-center gap-2 border-b border-border bg-[#F8FAF8] px-4 py-2 sm:px-6">
            {many && (
              <div className="flex items-center gap-1.5" role="group" aria-label="Pages of the form">
                <button type="button" className={toolButton} onClick={() => go(index - 1)} disabled={index === 0} aria-label="Previous page"><ChevronLeft size={16} aria-hidden="true" /></button>
                <span className="min-w-[4.5rem] text-center text-[12px] font-medium text-[#4A5E4A]">Page {index + 1} of {documents.length}</span>
                <button type="button" className={toolButton} onClick={() => go(index + 1)} disabled={index === documents.length - 1} aria-label="Next page"><ChevronRight size={16} aria-hidden="true" /></button>
              </div>
            )}
            {kind === 'image' && (
              <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="Zoom">
                <button type="button" className={toolButton} onClick={() => setZoom(zoomOut)} disabled={zoom <= ZOOM.min} aria-label="Zoom out"><ZoomOut size={16} aria-hidden="true" /></button>
                <span className="min-w-[3rem] text-center text-[12px] font-medium tabular-nums text-[#4A5E4A]" aria-live="polite">{Math.round(zoom * 100)}%</span>
                <button type="button" className={toolButton} onClick={() => setZoom(zoomIn)} disabled={zoom >= ZOOM.max} aria-label="Zoom in"><ZoomIn size={16} aria-hidden="true" /></button>
                <button type="button" className={toolButton} onClick={() => setZoom(1)} disabled={zoom === 1} aria-label="Fit to window" title="Fit to window"><RotateCcw size={15} aria-hidden="true" /></button>
              </div>
            )}
          </div>
        )}

        <div className="relative min-h-0 flex-1 overflow-auto bg-[#EEF2EE]">
          {!doc && <Notice icon={FileWarning}>There is no PCIC document to show.</Notice>}
          {doc && kind === 'unsupported' && (
            <Notice icon={FileWarning}>
              {name ? `"${name}"` : 'This file'} is not a picture or a PDF, so it cannot be shown here. Ask for the form to be uploaded again as a photo (JPG, PNG or WEBP).
            </Notice>
          )}
          {doc && kind !== 'unsupported' && status === 'error' && (
            <Notice icon={FileWarning} tone="text-rose-700">
              The document could not be loaded. Its link may have expired or the file may no longer be there. Close this window and open the record again; if it still fails, reload the page.
            </Notice>
          )}
          {doc && kind !== 'unsupported' && status === 'loading' && (
            <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-2 bg-[#EEF2EE] text-[13px] text-[#4A5E4A]" role="status">
              <Loader2 size={24} className="animate-spin text-[#1B4D2E]" aria-hidden="true" />
              Loading the document…
            </div>
          )}
          {doc && kind === 'image' && status !== 'error' && (
            <div className="p-2 sm:p-4">
              <img
                key={doc.url}
                src={doc.url}
                alt={`${documentTitle(index + 1, documents.length)}${name ? `: ${name}` : ''}`}
                onLoad={() => setStatus('ready')}
                onError={() => setStatus('error')}
                style={{ width: `${zoom * 100}%`, maxWidth: 'none' }}
                className="mx-auto block h-auto rounded bg-white shadow-sm"
                draggable={false}
              />
            </div>
          )}
          {doc && kind === 'pdf' && status !== 'error' && pdf.link === doc.url && (
            <iframe
              key={doc.url}
              src={pdf.src}
              title={`${documentTitle(index + 1, documents.length)}${name ? `: ${name}` : ''}`}
              onLoad={() => setStatus('ready')}
              onError={() => setStatus('error')}
              className="h-full min-h-[60vh] w-full bg-white"
            />
          )}
        </div>

        <div className="flex flex-shrink-0 justify-end gap-2 border-t border-border px-4 pb-4 pt-3 sm:px-6">
          <Button ref={closeRef} type="button" variant="outline" onClick={onClose}>Close</Button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
