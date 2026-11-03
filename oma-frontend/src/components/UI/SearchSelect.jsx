import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, X } from 'lucide-react'
import { baseInputClasses } from './FormField.jsx'
import { filterOptions, labelOf, nextActive } from '../../utils/searchSelect.js'

// A select you can type in: the box shows the chosen name; typing lists the options whose names contain what was typed (best matches first),
// the arrow keys and Enter choose, Escape puts the chosen name back. Used where the list is long enough that scrolling a plain dropdown is slow
// (the organization of a farmer or fisherfolk being registered).
//   options       [{ value, label }]
//   value         the chosen value, or null / '' for none
//   onChange      (value | null) => void
//   emptyLabel    when given, a first row with this text chooses "none" (e.g. "— Not a member of any organization")
// The list is drawn in <body> next to the box (like ComboboxWithOther) so a modal's or table's overflow never clips it.
const MAX_LIST_HEIGHT = 240
const MAX_ROWS = 50

export default function SearchSelect({
  options,
  value,
  onChange,
  emptyLabel = '',
  placeholder = 'Type to search…',
  noMatchText = 'No match. Check the spelling.',
  id,
  ariaLabel,
  disabled = false,
  className = '',
}) {
  const baseId = useId()
  const inputId = id || `${baseId}-input`
  const listId = `${baseId}-list`
  const rowId = (i) => `${baseId}-row-${i}`

  const rootRef = useRef(null)
  const inputRef = useRef(null)
  const listRef = useRef(null)
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0, openUpward: false })

  const chosenLabel = labelOf(options, value)
  // The rows: the "none" row (only while nothing is typed), then the matches.
  const rows = [
    ...(emptyLabel && !query.trim() ? [{ value: null, label: emptyLabel, isNone: true }] : []),
    ...filterOptions(options, query, { limit: MAX_ROWS }),
  ]
  const shownText = isOpen ? query : chosenLabel

  useEffect(() => {
    const outside = (e) => {
      if (rootRef.current?.contains(e.target) || listRef.current?.contains(e.target)) return
      setIsOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', outside)
    return () => document.removeEventListener('mousedown', outside)
  }, [])

  useLayoutEffect(() => {
    if (!isOpen) return undefined
    const reposition = () => {
      const box = rootRef.current?.getBoundingClientRect()
      if (!box) return
      const spaceBelow = window.innerHeight - box.bottom
      const openUpward = spaceBelow < MAX_LIST_HEIGHT && box.top > spaceBelow
      setPos({ top: openUpward ? box.top : box.bottom, left: box.left, width: box.width, openUpward })
    }
    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => { window.removeEventListener('resize', reposition); window.removeEventListener('scroll', reposition, true) }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && active >= 0) document.getElementById(rowId(active))?.scrollIntoView({ block: 'nearest' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, active])

  const open = () => { if (!disabled) setIsOpen(true) }
  const close = () => { setIsOpen(false); setQuery('') }
  const choose = (row) => { onChange(row.value === null ? null : row.value); close() }

  const onType = (e) => { setQuery(e.target.value); setActive(0); setIsOpen(true) }

  const onKeyDown = (e) => {
    if (disabled) return
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); open(); setActive(rows.length ? 0 : -1) }
      return
    }
    switch (e.key) {
      case 'ArrowDown': case 'ArrowUp': case 'Home': case 'End':
        e.preventDefault(); setActive((a) => nextActive(a, rows.length, e.key)); break
      case 'Enter':
        e.preventDefault()
        // Enter on the first match is the quick way: type a few letters, press Enter.
        if (rows[active >= 0 ? active : 0]) choose(rows[active >= 0 ? active : 0])
        break
      case 'Escape':
        e.preventDefault(); close(); break
      case 'Tab':
        close(); break
      default:
        break
    }
  }

  const clear = (e) => { e.preventDefault(); onChange(null); close(); inputRef.current?.focus() }
  const hasValue = value !== null && value !== undefined && value !== ''

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      <input
        ref={inputRef}
        id={inputId}
        type="text"
        role="combobox"
        aria-label={ariaLabel}
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={isOpen && active >= 0 ? rowId(active) : undefined}
        autoComplete="off"
        disabled={disabled}
        value={shownText}
        placeholder={isOpen || !emptyLabel ? placeholder : emptyLabel}
        onChange={onType}
        onFocus={(e) => { open(); e.target.select() }}
        onClick={open}
        onKeyDown={onKeyDown}
        className={`${baseInputClasses} pr-14 ${!isOpen && !hasValue && emptyLabel ? 'placeholder-[#4A5E4A]' : ''}`}
      />
      <span className="absolute inset-y-0 right-2 flex items-center gap-1">
        {hasValue && !disabled && (
          <button type="button" onMouseDown={clear} aria-label="Clear the choice" title="Clear"
            className="flex h-6 w-6 items-center justify-center rounded text-[#7A8E7A] hover:bg-[#F0F4F0] hover:text-[#1A2B1A]">
            <X size={14} aria-hidden="true" />
          </button>
        )}
        <ChevronDown size={14} aria-hidden="true" className="pointer-events-none text-[#7A8E7A]" />
      </span>

      {isOpen && createPortal(
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          style={{ position: 'fixed', left: pos.left, width: pos.width, ...(pos.openUpward ? { bottom: window.innerHeight - pos.top } : { top: pos.top }), maxHeight: MAX_LIST_HEIGHT }}
          className="z-[1000] overflow-y-auto rounded-lg border border-[#E2E8E2] bg-white py-1 shadow-lg"
        >
          {rows.length === 0 && <li className="px-3 py-2 text-[13px] text-[#7A8E7A]">{noMatchText}</li>}
          {rows.map((row, i) => {
            const selected = row.isNone ? !hasValue : String(row.value) === String(value)
            return (
              <li
                key={row.isNone ? 'none' : row.value}
                id={rowId(i)}
                role="option"
                aria-selected={selected}
                onMouseDown={(e) => { e.preventDefault(); choose(row) }}
                onMouseEnter={() => setActive(i)}
                className={`cursor-pointer px-3 py-2 text-[13px] max-md:min-h-[44px] max-md:py-3 ${i === active ? 'bg-[#EBF5EE]' : ''} ${selected ? 'font-semibold text-[#1B4D2E]' : 'text-[#1A2B1A]'} ${row.isNone ? 'text-[#4A5E4A]' : ''}`}
              >
                {row.label}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}
    </div>
  )
}
