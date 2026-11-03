import { useEffect, useRef, useState } from 'react'
import { ChevronDown } from 'lucide-react'
import { baseInputClasses } from './FormField.jsx'

// A dropdown of checkboxes, for choosing several of a list (the crops of a harvest unit weight). `options` is [{ value, label }], `value` the
// chosen values; with none chosen the box shows `emptyLabel` ("Every crop"). The list opens in the page's flow (under the box) so a table
// cell never clips it. The box carries `data-draft`, so an inline Add row puts the focus on it when it opens.
export default function MultiSelectDropdown({ options, value, onChange, emptyLabel = 'None chosen', ariaLabel, maxNames = 2 }) {
  const [open, setOpen] = useState(false)
  const box = useRef(null)
  const chosen = options.filter((o) => value.includes(o.value))

  useEffect(() => {
    if (!open) return undefined
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false) }
    const esc = (e) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', away)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('keydown', esc) }
  }, [open])

  const toggle = (v) => onChange(value.includes(v) ? value.filter((x) => x !== v) : [...value, v])
  const names = chosen.map((o) => o.label)
  const text = names.length === 0 ? emptyLabel : names.length <= maxNames ? names.join(', ') : `${names.slice(0, maxNames).join(', ')} +${names.length - maxNames}`

  return (
    <div ref={box} className="w-full min-w-[10rem]">
      <button
        type="button" data-draft aria-haspopup="listbox" aria-expanded={open} aria-label={ariaLabel} title={names.length > maxNames ? names.join(', ') : undefined}
        onClick={() => setOpen((o) => !o)}
        className={`${baseInputClasses} flex min-h-[40px] w-full items-center justify-between gap-2 text-left`}
      >
        <span className={`min-w-0 truncate ${names.length === 0 ? 'text-[#7A8E7A]' : ''}`}>{text}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-[#7A8E7A] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <ul role="listbox" aria-multiselectable="true" className="mt-1 max-h-48 overflow-auto rounded-lg border border-[#E2E8E2] bg-white py-1">
          {options.length === 0 && <li className="px-3 py-2 text-[12.5px] italic text-[#7A8E7A]">Nothing to choose from.</li>}
          {options.map((o) => (
            <li key={o.value} role="option" aria-selected={value.includes(o.value)}>
              <label className="flex min-h-[40px] cursor-pointer items-center gap-2 px-3 py-1.5 text-[13px] text-[#1A2B1A] hover:bg-[#F5F7F5]">
                <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={value.includes(o.value)} onChange={() => toggle(o.value)} />
                {o.label}
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
