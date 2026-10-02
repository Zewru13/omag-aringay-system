import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react'
import { toLocalISO, todayISO } from '../../utils/localDate.js'

// A date field whose calendar shows which days already have a log.
//
// A native <input type="date"> cannot style individual days, so someone logging
// an activity had to remember (or guess) whether they had already logged that
// day. This keeps the same value contract — a 'YYYY-MM-DD' string — but opens a
// small calendar where every date that already has a log is red, with a dot, so
// it can be seen at a glance before picking.
//
//   <LoggedDatePicker value={date} onChange={setDate} loggedDates={logs.map(l => l.date_of_activity)} />
//
// `loggedDates` may repeat a date (several logs on one day); the count is read
// out to screen readers and shown as a tooltip.
//
// The calendar is drawn in a portal at a fixed position next to the field, so a
// modal's own scroll area or overflow cannot clip it. It stays inside the
// screen, opens upward when there is no room below, and closes if the page
// scrolls underneath it (a fixed popup would otherwise float away from its field).

const DEFAULT_LABELS = {
  placeholder: 'Select date',
  today: 'Today',
  logged: 'Already logged',
  loggedNote: 'A log already exists on this date.',
  prevMonth: 'Previous month',
  nextMonth: 'Next month',
  logCount: (n) => `${n} ${n === 1 ? 'log' : 'logs'}`,
}

const POPUP_WIDTH = 296

