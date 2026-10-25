import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import { baseInputClasses } from './FormField.jsx'

// Batch B: replaces every "select with an Other option that reveals a
// second textbox elsewhere on the page" pattern with a single inline
// control — same box, box just becomes editable the moment "Other" is
// picked. The underlying value contract is unchanged from that old
// pattern: `value` is either one of `options`, or the literal string
// "Other"; `otherValue` is the free-text companion, only meaningful when
// value === "Other". Callers wire these straight into the same two form-
// state fields (e.g. disaster_type / disaster_type_other_specify) they
// always did — this component only changes how the two are edited, not
// what gets submitted.
//
// otherValue is cleared automatically (onOtherChange('')) the moment the
// user switches AWAY from "Other" back to a real option — matching what
// every hand-rolled instance of this pattern already did (e.g.
// LogGovernmentAssistanceModal's `if (value !== 'Other') set(..., '')`).
// Re-selecting "Other" after having already typed something does NOT
// clear it — same as a native select never touching an independent text
// field it doesn't own.
//
// ARIA: implements the "select-only combobox with a popup listbox"
// pattern (WAI-ARIA APG) — focus stays on the trigger/input, the active
// option is tracked via aria-activedescendant, not by moving focus into
// the listbox. Arrow keys / Enter / Escape / Tab are all handled so
// nothing a native <select> offered is lost.

const OTHER_SENTINEL = 'Other'

// `options` accepts either plain strings (value === display label, the
// original contract every existing caller relies on) or {value, label}
// objects, for the citizen screens whose option labels differ from the stored value
// (stored/submitted value vs. the label shown) — added rather
// than inventing a second Other-handling pattern for that one difference.
const normalizeOption = (o) => (typeof o === 'string' ? { value: o, label: o } : o)

