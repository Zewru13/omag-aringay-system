import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Pencil, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogScreen from './CitizenActivityLogModal.jsx'
import CitizenDisasterScreen from './CitizenDisasterScreen.jsx'
import CitizenHarvestModal from './CitizenHarvestModal.jsx'
import { labels } from './labels.js'
import {
  CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader, SectionHeading,
} from './citizenUI.jsx'

// Batch E added this as the "View history" destination for one crop
// record; the visual-spec revision swapped log editing from a modal to a
// full screen. Evaluator-parity batch: every entry now shows Edit
// regardless of who logged it — get_object_creator_id is no longer part
// of the backend's IsStaffOrOwnRecordCitizen check for CITIZEN (see
// accounts/permissions.py), so the frontend's own-entry gate would just be
// a UI lie if left in place. Ownership of the RECORD itself (not the
// entry) is still the real boundary, enforced server-side and untouched —
// this screen can only ever be reached for the citizen's own record to
// begin with. Also adds a Disasters section, opening the new
// CitizenDisasterScreen (report + status-track + recover) for this record.
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

export default function FarmerCropHistoryView({ record, onBack, onRecordChanged }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [harvests, setHarvests] = useState([])
  const [disasterCount, setDisasterCount] = useState(null) // { active, total } | null while loading
  const [isLoading, setIsLoading] = useState(true)
  const [logScreen, setLogScreen] = useState(null)   // { entry } — full screen
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

  if (disasterScreen) {
    return (
      <CitizenDisasterScreen
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={record.id}
        record={record}
        onClose={() => setDisasterScreen(false)}
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

  // Evaluator-parity batch: Edit shows on every row now, staff-logged or
  // not — `isStaffLogged` only drives the small "Logged by staff" tag next
  // to it, informational rather than gating. The actual permission is
  // enforced server-side (IsStaffOrOwnRecordCitizen, own-record-only), so
  // there is nothing left for the frontend to block on here.
  const entryRow = (key, title, meta, isStaffLogged, onEdit) => (
    <li key={key} className="flex items-center gap-3 border-b-[0.5px] border-cz-border px-[14px] py-[13px] last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-cz-text">{title}</p>
        <p className="text-[12px] text-cz-text-2">
          {meta}
        </p>
        <span
          className={`mt-1 inline-block rounded-[5px] px-2 py-0.5 text-[10.5px] font-bold uppercase tracking-[0.03em] ${
            isStaffLogged
              ? 'bg-[color:var(--color-semantic-warning-bg)] text-[color:var(--color-semantic-warning)]'
              : 'bg-[color:var(--color-semantic-safe-bg)] text-[color:var(--color-semantic-safe)]'
          }`}
        >
          {isStaffLogged ? labels.ffNew.loggedByStaff : labels.ffNew.loggedByYou}
        </span>
      </div>
      <button
        type="button"
        onClick={onEdit}
        className={`-my-2 flex min-h-[44px] shrink-0 items-center gap-1 px-2 ${CROP_THEME.accentText}`}
      >
        <Pencil size={14} aria-hidden="true" />
        <span className="text-[13px] font-medium">{labels.common.edit}</span>
      </button>
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
                  log[CROP_DOMAIN.creatorField] !== user?.id,
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
                    onClick={() => {
                      const gate = harvestGateInfo(record)
                      if (gate.gated) { showToast(gate.message, 'error'); return }
                      setHarvestModal({ entry: null })
                    }}
                    className="flex min-h-[44px] items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 py-2 text-cz-text transition-colors hover:bg-cz-page"
                  >
                    <Plus size={15} aria-hidden="true" />
                    <span className="text-[13px] font-medium">{labels.farmerHome.history.recordHarvest}</span>
                  </button>
                </div>
              )}
            </div>
            {harvestGateInfo(record).gated && harvests.length === 0 && (
              <p className="mb-3 rounded-[10px] border border-[#F5E0A3] bg-cz-alert-bg px-3.5 py-2.5 text-[13px] leading-[1.45] text-cz-alert-title">
                {harvestGateInfo(record).message}
              </p>
            )}
            {harvests.length === 0 ? (
              <p className="text-[14px] italic text-cz-text-muted">{labels.farmerHome.history.noHarvest}</p>
            ) : (
              <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
                {harvests.map((h) => entryRow(
                  h.id,
                  `${h.volume_kg} kg`,
                  h.harvest_start_date,
                  h[CROP_DOMAIN.creatorField] !== user?.id,
                  () => setHarvestModal({ entry: h }),
                ))}
              </ul>
            )}

            <div className="mb-[10px] flex items-center justify-between">
              <SectionHeading>{labels.farmerHome.history.disasterTitle}</SectionHeading>
            </div>
            <button
              type="button"
              onClick={() => setDisasterScreen(true)}
              className="flex min-h-[44px] w-full items-center justify-between gap-2 rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface px-[14px] py-[13px] text-left transition-colors hover:bg-cz-page"
            >
              <span className="flex items-center gap-2">
                <AlertTriangle size={16} className={disasterCount?.active ? 'text-cz-danger-accent' : 'text-cz-text-muted'} aria-hidden="true" />
                <span className="text-[14px] text-cz-text">
                  {disasterCount?.active
                    ? labels.farmerHome.history.activeDisasterCount(disasterCount.active)
                    : labels.farmerHome.history.manageDisasters}
                </span>
              </span>
              <ChevronRight size={16} className="text-cz-text-muted" aria-hidden="true" />
            </button>
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
