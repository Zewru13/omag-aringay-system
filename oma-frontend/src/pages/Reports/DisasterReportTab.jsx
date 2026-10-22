import { useState } from 'react'
import BarangaySelect from '../../components/UI/BarangaySelect.jsx'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import { labelCls } from './ReportParts.jsx'

// The disaster types each kind of log can hold (the values are what the logs store).
const KINDS = {
  fisheries: {
    path: '/reports/disasters/fisheries/',
    stem: 'fisheries_disaster_reports',
    searchPlaceholder: 'Search fisherfolk, species, type or reference no.',
    emptyText: 'No fisheries disaster reports match these filters.',
    types: [
      ['Fish Kill', 'Fish Kill'], ['Disease Outbreak', 'Disease Outbreak'], ['Flood', 'Flood'], ['Flooding', 'Flooding'],
      ['Storm Surge', 'Storm Surge'], ['Typhoon', 'Typhoon'], ['Drought', 'Drought'], ['El Nino Drought', 'El Niño / Drought'],
      ['Red Tide', 'Red Tide'], ['Predator Attack', 'Predator Attack'], ['Pollution Incident', 'Pollution Incident'], ['Other', 'Other'],
    ],
  },
  crops: {
    path: '/reports/disasters/crops/',
    stem: 'crop_disaster_reports',
    searchPlaceholder: 'Search farmer, crop, type or reference no.',
    emptyText: 'No crop disaster reports match these filters.',
    types: [
      ['Drought', 'Drought'], ['Flood', 'Flood'], ['Typhoon', 'Typhoon'], ['Strong Winds', 'Strong Winds'],
      ['Pest Outbreak', 'Pest Outbreak'], ['Other', 'Other'],
    ],
  },
}

const NO_FILTERS = { date_from: '', date_to: '', barangay: '', disaster_type: '', status: '', search: '' }

// Reports 4 and 5: the disaster reports already logged (Admin > Disaster), as one filtered document. `kind` is
// 'fisheries' or 'crops'.
export default function DisasterReportTab({ kind }) {
  const config = KINDS[kind]
  const [filters, setFilters] = useState(NO_FILTERS)
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const activeCount = ['date_from', 'date_to', 'barangay', 'disaster_type', 'status'].filter(k => filters[k]).length

  return (
    <DocumentReport
      path={config.path}
      params={filters}
      stem={config.stem}
      emptyText={config.emptyText}
      filters={(
        <div className="print:hidden">
          <FilterPanel
            search={filters.search}
            onSearchChange={v => set('search', v)}
            searchPlaceholder={config.searchPlaceholder}
            activeCount={activeCount}
            className=""
          >
            <div className="max-md:w-full">
              <label className={labelCls}>Occurred From</label>
              <input type="date" className={baseInputClasses} value={filters.date_from} max={filters.date_to || undefined} onChange={e => set('date_from', e.target.value)} />
            </div>
            <div className="max-md:w-full">
              <label className={labelCls}>Occurred To</label>
              <input type="date" className={baseInputClasses} value={filters.date_to} min={filters.date_from || undefined} onChange={e => set('date_to', e.target.value)} />
            </div>
            <div className="w-full sm:w-44">
              <label className={labelCls}>Barangay</label>
              <BarangaySelect value={filters.barangay} onChange={e => set('barangay', e.target.value)} includeAllOption />
            </div>
            <div className="max-md:w-full">
              <label className={labelCls}>Disaster Type</label>
              <select className={baseInputClasses} value={filters.disaster_type} onChange={e => set('disaster_type', e.target.value)}>
                <option value="">All Types</option>
                {config.types.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </div>
            <div className="max-md:w-full">
              <label className={labelCls}>Status</label>
              <select className={baseInputClasses} value={filters.status} onChange={e => set('status', e.target.value)}>
                <option value="">All</option>
                <option value="Active">Active</option>
                <option value="Recovered">Recovered</option>
              </select>
            </div>
          </FilterPanel>
        </div>
      )}
    />
  )
}
