import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { HandHelping, Plus, Upload } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ImportFileModal from '../../components/ImportFileModal.jsx'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import { apiMessage, openRequestCount } from '../../utils/equipmentLoans.js'
import { ChangeConditionDialog, EquipmentHistoryDialog, LendDialog, RejectDialog, RepairDialog, ReturnDialog } from '../Organizations/EquipmentActionDialogs.jsx'
import EquipmentGroupBody from '../Organizations/EquipmentGroupBody.jsx'
import LendEquipmentForm from '../Organizations/LendEquipmentForm.jsx'
import { AddEquipmentModal } from '../Organizations/OrganizationDetailPage.jsx'
import AccountPage from './AccountPage.jsx'
import { searchRows } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { LOAN_SECTIONS, conditionText, equipmentRows, loanActions, loanStatusText, loanText, loanTone, sortLoans } from './orgEquipment.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'
import TabBar from './TabBar.jsx'
import useMyOrganization from './useMyOrganization.js'

// An organization account's Equipment page, two tabs:
//   Items  one row per kind of equipment (units, condition, on loan, available). Details opens its conditions with their actions
//          (change condition, record a repair, lend, history, remove), the existing EquipmentGroupBody.
//   Loans  every loan in sections: Requests (approve / reject), On loan (mark returned), Returned.
// Lend equipment (several members at once), Add equipment and Import are at the top. Every form is the existing window.

const ITEM_COLUMNS = [
  { key: 'label', label: 'Equipment', phone: 'title' },
  { key: 'total', label: 'Units', align: 'right', phone: 'hide' },
  { key: 'condition', label: 'Condition', render: conditionText },
  { key: 'onLoan', label: 'On loan', align: 'right', phone: 'hide' },
  { key: 'available', label: 'Available', align: 'right' },
]

const LOAN_COLUMNS = [
  { key: 'equipment_name', label: 'Equipment', phone: 'title' },
  { key: 'member_name', label: 'Borrower' },
  { key: 'quantity', label: 'Units', align: 'right', phone: 'hide' },
  { key: 'borrowed', label: 'Borrowed', render: (l) => (l.borrowed_at ? formatDate(l.borrowed_at) : null) },
  { key: 'due', label: 'Return by', phone: 'hide', render: (l) => (l.due_date ? formatDate(l.due_date) : null) },
  { key: 'status', label: 'Status', phone: 'badge', render: (l) => <StatusBadge tone={loanTone(l)}>{loanStatusText(l)}</StatusBadge> },
]

