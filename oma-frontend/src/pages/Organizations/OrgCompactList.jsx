import { useMemo, useState } from 'react'
import { ChevronRight } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { filterOrgItems } from '../../utils/orgListFilter.js'

// A short list for an organization's own members, equipment or officers: one row per item (just its name, with an
// optional small line under it), a name search and filters, and the small details (plus actions) in a dialog when a
// row is tapped. Works the same on a phone and on a desktop.
//
// items:   [{ id, name, subtitle?, dim?, attrs: { <filter key>: value }, details: [{ label, value }],
//             actions?: [{ key, label, icon?, tone?, onClick }] }]
// filters: [{ key, label, allLabel?, options: [{ value, label }] }]   (a filter with no options is not shown)

const SELECT = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none'

export default function OrgCompactList({
  items, filters = [], searchPlaceholder = 'Search by name...', emptyText = 'Nothing recorded yet.', pageSize = 30,
}) {
  const [query, setQuery] = useState('')
  const [chosen, setChosen] = useState({})
  const [visible, setVisible] = useState(pageSize)
  const [openId, setOpenId] = useState(null)

  const matches = useMemo(() => filterOrgItems(items, { query, filters: chosen }), [items, query, chosen])
  const shown = matches.slice(0, visible)
  const open = openId === null ? null : items.find((item) => item.id === openId) || null
  const shownFilters = filters.filter((f) => f.options.length > 0)
  const activeCount = Object.values(chosen).filter(Boolean).length

  const setFilter = (key) => (e) => { setChosen((c) => ({ ...c, [key]: e.target.value })); setVisible(pageSize) }
  const clear = () => { setChosen({}); setQuery(''); setVisible(pageSize) }

  if (items.length === 0) {
    return <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">{emptyText}</p>
  }

  return (
    <div className="max-w-3xl space-y-3">
      <FilterPanel
        search={query} onSearchChange={(v) => { setQuery(v); setVisible(pageSize) }} searchPlaceholder={searchPlaceholder}
        activeCount={activeCount + (query.trim() ? 1 : 0)}
      >
        {shownFilters.map((f) => (
          <select key={f.key} className={SELECT} value={chosen[f.key] || ''} onChange={setFilter(f.key)} aria-label={f.label}>
            <option value="">{f.allLabel || `All ${f.label.toLowerCase()}`}</option>
            {f.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        ))}
        {(activeCount > 0 || query.trim()) && (
          <button type="button" onClick={clear} className="text-[13px] font-medium text-[#1E5637] hover:underline">
            Clear filters
          </button>
        )}
      </FilterPanel>

      <p className="text-[12px] text-[#7A8E7A]" data-testid="list-count">
        {matches.length === items.length ? `${items.length} in total` : `${matches.length} of ${items.length} shown`}
      </p>

      {matches.length === 0 ? (
        <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">Nothing matches your search or filters.</p>
      ) : (
        <ul className="divide-y divide-[#EEF2EE] overflow-hidden rounded-xl border border-[#E2E8E2] bg-white" data-testid="compact-list">
          {shown.map((item) => (
            <li key={item.id}>
              <button
                type="button" onClick={() => setOpenId(item.id)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#F5F7F5] ${item.dim ? 'opacity-60' : ''}`}
              >
                <span className="min-w-0">
                  <span className="block truncate text-[14px] font-medium text-[#1A2B1A]">{item.name}</span>
                  {item.subtitle && <span className="block truncate text-[12px] text-[#7A8E7A]">{item.subtitle}</span>}
                </span>
                <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      )}

      {matches.length > visible && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setVisible((v) => v + pageSize)}>
            Show more ({matches.length - visible} left)
          </Button>
        </div>
      )}

      {open && (
        <ModalShell
          title={open.name}
          subtitle={open.subtitle}
          onClose={() => setOpenId(null)}
          footer={(open.actions || []).length > 0 ? (
            <>
              {open.actions.map((a) => (
                <Button
                  key={a.key} type="button" size="sm" variant="ghost" icon={a.icon}
                  className={a.tone === 'danger' ? '!text-rose-600' : '!text-[#1B4D2E]'}
                  onClick={() => { setOpenId(null); a.onClick() }}
                >
                  {a.label}
                </Button>
              ))}
            </>
          ) : undefined}
        >
          <dl className="space-y-3">
            {open.details.map((d) => (
              <div key={d.label} className="flex items-start justify-between gap-4">
                <dt className="text-[12px] text-[#7A8E7A]">{d.label}</dt>
                <dd className="min-w-0 break-words text-right text-[13px] font-medium text-[#1A2B1A]">{d.value}</dd>
              </div>
            ))}
          </dl>
        </ModalShell>
      )}
    </div>
  )
}
