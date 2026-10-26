import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { lendManyBody, lendManyProblem, lendManySummary, unitsPicked } from '../../utils/lendMany.js'
import { todayISO } from '../../utils/localDate.js'
import { unitsSummary } from '../../utils/equipmentLoans.js'
import { ActionForm } from './EquipmentActionDialogs.jsx'

// "Lend equipment" on the Borrowed tab: the organization reports that several of its members borrowed one equipment, for the members who
// have no account to request it themselves. Pick the equipment, tick every member who took it (each with their own number of units), and
// say when it was borrowed and, if known, when it is due back. Every member becomes a Borrowed loan; all are saved or none.
//   lines: the organization's equipment lines (only Good ones with units left are offered); members: [{ id: person id, name }]
const LABEL = 'mb-1 block text-[12px] font-medium text-[#4A5A4C]'

const lineLabel = (line, many) => {
  const { available } = unitsSummary(line)
  const acquired = many && line.acquisition_date ? ` (acquired ${String(line.acquisition_date).slice(0, 4)})` : ''
  return `${line.equipment_name}${acquired} — ${available} available`
}

export default function LendEquipmentForm({ type, lines, members, onClose, onDone }) {
  const { showToast } = useToast()
  const today = todayISO()
  const lendable = useMemo(() => lines.filter((l) => l.condition === 'Good' && unitsSummary(l).available > 0), [lines])
  const [lineId, setLineId] = useState(lendable[0] ? String(lendable[0].id) : '')
  const [borrowedOn, setBorrowedOn] = useState(today)
  const [due, setDue] = useState('')
  const [picked, setPicked] = useState({})       // person id -> units (typed text)
  const [search, setSearch] = useState('')

  const line = lendable.find((l) => String(l.id) === lineId)
  const available = line ? unitsSummary(line).available : 0
  const sameName = line ? lendable.filter((l) => l.equipment_name === line.equipment_name).length > 1 : false
  const pickedList = Object.entries(picked).map(([member, quantity]) => ({ member, quantity }))
  const problem = lendManyProblem({ equipment: line?.id, picked: pickedList, available, borrowedOn, dueDate: due, today })
  const shown = members.filter((m) => m.name.toLowerCase().includes(search.trim().toLowerCase()))
  const total = unitsPicked(pickedList)

  const toggle = (id) => setPicked((p) => {
    const next = { ...p }
    if (id in next) delete next[id]
    else next[id] = '1'
    return next
  })
  const setUnits = (id, value) => setPicked((p) => ({ ...p, [id]: value }))

  return (
    <ActionForm
      title="Lend equipment" subtitle="Record who borrowed it, for members who cannot request it themselves" onClose={onClose}
      submitLabel={pickedList.length > 1 ? `Record ${pickedList.length} borrowers` : 'Record borrower'}
      disabled={lendable.length === 0 || members.length === 0 || Boolean(problem)}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/equipment/${line.id}/lend-many/`, lendManyBody(pickedList, { dueDate: due, borrowedOn }))
        showToast(lendManySummary(line.equipment_name, pickedList), 'success')
        onDone()
      }}
    >
      {lendable.length === 0 ? (
        <p className="text-[13px] text-[#7A8E7A]">No equipment in Good condition is available to lend right now.</p>
      ) : members.length === 0 ? (
        <p className="text-[13px] text-[#7A8E7A]">The organization has no active members to lend to.</p>
      ) : (
        <>
          <div>
            <label className={LABEL} htmlFor="lm-equipment">Equipment</label>
            <select id="lm-equipment" className={baseInputClasses} value={lineId} onChange={(e) => setLineId(e.target.value)} required>
              {lendable.map((l) => <option key={l.id} value={l.id}>{lineLabel(l, sameName || lendable.filter((x) => x.equipment_name === l.equipment_name).length > 1)}</option>)}
            </select>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={LABEL} htmlFor="lm-borrowed">Date borrowed</label>
              <input id="lm-borrowed" type="date" className={baseInputClasses} value={borrowedOn} max={today} onChange={(e) => setBorrowedOn(e.target.value)} required />
            </div>
            <div>
              <label className={LABEL} htmlFor="lm-due">Return by (optional)</label>
              <input id="lm-due" type="date" className={baseInputClasses} value={due} min={borrowedOn || undefined} onChange={(e) => setDue(e.target.value)} />
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-end justify-between gap-2">
              <span className={`${LABEL} !mb-0`} id="lm-members-label">Members who borrowed it</span>
              <span className={`text-[12px] font-medium ${total > available ? 'text-rose-700' : 'text-[#7A8E7A]'}`} role="status">
                {pickedList.length} chosen · {total} of {available} unit{available === 1 ? '' : 's'}
              </span>
            </div>
            <div className="relative mb-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A8BCA8]" aria-hidden="true" />
              <input type="text" className={`${baseInputClasses} pl-8`} placeholder="Search member…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search member" />
            </div>
            <ul aria-labelledby="lm-members-label" className="max-h-64 divide-y divide-[#EEF2EE] overflow-y-auto rounded-lg border border-[#E2E8E2]">
              {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-[#7A8E7A]">No member matches.</li>}
              {shown.map((m) => {
                const on = m.id in picked
                return (
                  <li key={m.id} className="flex min-h-[44px] items-center justify-between gap-3 px-3 py-1.5">
                    <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2.5">
                      <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#1B4D2E]" checked={on} onChange={() => toggle(m.id)} />
                      <span className="truncate text-[13px] text-[#1A2B1A]">{m.name}</span>
                    </label>
                    {on && (
                      <span className="flex shrink-0 items-center gap-1.5">
                        <label className="text-[12px] text-[#7A8E7A]" htmlFor={`lm-units-${m.id}`}>Units</label>
                        <input id={`lm-units-${m.id}`} type="number" min={1} step={1} className={`${baseInputClasses} !w-20 text-right`} value={picked[m.id]}
                          onChange={(e) => setUnits(m.id, e.target.value)} />
                      </span>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>

          {problem && pickedList.length > 0 && <p className="text-[12px] font-medium text-rose-700" data-testid="lend-problem">{problem}</p>}
        </>
      )}
    </ActionForm>
  )
}
