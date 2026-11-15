import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { formatDate } from '../../utils/dateFormat.js'
import { formatAssistanceQuantity } from '../AssistanceManagement/assistanceFieldHelpers.js'
import { ReportNotReceivedModal } from '../AssistanceManagement/AssistanceFollowUpModals.jsx'
import ConfirmReceivedModal from '../AssistanceManagement/ConfirmReceivedModal.jsx'
import AccountPage from './AccountPage.jsx'
import { inYear, searchRows, yearsOf } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { listOf } from './loadState.js'
import { ASSISTANCE_SECTIONS, assistanceDate, assistanceStatusLabel, assistanceText, assistanceTone, canConfirm, sortAssistance } from './myAssistance.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The farmer's Assistance page: the help the office or their organization recorded for them. What waits for their answer comes first,
// with Received and Not received on the row; then what the office is following up, what is scheduled, and the history. The two
// windows are the existing ones (Confirm Received, Report Not Received). The backend limits the list to the farmer's own records.

const COLUMNS = [
  { key: 'assistance_type', label: 'Assistance', phone: 'title', render: (r) => r.assistance_type || 'Assistance' },
  { key: 'quantity', label: 'Quantity', render: (r) => formatAssistanceQuantity(r.assistance_type, r.quantity) },
  { key: 'from', label: 'From', phone: 'hide', render: (r) => (r.source_agencies || []).join(', ') },
  { key: 'date', label: 'Date given', render: (r) => formatDate(r.date_given) },
  { key: 'status', label: 'Status', phone: 'badge', render: (r) => <StatusBadge tone={assistanceTone(r.status)}>{assistanceStatusLabel(r.status)}</StatusBadge> },
]

export default function MyAssistancePage() {
  const [records, setRecords] = useState([])
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [open, setOpen] = useState(null)     // { kind: 'received' | 'not-received', record }

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    api.get('/interventions/my-beneficiary-history/')
      .then((res) => { if (!cancelled) { setRecords(listOf(res)); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [version])

  const rows = useMemo(
    () => sortAssistance(inYear(searchRows(records, search, assistanceText), year, assistanceDate)),
    [records, search, year],
  )
  const actions = (record) => (canConfirm(record) ? [
    { label: 'Received', primary: true, onClick: () => setOpen({ kind: 'received', record }) },
    { label: 'Not received', onClick: () => setOpen({ kind: 'not-received', record }) },
  ] : [])
  const done = () => { setOpen(null); reload() }
  const narrowed = Boolean(search.trim() || year)

  return (
    <AccountPage title="Assistance" helper="Help recorded for you by the office or your organization.">
      {state === 'ready' && records.length > 0 && (
        <ListTools search={search} onSearch={setSearch} placeholder="Search assistance" years={yearsOf(records, assistanceDate)} year={year} onYear={setYear} />
      )}
      <RecordList
        columns={COLUMNS}
        rows={rows}
        sections={ASSISTANCE_SECTIONS}
        state={state}
        onRetry={retry}
        what="your assistance"
        actions={actions}
        empty={narrowed
          ? { title: 'No assistance matches', hint: 'Try another word or another year.' }
          : { title: 'No assistance yet', hint: 'Assistance given to you appears here once it is recorded.' }}
      />

      {open?.kind === 'received' && <ConfirmReceivedModal record={open.record} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'not-received' && <ReportNotReceivedModal record={open.record} onClose={() => setOpen(null)} onDone={done} />}
    </AccountPage>
  )
}
