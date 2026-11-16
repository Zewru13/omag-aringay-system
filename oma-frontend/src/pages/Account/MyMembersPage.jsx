import { useMemo, useState } from 'react'
import { Upload, UserPlus } from 'lucide-react'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import Button from '../../components/UI/Button.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import { AddMemberModal } from '../Organizations/OrganizationDetailPage.jsx'
import { heldPositions } from '../Organizations/positionRules.js'
import AccountPage from './AccountPage.jsx'
import { searchRows } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { MEMBER_SECTIONS, memberText } from './myOrganization.js'
import RecordList from './RecordList.jsx'
import useMyOrganization from './useMyOrganization.js'

// An organization account's Members page: everyone in the organization, active members first. Add member and Import members are the
// existing windows. The backend gives the organization only its own record.
export default function MyMembersPage() {
  const { org, state, reload, retry, domain, id } = useMyOrganization()
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)     // 'add' | 'import'

  const members = useMemo(() => org?.members || [], [org])
  const rows = useMemo(
    () => searchRows(members, search, (m) => memberText(m, domain)).sort((a, b) => String(a[domain.nameField]).localeCompare(String(b[domain.nameField]))),
    [members, search, domain],
  )
  const columns = [
    { key: 'name', label: 'Name', phone: 'title', render: (m) => m[domain.nameField] },
    { key: 'rsbsa', label: 'RSBSA no.', phone: 'hide', render: (m) => m[domain.idField] },
    { key: 'position', label: 'Position' },
    { key: 'joined', label: 'Date joined', render: (m) => formatDate(m.date_joined) },
    { key: 'main', label: 'Main organization', phone: 'hide', render: (m) => (m.is_main ? 'Yes' : 'No') },
  ]
  const close = () => setOpen(null)

  return (
    <AccountPage
      title="Members"
      helper="Everyone in your organization."
      action={(
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" icon={Upload} onClick={() => setOpen('import')}>Import</Button>
          <Button icon={UserPlus} onClick={() => setOpen('add')}>Add member</Button>
        </div>
      )}
    >
      {state === 'ready' && members.length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search name, RSBSA no. or position" />}
      <RecordList
        columns={columns}
        rows={rows}
        sections={MEMBER_SECTIONS}
        state={state}
        onRetry={retry}
        what="your members"
        empty={search.trim()
          ? { title: 'No member matches', hint: 'Try another word.' }
          : { title: 'No members yet', hint: `Add the registered ${domain.personLabel} who belong to your organization.` }}
      />

      {open === 'add' && org && (
        <AddMemberModal
          type={domain.type}
          organizationId={id}
          organizationName={org.name}
          own
          held={heldPositions(org.officers || [], members.filter((m) => m.is_active !== false))}
          onClose={close}
          onSuccess={reload}
        />
      )}
      {open === 'import' && org && (
        <ImportFileModal
          title="Import Members"
          subtitle={`Add already-registered ${domain.personLabel} to ${org.name} from a spreadsheet.`}
          importUrl={`/organizations/${domain.type}/${id}/members/import/`}
          templateUrl={`/organizations/${domain.type}/${id}/members/import/template/`}
          templateFilename={`${domain.type}_organization_members_import_template.xlsx`}
          undoType={`${domain.type}_org_members`}
          onClose={close}
          onImported={reload}
        />
      )}
    </AccountPage>
  )
}
