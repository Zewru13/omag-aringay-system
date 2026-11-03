import { ChevronDown } from 'lucide-react'
import { groupCells, groupColumnLabels, groupGridClass, groupPhoneLines } from '../../utils/groupColumns.js'

// The header and the button of a "Group by" row, laid out as columns (the labels and cells come from utils/groupColumns.js).
// A phone has no room for columns, so it keeps the stacked name / identity / counts lines.

// The green header above the group rows (wide screens only).
export function GroupColumnsHeader({ kind }) {
  return (
    <div className={`hidden items-center gap-3 bg-[#1B4D2E] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-white sm:grid ${groupGridClass(kind)}`}>
      {groupColumnLabels(kind).map((label) => <span key={label} className="truncate">{label}</span>)}
      <span aria-hidden="true" />
    </div>
  )
}

// What goes inside the group's button: the stacked lines on a phone, one cell per column on a wide screen, and the chevron.
export function GroupColumnsRow({ kind, group, isOpen }) {
  const cells = groupCells(kind, group)
  const phone = groupPhoneLines(kind, group)
  return (
    <>
      <span className="min-w-0 sm:hidden">
        <span className="block truncate text-[14px] font-semibold text-[#1A2B1A]">{phone.title}</span>
        {phone.identity && <span className="block truncate text-[13px] text-[#4A5E4A]">{phone.identity}</span>}
        <span className="block truncate text-[12px] text-[#7A8E7A]">{phone.counts}</span>
      </span>
      {cells.map((text, i) => (
        <span
          key={i}
          className={`hidden min-w-0 truncate text-[13px] sm:block ${i === 0 ? 'font-semibold text-[#1A2B1A]' : 'text-[#4A5E4A]'}`}
          title={text.length > 18 ? text : undefined}
        >
          {text}
        </span>
      ))}
      <ChevronDown size={18} className={`justify-self-end text-[#7A8E7A] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
    </>
  )
}
