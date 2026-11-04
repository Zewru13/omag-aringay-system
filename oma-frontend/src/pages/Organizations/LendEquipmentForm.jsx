import { useMemo, useRef } from 'react'
import { Plus, Search, Trash2 } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { canPickMore, lendBody, lendProblem, lendSummary, maxUnitsFor, unitsLeft, unitsPicked } from '../../utils/lendMany.js'
import { todayISO } from '../../utils/localDate.js'
import { unitsSummary } from '../../utils/equipmentLoans.js'
import { ActionForm } from './EquipmentActionDialogs.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'

// "Lend equipment" on the Borrowed tab: the organization reports that members borrowed equipment, for the members who have no account to
// request it themselves. Each section is one kind of equipment with the members who borrowed it (each with their own number of units); add
// another section to lend a different kind, so one member can borrow several kinds. Once every unit of a kind is given out, no other member
// can be chosen for it. Everything is saved together as Borrowed loans, or nothing is.
//   lines: the organization's equipment lines (only Good ones with units left are offered); members: [{ id: person id, name }]
const LABEL = 'mb-1 block text-[12px] font-medium text-[#4A5A4C]'

const lineLabel = (line, many) => {
  const { available } = unitsSummary(line)
  const acquired = many && line.acquisition_date ? ` (acquired ${String(line.acquisition_date).slice(0, 4)})` : ''
  return `${line.equipment_name}${acquired} — ${available} available`
}

const asList = (picked) => Object.entries(picked).map(([member, quantity]) => ({ member, quantity }))

