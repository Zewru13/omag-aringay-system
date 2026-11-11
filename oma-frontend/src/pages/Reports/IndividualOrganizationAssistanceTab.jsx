import { useEffect, useState } from 'react'
import api from '../../api/axiosInstance.js'
import FilterPanel from '../../components/UI/FilterPanel.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import SearchSelect from '../../components/UI/SearchSelect.jsx'
import DocumentReport from './DocumentReport.jsx'
import OrgAssistanceFilterFields from './OrgAssistanceFilterFields.jsx'
import { labelCls } from './ReportParts.jsx'
import {
  NO_ORG_ASSISTANCE_FILTERS, ORG_ASSISTANCE_PATH, ORG_KINDS, activeOrgFilterCount, oneOrganizationParams, oneOrganizationStem,
  orgKind, organizationOptions,
} from './orgAssistanceReport.js'

// Report 7: the assistance ONE organization gave to its members - its distributions and every recipient. Choose the kind of organization,
// then the organization itself from a list you can type in; the dates, assistance type, source agency and status narrow it. It is the same
// backend report as Organization Assistance, asked for that one organization (its id), so the paper, Print Report and Download Report are
// the same as every other report. Nothing is asked until an organization is chosen.
export default function IndividualOrganizationAssistanceTab() {
  const [kind, setKind] = useState(ORG_KINDS[0].id)
  const [organization, setOrganization] = useState(null)
  const [filters, setFilters] = useState(NO_ORG_ASSISTANCE_FILTERS)
  const [lists, setLists] = useState({})        // kind -> the organizations of that kind, once loaded
  const [agencies, setAgencies] = useState([])
  const set = (k, v) => setFilters(f => ({ ...f, [k]: v }))
  const current = orgKind(kind)
  const options = lists[kind]

  useEffect(() => {
    let alive = true
    api.get('/interventions/agencies/')
      .then(res => { if (alive) setAgencies((Array.isArray(res.data) ? res.data : res.data.results || []).map(a => a.name)) })
      .catch(() => {})
    return () => { alive = false }
  }, [])

  // The organizations of the chosen kind (read once per kind).
  useEffect(() => {
    if (lists[kind]) return undefined
    let alive = true
    api.get(current.listPath)
      .then(res => { if (alive) setLists(l => ({ ...l, [kind]: organizationOptions(res.data) })) })
      .catch(() => { if (alive) setLists(l => ({ ...l, [kind]: [] })) })
    return () => { alive = false }
  }, [kind, current.listPath, lists])

  // Another kind has other organizations and other assistance types, so the choice and that filter start again.
  const chooseKind = (id) => { setKind(id); setOrganization(null); setFilters(f => ({ ...f, assistance_type: '' })) }
  const params = oneOrganizationParams({ kind, organization, filters })

  const pickers = (
    <div className="space-y-4 print:hidden">
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="one-org-kind" className={labelCls}>Kind of organization</label>
          <select id="one-org-kind" className={baseInputClasses} value={kind} onChange={e => chooseKind(e.target.value)}>
            {ORG_KINDS.map(k => <option key={k.id} value={k.id}>{k.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="one-org" className={labelCls}>Organization</label>
          <SearchSelect
            id="one-org"
            ariaLabel="Organization"
            options={options || []}
            value={organization}
            onChange={setOrganization}
            placeholder={options ? 'Type the organization name' : 'Loading organizations…'}
            noMatchText="No organization with that name."
            disabled={!options}
          />
        </div>
      </div>

      <FilterPanel activeCount={activeOrgFilterCount(filters)} className="">
        <OrgAssistanceFilterFields filters={filters} set={set} types={current.types} agencies={agencies} />
      </FilterPanel>
    </div>
  )

  if (!params) {
    return (
      <div className="space-y-5">
        {pickers}
        <p className="rounded-xl border border-dashed border-[#C8D5C8] bg-white px-4 py-10 text-center text-[13px] text-[#7A8E7A]" role="status">
          {options && options.length === 0
            ? `No ${current.label.toLowerCase()} are registered yet.`
            : 'Choose an organization to see its assistance report.'}
        </p>
      </div>
    )
  }

  return (
    <DocumentReport
      reportId="organization_assistance_individual"
      path={ORG_ASSISTANCE_PATH}
      params={params}
      stem={oneOrganizationStem(kind, organization)}
      emptyText="This organization has no assistance that matches these filters."
      filters={pickers}
    />
  )
}
