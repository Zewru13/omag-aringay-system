import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import { labelCls } from './ReportParts.jsx'
import { RecordPicker } from './RegisteredReportTab.jsx'

const PATH = '/reports/organization-assistance/'

// `pickerKind` is the kind the registered-records picker uses to list that kind's organizations.
const KINDS = [
  { id: 'farmers',    label: 'Farmers Organizations',    pickerKind: 'farmers_orgs',    one: 'farmers organization',
    types: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'] },
  { id: 'fisherfolk', label: 'Fisherfolk Organizations', pickerKind: 'fisherfolk_orgs', one: 'fisherfolk organization',
    types: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'] },
]

const STATUSES = [['confirmed', 'Confirmed'], ['awaiting', 'Awaiting confirmation'], ['follow_up', 'Needs follow-up']]
const NO_FILTERS = { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '', search: '' }

const pill = (active) => `rounded-lg border px-3 py-2 text-[13px] font-medium transition-colors max-md:min-h-[40px] ${
  active ? 'border-[#1B4D2E] bg-[#1B4D2E] text-white' : 'border-[#C8D5C8] bg-white text-[#4A5E4A] hover:bg-[#F5F7F5]'
}`

// Report 6: the assistance organizations distributed to their members, for every organization of a kind (with filters) or for
// one organization (its distributions and each recipient).
export default function OrganizationAssistanceReportTab() {
  const [kind, setKind] = useState('farmers')
  const [scope, setScope] = useState('all')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [picked, setPicked] = useState(null)
  const [agencies, setAgencies] = useState([])
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const current = KINDS.find(k => k.id === kind)

  useEffect(() => {
    let alive = true
    api.get('/interventions/agencies/')
      .then(res => { if (alive) setAgencies((Array.isArray(res.data) ? res.data : res.data.results || []).map(a => a.name)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const chooseKind = (id) => { setKind(id); setPicked(null); set('assistance_type', '') }
  const all = scope === 'all'
  const params = { kind, ...filters, ...(all ? {} : { id: picked?.id, search: '' }) }
  const stem = all ? `${kind}_organization_assistance` : `${kind}_organization_assistance_${picked?.id ?? 'one'}`
  const activeCount = ['date_from', 'date_to', 'assistance_type', 'source_agency', 'status'].filter(k => filters[k]).length

  const filterFields = (
    <>
      <div className="max-md:w-full">
        <label className={labelCls}>Given From</label>
        <input type="date" className={baseInputClasses} value={filters.date_from} max={filters.date_to || undefined} onChange={e => set('date_from', e.target.value)} />
      </div>
      <div className="max-md:w-full">
        <label className={labelCls}>Given To</label>
        <input type="date" className={baseInputClasses} value={filters.date_to} min={filters.date_from || undefined} onChange={e => set('date_to', e.target.value)} />
      </div>
      <div className="max-md:w-full">
        <label className={labelCls}>Assistance Type</label>
        <select className={baseInputClasses} value={filters.assistance_type} onChange={e => set('assistance_type', e.target.value)}>
          <option value="">All Types</option>
          {current.types.map(t => <option key={t} value={t}>{t}</option>)}
        </select>
      </div>
      <div className="max-md:w-full">
        <label className={labelCls}>Source Agency</label>
        <select className={baseInputClasses} value={filters.source_agency} onChange={e => set('source_agency', e.target.value)}>
          <option value="">All Agencies</option>
          {agencies.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
      </div>
      <div className="max-md:w-full">
        <label className={labelCls}>Status</label>
        <select className={baseInputClasses} value={filters.status} onChange={e => set('status', e.target.value)}>
          <option value="">All</option>
          {STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </>
  )

  return (
    <DocumentReport
      path={PATH}
      params={params}
      stem={stem}
      ready={all || Boolean(picked)}
      notReady={`Choose a ${current.one} above to see its assistance.`}
      emptyText="No organization assistance matches these filters."
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
            <p className={labelCls}>Organizations</p>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Organizations">
              <button type="button" aria-pressed={all} className={pill(all)} onClick={() => setScope('all')}>All organizations</button>
              <button type="button" aria-pressed={!all} className={pill(!all)} onClick={() => setScope('one')}>One organization</button>
            </div>
          </div>

          {!all && <RecordPicker key={kind} kind={current.pickerKind} label={current.one} picked={picked} onPick={setPicked} />}

          {all ? (
            <FilterPanel
              search={filters.search}
              onSearchChange={v => set('search', v)}
              searchPlaceholder="Search organization name"
              activeCount={activeCount}
              className=""
            >
              {filterFields}
            </FilterPanel>
          ) : (
            picked && <FilterPanel activeCount={activeCount} className="">{filterFields}</FilterPanel>
          )}
        </div>
      )}
    />
  )
}
