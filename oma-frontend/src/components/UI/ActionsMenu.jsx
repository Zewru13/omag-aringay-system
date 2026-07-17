import { useEffect, useRef, useState } from 'react'
import { MoreVertical } from 'lucide-react'

// Shared row-actions ("⋮") dropdown for table rows.
//
// Table containers use overflow-hidden (rounded corners) or overflow-x-auto
// (horizontal scroll) on their wrapper, which also clips vertical overflow.
// A menu that always opens downward gets clipped once its row is close enough
// to the wrapper's bottom edge — most visibly the table's last row. Flipping
// the menu to open upward when there isn't room below keeps it inside the
// wrapper's own bounds instead of overflowing past the clipped edge.
function ActionsMenu({ title = 'Actions', menuWidthClassName = 'w-40', buttonClassName, children }) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const ref = useRef(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const toggleOpen = (e) => {
    e.stopPropagation()
    setOpen((wasOpen) => {
      if (!wasOpen && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect()
        const ESTIMATED_MENU_HEIGHT = 200
        setOpenUpward(window.innerHeight - rect.bottom < ESTIMATED_MENU_HEIGHT)
      }
      return !wasOpen
    })
  }

  return (
    <div className="relative" ref={ref}>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={buttonClassName || 'flex items-center justify-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors'}
        title={title}
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <div
          className={`absolute right-0 z-20 ${menuWidthClassName} rounded-lg border border-[#E2E8E2] bg-white py-1 shadow-lg ${
            openUpward ? 'bottom-full mb-1' : 'top-full mt-1'
          }`}
        >
          {children({ close: () => setOpen(false) })}
        </div>
      )}
    </div>
  )
}

export default ActionsMenu
