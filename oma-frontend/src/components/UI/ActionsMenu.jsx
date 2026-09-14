import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { MoreVertical } from 'lucide-react'

const GAP = 4 // px between trigger and menu — matches the old mt-1/mb-1 (0.25rem)

// Shared row-actions ("⋮") dropdown for table rows.
//
// Portaled to document.body and positioned with `position: fixed`, computed
// from the trigger's real getBoundingClientRect() — NOT a normal
// absolutely-positioned DOM child of the trigger (which is what this used
// to be, and is exactly what got clipped). Table wrappers use overflow-hidden
// (rounded corners) or overflow-x-auto (horizontal scroll — which browsers
// also compute overflow-y: auto for, unless overflow-y is set explicitly;
// confirmed via getComputedStyle on a real table wrapper) — either one clips
// ANY descendant, absolutely-positioned or not, that extends past its own
// box, regardless of z-index. A portal to document.body escapes that
// entirely, since body has no such ancestor. The only boundary left to
// respect is the viewport itself.
//
// Vertical flip direction is decided from the menu's REAL measured height
// once it's mounted (via the menuNode ref-callback below triggering a second,
// synchronous layout-effect pass), not an estimate — both passes run before
// the browser paints, so a wrong first guess never visibly flashes.
function ActionsMenu({ title = 'Actions', menuWidthClassName = 'w-40', buttonClassName, children }) {
  const [open, setOpen] = useState(false)
  const [style, setStyle] = useState(null)
  const [menuNode, setMenuNode] = useState(null)
  const buttonRef = useRef(null)

  const close = () => { setOpen(false); setStyle(null); setMenuNode(null) }

  useLayoutEffect(() => {
    if (!open) return
    const button = buttonRef.current
    if (!button) return
    const rect = button.getBoundingClientRect()
    const measuredHeight = menuNode?.getBoundingClientRect().height ?? 0
    const spaceBelow = window.innerHeight - rect.bottom
    // Before the menu is mounted, menuNode is null — fall back to a rough
    // estimate for the very first paint; the effect re-runs (see the
    // menuNode dependency) the instant the real node attaches and mounts
    // and corrects this if the guess was wrong.
    const openUpward = measuredHeight > 0 ? spaceBelow < measuredHeight + GAP : spaceBelow < 200
    setStyle({
      position: 'fixed',
      right: Math.max(GAP, window.innerWidth - rect.right),
      ...(openUpward
        ? { bottom: window.innerHeight - rect.top + GAP }
        : { top: rect.bottom + GAP }),
    })
  }, [open, menuNode])

  // Reposition on ANY scroll, not just the page's own — scroll events don't
  // bubble, but a capture-phase listener on window still fires on the way
  // down to whichever element actually scrolled, so this also catches a
  // table's own internal overflow-x-auto scroll without needing to locate
  // and attach to that container specifically. Closes outright if the
  // trigger scrolls fully out of the viewport — a floating menu with no
  // visible anchor is worse than no menu.
  useEffect(() => {
    if (!open) return
    const reposition = () => {
      const button = buttonRef.current
      if (!button) return
      const rect = button.getBoundingClientRect()
      const fullyOffscreen = rect.bottom < 0 || rect.top > window.innerHeight
        || rect.right < 0 || rect.left > window.innerWidth
      if (fullyOffscreen) { close(); return }
      const measuredHeight = menuNode?.getBoundingClientRect().height ?? 0
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = measuredHeight > 0 ? spaceBelow < measuredHeight + GAP : spaceBelow < 200
      setStyle({
        position: 'fixed',
        right: Math.max(GAP, window.innerWidth - rect.right),
        ...(openUpward
          ? { bottom: window.innerHeight - rect.top + GAP }
          : { top: rect.bottom + GAP }),
      })
    }
    window.addEventListener('scroll', reposition, true)
    window.addEventListener('resize', reposition)
    return () => {
      window.removeEventListener('scroll', reposition, true)
      window.removeEventListener('resize', reposition)
    }
  }, [open, menuNode])

  useEffect(() => {
    if (!open) return
    const handler = (e) => {
      if (buttonRef.current?.contains(e.target)) return
      if (menuNode?.contains(e.target)) return
      close()
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open, menuNode])

  const toggleOpen = (e) => {
    e.stopPropagation()
    if (open) close()
    else setOpen(true)
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleOpen}
        className={buttonClassName || 'flex items-center justify-center rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 transition-colors'}
        title={title}
      >
        <MoreVertical size={14} />
      </button>
      {open && style && createPortal(
        <div
          ref={setMenuNode}
          style={style}
          className={`z-50 ${menuWidthClassName} rounded-lg border border-[#E2E8E2] bg-white py-1 shadow-lg`}
        >
          {children({ close })}
        </div>,
        document.body,
      )}
    </>
  )
}

export default ActionsMenu