const parseISO = (iso) => {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const addDays = (iso, n) => {
  const d = parseISO(iso)
  d.setDate(d.getDate() + n)
  return toLocalISO(d)
}

const addMonths = (iso, n) => {
  const d = parseISO(iso)
  const day = d.getDate()
  d.setDate(1)
  d.setMonth(d.getMonth() + n)
  d.setDate(Math.min(day, new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()))
  return toLocalISO(d)
}

export default function LoggedDatePicker({
  id,
  value,
  onChange,
  loggedDates = [],
  min,
  max,
  disabled = false,
  className = '',
  accentClass = 'bg-[#1B4D2E] text-white',
  locale = 'en-US',
  defaultOpen = false,
  showLoggedNote = true,
  align = 'left',
  labels,
}) {
  const L = { ...DEFAULT_LABELS, ...labels }
  const [open, setOpen] = useState(defaultOpen)
  const [focusIso, setFocusIso] = useState(value || todayISO())
  const [view, setView] = useState((value || todayISO()).slice(0, 7))
  const [pos, setPos] = useState(null)
  const triggerRef = useRef(null)
  const popupRef = useRef(null)
  const gridRef = useRef(null)
  const keyboardMoved = useRef(false)

  const counts = useMemo(() => {
    const map = new Map()
    for (const d of loggedDates) if (d) map.set(d, (map.get(d) || 0) + 1)
    return map
  }, [loggedDates])

  const fmtLong = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', day: 'numeric', year: 'numeric' }), [locale])
  const fmtMonth = useMemo(() => new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }), [locale])
  const weekdays = useMemo(() => {
    const f = new Intl.DateTimeFormat(locale, { weekday: 'short' })
    // 2023-01-01 was a Sunday.
    return Array.from({ length: 7 }, (_, i) => f.format(new Date(2023, 0, 1 + i)))
  }, [locale])

  const blocked = (iso) => Boolean((min && iso < min) || (max && iso > max))

  // Place the popup beside the field, kept on screen, flipped above if needed.
  // Re-measured when the month changes because a 6-week month is taller.
  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const r = triggerRef.current.getBoundingClientRect()
    const width = Math.min(POPUP_WIDTH, window.innerWidth - 16)
    let left = align === 'right' ? r.right - width : r.left
    left = Math.max(8, Math.min(left, window.innerWidth - width - 8))
    const height = popupRef.current?.offsetHeight || 340
    let top = r.bottom + 6
    if (top + height > window.innerHeight - 8 && r.top - height - 6 > 8) top = r.top - height - 6
    setPos({ top, left, width })
  }, [open, view, align])

  useEffect(() => {
    if (!open) return undefined
    const onDown = (e) => {
      if (triggerRef.current?.contains(e.target) || popupRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false) }
    const onScroll = (e) => { if (!popupRef.current?.contains(e.target)) setOpen(false) }
    const onResize = () => setOpen(false)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [open])

  // After an arrow-key move, put real focus on the new day once it is rendered.
  useEffect(() => {
    if (!open || !keyboardMoved.current) return
    keyboardMoved.current = false
    gridRef.current?.querySelector(`[data-iso="${focusIso}"]`)?.focus()
  }, [open, focusIso, view])

  const toggle = () => {
    if (disabled) return
    if (!open) {
      const start = value || todayISO()
      setFocusIso(start)
      setView(start.slice(0, 7))
      setPos(null)
    }
    setOpen((o) => !o)
  }

  const pick = (iso) => {
    if (blocked(iso)) return
    onChange(iso)
    setOpen(false)
  }

  const moveFocus = (next) => {
    if (blocked(next)) return
    keyboardMoved.current = true
    setFocusIso(next)
    setView(next.slice(0, 7))
  }

  const onGridKeyDown = (e) => {
    const step = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[e.key]
    if (step) { e.preventDefault(); moveFocus(addDays(focusIso, step)) }
    else if (e.key === 'PageUp') { e.preventDefault(); moveFocus(addMonths(focusIso, -1)) }
    else if (e.key === 'PageDown') { e.preventDefault(); moveFocus(addMonths(focusIso, 1)) }
  }

  const [vy, vm] = view.split('-').map(Number)
  const lead = new Date(vy, vm - 1, 1).getDay()
  const daysInMonth = new Date(vy, vm, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)]
  const today = todayISO()
  const valueLogged = Boolean(value && counts.has(value))

  const shiftView = (n) => setView(addMonths(`${view}-01`, n).slice(0, 7))

  const popup = open && (
    <div
      ref={popupRef}
      role="dialog"
      aria-label={fmtMonth.format(new Date(vy, vm - 1, 1))}
      style={pos ? { top: pos.top, left: pos.left, width: pos.width } : { top: 0, left: 0, width: POPUP_WIDTH, visibility: 'hidden' }}
      className="org-pop fixed z-[1000] rounded-xl border border-black/10 bg-white p-3 text-[#1A2B1A] shadow-lg"
    >
      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={() => shiftView(-1)} aria-label={L.prevMonth} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5">
          <ChevronLeft size={16} aria-hidden="true" />
        </button>
        <p className="text-[14px] font-semibold capitalize" aria-live="polite">{fmtMonth.format(new Date(vy, vm - 1, 1))}</p>
        <button type="button" onClick={() => shiftView(1)} aria-label={L.nextMonth} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-black/5">
          <ChevronRight size={16} aria-hidden="true" />
        </button>
      </div>

      <div className="grid grid-cols-7 text-center text-[11px] text-black/50">
        {weekdays.map((w) => <span key={w} className="py-1">{w}</span>)}
      </div>

      <div ref={gridRef} role="grid" onKeyDown={onGridKeyDown} className="grid grid-cols-7 gap-y-0.5">
        {cells.map((day, i) => {
          if (day === null) return <span key={`pad-${i}`} />
          const iso = `${view}-${String(day).padStart(2, '0')}`
          const n = counts.get(iso) || 0
          const isSelected = iso === value
          const isOff = blocked(iso)
          const label = `${fmtLong.format(parseISO(iso))}${n ? ` — ${L.logged}, ${L.logCount(n)}` : ''}`
          let tone = 'hover:bg-black/5'
          if (n) tone = 'bg-red-50 font-semibold text-red-600 hover:bg-red-100'
          if (isSelected) tone = `${accentClass} font-semibold`
          return (
            <button
              key={iso}
              type="button"
              data-iso={iso}
              disabled={isOff}
              tabIndex={iso === focusIso ? 0 : -1}
              title={n ? `${L.logged} · ${L.logCount(n)}` : undefined}
              aria-label={label}
              aria-pressed={isSelected}
              onClick={() => pick(iso)}
              className={`relative mx-auto flex h-9 w-9 items-center justify-center rounded-lg text-[13px] transition-colors disabled:cursor-not-allowed disabled:opacity-30 ${tone} ${iso === today && !isSelected ? 'ring-1 ring-inset ring-black/30' : ''}`}
            >
              {day}
              {n > 0 && (
                <span className="absolute bottom-[3px] left-1/2 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-red-500 ring-[1.5px] ring-white" aria-hidden="true" />
              )}
            </button>
          )
        })}
      </div>

      <div className="mt-2 flex items-center justify-between border-t border-black/10 pt-2">
        <span className="flex items-center gap-1.5 text-[12px] text-black/60">
          <span className="h-2 w-2 rounded-full bg-red-500" aria-hidden="true" />
          {L.logged}
        </span>
        <button
          type="button"
          disabled={blocked(today)}
          onClick={() => pick(today)}
          className="rounded-lg px-2.5 py-1 text-[12px] font-medium hover:bg-black/5 disabled:opacity-40"
        >
          {L.today}
        </button>
      </div>
    </div>
  )

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        id={id}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
        className={`${className} flex items-center justify-between gap-2 text-left disabled:opacity-50`}
      >
        <span className={value ? '' : 'opacity-60'}>{value ? fmtLong.format(parseISO(value)) : L.placeholder}</span>
        <CalendarDays size={16} className="shrink-0 opacity-60" aria-hidden="true" />
      </button>

      {valueLogged && showLoggedNote && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] font-medium text-red-600">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-red-500" aria-hidden="true" />
          {L.loggedNote}
        </p>
      )}

      {popup && createPortal(popup, document.body)}
    </div>
  )
}
