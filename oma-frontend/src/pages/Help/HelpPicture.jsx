import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronLeft, ChevronRight, Maximize2, X, ZoomIn, ZoomOut } from 'lucide-react'

// The picture of a Help topic, one at a time. A topic with several has arrows on the picture, dots and "1 of 3" under it, and
// can be swiped on a phone. Enlarge shows it over the whole screen, where it can be zoomed to its full size; Escape or the close
// button come back.
const ARROW = 'absolute top-1/2 z-10 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-[#1B4D2E] text-white shadow-md transition-transform active:scale-95'

function Enlarged({ picture, onClose }) {
  const [zoomed, setZoomed] = useState(false)
  const close = useRef(null)

  useEffect(() => {
    const before = document.activeElement
    const root = document.getElementById('root')
    if (root) root.inert = true          // the page behind cannot be reached while the picture is up
    close.current?.focus()
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      if (root) root.inert = false
      before?.focus?.()
    }
  }, [onClose])

  const Zoom = zoomed ? ZoomOut : ZoomIn
  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={picture.title} className="fixed inset-0 z-[90] flex flex-col bg-black/90">
      <div className="flex items-center justify-between gap-3 px-3 py-2">
        <p className="min-w-0 truncate text-[13px] font-medium text-white">{picture.title}</p>
        <div className="flex flex-none gap-2">
          <button type="button" onClick={() => setZoomed((z) => !z)} className="flex h-10 items-center gap-1.5 rounded-lg bg-white/15 px-3 text-[13px] font-medium text-white hover:bg-white/25">
            <Zoom size={16} aria-hidden="true" /> {zoomed ? 'Fit to screen' : 'Zoom in'}
          </button>
          <button ref={close} type="button" onClick={onClose} aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className={`min-h-0 flex-1 overflow-auto p-3 ${zoomed ? '' : 'flex items-center justify-center'}`}>
        <img src={picture.image} alt={`${picture.title}: ${picture.purpose}`} onClick={() => setZoomed((z) => !z)}
          className={zoomed ? 'max-w-none cursor-zoom-out' : 'max-h-full max-w-full cursor-zoom-in object-contain'}
          style={zoomed ? { width: picture.width } : undefined} />
      </div>
    </div>,
    document.body,
  )
}

export default function HelpPicture({ picture, index, count, onPicture }) {
  const [enlarged, setEnlarged] = useState(false)
  const touchX = useRef(null)
  const go = (step) => onPicture((index + step + count) % count)

  const onTouchStart = (e) => { touchX.current = e.touches[0].clientX }
  const onTouchEnd = (e) => {
    const moved = e.changedTouches[0].clientX - (touchX.current ?? e.changedTouches[0].clientX)
    touchX.current = null
    if (count > 1 && Math.abs(moved) > 40) go(moved < 0 ? 1 : -1)
  }

  return (
    <div>
      <div className={`relative ${picture.phone ? 'w-full max-w-[300px]' : 'w-full'}`} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
        <figure className="overflow-hidden rounded-xl border border-[#D8E2D8] bg-[#F5F7F5]">
          <img src={picture.image} alt={`${picture.title}: ${picture.purpose}`} width={picture.width} height={picture.height} className="block h-auto w-full" />
        </figure>
        {/* half outside the picture's edge, so that they hide as little of it as they can */}
        {count > 1 && (
          <>
            <button type="button" aria-label="Previous picture" onClick={() => go(-1)} className={`${ARROW} -left-3.5`}><ChevronLeft size={16} aria-hidden="true" /></button>
            <button type="button" aria-label="Next picture" onClick={() => go(1)} className={`${ARROW} -right-3.5`}><ChevronRight size={16} aria-hidden="true" /></button>
          </>
        )}
        <button type="button" onClick={() => setEnlarged(true)}
          className="absolute bottom-2 right-2 z-10 flex min-h-8 items-center gap-1.5 rounded-lg border border-[#D8E2D8] bg-white/95 px-2.5 text-[12px] font-medium text-[#1A2B1A] shadow-sm hover:bg-white">
          <Maximize2 size={13} aria-hidden="true" /> Enlarge
        </button>
      </div>

      <div className={`mt-2 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 ${picture.phone ? 'max-w-[300px]' : ''}`}>
        {count > 1 && (
          <>
            <span className="flex items-center gap-1.5">
              {Array.from({ length: count }).map((_, i) => (
                <button key={i} type="button" aria-label={`Picture ${i + 1}`} aria-current={i === index ? 'true' : undefined} onClick={() => onPicture(i)}
                  className={`h-2 rounded-full transition-all duration-200 ${i === index ? 'w-5 bg-[#1B4D2E]' : 'w-2 bg-[#C8D5C8]'}`} />
              ))}
            </span>
            <span className="text-[12px] tabular-nums text-[#7A8E7A]" aria-live="polite">{index + 1} of {count}</span>
          </>
        )}
        <span className="text-center text-[12px] font-medium text-[#4A5E4A]">{picture.title}</span>
      </div>

      {enlarged && <Enlarged picture={picture} onClose={() => setEnlarged(false)} />}
    </div>
  )
}
