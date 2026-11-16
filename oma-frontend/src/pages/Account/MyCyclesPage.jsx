import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Fish } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import DisasterIndicator from '../../components/UI/DisasterIndicator.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import fetchAllPages from '../Citizen/fetchAllPages.js'
import EditStockingModal from '../FisheriesRecords/EditStockingModal.jsx'
import { StockingDetailModal } from '../FisheriesRecords/FisheriesRecordsPage.jsx'
import { cycleStatusText } from '../FisheriesRecords/emergencyForceHarvest.js'
import { ForcedHarvestDetailsModal } from '../FisheriesRecords/ForcedHarvestDetails.jsx'
import ForceHarvestModal from '../FisheriesRecords/ForceHarvestModal.jsx'
import { stockingHarvestGate } from '../FisheriesRecords/stockingHarvestGate.js'
import { RecordStockingHarvestModal } from '../FisheriesRecords/StockingMonitoringModals.jsx'
import CycleActivityLogsModal from '../Monitoring/CycleActivityLogsModal.jsx'
import { printSpec } from '../Monitoring/disasterReportDocument.js'
import { cycleReport } from '../Monitoring/listReports.js'
import LogActivityModal from '../Monitoring/LogActivityModal.jsx'
import StartProductionCycleModal from '../Monitoring/StartProductionCycleModal.jsx'
import AccountPage from './AccountPage.jsx'
import { inYear, searchRows, yearsOf } from './accountSearch.js'
import ChooseLogWindow from './ChooseLogWindow.jsx'
import CycleDetailsWindow from './CycleDetailsWindow.jsx'
import ListTools from './ListTools.jsx'
import { CYCLE_SECTIONS, cycleDate, cycleHarvestDate, cycleMainAction, cycleStatusLabel, cycleText, cycleTitle, sortCycles } from './myCycles.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The fisherfolk's Cycles page: every production cycle of theirs, in sections (Growing, Ready to harvest, Harvested, Lost). Each row
// leads with what the fisherfolk does next (Log activity, or Record harvest once it is ready and allowed) and Details, which shows the
// cycle with its ponds and cages and holds the other actions (Activity logs, Edit, Print, Harvest details, Force harvest). Every form is
// the office's own window; this page only lists and opens them. The backend limits the list to the fisherfolk's own cycles.

const ALL_CYCLES = 'Stocked,Near Harvest,Late,Harvested,Total Loss'

const COLUMNS = [
  { key: 'title', label: 'Species', phone: 'title', render: cycleTitle },
  { key: 'number_of_units', label: 'Ponds and cages', align: 'right', phone: 'hide' },
  { key: 'place', label: 'Location', render: (r) => [r.culture_type, r.pond_location_barangay].filter(Boolean).join(', ') },
  { key: 'stocked', label: 'Date stocked', phone: 'hide', render: (r) => formatDate(r.date_stocked) },
  { key: 'harvest', label: 'Harvest date', render: (r) => formatDate(cycleHarvestDate(r)) },
  {
    key: 'status', label: 'Status', phone: 'badge',
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <StatusBadge status={cycleStatusText(r)}>{cycleStatusLabel(r)}</StatusBadge>
        <DisasterIndicator disastersCount={r.disaster_count} hasRecoveredDisaster={r.has_recovered_disaster} />
      </span>
    ),
  },
]