export default function LendEquipmentForm({ type, organizationId, lines, members, onClose, onDone }) {
  const { showToast } = useToast()
  const today = todayISO()
  const lendable = useMemo(() => lines.filter((l) => l.condition === 'Good' && unitsSummary(l).available > 0), [lines])
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`lend-equipment:${type}:${organizationId}`)
  const [kinds, setKinds] = useDraftField(draft, 'kinds', () => [{ key: 1, lineId: lendable[0] ? String(lendable[0].id) : '', picked: {}, search: '' }])
  // New kinds continue after the ones a restored draft already has.
  const nextKey = useRef(Math.max(1, ...kinds.map((k) => k.key)) + 1)
  const [borrowedOn, setBorrowedOn] = useDraftField(draft, 'borrowedOn', today)

  const lineOf = (kind) => lendable.find((l) => String(l.id) === kind.lineId)
  const usedElsewhere = (kind) => new Set(kinds.filter((k) => k.key !== kind.key).map((k) => k.lineId))
  const freeLines = lendable.filter((l) => !kinds.some((k) => k.lineId === String(l.id)))
  const patch = (key, change) => setKinds((all) => all.map((k) => (k.key === key ? { ...k, ...change } : k)))

  const forCheck = kinds.map((k) => ({ equipment: lineOf(k)?.id, name: lineOf(k)?.equipment_name, picked: asList(k.picked), available: lineOf(k) ? unitsSummary(lineOf(k)).available : 0 }))
  const problem = lendProblem({ kinds: forCheck, borrowedOn, today })
  const anyPicked = forCheck.some((k) => k.picked.length > 0)
  const people = new Set(forCheck.flatMap((k) => k.picked.map((p) => p.member))).size

  const toggle = (kind, id, available) => {
    const next = { ...kind.picked }
    if (id in next) delete next[id]
    else if (canPickMore(available, asList(next))) next[id] = '1'
    patch(kind.key, { picked: next })
  }
  const addKind = () => {
    if (freeLines.length === 0) return
    setKinds((all) => [...all, { key: nextKey.current++, lineId: String(freeLines[0].id), picked: {}, search: '' }])
  }

  return (
    <ActionForm
      draft={draft}
      title="Lend equipment" subtitle="Record who borrowed what, for members who cannot request it themselves" onClose={onClose}
      submitLabel={anyPicked ? `Record ${forCheck.reduce((n, k) => n + k.picked.length, 0)} borrowed item${forCheck.reduce((n, k) => n + k.picked.length, 0) === 1 ? '' : 's'}` : 'Record borrowed'}
      disabled={lendable.length === 0 || members.length === 0 || Boolean(problem)}
      onSubmit={async () => {
        await api.post(`/organizations/${type}/${organizationId}/equipment-lend/`, lendBody(forCheck, { borrowedOn }))
        showToast(lendSummary(forCheck), 'success')
        draft.clear()
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
            <label className={LABEL} htmlFor="lm-borrowed">Date borrowed</label>
            <input id="lm-borrowed" type="date" className={baseInputClasses} value={borrowedOn} max={today} onChange={(e) => setBorrowedOn(e.target.value)} required />
          </div>

          {kinds.map((kind, index) => {
            const line = lineOf(kind)
            const available = line ? unitsSummary(line).available : 0
            const picked = asList(kind.picked)
            const left = unitsLeft(available, picked)
            const full = !canPickMore(available, picked)
            const choices = lendable.filter((l) => !usedElsewhere(kind).has(String(l.id)))
            const shown = members.filter((m) => m.name.toLowerCase().includes(kind.search.trim().toLowerCase()))
            return (
              <section key={kind.key} aria-label={`Equipment ${index + 1}`} className="space-y-3 rounded-xl border border-[#E2E8E2] bg-[#FAFBFA] p-3">
                <div className="flex items-end gap-2">
                  <div className="min-w-0 flex-1">
                    <label className={LABEL} htmlFor={`lm-equipment-${kind.key}`}>{kinds.length > 1 ? `Equipment ${index + 1}` : 'Equipment'}</label>
                    <select id={`lm-equipment-${kind.key}`} className={baseInputClasses} value={kind.lineId}
                      onChange={(e) => patch(kind.key, { lineId: e.target.value, picked: {} })} required>
                      {choices.map((l) => <option key={l.id} value={l.id}>{lineLabel(l, lendable.filter((x) => x.equipment_name === l.equipment_name).length > 1)}</option>)}
                    </select>
                  </div>
                  {kinds.length > 1 && (
                    <button type="button" onClick={() => setKinds((all) => all.filter((k) => k.key !== kind.key))} title="Remove this equipment"
                      className="mb-0.5 inline-flex min-h-10 items-center rounded-md px-2 text-rose-500 hover:bg-rose-50" aria-label={`Remove equipment ${index + 1}`}>
                      <Trash2 size={15} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div>
                  <div className="mb-1 flex items-end justify-between gap-2">
                    <span className={`${LABEL} !mb-0`} id={`lm-members-label-${kind.key}`}>Members who borrowed it</span>
                    <span className={`text-[12px] font-medium ${full ? 'text-[#8A5207]' : 'text-[#7A8E7A]'}`} role="status">
                      {picked.length} chosen · {unitsPicked(picked)} of {available} unit{available === 1 ? '' : 's'}{full && picked.length > 0 ? ' · all given out' : ''}
                    </span>
                  </div>
                  <div className="relative mb-2">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#A8BCA8]" aria-hidden="true" />
                    <input type="text" className={`${baseInputClasses} pl-8`} placeholder="Search member…" value={kind.search} onChange={(e) => patch(kind.key, { search: e.target.value })} aria-label="Search member" />
                  </div>
                  <ul aria-labelledby={`lm-members-label-${kind.key}`} className="max-h-56 divide-y divide-[#EEF2EE] overflow-y-auto rounded-lg border border-[#E2E8E2] bg-white">
                    {shown.length === 0 && <li className="px-3 py-3 text-[13px] text-[#7A8E7A]">No member matches.</li>}
                    {shown.map((m) => {
                      const on = m.id in kind.picked
                      const blocked = !on && full
                      return (
                        <li key={m.id} className={`flex min-h-[44px] items-center justify-between gap-3 px-3 py-1.5 ${blocked ? 'opacity-50' : ''}`}>
                          <label className={`flex min-w-0 flex-1 items-center gap-2.5 ${blocked ? 'cursor-not-allowed' : 'cursor-pointer'}`}>
                            <input type="checkbox" className="h-4 w-4 shrink-0 accent-[#1B4D2E]" checked={on} disabled={blocked} onChange={() => toggle(kind, m.id, available)} />
                            <span className="truncate text-[13px] text-[#1A2B1A]">{m.name}</span>
                          </label>
                          {on && (
                            <span className="flex shrink-0 items-center gap-1.5">
                              <label className="text-[12px] text-[#7A8E7A]" htmlFor={`lm-units-${kind.key}-${m.id}`}>Units</label>
                              <input id={`lm-units-${kind.key}-${m.id}`} type="number" min={1} max={maxUnitsFor(available, picked, m.id)} step={1}
                                className={`${baseInputClasses} !w-20 text-right`} value={kind.picked[m.id]}
                                onChange={(e) => patch(kind.key, { picked: { ...kind.picked, [m.id]: e.target.value } })} />
                            </span>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                  {full && left === 0 && <p className="mt-1 text-[12px] text-[#8A5207]">Every unit of this equipment is given out, so no other member can be chosen for it.</p>}
                </div>
              </section>
            )
          })}

          <button type="button" onClick={addKind} disabled={freeLines.length === 0}
            className="inline-flex min-h-10 items-center gap-1.5 self-start rounded-lg border border-[#1B4D2E]/30 bg-[#EBF5EE]/50 px-3 text-[13px] font-semibold text-[#1B4D2E] hover:bg-[#EBF5EE] disabled:cursor-not-allowed disabled:opacity-50">
            <Plus size={14} aria-hidden="true" /> Lend another equipment
          </button>
          {freeLines.length === 0 && kinds.length > 1 && <p className="text-[12px] text-[#7A8E7A]">Every available equipment is already in this form.</p>}

          {anyPicked && <p className="text-[12px] text-[#7A8E7A]">{people} member{people === 1 ? '' : 's'} in all.</p>}
          {problem && anyPicked && <p className="text-[12px] font-medium text-rose-700" data-testid="lend-problem">{problem}</p>}
        </>
      )}
    </ActionForm>
  )
}
