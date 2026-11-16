import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import DisasterLogDetailsModal from '../Monitoring/DisasterLogDetailsModal.jsx'
import { canRecoverDisaster, disasterStatusLabel } from '../Monitoring/disasterRecovery.js'
import { fetchAllStocks } from '../Monitoring/disasterReportDocument.js'
import { MarkRecoveredModal } from '../Monitoring/FisherfolkDisasterPage.jsx'
import FisherfolkStockDisasterModal from '../Monitoring/FisherfolkStockDisasterModal.jsx'
import AccountPage from './AccountPage.jsx'
import { searchRows } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { listOf, settleAll } from './loadState.js'
import { DISASTER_SECTIONS, disasterText, disasterTone, sortDisasters, stockLabel } from './myDisasters.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The fisherfolk's Disasters page: the damage they reported on their ponds and cages, ongoing reports first. Report a disaster opens
// the existing form as a window (it starts with a table of every pond and cage to tick, and saving also sends it to the office).
// Details is the existing disaster log window, which also prints and downloads it. Reporting needs a pond or cage on record: the
// server says when it cannot be done and why (eligibility). The backend limits every list here to the fisherfolk's own records.

const REPORTABLE = 'Stocked,Near Harvest'

const COLUMNS = [
  { key: 'disaster_type_label', label: 'Disaster', phone: 'title' },
  { key: 'stock', label: 'Stock', render: stockLabel },
  { key: 'date', label: 'Date', render: (r) => formatDate(r.date_of_occurrence) },
  { key: 'volume', label: 'Volume lost', align: 'right', phone: 'hide', render: (r) => (r.volume_lost_kg != null ? `${Number(r.volume_lost_kg).toLocaleString()} kg` : null) },
  { key: 'status', label: 'Status', phone: 'badge', render: (r) => <StatusBadge tone={disasterTone(r)}>{r.status === 'Active' && canRecoverDisaster(r) ? 'Ongoing' : disasterStatusLabel(r)}</StatusBadge> },
]

export default function MyFisheriesDisastersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [reports, setReports] = useState([])
  const [stocks, setStocks] = useState(null)          // the fisherfolk's stocks in the water (null while loading, or when they could not be read)
  const [eligibility, setEligibility] = useState(null) // { can_log_disaster, message }: reporting needs a pond or cage on record
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)              // { kind: 'report' | 'details' | 'recover', ... }

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    settleAll({
      reports: () => api.get('/fisheries/disaster-reports/'),
      stocks: () => fetchAllStocks({ status: REPORTABLE }),
      eligibility: () => api.get('/monitoring/fisherfolk-disasters/eligibility/'),
    }).then(({ data, failed }) => {
      if (cancelled) return
      setStocks(data.stocks ? listOf(data.stocks) : null)
      setEligibility(data.eligibility ? data.eligibility.data : null)
      if (failed.includes('reports')) { setState('failed'); return }
      setReports(listOf(data.reports))
      setState('ready')
    })
    return () => { cancelled = true }
  }, [version])

  const blocked = eligibility?.can_log_disaster === false ? eligibility.message : null
  const canReport = Boolean(stocks && eligibility && !blocked)

  // ?stock=<id> (a link from Home or a cycle): the report form opens with that stock ticked. Once it is closed or saved the link is
  // used up and leaves the address.
  const linkedStockId = Number(searchParams.get('stock')) || null
  const [linkUsed, setLinkUsed] = useState(false)
  const linkedStock = linkedStockId && !linkUsed && canReport ? stocks.find((s) => s.id === linkedStockId) : null
  const endLink = () => { setLinkUsed(true); if (linkedStockId) setSearchParams({}, { replace: true }) }
  const close = () => { endLink(); setOpen(null) }
  const reporting = open?.kind === 'report' ? open : (!open && linkedStock ? { initialStockIds: [linkedStock.id] } : null)

  const rows = useMemo(() => sortDisasters(searchRows(reports, search, disasterText)), [reports, search])
  const actions = (row) => [
    canRecoverDisaster(row) && { label: 'Mark recovered', primary: true, onClick: () => setOpen({ kind: 'recover', row }) },
    { label: 'Details', onClick: () => setOpen({ kind: 'details', id: row.id }) },
  ].filter(Boolean)

  return (
    <AccountPage
      title="Disasters"
      helper="Damage you reported on your ponds and cages."
      action={canReport && (
        <Button icon={AlertTriangle} onClick={() => setOpen({ kind: 'report', initialStockIds: [] })}>Report a disaster</Button>
      )}
    >
      {blocked && (
        <p className="mb-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] leading-snug text-amber-900" data-testid="disaster-blocked">
          {eligibility.message}
        </p>
      )}
      {state === 'ready' && reports.length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search disaster or stock" />}
      <RecordList
        columns={COLUMNS}
        rows={rows}
        sections={DISASTER_SECTIONS}
        state={state}
        onRetry={retry}
        what="your disaster reports"
        actions={actions}
        empty={search.trim()
          ? { title: 'No report matches', hint: 'Try another word.' }
          : { title: 'No disasters reported', hint: 'When a pond or cage is damaged, report it here so the office knows.' }}
      />

      {reporting && (
        <FisherfolkStockDisasterModal
          stocks={stocks}
          initialStockIds={reporting.initialStockIds}
          onClose={close}
          // Saving also sends the report to the office; its details open straight away, as before.
          onSaved={(log) => { endLink(); reload(); setOpen(log?.id ? { kind: 'details', id: log.id } : null) }}
        />
      )}
      {open?.kind === 'details' && <DisasterLogDetailsModal key={open.id} kind="fisheries" logId={open.id} onClose={close} />}
      {open?.kind === 'recover' && <MarkRecoveredModal row={open.row} onClose={close} onDone={() => { close(); reload() }} />}
    </AccountPage>
  )
}
