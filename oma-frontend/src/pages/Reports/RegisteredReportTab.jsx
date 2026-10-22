import { useEffect, useState } from 'react'
import { X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import { labelCls } from './ReportParts.jsx'

const PATH = '/reports/registered/'

const KINDS = [
  { id: 'farmers',         label: 'Farmers',                  one: 'farmer',               stem: 'registered_farmers' },
  { id: 'fisherfolk',      label: 'Fisherfolk',               one: 'fisherfolk',           stem: 'registered_fisherfolk' },
  { id: 'farmers_orgs',    label: 'Farmers Organizations',    one: 'farmers organization', stem: 'registered_farmers_organizations' },
  { id: 'fisherfolk_orgs', label: 'Fisherfolk Organizations', one: 'fisherfolk organization', stem: 'registered_fisherfolk_organizations' },
]

const NO_FILTERS = { barangay: '', status: '', registered_from: '', registered_to: '', search: '' }

const pill = (active) => `rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors max-md:min-h-[40px] ${
  active ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white' : 'border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
}`

function useDebounced(value, ms = 300) {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return debounced
}

// Search-and-pick one record: the matches come from the report's own `options` list so the staff see the same people the
// report will contain.
function RecordPicker({ kind, label, picked, onPick }) {
  const [term, setTerm] = useState('')
  const debounced = useDebounced(term.trim())
  const [result, setResult] = useState({ key: null, items: [] })
  const key = `${kind}|${debounced}`
  const isLoading = result.key !== key

  useEffect(() => {
    let current = true
    api.get(PATH, { params: { kind, options: 1, search: debounced } })
      .then(res => { if (current) setResult({ key, items: res.data }) })
      .catch(() => { if (current) setResult({ key, items: [] }) })
    return () => { current = false }
  }, [kind, debounced, key])

  if (picked) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[#1B4D2E] bg-[#EBF5EE] px-4 py-3">
        <div className="min-w-0">
          <p className="text-[14px] font-semibold text-[#1B4D2E] truncate">{picked.label}</p>
          <p className="text-[12px] text-[#4A5E4A] truncate">{picked.detail}</p>
        </div>
        <button
          type="button"
          onClick={() => onPick(null)}
          aria-label={`Choose a different ${label}`}
          className="shrink-0 rounded-lg p-2 text-[#4A5E4A] hover:bg-white max-md:min-h-[40px] max-md:min-w-[40px]"
        >
          <X size={16} aria-hidden="true" />
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <label className={labelCls} htmlFor="registered-picker">Find the {label}</label>
      <input
        id="registered-picker"
        type="search"
        value={term}
        onChange={e => setTerm(e.target.value)}
        placeholder="Type a name or number"
        className={baseInputClasses}
      />
      <ul className="max-h-64 overflow-y-auto rounded-xl border border-[#E2E8E2] bg-white divide-y divide-[#F0F4F0]">
        {isLoading && <li className="px-4 py-3 text-[13px] text-[#7A8E7A]">Searching…</li>}
        {!isLoading && result.items.length === 0 && <li className="px-4 py-3 text-[13px] text-[#7A8E7A]">No matching records.</li>}
        {!isLoading && result.items.map(item => (
          <li key={item.id}>
            <button
              type="button"
              onClick={() => onPick(item)}
              className="block w-full px-4 py-2.5 text-left hover:bg-[#F5F7F5] max-md:min-h-[44px]"
            >
              <span className="block text-[13px] font-medium text-[#1A2B1A]">{item.label}</span>
              <span className="block text-[12px] text-[#7A8E7A]">{item.detail}</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

// Report 1: Registered Farmers / Fisherfolk / Organizations, for everyone at once (with filters) or for one record.
export default function RegisteredReportTab() {
  const [kind, setKind] = useState('farmers')
  const [scope, setScope] = useState('bulk')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [picked, setPicked] = useState(null)
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const current = KINDS.find(k => k.id === kind)

  const chooseKind = (id) => { setKind(id); setPicked(null) }

  const bulk = scope === 'bulk'
  const params = bulk ? { kind, ...filters } : { kind, id: picked?.id }
  const stem = bulk ? current.stem : `${current.stem}_${picked?.id ?? 'one'}`

  return (
    <DocumentReport
      path={PATH}
      params={params}
      stem={stem}
      ready={bulk || Boolean(picked)}
      notReady={`Choose a ${current.one} above to see its record.`}
      emptyText="No records match these filters."
      filters={(
        <div className="space-y-4 print:hidden">
          <div>
            <p className={labelCls}>Report on</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Report on">
              {KINDS.map(k => (
                <button key={k.id} type="button" aria-pressed={kind === k.id} className={pill(kind === k.id)} onClick={() => chooseKind(k.id)}>
                  {k.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className={labelCls}>Records</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Records">
              <button type="button" aria-pressed={bulk} className={pill(bulk)} onClick={() => setScope('bulk')}>All records (bulk)</button>
              <button type="button" aria-pressed={!bulk} className={pill(!bulk)} onClick={() => setScope('one')}>One {current.one}</button>
            </div>
          </div>

          {bulk ? (
            <FilterPanel
              search={filters.search}
              onSearchChange={v => set('search', v)}
              searchPlaceholder="Search name or number"
              activeCount={['barangay', 'status', 'registered_from', 'registered_to'].filter(k => filters[k]).length}
              className=""
            >
              <div className="w-full sm:w-44">
                <label className={labelCls}>Barangay</label>
                <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
              </div>
              <div className="max-md:w-full">
                <label className={labelCls}>Status</label>
                <select className={baseInputClasses} value={filters.status} onChange={e => set('status', e.target.value)}>
                  <option value="">All</option>
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
              <div className="max-md:w-full">
                <label className={labelCls}>Registered From</label>
                <input type="date" className={baseInputClasses} value={filters.registered_from} max={filters.registered_to || undefined} onChange={e => set('registered_from', e.target.value)} />
              </div>
              <div className="max-md:w-full">
                <label className={labelCls}>Registered To</label>
                <input type="date" className={baseInputClasses} value={filters.registered_to} min={filters.registered_from || undefined} onChange={e => set('registered_to', e.target.value)} />
              </div>
            </FilterPanel>
          ) : (
            <RecordPicker key={kind} kind={kind} label={current.one} picked={picked} onPick={setPicked} />
          )}
        </div>
      )}
    />
  )
}
