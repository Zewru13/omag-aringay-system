import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { labelCls } from './ReportParts.jsx'
import { ORG_ASSISTANCE_STATUSES } from './orgAssistanceReport.js'

// The filter boxes both Organization Assistance reports show inside their Filters panel: the dates the assistance was given, its type,
// its source agency and the status of the distribution. `types` are the assistance types of the chosen kind of organization, `agencies`
// the source agency names; `set(key, value)` changes one filter.
export default function OrgAssistanceFilterFields({ filters, set, types, agencies }) {
  return (
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
          {types.map(t => <option key={t} value={t}>{t}</option>)}
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
          {ORG_ASSISTANCE_STATUSES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
      </div>
    </>
  )
}
