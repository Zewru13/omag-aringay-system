import { useMemo, useState } from 'react'
import Button from '../../components/UI/Button.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { outcomeSummary } from '../../utils/equipmentLoans.js'
import { matchesSearch } from '../../utils/searchMatch.js'

// Everything an organization lent that came back: one row per loan (who, what, how many, when it went and when it came back, and the
// condition the units returned in). `loans` are the returned loans the equipment-loans endpoint gave (newest first). Search by member,
// narrow by equipment.
const SELECT = 'rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm focus:border-[#1E4620] focus:outline-none'
const CELL = 'px-4 py-3 text-[13px] text-[#1A2B1A] max-md:block max-md:w-full max-md:px-0 max-md:py-1 max-md:text-left max-md:before:mb-0.5 max-md:before:block max-md:before:text-[11px] max-md:before:font-semibold max-md:before:uppercase max-md:before:tracking-wide max-md:before:text-[#7A8E7A] max-md:before:content-[attr(data-label)]'

const formatDate = (value) => {
  if (!value) return '—'
  const d = new Date(String(value).length > 10 ? value : `${value}T00:00:00`)
  return Number.isNaN(d.getTime()) ? '—' : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d)
}

// Returned after its return-by date (compared by day).
const returnedLate = (loan) => Boolean(loan.due_date && loan.returned_at && String(loan.returned_at).slice(0, 10) > loan.due_date)

export default function ReturnedTable({ loans, pageSize = 30 }) {
  const [query, setQuery] = useState('')
  const [equipment, setEquipment] = useState('')
  const [visible, setVisible] = useState(pageSize)

  const equipmentNames = useMemo(() => [...new Set(loans.map((l) => l.equipment_name))].sort(), [loans])
  const rows = useMemo(() => loans.filter((l) => (
    (!equipment || l.equipment_name === equipment)
    && matchesSearch(l.member_name, query)
  )), [loans, query, equipment])

  if (loans.length === 0) {
    return <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">Nothing has been returned yet.</p>
  }
  const active = (equipment ? 1 : 0) + (query.trim() ? 1 : 0)
  return (
    <div className="space-y-3">
      <FilterPanel search={query} onSearchChange={(v) => { setQuery(v); setVisible(pageSize) }} searchPlaceholder="Search member..." activeCount={active} className="">
        <select className={SELECT} value={equipment} onChange={(e) => { setEquipment(e.target.value); setVisible(pageSize) }} aria-label="Equipment">
          <option value="">All equipment</option>
          {equipmentNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        {active > 0 && <button type="button" onClick={() => { setQuery(''); setEquipment(''); setVisible(pageSize) }} className="text-[13px] font-medium text-[#1E5637] hover:underline">Clear filters</button>}
      </FilterPanel>

      <p className="text-[12px] text-[#7A8E7A]" data-testid="returned-count">
        {rows.length === loans.length ? `${loans.length} returned in total` : `${rows.length} of ${loans.length} shown`}
      </p>

      {rows.length === 0 ? (
        <p className="rounded-lg bg-[#F5F7F5] px-4 py-3 text-[13px] text-[#7A8E7A]">Nothing matches your search or filters.</p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[#E2E8E2] bg-white">
          <table className="w-full text-left max-md:block" data-testid="returned-table">
            <thead className="bg-[#1B4D2E] text-white max-md:hidden">
              <tr>
                {['Member', 'Equipment', 'Units', 'Borrowed', 'Returned', 'What happened'].map((h) => (
                  <th key={h} className="px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2EE] max-md:block">
              {rows.slice(0, visible).map((loan) => (
                <tr key={loan.id} className="max-md:block max-md:px-4 max-md:py-3">
                  <td data-label="Member" className={`${CELL} font-medium`}>{loan.member_name}</td>
                  <td data-label="Equipment" className={CELL}>{loan.equipment_name}</td>
                  <td data-label="Units" className={CELL}>{loan.quantity}</td>
                  <td data-label="Borrowed" className={CELL}>{formatDate(loan.borrowed_at)}</td>
                  <td data-label="Returned" className={CELL}>
                    {formatDate(loan.returned_at)}
                    {returnedLate(loan) && <span className="ml-2 align-middle"><StatusPill tone="rose">Late</StatusPill></span>}
                  </td>
                  <td data-label="What happened" className={CELL}>{outcomeSummary(loan.return_breakdown)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > visible && (
        <div className="flex justify-center">
          <Button type="button" variant="outline" size="sm" onClick={() => setVisible((v) => v + pageSize)}>Show more ({rows.length - visible} left)</Button>
        </div>
      )}
    </div>
  )
}
