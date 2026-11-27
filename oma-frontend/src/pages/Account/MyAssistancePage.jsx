import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../../api/axiosInstance.js'
import { formatAssistanceQuantity } from '../AssistanceManagement/assistanceFieldHelpers.js'
import { scheduleText } from '../AssistanceManagement/assistanceStatus.js'
import AccountPage from './AccountPage.jsx'
import { inYear, searchRows, yearsOf } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { listOf } from './loadState.js'
import { ASSISTANCE_SECTIONS, assistanceDate, assistanceStatusLabel, assistanceText, assistanceTone, sortAssistance } from './myAssistance.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// A farmer's or a fisherfolk's Assistance page (`domain` is 'crop' or 'fisheries'): the help the office or their cooperative recorded
// for them. What is scheduled comes first, with the date, time and place to claim it; then the history. There is nothing to answer:
// it shows as Received after that time. The backend limits the list to the person's own records.
const DOMAINS = {
  crop: { url: '/interventions/my-beneficiary-history/' },
  fisheries: { url: '/interventions/my-fisherfolk-beneficiary-history/' },
}

const COLUMNS = [
  { key: 'assistance_type', label: 'Assistance', phone: 'title', render: (r) => r.assistance_type || 'Assistance' },
  { key: 'quantity', label: 'Quantity', render: (r) => formatAssistanceQuantity(r.assistance_type, r.quantity) },
  { key: 'from', label: 'From', phone: 'hide', render: (r) => (r.source_agencies || []).join(', ') },
  { key: 'date', label: 'Date, time and place', render: (r) => scheduleText(r) },
  { key: 'status', label: 'Status', phone: 'badge', render: (r) => <StatusBadge tone={assistanceTone(r.status)}>{assistanceStatusLabel(r.status)}</StatusBadge> },
]

export default function MyAssistancePage({ domain = 'crop' }) {
  const config = DOMAINS[domain] || DOMAINS.crop
  const [records, setRecords] = useState([])
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')

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
  const narrowed = Boolean(search.trim() || year)

  return (
    <AccountPage title="Assistance" helper="Help recorded for you by the office or your cooperative.">
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
        empty={narrowed
          ? { title: 'No assistance matches', hint: 'Try another word or another year.' }
          : { title: 'No assistance yet', hint: 'Assistance given to you appears here once it is recorded.' }}
      />
    </AccountPage>
  )
}
