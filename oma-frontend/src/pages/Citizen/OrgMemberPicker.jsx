import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'

// Search-as-you-type picker over an organization's OWN members, replacing the
// plain <select> on Assign Officer and Report Assistance (a select of dozens
// of names cannot be typed into usefully). Typing narrows the list by name,
// barangay or ID number — any words, any order ("cruz juan") — and the person
// can only be chosen FROM that list: typing free text never sets a value, so
// nobody outside the member list can be picked.
//
// The parent holds the chosen person's id (`value`, '' when nothing is chosen)
// and passes `members` (the join rows the organization screens already hold).
// Keyboard: ArrowUp/ArrowDown move, Enter chooses, Escape closes.

const MAX_SHOWN = 30
const mask = (v) => (v ? `…${String(v).slice(-4)}` : '')

export default function OrgMemberPicker({ domain, members, value, onChange, id, placeholder }) {
  const theme = domain.dashboardTheme
  const listId = useId()
  const wrapRef = useRef(null)
  const selected = members.find((m) => String(domain.rowPersonId(m)) === String(value)) || null

  // `text` is what the box shows. Choosing someone puts their name there;
  // editing it afterwards clears the choice so it must be picked again.
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(0)

  useEffect(() => {
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [])

  const shown = useMemo(() => {
    const browsing = selected && text === domain.rowName(selected)
    const tokens = browsing ? [] : text.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const rows = tokens.length === 0
      ? members
      : members.filter((m) => {
        const hay = [domain.rowName(m), domain.rowBarangay(m), domain.rowIdNumber(m)]
          .filter(Boolean).join(' ').toLowerCase()
        return tokens.every((t) => hay.includes(t))
      })
    return rows
  }, [members, text, selected, domain])
  const list = shown.slice(0, MAX_SHOWN)
  const current = Math.min(active, Math.max(0, list.length - 1))

  const choose = (m) => {
    onChange(String(domain.rowPersonId(m)))
    setText(domain.rowName(m))
    setOpen(false)
  }

  const clear = () => {
    onChange('')
    setText('')
    setActive(0)
    setOpen(true)
  }

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) { setOpen(true); return }
      setActive(Math.min(current + 1, list.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(current - 1, 0))
    } else if (e.key === 'Enter') {
      if (open && list[current]) { e.preventDefault(); choose(list[current]) }
    } else if (e.key === 'Escape') {
      setOpen(false)
    }
  }

  return (
    <div ref={wrapRef} className="relative">
      <div className={`flex min-h-[46px] items-center gap-2 rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 ${theme.focusWithinBorder}`}>
        <Search size={16} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
        <input
          id={id}
          type="text"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          value={text}
          placeholder={placeholder || labels.orgPicker.placeholder}
          onChange={(e) => {
            setText(e.target.value)
            setActive(0)
            setOpen(true)
            if (value) onChange('')
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          className="min-h-[44px] w-full bg-transparent text-[14px] text-cz-text outline-none"
        />
        {text && (
          <button
            type="button"
            onClick={clear}
            aria-label={labels.orgPicker.clear}
            className="press-scale flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-cz-text-muted transition-colors hover:bg-cz-page"
          >
            <X size={15} aria-hidden="true" />
          </button>
        )}
      </div>

      {open && (
        <ul
          id={listId}
          role="listbox"
          className="org-pop absolute z-30 mt-1.5 max-h-64 w-full overflow-y-auto rounded-[12px] border-[0.5px] border-cz-border bg-white py-1 shadow-[var(--shadow-lg)]"
        >
          {list.length === 0 ? (
            <li className="px-4 py-3 text-[13px] text-cz-text-muted">{labels.orgPicker.empty}</li>
          ) : list.map((m, i) => {
            const isActiveRow = domain.rowIsActive(m)
            return (
              <li
                key={m.id}
                role="option"
                aria-selected={String(domain.rowPersonId(m)) === String(value)}
                onMouseDown={(e) => { e.preventDefault(); choose(m) }}
                onMouseEnter={() => setActive(i)}
                className={`flex cursor-pointer items-center gap-3 px-3.5 py-2 ${i === current ? 'bg-cz-page' : ''}`}
              >
                <OrgAvatar name={domain.rowName(m)} theme={theme} size={32} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-semibold text-cz-text">{domain.rowName(m)}</span>
                  <span className="block truncate text-[12px] text-cz-text-2">
                    {[domain.rowBarangay(m) && `Brgy. ${domain.rowBarangay(m)}`, mask(domain.rowIdNumber(m))].filter(Boolean).join(' · ')}
                  </span>
                </span>
                {!isActiveRow && (
                  <span className="shrink-0 rounded-full bg-cz-tile-slate-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.04em] text-cz-tile-slate-fg">
                    {labels.orgMemberActive.inactiveBadge}
                  </span>
                )}
              </li>
            )
          })}
          {shown.length > MAX_SHOWN && (
            <li className="px-4 py-2 text-[11px] text-cz-text-muted">{labels.orgPicker.capped(MAX_SHOWN)}</li>
          )}
        </ul>
      )}
    </div>
  )
}
