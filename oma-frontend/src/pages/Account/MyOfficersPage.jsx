import { useMemo, useState } from 'react'
import { History, UserCog } from 'lucide-react'
import Button from '../../components/UI/Button.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import { AssignOfficerModal, EndTermModal, OfficerHistoryModal } from '../Organizations/OrganizationDetailPage.jsx'
import AccountPage from './AccountPage.jsx'
import { officerRows } from './myOrganization.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'
import useMyOrganization from './useMyOrganization.js'

// An organization account's Officers page (under More): who holds each position now, President first. Assign officer, End term early
// and Officer history are the existing windows.
const COLUMNS = [
  { key: 'full_name', label: 'Name', phone: 'title' },
  { key: 'position', label: 'Position' },
  { key: 'start', label: 'Term start', render: (o) => formatDate(o.term_start_date) },
  { key: 'end', label: 'Term end', phone: 'hide', render: (o) => formatDate(o.term_end_date) },
  {
    key: 'member', label: 'Member', phone: 'badge',
    // An officer who is not a member cannot receive assistance through the organization, so that one is flagged.
    render: (o) => (o.is_member === false ? <StatusBadge tone="amber">Not a member</StatusBadge> : 'Yes'),
  },
]

export default function MyOfficersPage() {
  const { org, state, reload, retry, domain, id } = useMyOrganization()
  const [open, setOpen] = useState(null)     // { kind: 'assign' | 'history' | 'end', officer? }
  const rows = useMemo(() => officerRows(org), [org])
  const close = () => setOpen(null)

  return (
    <AccountPage
      title="Officers"
      helper="Who holds each position in your organization now."
      action={(
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" icon={History} onClick={() => setOpen({ kind: 'history' })}>Officer history</Button>
          <Button icon={UserCog} onClick={() => setOpen({ kind: 'assign' })}>Assign officer</Button>
        </div>
      )}
    >
      <RecordList
        columns={COLUMNS}
        rows={rows}
        state={state}
        onRetry={retry}
        what="your officers"
        actions={(officer) => [{ label: 'End term early', onClick: () => setOpen({ kind: 'end', officer }) }]}
        empty={{ title: 'No officers yet', hint: 'Assign your organization’s officers from its active members.' }}
      />

      {open?.kind === 'assign' && org && (
        <AssignOfficerModal
          type={domain.type}
          organizationId={id}
          existingOfficers={org.officers || []}
          members={(org.members || []).filter((m) => m.is_active !== false)}
          own
          onClose={close}
          onSuccess={reload}
        />
      )}
      {open?.kind === 'end' && (
        <EndTermModal
          type={domain.type}
          officer={{ id: open.officer.id, position: open.officer.position, name: open.officer.full_name }}
          onClose={close}
          onSuccess={reload}
        />
      )}
      {open?.kind === 'history' && <OfficerHistoryModal history={org?.officer_history || []} onClose={close} />}
    </AccountPage>
  )
}