// `tab` ('items' | 'loans') comes from the address (/my-organization?tab=equipment | borrowed); choosing a tab changes the address.
export default function MyOrgEquipmentPage({ tab = 'items' }) {
  const navigate = useNavigate()
  const { showToast } = useToast()
  const { org, state, reload, retry, domain, id } = useMyOrganization()
  const [loans, setLoans] = useState([])
  const [loanState, setLoanState] = useState('loading')
  const [loanVersion, setLoanVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)   // { kind, group?, line?, loan? }
  const [busyId, setBusyId] = useState(null)

  useEffect(() => {
    if (!id) return undefined
    let cancelled = false
    api.get(`/organizations/${domain.type}/${id}/equipment-loans/`)
      .then((res) => { if (!cancelled) { setLoans(Array.isArray(res.data) ? res.data : []); setLoanState('ready') } })
      .catch(() => { if (!cancelled) setLoanState('failed') })
    return () => { cancelled = true }
  }, [domain.type, id, loanVersion])

  // A loan or an equipment change affects both lists (units on loan, available units), so both are read again.
  const reloadAll = useCallback(() => { reload(); setLoanVersion((v) => v + 1) }, [reload])
  const close = () => setOpen(null)
  const done = () => { close(); reloadAll() }
  const switchTab = (next) => {
    setSearch('')
    navigate(`/my-organization?tab=${next === 'loans' ? 'borrowed' : 'equipment'}`, { replace: true })
  }

  const approve = async (loan) => {
    setBusyId(loan.id)
    try {
      await api.post(`/organizations/${domain.type}/equipment-loans/${loan.id}/approve/`)
      showToast(`Approved. ${loan.quantity} × ${loan.equipment_name} lent to ${loan.member_name}.`, 'success')
    } catch (err) {
      showToast(apiMessage(err, 'The request could not be approved.'), 'error')
    } finally {
      setBusyId(null)
      reloadAll()
    }
  }

  const items = useMemo(() => searchRows(equipmentRows(org?.equipment || []), search, (r) => `${r.label} ${conditionText(r)}`), [org, search])
  const loanRows = useMemo(() => sortLoans(searchRows(loans, search, loanText)), [loans, search])
  const lendableMembers = (org?.members || []).filter((m) => m.is_active !== false).map((m) => ({ id: m[domain.personField], name: m[domain.nameField] }))
  const loanButtons = (loan) => loanActions(loan).map((action) => ({
    label: busyId === loan.id && action.kind === 'approve' ? 'Approving…' : action.label,
    primary: action.primary,
    onClick: () => (action.kind === 'approve' ? approve(loan) : setOpen({ kind: action.kind, loan })),
  }))

  return (
    <AccountPage
      title="Equipment"
      helper="What your organization owns and lends to its members."
      action={(
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" icon={HandHelping} onClick={() => setOpen({ kind: 'lend-many' })}>Lend equipment</Button>
          <Button variant="outline" icon={Upload} onClick={() => setOpen({ kind: 'import' })}>Import</Button>
          <Button icon={Plus} className="col-span-2" onClick={() => setOpen({ kind: 'add' })}>Add equipment</Button>
        </div>
      )}
    >
      <TabBar
        label="Equipment views"
        value={tab}
        onChange={switchTab}
        tabs={[{ value: 'items', label: 'Items' }, { value: 'loans', label: 'Loans', count: openRequestCount(loans) }]}
      />
      {tab === 'items' ? (
        <>
          {state === 'ready' && (org?.equipment || []).length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search equipment" />}
          <RecordList
            columns={ITEM_COLUMNS}
            rows={items}
            state={state}
            onRetry={retry}
            what="your equipment"
            actions={(group) => [{ label: 'Details', onClick: () => setOpen({ kind: 'group', group }) }]}
            empty={search.trim()
              ? { title: 'No equipment matches', hint: 'Try another word.' }
              : { title: 'No equipment yet', hint: 'Add what your organization owns, so you can lend it to members.' }}
          />
        </>
      ) : (
        <>
          {loanState === 'ready' && loans.length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search equipment or borrower" />}
          <RecordList
            columns={LOAN_COLUMNS}
            rows={loanRows}
            sections={LOAN_SECTIONS}
            state={loanState}
            onRetry={() => { setLoanState('loading'); setLoanVersion((v) => v + 1) }}
            what="your loans"
            actions={loanButtons}
            empty={search.trim()
              ? { title: 'No loan matches', hint: 'Try another word.' }
              : { title: 'Nothing lent yet', hint: 'Loans and members’ borrow requests appear here.' }}
          />
        </>
      )}

      {open?.kind === 'group' && (
        <ModalShell title={open.group.label} subtitle={conditionText(open.group)} onClose={close} maxWidth="max-w-lg">
          <EquipmentGroupBody
            group={open.group}
            onAction={(kind, line) => setOpen({ kind, line })}
            onRemove={(line) => setOpen({ kind: 'remove', line })}
          />
        </ModalShell>
      )}
      {open?.kind === 'condition' && <ChangeConditionDialog line={open.line} type={domain.type} onClose={close} onDone={done} />}
      {open?.kind === 'repair' && <RepairDialog line={open.line} type={domain.type} onClose={close} onDone={done} />}
      {open?.kind === 'lend' && <LendDialog line={open.line} type={domain.type} members={lendableMembers} onClose={close} onDone={done} />}
      {open?.kind === 'history' && <EquipmentHistoryDialog line={open.line} type={domain.type} onClose={close} />}
      {open?.kind === 'remove' && (
        <ConfirmDialog
          title="Remove equipment"
          message="Are you sure you want to remove this equipment record?"
          confirmLabel="Remove"
          danger
          onCancel={close}
          onConfirm={async () => {
            try {
              await api.delete(`/organizations/${domain.type}/equipment/${open.line.id}/`)
              showToast('Equipment removed.', 'success')
              done()
            } catch (err) {
              showToast(apiMessage(err, 'Unable to remove equipment.'), 'error')
              close()
            }
          }}
        />
      )}
      {open?.kind === 'reject' && <RejectDialog loan={open.loan} type={domain.type} onClose={close} onDone={done} />}
      {open?.kind === 'return' && <ReturnDialog loan={open.loan} type={domain.type} onClose={close} onDone={done} />}
      {open?.kind === 'lend-many' && org && (
        <LendEquipmentForm type={domain.type} organizationId={org.id} lines={org.equipment || []} members={lendableMembers} onClose={close} onDone={done} />
      )}
      {open?.kind === 'add' && <AddEquipmentModal type={domain.type} organizationId={id} onClose={close} onSuccess={reloadAll} />}
      {open?.kind === 'import' && org && (
        <ImportFileModal
          title="Import Equipment"
          subtitle={`Add equipment to ${org.name} from a spreadsheet.`}
          importUrl={`/organizations/${domain.type}/${id}/equipment/import/`}
          templateUrl={`/organizations/${domain.type}/${id}/equipment/import/template/`}
          templateFilename={`${domain.type}_organization_equipment_import_template.xlsx`}
          undoType={`${domain.type}_org_equipment`}
          onClose={close}
          onImported={reloadAll}
        />
      )}
    </AccountPage>
  )
}
