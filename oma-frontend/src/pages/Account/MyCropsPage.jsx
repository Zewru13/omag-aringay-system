import { useCallback, useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import api from '../../api/axiosInstance.js'
import DisasterIndicator from '../../components/UI/DisasterIndicator.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { formatDate } from '../../utils/dateFormat.js'
import fetchAllPages from '../Citizen/fetchAllPages.js'
import CropDetailsModal from '../Monitoring/CropDetailsModal.jsx'
import { DisasterReportModal, RecordHarvestFromMonitoringModal, ViewLogsModal } from '../Monitoring/CropMonitoringPage.jsx'
import { harvestGateInfo } from '../Monitoring/harvestGateInfo.js'
import AccountPage from './AccountPage.jsx'
import { inYear, searchRows, yearsOf } from './accountSearch.js'
import ListTools from './ListTools.jsx'
import { CROP_SECTIONS, cropDate, cropHarvestDate, cropMainAction, cropStatusLabel, cropText, sortCrops } from './myCrops.js'
import RecordList from './RecordList.jsx'
import StatusBadge from './StatusBadge.jsx'

// The farmer's Crops page: every crop the office has on record for them, in sections (Growing, Ready to harvest, Harvested, Lost).
// Each row leads with what the farmer does next (Log activity, or Record harvest once the crop is ready) and Details. The forms are
// the office's own windows (Log Activity, Record Harvest, Crop Details, Report Disaster); this page only lists and opens them.
// The backend limits the list to the farmer's own crops.

const ALL_CROPS = 'Planted,Near Harvest,Harvested,Total Loss'

const COLUMNS = [
  {
    key: 'crop', label: 'Crop', phone: 'title',
    render: (r) => (r.variety_used ? `${r.crop_type_name || 'Crop'} (${r.variety_used})` : r.crop_type_name || 'Crop'),
  },
  { key: 'area', label: 'Area (ha)', align: 'right', phone: 'hide', render: (r) => (r.area_planted_ha != null ? Number(r.area_planted_ha).toFixed(2) : null) },
  { key: 'farm_location_barangay', label: 'Location' },
  { key: 'planted', label: 'Date planted', phone: 'hide', render: (r) => formatDate(r.date_planted) },
  { key: 'harvest', label: 'Harvest date', render: (r) => formatDate(cropHarvestDate(r)) },
  {
    key: 'status', label: 'Status', phone: 'badge',
    render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <StatusBadge status={r.status}>{cropStatusLabel(r)}</StatusBadge>
        <DisasterIndicator disastersCount={r.disasters_count} hasRecoveredDisaster={r.has_recovered_disaster} />
      </span>
    ),
  },
]

export default function MyCropsPage() {
  const { showToast } = useToast()
  const [searchParams] = useSearchParams()
  const [crops, setCrops] = useState([])
  const [state, setState] = useState('loading')
  const [version, setVersion] = useState(0)
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [open, setOpen] = useState(null)     // { kind: 'details' | 'activity' | 'harvest' | 'disaster', crop }

  const reload = useCallback(() => setVersion((v) => v + 1), [])
  const retry = () => { setState('loading'); reload() }
  useEffect(() => {
    let cancelled = false
    fetchAllPages('/production/monitoring/', { status: ALL_CROPS })
      .then((rows) => { if (!cancelled) { setCrops(rows); setState('ready') } })
      .catch(() => { if (!cancelled) setState('failed') })
    return () => { cancelled = true }
  }, [version])

  // ?record=<id> (a link from Home or a notification): open that crop's details. The endpoint applies the usual access rules, so a
  // record that cannot be opened simply does not open.
  const linkedId = searchParams.get('record')
  useEffect(() => {
    if (!linkedId) return undefined
    let cancelled = false
    api.get(`/production/monitoring/${linkedId}/`)
      .then((res) => { if (!cancelled) setOpen({ kind: 'details', crop: res.data }) })
      .catch(() => {})
    return () => { cancelled = true }
  }, [linkedId])

  const close = () => setOpen(null)
  // Record Harvest opens only when the crop may be harvested; otherwise the reason is shown.
  const openHarvest = (crop) => {
    const gate = harvestGateInfo(crop)
    if (gate.gated) showToast(gate.message, 'error')
    else setOpen({ kind: 'harvest', crop })
  }

  const rows = useMemo(
    () => sortCrops(inYear(searchRows(crops, search, cropText), year, cropDate)),
    [crops, search, year],
  )
  const actions = (crop) => {
    const main = cropMainAction(crop, harvestGateInfo(crop))
    return [
      main === 'harvest' && { label: 'Record harvest', primary: true, onClick: () => openHarvest(crop) },
      main === 'activity' && { label: 'Log activity', primary: true, onClick: () => setOpen({ kind: 'activity', crop }) },
      { label: 'Details', onClick: () => setOpen({ kind: 'details', crop }) },
    ].filter(Boolean)
  }
  const narrowed = Boolean(search.trim() || year)

  return (
    <AccountPage title="My crops" helper="Every crop the office has on record for you.">
      {state === 'ready' && crops.length > 0 && (
        <ListTools search={search} onSearch={setSearch} placeholder="Search crop or place" years={yearsOf(crops, cropDate)} year={year} onYear={setYear} />
      )}
      <RecordList
        columns={COLUMNS}
        rows={rows}
        sections={CROP_SECTIONS}
        state={state}
        onRetry={retry}
        what="your crops"
        actions={actions}
        empty={narrowed
          ? { title: 'No crop matches', hint: 'Try another word or another year.' }
          : { title: 'No crops yet', hint: 'Your crops appear here once the office registers them.' }}
      />

      {open?.kind === 'details' && (
        <CropDetailsModal
          record={open.crop}
          onClose={close}
          onAction={(action) => {
            const crop = open.crop
            if (action === 'activity') setOpen({ kind: 'activity', crop })
            else if (action === 'disaster') setOpen({ kind: 'disaster', crop })
            else if (action === 'harvest') { close(); openHarvest(crop) }
            else close()
          }}
        />
      )}
      {open?.kind === 'activity' && <ViewLogsModal record={open.crop} onClose={close} onLogAdded={reload} />}
      {open?.kind === 'harvest' && <RecordHarvestFromMonitoringModal record={open.crop} onClose={close} onSuccess={reload} />}
      {open?.kind === 'disaster' && <DisasterReportModal record={open.crop} onClose={close} onSuccess={reload} />}
    </AccountPage>
  )
}