function ComboboxWithOther({
  options,
  value,
  otherValue = '',
  onChange,
  onOtherChange,
  otherLabel = 'Other',
  placeholder = 'Select...',
  required = false,
  error,
  disabled = false,
  className = '',
  // The citizen self-service screens (src/pages/Citizen/**) follow a
  // different visual spec from the staff app — taller controls, hairline
  // borders, larger type. These two optional overrides let them restyle
  // the control without forking the component or disturbing the staff
  // usages, which simply don't pass them and keep baseInputClasses.
  inputClassName = baseInputClasses,
  chevronSize = 14,
}) {
  const baseId = useId()
  const listboxId = `${baseId}-listbox`
  const optionId = (i) => `${baseId}-opt-${i}`

  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  // Portal-positioning: the listbox renders into document.body (see below
  // for why), so its position has to be computed from the trigger's own
  // on-screen rect rather than inherited from normal document flow.
  const [dropPos, setDropPos] = useState({ top: 0, left: 0, width: 0, openUpward: false })

  const rootRef = useRef(null)
  const triggerRef = useRef(null)
  const otherInputRef = useRef(null)
  const listRef = useRef(null)

  const allOptions = [...options.map(normalizeOption), { value: OTHER_SENTINEL, label: otherLabel }]
  const isOtherMode = value === OTHER_SENTINEL

  useEffect(() => {
    function handleOutside(e) {
      const insideTrigger = rootRef.current && rootRef.current.contains(e.target)
      const insideList = listRef.current && listRef.current.contains(e.target)
      if (!insideTrigger && !insideList) setIsOpen(false)
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [])

  // Every table/scrollable-card usage of this component (bulk-entry tables,
  // modal bodies, etc.) used to clip the option list the moment it needed
  // to extend past that ancestor's own overflow:hidden/auto — the listbox
  // was a normal absolutely-positioned child, so it was clipped exactly
  // like any other overflowing content. Portaling to <body> with
  // position:fixed, positioned from the trigger's live getBoundingClientRect,
  // escapes every such ancestor; recomputing on scroll/resize keeps it
  // glued to the trigger while open, and flipping above the trigger when
  // there isn't room below keeps it fully visible near the bottom of the
  // viewport instead of running off-screen.
  useLayoutEffect(() => {
    if (!isOpen) return
    const MAX_LIST_HEIGHT = 208 // matches max-h-52

    const reposition = () => {
      const trigger = rootRef.current
      if (!trigger) return
      const rect = trigger.getBoundingClientRect()
      const spaceBelow = window.innerHeight - rect.bottom
      const openUpward = spaceBelow < MAX_LIST_HEIGHT && rect.top > spaceBelow
      setDropPos({
        top: openUpward ? rect.top : rect.bottom,
        left: rect.left,
        width: rect.width,
        openUpward,
      })
    }

    reposition()
    window.addEventListener('resize', reposition)
    window.addEventListener('scroll', reposition, true)
    return () => {
      window.removeEventListener('resize', reposition)
      window.removeEventListener('scroll', reposition, true)
    }
  }, [isOpen])

  // Focus the text box the instant Other mode is entered — "the SAME box
  // becomes an editable text field immediately, focused and ready to type".
  useEffect(() => {
    if (isOtherMode && !isOpen) {
      otherInputRef.current?.focus()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOtherMode])

  useEffect(() => {
    if (isOpen && activeIndex >= 0) {
      document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: 'nearest' })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeIndex])

  const openDropdown = () => {
    if (disabled) return
    const currentIdx = allOptions.findIndex((o) => o.value === value)
    setActiveIndex(currentIdx >= 0 ? currentIdx : 0)
    setIsOpen(true)
  }

  const closeDropdown = () => setIsOpen(false)

  const selectOption = (opt) => {
    if (opt.value === OTHER_SENTINEL) {
      onChange(OTHER_SENTINEL)
    } else {
      if (isOtherMode) onOtherChange?.('')
      onChange(opt.value)
    }
    setIsOpen(false)
    triggerRef.current?.focus()
  }

  const handleTriggerKeyDown = (e) => {
    if (disabled) return
    if (!isOpen) {
      if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(e.key)) {
        e.preventDefault()
        openDropdown()
      }
      return
    }
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setActiveIndex((i) => Math.min(i + 1, allOptions.length - 1))
        break
      case 'ArrowUp':
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
        break
      case 'Enter':
      case ' ':
        e.preventDefault()
        if (activeIndex >= 0) selectOption(allOptions[activeIndex])
        break
      case 'Escape':
        e.preventDefault()
        closeDropdown()
        break
      case 'Tab':
        closeDropdown()
        break
      default:
        break
    }
  }

  // Other-mode text input still needs to reopen the dropdown via keyboard
  // (Alt+Down is the conventional combobox shortcut; plain ArrowDown when
  // the caret is already at either end also opens it, same courtesy a
  // native select's "type to search, arrow to browse" affords).
  const handleOtherInputKeyDown = (e) => {
    if (e.key === 'ArrowDown' && (e.altKey || !isOpen)) {
      e.preventDefault()
      openDropdown()
      return
    }
    if (isOpen) {
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIndex((i) => Math.max(i - 1, 0))
      } else if (e.key === 'Enter' && activeIndex >= 0) {
        e.preventDefault()
        selectOption(allOptions[activeIndex])
      } else if (e.key === 'Escape') {
        e.preventDefault()
        closeDropdown()
      }
    }
  }

  const displayLabel = value && !isOtherMode
    ? (allOptions.find((o) => o.value === value)?.label ?? value)
    : ''

  return (
    <div ref={rootRef} className={`relative ${className}`}>
      {!isOtherMode ? (
        <button
          ref={triggerRef}
          type="button"
          role="combobox"
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-controls={listboxId}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
          disabled={disabled}
          onClick={() => (isOpen ? closeDropdown() : openDropdown())}
          onKeyDown={handleTriggerKeyDown}
          className={`${inputClassName} flex items-center justify-between gap-2 text-left disabled:opacity-50 disabled:cursor-not-allowed`}
        >
          <span className={`min-w-0 flex-1 truncate ${displayLabel ? '' : 'text-[#A8BCA8]'}`}>
            {displayLabel || placeholder}
          </span>
          <ChevronDown
            size={chevronSize}
            className={`shrink-0 text-[#7A8E7A] transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
            aria-hidden="true"
          />
        </button>
      ) : (
        <div className="relative">
          <input
            ref={otherInputRef}
            type="text"
            role="combobox"
            aria-expanded={isOpen}
            aria-haspopup="listbox"
            aria-controls={listboxId}
            aria-required={required || undefined}
            aria-invalid={error ? true : undefined}
            aria-activedescendant={isOpen && activeIndex >= 0 ? optionId(activeIndex) : undefined}
            disabled={disabled}
            value={otherValue}
            placeholder={`${otherLabel} — please specify`}
            onChange={(e) => onOtherChange?.(e.target.value)}
            onKeyDown={handleOtherInputKeyDown}
            className={`${inputClassName} pr-8 disabled:opacity-50 disabled:cursor-not-allowed`}
          />
          <button
            type="button"
            tabIndex={-1}
            aria-label="Choose a different option"
            disabled={disabled}
            onClick={() => (isOpen ? closeDropdown() : openDropdown())}
            className="absolute right-0 top-0 flex h-full w-9 items-center justify-center text-[#7A8E7A] hover:text-[#1B4D2E] disabled:opacity-50"
          >
            <ChevronDown
              size={chevronSize}
              className={`transition-transform motion-reduce:transition-none ${isOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </button>
        </div>
      )}

      {/* Portaled to <body> — see the useLayoutEffect above for why — and
          kept mounted (not conditionally rendered) so the opacity/scale
          toggle below is an actual CSS transition rather than an instant
          mount/unmount — motion-reduce:transition-none zeroes it out for
          users who asked for reduced motion. aria-hidden keeps it out of
          the accessibility tree while closed; nothing ever needs to focus
          into it since the trigger owns aria-activedescendant. */}
      {createPortal(
        <ul
          ref={listRef}
          id={listboxId}
          role="listbox"
          aria-hidden={!isOpen}
          style={{
            position: 'fixed',
            top: dropPos.openUpward ? undefined : dropPos.top,
            bottom: dropPos.openUpward ? window.innerHeight - dropPos.top : undefined,
            left: dropPos.left,
            width: dropPos.width,
          }}
          className={`z-[1000] max-h-52 overflow-y-auto rounded-xl border border-[#E2E8E2] bg-white py-1 shadow-lg ${dropPos.openUpward ? 'origin-bottom mb-1' : 'origin-top mt-1'}
            transition-[opacity,transform] duration-100 ease-out motion-reduce:transition-none ${
              isOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible pointer-events-none'
            }`}
        >
          {allOptions.map((opt, i) => {
            const isSelected = value === opt.value
            const isActive = i === activeIndex
            return (
              <li
                key={opt.value}
                id={optionId(i)}
                role="option"
                aria-selected={isSelected}
                onMouseDown={(e) => { e.preventDefault(); selectOption(opt) }}
                onMouseEnter={() => setActiveIndex(i)}
                className={`cursor-pointer px-3 py-2 text-[13px] transition-colors motion-reduce:transition-none ${
                  isSelected
                    ? 'bg-[#EBF5EE] font-semibold text-[#1B4D2E]'
                    : isActive
                      ? 'bg-[#F5F7F5] text-[#1A2B1A]'
                      : 'text-[#1A2B1A]'
                }`}
              >
                {opt.label}
              </li>
            )
          })}
        </ul>,
        document.body,
      )}

      {error && (
        <p className="text-[12px] text-[#C0392B] mt-1">{error}</p>
      )}
    </div>
  )
}

export default ComboboxWithOther
