import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Leaf } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenDisasterScreen from './CitizenDisasterScreen.jsx'
import CitizenHarvestModal from './CitizenHarvestModal.jsx'
import { dayFirstLong, dayFirstShort } from './farmerDates.js'
import { labels } from './labels.js'
import { CROP_THEME, CitizenBody, CitizenHomeHeader, CitizenScreen } from './citizenUI.jsx'

// "View history" destination for one crop record, reached from a results card.
// Every entry keeps its Edit action regardless of who logged it: ownership of
// the RECORD (not the entry) is the real boundary, enforced server-side
// (IsStaffOrOwnRecordCitizen), and this screen can only be reached for the
// citizen's own record.
//
// Mirrors core.utils.harvest_gate_status on the backend (the real
// enforcement — this is client-side UX only, to explain the gate before
// the citizen even opens the modal rather than after a rejected submit).
function harvestGateInfo(record) {
  if (!record.date_planted || !record.expected_harvest_date) return { gated: false, message: null }
  const planted = new Date(record.date_planted + 'T00:00:00')
  const expected = new Date(record.expected_harvest_date + 'T00:00:00')
  const totalDays = (expected - planted) / (1000 * 60 * 60 * 24)
  if (totalDays <= 0) return { gated: false, message: null }
  const halfwayDays = totalDays / 2
  const elapsedDays = (new Date() - planted) / (1000 * 60 * 60 * 24)
  if (elapsedDays >= halfwayDays) return { gated: false, message: null }
  const daysRemaining = Math.ceil(halfwayDays - elapsedDays)
  return {
    gated: true,
    message: `Harvest can only be recorded once at least half the expected growth duration has passed. Available in about ${daysRemaining} more day(s).`,
  }
}

const H = labels.farmerHistory

