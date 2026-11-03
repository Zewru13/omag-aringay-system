import { useEffect, useState } from 'react'
import { Users } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PaginationBar from '../../components/UI/PaginationBar.jsx'
import SearchBar from '../../components/UI/SearchBar.jsx'
import useDebouncedValue from '../../hooks/useDebouncedValue.js'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { positionLabel, takenForLine } from './positionRules.js'
import { MEMBER_POSITIONS } from './registrationMembers.js'

// "Add Members" on the organization forms: a table of the registered farmers (or fisherfolk) who are not members of this organization yet. Search,
// tick the ones to add and choose each one's position (Member, or an officer position), then Add. Nothing is saved here: the chosen people go to the
// form's list and are saved with the organization. `organizationId` is the organization being edited (null while it is being registered);
// `taken` are the ids already in the form's list, which are not offered again.
const PAGE_SIZE = 10
const TH = 'whitespace-nowrap px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-[#4A5E4A]'

export default function MembersPickerModal({ type, organizationId = null, taken = [], held = new Set(), onAdd, onClose }) {
  const farmers = type === 'farmers'
  const noun = farmers ? 'farmers' : 'fisherfolk'
  const [search, setSearch] = useState('')
  const debounced = useDebouncedValue(search, 300)
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ rows: [], count: 0, loading: true, failed: false })
  const [chosen, setChosen] = useState({})   // person id -> { person, position }

  useEffect(() => {
    let alive = true
    const params = { page, page_size: PAGE_SIZE, ...(debounced.trim() ? { search: debounced.trim() } : {}), ...(organizationId ? { not_member_of: organizationId } : {}) }
    api.get(farmers ? '/farmers/' : '/fisheries/fisherfolk/', { params })
      .then((r) => {
        if (!alive) return
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setState({ rows: list, count: Array.isArray(r.data) ? list.length : (r.data.count ?? list.length), loading: false, failed: false })
      })
      .catch(() => alive && setState({ rows: [], count: 0, loading: false, failed: true }))
    return () => { alive = false }
  }, [farmers, debounced, page, organizationId])

  const shown = state.rows.filter((p) => !taken.includes(p.id))
  const picked = Object.values(chosen)
  const toggle = (person, on) => setChosen((c) => {
    const next = { ...c }
    if (on) next[person.id] = { person, position: 'Member' }
    else delete next[person.id]
    return next
  })
  const setPosition = (id, position) => setChosen((c) => ({ ...c, [id]: { ...c[id], position } }))

  return (
    <ModalShell
      title="Add Members"
      subtitle={`Choose the registered ${noun} to add. Only those who are not members of this organization are listed.`}
      icon={Users}
      onClose={onClose}
      maxWidth="max-w-4xl"
      footer={(
        <>
          <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
          <Button type="button" disabled={picked.length === 0} onClick={() => onAdd(picked)}>
            {picked.length ? `Add ${picked.length} selected` : 'Add selected'}
          </Button>
        </>
      )}
    >
      <div className="space-y-3">
        <div className="flex items-center rounded-xl border border-slate-300 bg-white">
          <SearchBar value={search} onChange={(v) => { setSearch(v); setPage(1) }} placeholder={`Search ${noun} by name or RSBSA number…`} />
        </div>
        <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
          <table className="w-full min-w-[40rem] text-sm" aria-label={`Registered ${noun} who are not members`}>
            <thead className="bg-[#F0F4F0]">
              <tr><th className={`${TH} w-10`} /><th className={TH}>Name</th><th className={TH}>RSBSA No.</th><th className={TH}>Barangay</th><th className={TH}>Position</th></tr>
            </thead>
            <tbody>
              {state.loading && <tr><td colSpan={5} className="px-3 py-8 text-center text-[13px] text-slate-500">Loading…</td></tr>}
              {state.failed && <tr><td colSpan={5} className="px-3 py-8 text-center text-[13px] text-rose-600" role="alert">The list could not be loaded. Please try again.</td></tr>}
              {!state.loading && !state.failed && shown.length === 0 && (
                <tr><td colSpan={5} className="px-3 py-8 text-center text-[13px] text-slate-500">No {noun} to add{debounced.trim() ? ' match that search' : ''}.</td></tr>
              )}
              {shown.map((p) => {
                const entry = chosen[p.id]
                return (
                  <tr key={p.id} className={`border-t border-[#F0F4F0] ${entry ? 'bg-[#F6FAF7]' : ''}`}>
                    <td className="px-3 py-2">
                      <input type="checkbox" className="h-4 w-4 accent-[#1B4D2E]" checked={Boolean(entry)} onChange={(e) => toggle(p, e.target.checked)} aria-label={`Select ${p.full_name}`} />
                    </td>
                    <td className="px-3 py-2 text-[13px] font-medium text-[#1A2B1A]">{p.full_name}</td>
                    <td className="px-3 py-2 text-[13px] text-[#4A5E4A]">{p.rsbsa_number}</td>
                    <td className="px-3 py-2 text-[13px] text-[#4A5E4A]">{p.barangay || '—'}</td>
                    <td className="w-48 px-3 py-2">
                      {entry
                        ? (
                          <select className={baseInputClasses} value={entry.position} aria-label={`Position of ${p.full_name}`} onChange={(e) => setPosition(p.id, e.target.value)}>
                            {MEMBER_POSITIONS.map((pos) => { const off = takenForLine(held, picked.map((x) => ({ _uid: x.person.id, position: x.position })), p.id); return <option key={pos} value={pos} disabled={pos !== 'Member' && off.has(pos)}>{positionLabel(pos, off)}</option> })}
                          </select>
                        )
                        : <span className="text-[#A8BCA8]">—</span>}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <PaginationBar page={page} totalCount={state.count} pageSize={PAGE_SIZE} onPageChange={setPage} />
      </div>
    </ModalShell>
  )
}
