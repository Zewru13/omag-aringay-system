import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import DocumentReport from './DocumentReport.jsx'
import OrgAssistanceFilterFields from './OrgAssistanceFilterFields.jsx'
import { labelCls } from './ReportParts.jsx'
import { NO_ORG_ASSISTANCE_FILTERS, ORG_ASSISTANCE_PATH, ORG_KINDS, activeOrgFilterCount, orgKind, orgReportParams, orgReportStem } from './orgAssistanceReport.js'

const NO_FILTERS = { ...NO_ORG_ASSISTANCE_FILTERS, search: '' }

// Report 6: the assistance organizations distributed to their members, for every organization of a kind that matches the search and the
// filters, with the members who received it by name. One organization's own report (its distributions and each recipient) comes from
// clicking one of its rows in the preview, or from a search that leaves exactly one organization (the backend decides that:
// individual=auto); changing the search or a filter goes back to the list. Individual Farmers / Individual Fisherfolk report the assistance
// given directly to people, not through an organization; there the search is the person's name and no row opens an organization.
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
  const stem = orgReportStem(kind)

  return (
    <DocumentReport
      reportId="organization_assistance"
      path={ORG_ASSISTANCE_PATH}
      params={orgReportParams(kind, filters, picked)}
      stem={picked && !current.individual ? `${stem}_${picked.id}` : stem}
      emptyText={current.individual ? 'No assistance given directly matches these filters.' : 'No organization assistance matches these filters.'}
      picked={current.individual ? null : picked}
      onPickRow={current.individual ? undefined : setPicked}
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
            searchPlaceholder={current.searchPlaceholder}
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
