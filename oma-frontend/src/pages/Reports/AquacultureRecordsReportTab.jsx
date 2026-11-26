import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import { labelCls } from './ReportParts.jsx'
import {
  AQUACULTURE_RECORDS_PATH, AQUACULTURE_REPORT_PCIC, FILTER_OPTIONS_PATH, NO_AQUACULTURE_FILTERS, activeAquacultureFilterCount, aquacultureOptions,
} from './aquacultureRecordsReport.js'

// One labelled dropdown of the Filters panel; `children` are its options after "All".
function Pick({ label, value, onChange, all, children }) {
  return (
    <div className="max-md:w-full">
      <label className={labelCls}>{label}</label>
      <select className={baseInputClasses} value={value} onChange={e => onChange(e.target.value)}>
        <option value="">{all}</option>
        {children}
      </select>
    </div>
  )
}

// The Aquaculture Records report: every production cycle the Aquaculture Records page lists (ownership, cycle, species, fisherfolk, barangay,
// pond/cage location, culture type, organization, date stocked, PCIC insured), narrowed by the search and the filters. The preview, the PDF
// (Print Report / Download Report) and the Excel file all come from the same backend document.
export default function AquacultureRecordsReportTab() {
  const [filters, setFilters] = useState(NO_AQUACULTURE_FILTERS)
  const [options, setOptions] = useState(() => aquacultureOptions(null))
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))

  useEffect(() => {
    let alive = true
    api.get(FILTER_OPTIONS_PATH).then(res => { if (alive) setOptions(aquacultureOptions(res.data)) }).catch(() => {})
    return () => { alive = false }
  }, [])

  return (
    <DocumentReport
      reportId="aquaculture_records"
      path={AQUACULTURE_RECORDS_PATH}
      params={filters}
      stem="aquaculture_records"
      emptyText="No aquaculture records match these filters."
      filters={(
        <div className="print:hidden">
          <FilterPanel
            search={filters.search}
            onSearchChange={v => set('search', v)}
            searchPlaceholder="Search fisherfolk, RSBSA no., species, or barangay..."
            activeCount={activeAquacultureFilterCount(filters)}
            className=""
          >
            <Pick label="Fisherfolk" all="All Fisherfolk" value={filters.fisherfolk} onChange={v => set('fisherfolk', v)}>
              {options.fisherfolk.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </Pick>
            <Pick label="Species" all="All Species" value={filters.species} onChange={v => set('species', v)}>
              {options.species.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Pick>
            <Pick label="Barangay" all="All Barangays" value={filters.barangay} onChange={v => set('barangay', v)}>
              {options.barangays.map(b => <option key={b} value={b}>{b}</option>)}
            </Pick>
            <Pick label="Pond/Cage Location" all="All Locations" value={filters.pond_location} onChange={v => set('pond_location', v)}>
              {options.pond_locations.map(b => <option key={b} value={b}>{b}</option>)}
            </Pick>
            <Pick label="Ownership" all="All Ownerships" value={filters.ownership} onChange={v => set('ownership', v)}>
              {options.ownerships.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </Pick>
            <Pick label="Culture Type" all="All Types" value={filters.culture_type} onChange={v => set('culture_type', v)}>
              {options.culture_types.map(c => <option key={c} value={c}>{c}</option>)}
            </Pick>
            <Pick label="Cooperative" all="All Cooperatives" value={filters.organization} onChange={v => set('organization', v)}>
              {options.organizations.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
            </Pick>
            <Pick label="Cycle" all="All Cycles" value={filters.cycle} onChange={v => set('cycle', v)}>
              {options.cycles.map(c => <option key={c} value={c}>{c}</option>)}
            </Pick>
            <div className="max-md:w-full">
              <label className={labelCls}>PCIC Insured</label>
              <select className={baseInputClasses} value={filters.pcic} onChange={e => set('pcic', e.target.value)}>
                {AQUACULTURE_REPORT_PCIC.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div className="max-md:w-full">
              <label className={labelCls}>Stocked From</label>
              <input type="date" className={`${baseInputClasses} min-w-[9.5rem]`} value={filters.stocked_from} max={filters.stocked_to || undefined} onChange={e => set('stocked_from', e.target.value)} />
            </div>
            <div className="max-md:w-full">
              <label className={labelCls}>Stocked To</label>
              <input type="date" className={`${baseInputClasses} min-w-[9.5rem]`} value={filters.stocked_to} min={filters.stocked_from || undefined} onChange={e => set('stocked_to', e.target.value)} />
            </div>
          </FilterPanel>
        </div>
      )}
    />
  )
}
