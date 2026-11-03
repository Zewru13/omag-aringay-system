import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import { labelCls } from './ReportParts.jsx'
import { individualParams } from './reportPaper.js'

const PATH = '/reports/organization-assistance/'

const KINDS = [
  { id: 'farmers',    label: 'Farmers Organizations',
    types: ['Fertilizer', 'Seeds', 'Equipment', 'Cash Assistance', 'Training', 'Other'] },
  { id: 'fisherfolk', label: 'Fisherfolk Organizations',
    types: ['Fishing Gear', 'Boat/Vessel', 'Fingerlings/Seeds', 'Feed', 'Equipment', 'Cash Assistance', 'Training', 'Other'] },
]

const STATUSES = [['confirmed', 'Confirmed'], ['awaiting', 'Awaiting confirmation'], ['follow_up', 'Needs follow-up']]
const NO_FILTERS = { date_from: '', date_to: '', assistance_type: '', source_agency: '', status: '', search: '' }

// Report 6: the assistance organizations distributed to their members, for every organization of a kind that matches the search and the
// filters. One organization's own report (its distributions and each recipient) comes from clicking one of its rows in the preview, or from
// a search that leaves exactly one organization (the backend decides that: individual=auto); changing the search or a filter goes back to the list.
export default function OrganizationAssistanceReportTab() {
  const [kind, setKind] = useState('farmers')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [picked, setPicked] = useState(null)
  const [agencies, setAgencies] = useState([])
  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPicked(null) }
  const current = KINDS.find(k => k.id === kind)

  useEffect(() => {
    let alive = true
    api.get('/interventions/agencies/')
      .then(res => { if (alive) setAgencies((Array.isArray(res.data) ? res.data : res.data.results || []).map(a => a.name)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const chooseKind = (id) => { setKind(id); setPicked(null); setFilters(f => ({ ...f, assistance_type: '' })) }
  const stem = `${kind}_organization_assistance`
  const activeCount = ['date_from', 'date_to', 'assistance_type', 'source_agency', 'status'].filter(k => filters[k]).length

  return (
    <DocumentReport
      reportId="organization_assistance"
      path={PATH}
      params={individualParams({ kind, ...filters }, picked)}
      stem={picked ? `${stem}_${picked.id}` : stem}
      emptyText="No organization assistance matches these filters."
      picked={picked}
      onPickRow={setPicked}
      onShowAll={() => setPicked(null)}
      filters={(
        <div className="space-y-4 print:hidden">
          <div className="max-w-sm">
            <label htmlFor="assistance-kind" className={labelCls}>Report on</label>
            <select id="assistance-kind" className={baseInputClasses} value={kind} onChange={e => chooseKind(e.target.value)}>
              {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>

          <FilterPanel
            search={filters.search}
            onSearchChange={v => set('search', v)}
            searchPlaceholder="Search organization name"
            activeCount={activeCount}
            className=""
          >
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
          </FilterPanel>
        </div>
      )}
    />
  )
}
