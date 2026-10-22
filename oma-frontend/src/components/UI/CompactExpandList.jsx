import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

// A list that shows only a title and one line for each item (for example a crop and the type of disaster, or an assistance and
// its date); tapping an item opens its details and actions underneath. One item is open at a time. Used on the farmer and
// fisherfolk accounts' Disaster and Assistance pages, where a wide table is too much on a phone.
//   items: [{ id, title, subtitle, details: [[label, value], ...], actions }]   (actions: any node, shown under the details)
export default function CompactExpandList({ items, isLoading = false, emptyText = 'Nothing to show yet.' }) {
  const [openId, setOpenId] = useState(null)

  if (isLoading) {
    return (
      <div className="space-y-2" aria-busy="true">
        {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl border border-[#E2E8E2] bg-[#E8EEE8]/60" />)}
      </div>
    )
  }
  if (items.length === 0) {
    return <p className="rounded-xl border border-[#E2E8E2] bg-white px-4 py-10 text-center text-[13px] italic text-[#7A8E7A]">{emptyText}</p>
  }

  return (
    <ul className="space-y-2" data-testid="compact-list">
      {items.map((item) => {
        const open = openId === item.id
        const panelId = `compact-${item.id}`
        return (
          <li key={item.id} className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <button
              type="button"
              onClick={() => setOpenId(open ? null : item.id)}
              aria-expanded={open}
              aria-controls={panelId}
              className="flex min-h-[56px] w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F9FAF9]"
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[14px] font-semibold text-[#1A2B1A]">{item.title}</span>
                {item.subtitle && <span className="mt-0.5 block truncate text-[12.5px] text-[#4A5E4A]">{item.subtitle}</span>}
              </span>
              <ChevronDown size={18} className={`shrink-0 text-[#7A8E7A] transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden="true" />
            </button>
            {open && (
              <div id={panelId} className="border-t border-[#F0F4F0] bg-[#F9FAF9] px-4 py-3">
                <dl className="divide-y divide-[#F0F4F0]">
                  {item.details.filter(([, value]) => value !== null && value !== undefined && value !== '').map(([label, value]) => (
                    <div key={label} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5 py-1.5 text-[13px]">
                      <dt className="text-[#7A8E7A]">{label}</dt>
                      <dd className="min-w-0 break-words text-right font-medium text-[#1A2B1A]">{value}</dd>
                    </div>
                  ))}
                </dl>
                {item.actions && <div className="mt-2 flex flex-wrap items-center justify-end gap-2">{item.actions}</div>}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}
