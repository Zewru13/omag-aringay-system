import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import DisasterLogDetailsModal from '../Monitoring/DisasterLogDetailsModal.jsx'
import { canRecoverDisaster, disasterStatusLabel } from '../Monitoring/disasterRecovery.js'
import { MarkRecoveredModal } from '../Monitoring/FarmerDisasterPage.jsx'
import { ChooseCropsModal, MultiCropDisasterModal } from '../Monitoring/MultiCropDisaster.jsx'
import AccountPage from './AccountPage.jsx'
import { searchRows } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { listOf, settleAll } from './loadState.js'
import { DISASTER_SECTIONS, cropChoiceLabel, disasterText, disasterTone, reportBlock, sortDisasters } from './myDisasters.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The farmer's Disasters page: the damage they reported on their crops, ongoing reports first. Report a disaster opens the two
// existing steps as windows (choose the affected crops, then one form for all of them; one report is saved for each crop). Details
// is the existing disaster log window, which also prints and downloads it. The backend limits both lists to the farmer's own crops.

const ACTIVE_CROPS = 'Planted,Near Harvest'

const COLUMNS = [
  { key: 'disaster_type_label', label: 'Disaster', phone: 'title' },
  { key: 'crop', label: 'Crop' },
  { key: 'date', label: 'Date', render: (r) => formatDate(r.date_of_occurrence) },
  { key: 'area', label: 'Area affected', align: 'right', phone: 'hide', render: (r) => (r.area_affected_ha != null ? `${Number(r.area_affected_ha).toLocaleString()} ha` : null) },
  { key: 'status', label: 'Status', phone: 'badge', render: (r) => <StatusBadge tone={disasterTone(r)}>{r.status === 'Active' && canRecoverDisaster(r) ? 'Ongoing' : disasterStatusLabel(r)}</StatusBadge> },
]

export default function MyDisastersPage() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [reports, setReports] = useState([])
  const [crops, setCrops] = useState(null)      // the farmer's crops in the field (null while loading, or when they could not be read)
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [open, setOpen] = useState(null)        // { kind: 'choose' } | { kind: 'report', crops } | { kind: 'details', id } | { kind: 'recover', row }

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    settleAll({
      reports: () => api.get('/production/disaster-logs/'),
      crops: () => api.get('/production/monitoring/', { params: { status: ACTIVE_CROPS } }),
    }).then(({ data, failed }) => {
      if (cancelled) return
      setCrops(data.crops ? listOf(data.crops).map((crop) => ({ ...crop, label: cropChoiceLabel(crop) })) : null)
      if (failed.includes('reports')) { setState('failed'); return }
      setReports(listOf(data.reports))
      setState('ready')
    })
    return () => { cancelled = true }
  }, [version])

  // ?crop=<id> (a link from Home or a crop): the report form opens on that crop straight away. Once it is closed or saved the link
  // is used up and leaves the address.
  const linkedCropId = searchParams.get('crop')
  const [linkUsed, setLinkUsed] = useState(false)
  const linkedCrop = linkedCropId && !linkUsed && crops ? crops.find((c) => String(c.id) === linkedCropId) : null
  const endLink = () => { setLinkUsed(true); if (linkedCropId) setSearchParams({}, { replace: true }) }

  const blocked = reportBlock(crops)
  const rows = useMemo(() => sortDisasters(searchRows(reports, search, disasterText)), [reports, search])
  const actions = (row) => [
    canRecoverDisaster(row) && { label: 'Mark recovered', primary: true, onClick: () => setOpen({ kind: 'recover', row }) },
    { label: 'Details', onClick: () => setOpen({ kind: 'details', id: row.id }) },
  ].filter(Boolean)
  const close = () => { endLink(); setOpen(null) }
  const reporting = open?.kind === 'report' ? open.crops : (!open && linkedCrop ? [linkedCrop] : null)

  return (
    <AccountPage
      title="Disasters"
      helper="Damage you reported on your crops."
      action={crops && !blocked && (
        <Button icon={AlertTriangle} onClick={() => setOpen({ kind: 'choose' })}>Report a disaster</Button>
      )}
    >
      {blocked && (
        <p className="mb-3 rounded-[var(--radius-md)] border border-amber-200 bg-amber-50 px-4 py-3 text-[14px] leading-snug text-amber-900" data-testid="disaster-blocked">
          {blocked} Your crops appear once the office registers them.
        </p>
      )}
      {state === 'ready' && reports.length > 0 && <ListTools search={search} onSearch={setSearch} placeholder="Search disaster or crop" />}
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
          : { title: 'No disasters reported', hint: 'When a crop is damaged, report it here so the office knows.' }}
      />

      {open?.kind === 'choose' && (
        <ChooseCropsModal
          title="Report a disaster"
          subtitle="Step 1 of 2: choose the affected crops"
          crops={crops}
          onClose={close}
          onContinue={(chosen) => setOpen({ kind: 'report', crops: chosen })}
        />
      )}
      {reporting && (
        <MultiCropDisasterModal crops={reporting} onBack={() => { endLink(); setOpen({ kind: 'choose' }) }} onClose={close} onSuccess={reload} />
      )}
      {open?.kind === 'details' && <DisasterLogDetailsModal key={open.id} kind="farmer" logId={open.id} onClose={close} />}
      {open?.kind === 'recover' && <MarkRecoveredModal row={open.row} onClose={close} onDone={() => { close(); reload() }} />}
    </AccountPage>
  )
}
