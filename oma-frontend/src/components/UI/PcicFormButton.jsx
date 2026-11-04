import { useState } from 'react'
import PcicDocumentViewer from './PcicDocumentViewer.jsx'

// A text button ("View form", "Photo 2") that opens the PCIC documents in the in-app viewer (PcicDocumentViewer) instead of another browser tab.
//   documents: [{ id, url, ... }] (utils/pcicDocuments.js pcicDocumentsFrom)    startIndex: which document opens first
export default function PcicFormButton({ documents, startIndex = 0, children = 'View form', className = '', title }) {
  const [open, setOpen] = useState(false)
  if (!documents || documents.length === 0) return null
  return (
    <>
      <button
        type="button"
        title={title}
        onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className={`font-medium text-[#1B4D2E] underline decoration-[#1B4D2E]/40 underline-offset-2 hover:decoration-[#1B4D2E] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#1B4D2E] ${className}`}
      >
        {children}
      </button>
      {open && <PcicDocumentViewer documents={documents} startIndex={startIndex} onClose={() => setOpen(false)} />}
    </>
  )
}
