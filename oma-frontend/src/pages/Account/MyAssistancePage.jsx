import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { formatDate } from '../../utils/dateFormat.js'
import { formatAssistanceQuantity } from '../AssistanceManagement/assistanceFieldHelpers.js'
import { ReportNotReceivedModal } from '../AssistanceManagement/AssistanceFollowUpModals.jsx'
import ConfirmReceivedDialog from '../AssistanceManagement/ConfirmReceivedDialog.jsx'
import ConfirmReceivedModal from '../AssistanceManagement/ConfirmReceivedModal.jsx'
import AccountPage from './AccountPage.jsx'
import { inYear, searchRows, yearsOf } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { listOf } from './loadState.js'
import { ASSISTANCE_SECTIONS, assistanceDate, assistanceStatusLabel, assistanceText, assistanceTone, canConfirm, sortAssistance } from './myAssistance.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// A farmer's or a fisherfolk's Assistance page (`domain` is 'crop' or 'fisheries'): the help the office or their organization recorded
// for them. What waits for their answer comes first, with Received and Not received on the row; then what the office is following up,
// what is scheduled, and the history. The windows are the existing ones of that kind of assistance. The backend limits the list to the
// person's own records.

// What differs between the two: the list, and the window that confirms receipt (the follow-up window takes the domain itself).
const DOMAINS = {
  crop: {
    url: '/interventions/my-beneficiary-history/',
    Received: ({ record, onClose, onDone }) => <ConfirmReceivedModal record={record} onClose={onClose} onDone={onDone} />,
  },
  fisheries: {
    url: '/interventions/my-fisherfolk-beneficiary-history/',
    Received: ({ record, onClose, onDone }) => (
      <ConfirmReceivedDialog record={record} url={`/interventions/fisherfolk-beneficiaries/${record.id}/confirm-received/`} domain="fisheries" onClose={onClose} onDone={onDone} />
    ),
  },
}

const COLUMNS = [
  { key: 'assistance_type', label: 'Assistance', phone: 'title', render: (r) => r.assistance_type || 'Assistance' },
  { key: 'quantity', label: 'Quantity', render: (r) => formatAssistanceQuantity(r.assistance_type, r.quantity) },
  { key: 'from', label: 'From', phone: 'hide', render: (r) => (r.source_agencies || []).join(', ') },
  { key: 'date', label: 'Date given', render: (r) => formatDate(r.date_given) },
  { key: 'status', label: 'Status', phone: 'badge', render: (r) => <StatusBadge tone={assistanceTone(r.status)}>{assistanceStatusLabel(r.status)}</StatusBadge> },
]

export default function MyAssistancePage({ domain = 'crop' }) {
  const config = DOMAINS[domain] || DOMAINS.crop
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
    api.get(config.url)
      .then((res) => { if (!cancelled) { setRecords(listOf(res)); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [version, config.url])

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

      {open?.kind === 'received' && <config.Received record={open.record} onClose={() => setOpen(null)} onDone={done} />}
      {open?.kind === 'not-received' && <ReportNotReceivedModal domain={domain} record={open.record} onClose={() => setOpen(null)} onDone={done} />}
    </AccountPage>
  )
}