// Reference layout: one card — crop band, activity rows, a disasters row, and
// the last harvest. Activity edits open the Farmer Log-activity screen
// (onEditLog) rather than the older full-screen editor.
export default function FarmerCropHistoryView({ record, onBack, onRecordChanged, onEditLog, tabBar, bare = false }) {
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [harvests, setHarvests] = useState([])
  const [disasterCount, setDisasterCount] = useState(null) // { active, total } | null while loading
  const [isLoading, setIsLoading] = useState(true)
  const [harvestModal, setHarvestModal] = useState(null) // { entry } — overlay
  const [disasterScreen, setDisasterScreen] = useState(false) // full screen

  const fetchDetail = async () => {
    setIsLoading(true)
    try {
      const logsPromise = api.get(CROP_DOMAIN.logsUrl(record.id))
      const harvestsPromise = record.harvest_record_id
        ? api.get(CROP_DOMAIN.harvestDetailUrl(record.harvest_record_id)).then((r) => [r.data])
        : Promise.resolve([])
      const disastersPromise = api.get(CROP_DOMAIN.disastersUrl(record.id)).catch(() => null)
      const [logsRes, harvestsRes, disastersRes] = await Promise.all([logsPromise, harvestsPromise, disastersPromise])
      setLogs(logsRes.data)
      setHarvests(harvestsRes)
      if (disastersRes) {
        const rows = Array.isArray(disastersRes.data) ? disastersRes.data : (disastersRes.data?.results || [])
        setDisasterCount({ active: rows.filter((d) => d.status === 'Active').length, total: rows.length })
      } else {
        setDisasterCount(null)
      }
    } catch {
      showToast(labels.farmerHome.history.loadError(CROP_DOMAIN.recordLabel.toLowerCase()), 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchDetail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [record.id])

  const refreshAfterChange = async () => {
    await fetchDetail()
    onRecordChanged?.()
  }

  if (disasterScreen) {
    return (
      <CitizenDisasterScreen
        variant="farmer"
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={record.id}
        record={record}
        tabBar={tabBar}
        onClose={() => setDisasterScreen(false)}
        onSuccess={refreshAfterChange}
        bare={bare}
      />
    )
  }

  const harvest = harvests[0] || null
  const gate = harvestGateInfo(record)
  const openHarvest = () => {
    if (!harvest && gate.gated) { showToast(gate.message, 'error'); return }
    setHarvestModal({ entry: harvest })
  }

  const card = (
    <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
      <div className="flex items-center gap-3 bg-cz-crop-pale px-[15px] py-[14px]">
        <span className="flex h-[44px] w-[44px] shrink-0 items-center justify-center rounded-[10px] bg-white/70">
          <Leaf size={20} className="text-cz-crop-header" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-[17px] font-semibold text-cz-text">{record.crop_type_name || labels.yieldAnalysis.cropCropLabel}</p>
          <p className="mt-0.5 truncate text-[12.5px] text-cz-text-2">
            {record.area_planted_ha ?? labels.common.unknown} ha · Brgy. {record.farm_location_barangay || labels.common.unknown}
          </p>
        </div>
      </div>

      {isLoading ? (
        <p className="px-[15px] py-4 text-[14px] italic text-cz-text-2">{labels.farmerHome.history.loading}</p>
      ) : (
        <>
          <div className="px-[15px] py-[14px]">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[15px] font-semibold text-cz-text">{H.activities}</p>
              <button
                type="button"
                onClick={() => onEditLog(null)}
                className="shrink-0 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 py-[9px] transition-colors hover:bg-cz-page"
              >
                <span className="whitespace-nowrap text-[12px] font-semibold text-cz-text">{H.logActivity}</span>
              </button>
            </div>
            {logs.length === 0 ? (
              <p className="mt-3 text-[13px] italic text-cz-text-muted">{labels.farmerHome.history.noActivity}</p>
            ) : (
              <ul className="mt-3 space-y-2">
                {logs.map((log) => (
                  <li key={log.id} className="flex items-center justify-between gap-3 rounded-[10px] border-[0.5px] border-cz-border px-3.5 py-3">
                    <span className="min-w-0 text-[13.5px] text-cz-text">
                      {log[CROP_DOMAIN.activityField]} · {dayFirstShort(log.date_of_activity)}
                      {log.is_late ? labels.farmerHome.history.lateSuffix : ''}
                    </span>
                    <button type="button" onClick={() => onEditLog(log.id)} className="shrink-0 py-1">
                      <span className="text-[13.5px] font-bold text-cz-crop-header">{H.edit}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button
            type="button"
            onClick={() => setDisasterScreen(true)}
            className="flex w-full items-center justify-between gap-2 border-t-[0.5px] border-cz-border px-[15px] py-[18px] text-left transition-colors hover:bg-cz-page"
          >
            <span className="flex items-center gap-3">
              <AlertTriangle size={17} className={disasterCount?.active ? 'text-cz-danger-accent' : 'text-cz-text'} aria-hidden="true" />
              <span className="text-[14.5px] text-cz-text">{H.disasters}</span>
            </span>
            <ChevronRight size={16} className="text-cz-text-muted" aria-hidden="true" />
          </button>

          {!harvest && gate.gated && (
            <p className="mx-[15px] mb-3 rounded-[10px] border border-cz-alert-border bg-cz-alert-bg px-3.5 py-2.5 text-[12.5px] leading-[1.45] text-cz-alert-title">
              {gate.message}
            </p>
          )}
          <div className="flex items-center justify-between gap-3 border-t-[0.5px] border-cz-border px-[15px] py-[14px]">
            <div className="min-w-0">
              <p className="text-[15px] font-semibold text-cz-text">{H.lastHarvest}</p>
              <p className="mt-1 text-[12px] text-cz-text-2">
                {harvest
                  ? H.harvestMeta(dayFirstLong(harvest.harvest_start_date), (Number(harvest.volume_kg) / 1000).toFixed(2))
                  : labels.farmerHome.history.noHarvest}
              </p>
            </div>
            <button
              type="button"
              onClick={openHarvest}
              className="shrink-0 rounded-[8px] bg-cz-crop-header px-4 py-[10px] transition-opacity hover:opacity-90"
            >
              <span className="whitespace-nowrap text-[12px] font-semibold text-white">{harvest ? H.edit : H.recordHarvest}</span>
            </button>
          </div>
        </>
      )}
    </div>
  )

  const content = (
    <>
      <button type="button" onClick={onBack} className="mb-4 text-cz-crop-header">
        <span className="border-b border-cz-crop-header pb-px text-[12.5px]">‹ {H.back}</span>
      </button>
      {card}
    </>
  )

  const modal = harvestModal && (
    <CitizenHarvestModal
      domain={CROP_DOMAIN}
      record={record}
      harvest={harvestModal.entry}
      onClose={() => setHarvestModal(null)}
      onSuccess={refreshAfterChange}
    />
  )

  if (bare) {
    return (
      <div className="mx-auto w-full max-w-[718px] px-6 py-5">
        {content}
        {modal}
      </div>
    )
  }

  return (
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader theme={CROP_THEME} />
      <CitizenBody className="!px-3 !pt-4">{content}</CitizenBody>
      {tabBar}
      {modal}
    </CitizenScreen>
  )
}
