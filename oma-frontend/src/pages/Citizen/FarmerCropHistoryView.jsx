import { useEffect, useState } from 'react'
import { Pencil, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogScreen from './CitizenActivityLogModal.jsx'
import CitizenHarvestModal from './CitizenHarvestModal.jsx'
import { labels } from './labels.js'
import {
  CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader, SectionHeading,
} from './citizenUI.jsx'

// Batch E added this as the "View history" destination for one crop
// record; this revision re-skins it to the citizen visual spec and, now
// that logging is a full screen rather than a modal, swaps to that screen
// instead of stacking it on top. Same data, same own-entry-only edit
// rule — a staff-logged entry still shows as read-only here.
export default function FarmerCropHistoryView({ record, onBack, onRecordChanged }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [harvests, setHarvests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [logScreen, setLogScreen] = useState(null)   // { entry } — full screen
  const [harvestModal, setHarvestModal] = useState(null) // { entry } — overlay

  const fetchDetail = async () => {
    setIsLoading(true)
    try {
      const logsPromise = api.get(CROP_DOMAIN.logsUrl(record.id))
      const harvestsPromise = record.harvest_record_id
        ? api.get(CROP_DOMAIN.harvestDetailUrl(record.harvest_record_id)).then((r) => [r.data])
        : Promise.resolve([])
      const [logsRes, harvestsRes] = await Promise.all([logsPromise, harvestsPromise])
      setLogs(logsRes.data)
      setHarvests(harvestsRes)
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

  if (logScreen) {
    return (
      <CitizenActivityLogScreen
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={record.id}
        record={record}
        log={logScreen.entry}
        onClose={() => setLogScreen(null)}
        onSuccess={refreshAfterChange}
      />
    )
  }

  const addButton = (onClick) => (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[44px] items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 py-2 text-cz-text transition-colors hover:bg-cz-page"
    >
      <Plus size={15} aria-hidden="true" />
      <span className="text-[13px] font-medium">{labels.farmerHome.history.logActivity}</span>
    </button>
  )

  const entryRow = (key, title, meta, isMine, onEdit) => (
    <li key={key} className="flex items-center gap-3 border-b-[0.5px] border-cz-border px-[14px] py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-cz-text">{title}</p>
        <p className="text-[12px] text-cz-text-2">{meta}</p>
      </div>
      {isMine ? (
        <button
          type="button"
          onClick={onEdit}
          className={`-my-2 flex min-h-[44px] shrink-0 items-center gap-1 px-2 ${CROP_THEME.accentText}`}
        >
          <Pencil size={14} aria-hidden="true" />
          <span className="text-[13px] font-medium">{labels.common.edit}</span>
        </button>
      ) : (
        <span className="shrink-0 text-[12px] italic text-cz-text-muted">{labels.common.loggedByStaff}</span>
      )}
    </li>
  )

  return (
    <CitizenScreen>
      <CitizenSubHeader
        theme={CROP_THEME}
        title={labels.farmerHome.history.title(CROP_DOMAIN.recordTitle(record))}
        subtitle={record.farm_location_barangay || undefined}
        onBack={onBack}
      />

      <CitizenBody>
        {isLoading ? (
          <p className="text-[15px] italic text-cz-text-2">{labels.farmerHome.history.loading}</p>
        ) : (
          <>
            <div className="mb-[10px] flex items-center justify-between">
              <SectionHeading>{labels.farmerHome.history.activityLogTitle}</SectionHeading>
              <div className="-mt-[10px]">{addButton(() => setLogScreen({ entry: null }))}</div>
            </div>
            {logs.length === 0 ? (
              <p className="mb-4 text-[14px] italic text-cz-text-muted">{labels.farmerHome.history.noActivity}</p>
            ) : (
              <ul className="mb-4 overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
                {logs.map((log) => entryRow(
                  log.id,
                  log[CROP_DOMAIN.activityField],
                  `${log.date_of_activity}${log.is_late ? labels.farmerHome.history.lateSuffix : ''}`,
                  log[CROP_DOMAIN.creatorField] === user?.id,
                  () => setLogScreen({ entry: log }),
                ))}
              </ul>
            )}

            <div className="mb-[10px] flex items-center justify-between">
              <SectionHeading>{labels.farmerHome.history.harvestTitle}</SectionHeading>
              {!record.harvest_record_id && (
                <div className="-mt-[10px]">
                  <button
                    type="button"
                    onClick={() => setHarvestModal({ entry: null })}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 py-2 text-cz-text transition-colors hover:bg-cz-page"
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span className="text-[13px] font-medium">{labels.farmerHome.history.recordHarvest}</span>
                  </button>
                </div>
              )}
            </div>
            {harvests.length === 0 ? (
              <p className="text-[14px] italic text-cz-text-muted">{labels.farmerHome.history.noHarvest}</p>
            ) : (
              <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
                {harvests.map((h) => entryRow(
                  h.id,
                  `${h.volume_kg} kg`,
                  h.harvest_start_date,
                  h[CROP_DOMAIN.creatorField] === user?.id,
                  () => setHarvestModal({ entry: h }),
                ))}
              </ul>
            )}
          </>
        )}
      </CitizenBody>

      {harvestModal && (
        <CitizenHarvestModal
          domain={CROP_DOMAIN}
          record={record}
          harvest={harvestModal.entry}
          onClose={() => setHarvestModal(null)}
          onSuccess={refreshAfterChange}
        />
      )}
    </CitizenScreen>
  )
}