export default function MyCyclesPage() {
  const { showToast } = useToast()
  const [searchParams, setSearchParams] = useSearchParams()
  const [cycles, setCycles] = useState([])
  const [species, setSpecies] = useState([])
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  // The open window: { kind: 'details' | 'choose-log' | 'log' | 'harvest' | 'edit' | 'force' | 'logs' | 'harvests' | 'start', rec, ... }
  const [open, setOpen] = useState(null)

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    fetchAllPages('/fisheries/stocking/', { status: ALL_CYCLES })
      .then((rows) => { if (!cancelled) { setCycles(rows); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [version])
  useEffect(() => {
    api.get('/fisheries/species/').then((res) => setSpecies(Array.isArray(res.data) ? res.data : (res.data.results || []))).catch(() => {})
  }, [])

  // Links from Home, a profile or a notification: ?cycle=<production cycle id> or ?record=<stocking id> opens that cycle's Details, once
  // the list is loaded (a cycle that is not on it - another account's, or gone - simply does not open); ?forced=<id> opens a saved
  // Force Harvest. Each link leaves the address once it is used.
  const linkedCycle = searchParams.get('cycle')
  const linkedRecord = searchParams.get('record')
  const linkedForced = searchParams.get('forced')
  const [linkUsed, setLinkUsed] = useState(false)
  const linkedRow = !linkUsed && state === 'ready'
    ? cycles.find((c) => (linkedCycle && String(c.production_cycle) === linkedCycle) || (linkedRecord && String(c.id) === linkedRecord))
    : null
  const dropLinks = () => {
    setLinkUsed(true)
    if (linkedCycle || linkedRecord || linkedForced) {
      const next = new URLSearchParams(searchParams)
      ;['cycle', 'record', 'forced'].forEach((key) => next.delete(key))
      setSearchParams(next, { replace: true })
    }
  }
  const shown = open || (linkedRow ? { kind: 'details', rec: linkedRow } : null)
  const close = () => { dropLinks(); setOpen(null) }
  const done = () => { close(); reload() }

  // Record Harvest opens only when the cycle may be harvested; otherwise the reason is shown.
  const openHarvest = (rec) => {
    const gate = stockingHarvestGate(rec)
    if (gate.gated) showToast(gate.message, 'error')
    else setOpen({ kind: 'harvest', rec })
  }
  // Log Activity needs the cycle itself (its ponds and cages): read it the way the office page does.
  const openLog = async (rec, logKind) => {
    if (!rec.production_cycle) { showToast('This stocking has no production cycle on record.', 'error'); return }
    try {
      const res = await api.get(`/monitoring/aquaculture-cycles/${rec.production_cycle}/`)
      setOpen({ kind: 'log', rec, logKind, cycle: res.data })
    } catch (err) {
      showToast(err?.response?.data?.detail || 'This cycle could not be opened. Try again.', 'error')
    }
  }
  const print = async (rec) => {
    try {
      const cycle = rec.production_cycle ? (await api.get(`/monitoring/aquaculture-cycles/${rec.production_cycle}/`)).data : null
      await printSpec(cycleReport({ record: rec, cycle }))
    } catch {
      showToast('The report could not be printed. Try again.', 'error')
    }
  }

  const rows = useMemo(() => sortCycles(inYear(searchRows(cycles, search, cycleText), year, cycleDate)), [cycles, search, year])
  const actions = (rec) => {
    const main = cycleMainAction(rec, stockingHarvestGate(rec))
    return [
      main === 'harvest' && { label: 'Record harvest', primary: true, onClick: () => openHarvest(rec) },
      main === 'activity' && { label: 'Log activity', primary: true, onClick: () => setOpen({ kind: 'choose-log', rec }) },
      { label: 'Details', onClick: () => setOpen({ kind: 'details', rec }) },
    ].filter(Boolean)
  }
  const narrowed = Boolean(search.trim() || year)
  const rec = shown?.rec

  return (
    <AccountPage
      title="My cycles"
      helper="Your fish production cycles, ponds and cages."
      action={<Button icon={Fish} onClick={() => setOpen({ kind: 'start' })}>Start a cycle</Button>}
    >
      {state === 'ready' && cycles.length > 0 && (
        <ListTools search={search} onSearch={setSearch} placeholder="Search species or place" years={yearsOf(cycles, cycleDate)} year={year} onYear={setYear} />
      )}
      <RecordList
        columns={COLUMNS}
        rows={rows}
        sections={CYCLE_SECTIONS}
        state={state}
        onRetry={retry}
        what="your cycles"
        actions={actions}
        empty={narrowed
          ? { title: 'No cycle matches', hint: 'Try another word or another year.' }
          : { title: 'No cycles yet', hint: 'Start a production cycle to see it here.' }}
      />

      {shown?.kind === 'details' && (
        <CycleDetailsWindow
          rec={rec}
          onClose={close}
          actions={{
            onActivityLogs: () => setOpen({ kind: 'logs', rec }),
            onEdit: () => setOpen({ kind: 'edit', rec }),
            onPrint: () => print(rec),
            onHarvestDetails: () => setOpen({ kind: 'harvests', rec }),
            onForceHarvest: () => setOpen({ kind: 'force', rec }),
          }}
        />
      )}
      {shown?.kind === 'choose-log' && (
        <ChooseLogWindow subtitle={cycleTitle(rec)} onClose={close} onChoose={(logKind) => { setOpen(null); openLog(rec, logKind) }} />
      )}
      {shown?.kind === 'log' && (
        <LogActivityModal kind={shown.logKind} cycle={shown.cycle} subtitle={[cycleTitle(rec), shown.cycle.cycle_name].filter(Boolean).join(' · ')} onClose={close} onSaved={done} />
      )}
      {shown?.kind === 'harvest' && <RecordStockingHarvestModal record={rec} onClose={close} onSuccess={done} />}
      {shown?.kind === 'edit' && <EditStockingModal record={rec} speciesList={species} onClose={close} onSaved={done} />}
      {shown?.kind === 'logs' && <CycleActivityLogsModal record={rec} onClose={close} />}
      {shown?.kind === 'harvests' && <StockingDetailModal record={rec} onClose={close} />}
      {shown?.kind === 'force' && (
        <ForceHarvestModal
          stockingRecord={rec}
          onClose={close}
          onRecorded={(harvests) => {
            showToast(`Force harvest recorded for ${harvests.length} production cycle${harvests.length === 1 ? '' : 's'}.`, 'success')
            done()
          }}
        />
      )}
      {shown?.kind === 'start' && <StartProductionCycleModal onClose={close} onSuccess={done} />}
      {linkedForced && !linkUsed && <ForcedHarvestDetailsModal harvestId={linkedForced} onClose={dropLinks} />}
    </AccountPage>
  )
}
