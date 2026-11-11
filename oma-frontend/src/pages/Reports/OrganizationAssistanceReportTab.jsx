import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import OrgAssistanceFilterFields from './OrgAssistanceFilterFields.jsx'
import { labelCls } from './ReportParts.jsx'
import { NO_ORG_ASSISTANCE_FILTERS, ORG_ASSISTANCE_PATH, ORG_KINDS, activeOrgFilterCount, orgKind } from './orgAssistanceReport.js'
import { individualParams } from './reportPaper.js'

const NO_FILTERS = { ...NO_ORG_ASSISTANCE_FILTERS, search: '' }

// Report 6: the assistance organizations distributed to their members, for every organization of a kind that matches the search and the
// filters. One organization's own report (its distributions and each recipient) comes from clicking one of its rows in the preview, or from
// a search that leaves exactly one organization (the backend decides that: individual=auto); changing the search or a filter goes back to the list.
// (Report 7, Individual Organization Assistance, is the same report with the organization chosen from a list: IndividualOrganizationAssistanceTab.)
export default function OrganizationAssistanceReportTab() {
  const [kind, setKind] = useState(ORG_KINDS[0].id)
  const [filters, setFilters] = useState(NO_FILTERS)
  const [picked, setPicked] = useState(null)
  const [agencies, setAgencies] = useState([])
  const set = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPicked(null) }
  const current = orgKind(kind)

  useEffect(() => {
    let alive = true
    api.get('/interventions/agencies/')
      .then(res => { if (alive) setAgencies((Array.isArray(res.data) ? res.data : res.data.results || []).map(a => a.name)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  const chooseKind = (id) => { setKind(id); setPicked(null); setFilters(f => ({ ...f, assistance_type: '' })) }
  const stem = `${kind}_organization_assistance`

  return (
    <DocumentReport
      reportId="organization_assistance"
      path={ORG_ASSISTANCE_PATH}
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
              {ORG_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
            </select>
          </div>

          <FilterPanel
            search={filters.search}
            onSearchChange={v => set('search', v)}
            searchPlaceholder="Search organization name"
            activeCount={activeOrgFilterCount(filters)}
            className=""
          >
            <OrgAssistanceFilterFields filters={filters} set={set} types={current.types} agencies={agencies} />
          </FilterPanel>
        </div>
      )}
    />
  )
}
