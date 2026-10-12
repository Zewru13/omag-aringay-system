import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// Disaster logs grouped by person: one row per farmer or fisherfolk (name, barangay, how many disasters and how many
// are active or recovered). Clicking the row opens it onto that person's crops or ponds, one line each; clicking a line
// opens that disaster's details. Several disasters for one person no longer fill the table with repeats.
//   groups: groupDisasterRows(...) output. columns: [{ key, label }] for the lines under a person; the line's cells
//   are row[key] (already formatted). onOpen(row): what clicking a line does. personLabel: 'Farmer' | 'Fisherfolk'.

export default function GroupedDisasterTable({ groups, columns, isLoading, onOpen, personLabel = 'Person', emptyText = 'No disasters found.' }) {
  const [open, setOpen] = useState(() => new Set())
  const toggle = (key) => setOpen((prev) => {
    const next = new Set(prev)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    return next
  })

  return (
    <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white" data-testid="grouped-disaster-table">
      <div className="hidden bg-[#1B4D2E] px-4 py-3 text-[11px] font-semibold uppercase tracking-wide text-white sm:grid sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_2rem] sm:gap-3">
        <span>{personLabel}</span>
        <span>Barangay</span>
        <span>Disasters</span>
        <span>Status</span>
        <span />
      </div>
      {isLoading && <p className="px-4 py-8 text-center text-sm text-slate-500">Loading…</p>}
      {!isLoading && groups.length === 0 && <p className="px-4 py-8 text-center text-sm text-slate-500">{emptyText}</p>}
      <ul className="divide-y divide-[#E2E8E2]">
        {!isLoading && groups.map((group) => {
          const isOpen = open.has(group.key)
          return (
            <li key={group.key}>
              <button
                type="button"
                onClick={() => toggle(group.key)}
                aria-expanded={isOpen}
                className="grid w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F7F5] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#1B4D2E]/30 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_2rem]"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-[#1A2B1A]">{group.name}</span>
                  <span className="block truncate text-[12px] text-[#7A8E7A] sm:hidden">
                    {[group.barangay, `${group.total} disaster${group.total === 1 ? '' : 's'}`, group.summary].filter(Boolean).join(' · ')}
                  </span>
                </span>
                <span className="hidden truncate text-[13px] text-[#4A5E4A] sm:block">{group.barangay || '—'}</span>
                <span className="hidden text-[13px] font-medium text-[#1A2B1A] sm:block">{group.total} disaster{group.total === 1 ? '' : 's'}</span>
                <span className="hidden text-[12.5px] text-[#4A5E4A] sm:block">{group.summary || '—'}</span>
                <ChevronDown size={18} className={`justify-self-end text-[#7A8E7A] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {isOpen && (
                <div className="border-t border-[#E2E8E2] bg-[#F9FAF9] px-2 py-2 sm:px-4">
                  <div className="overflow-x-auto rounded-lg border border-[#E2E8E2] bg-white">
                    <table className="w-full min-w-[640px] text-left text-[13px]">
                      <thead>
                        <tr className="bg-[#F5F7F5] text-[11px] font-semibold uppercase tracking-wide text-[#4A5E4A]">
                          {columns.map((col) => <th key={col.key} className="px-3 py-2">{col.label}</th>)}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[#E2E8E2]">
                        {group.rows.map((row) => (
                          <tr
                            key={row.id}
                            tabIndex={0}
                            onClick={() => onOpen(row)}
                            onKeyDown={(e) => { if (e.key === 'Enter') onOpen(row) }}
                            className="cursor-pointer align-top transition-colors hover:bg-[#F5F7F5] focus-visible:bg-[#F5F7F5] focus-visible:outline-none"
                          >
                            {columns.map((col) => (
                              <td key={col.key} className="px-3 py-2.5 text-[#1A2B1A]" onClick={col.key === 'actions_cell' ? (e) => e.stopPropagation() : undefined}>
                                {row[col.key] ?? '—'}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
