import { useState } from 'react'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import { labelCls } from './ReportParts.jsx'
import { individualParams } from './reportPaper.js'

const PATH = '/reports/registered/'

const KINDS = [
  { id: 'farmers',         label: 'Farmers',                  stem: 'registered_farmers' },
  { id: 'fisherfolk',      label: 'Fisherfolk',               stem: 'registered_fisherfolk' },
  { id: 'farmers_orgs',    label: 'Farmers Organizations',    stem: 'registered_farmers_organizations' },
  { id: 'fisherfolk_orgs', label: 'Fisherfolk Organizations', stem: 'registered_fisherfolk_organizations' },
]

const NO_FILTERS = { barangay: '', registered_from: '', registered_to: '', search: '' }

// Report 1: Registered Farmers / Fisherfolk / Organizations. The report lists everyone that matches the search and the filters. One record's
// individual report comes from clicking its row in the preview, or from a search that leaves exactly one record (the backend decides that:
// individual=auto); changing the search or a filter goes back to the list.
export default function RegisteredReportTab() {
  const [kind, setKind] = useState('farmers')
  const [filters, setFilters] = useState(NO_FILTERS)
  const [picked, setPicked] = useState(null)
  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPicked(null) }
  const current = KINDS.find(k => k.id === kind)

  const chooseKind = (id) => { setKind(id); setPicked(null) }

  return (
    <DocumentReport
      reportId="registered"
      path={PATH}
      params={individualParams({ kind, ...filters }, picked)}
      stem={picked ? `${current.stem}_${picked.id}` : current.stem}
      emptyText="No records match these filters."
      picked={picked}
      onPickRow={setPicked}
      onShowAll={() => setPicked(null)}
      filters={(
        <div className="space-y-4 print:hidden">
          <div className="max-w-sm">
            <label htmlFor="registered-kind" className={labelCls}>Report on</label>
            <select id="registered-kind" className={baseInputClasses} value={kind} onChange={e => chooseKind(e.target.value)}>
              {KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>

          <FilterPanel
            search={filters.search}
            onSearchChange={v => set('search', v)}
            searchPlaceholder="Search name or number"
            activeCount={['barangay', 'registered_from', 'registered_to'].filter(k => filters[k]).length}
            className=""
          >
            <div className="w-full sm:w-44">
              <label className={labelCls}>Barangay</label>
              <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
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
        </div>
      )}
    />
  )
}
