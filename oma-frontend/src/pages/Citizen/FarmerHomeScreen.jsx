import { useEffect, useState } from 'react'
import { AlertCircle, BarChart3, Clock, Gift, Plus, Sprout, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogScreen from './CitizenActivityLogModal.jsx'
import FarmerCropHistoryView from './FarmerCropHistoryView.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { labels } from './labels.js'
import {
  CROP_THEME, CitizenBody, CitizenEmptyState, CitizenHomeHeader, CitizenScreen,
  CitizenSubHeader, ProgressTrack, SectionHeading, SecondaryRow, SecondaryRows,
  StatusCard, cycleProgress,
} from './citizenUI.jsx'

// Batch E built this task-first Farmer home screen; this revision re-skins
// it to the citizen visual specification (phone-shaped column at every
// breakpoint, cz-* palette, hairline borders) WITHOUT touching what it
// fetches or what it may do. Every call below still hits the same
// own-record-scoped endpoints, and no permission, validation or
// create/edit capability changed with the re-skin.
export default function FarmerHomeScreen({ record, onLogout }) {
  const { showToast } = useToast()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [tasksByRecord, setTasksByRecord] = useState({}) // recordId -> [{...suggestion}]

  const [view, setView] = useState({ kind: 'home' }) // 'home' | 'yield' | 'assistance' | { kind: 'history', record }
  const [logScreen, setLogScreen] = useState(null) // { record, prefillActivity }

  const fetchRecords = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(CROP_DOMAIN.recordsUrl)
      const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      setRecords(rows)

      const results = await Promise.all(
        rows.map((rec) =>
          api.get(`/production/monitoring/${rec.id}/suggestions/`)
            .then((res) => [rec.id, res.data.suggestions || []])
            .catch(() => [rec.id, []]),
        ),
      )
      setTasksByRecord(Object.fromEntries(results))
    } catch {
      showToast(labels.farmerHome.loadError, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Flatten every record's overdue/due-now suggestions into one task list,
  // each tagged with the crop record it belongs to. Overdue sorts first.
  const needsAttention = records.flatMap((rec) =>
    (tasksByRecord[rec.id] || [])
      .filter((s) => s.status === 'overdue' || s.status === 'due_now')
      .map((s) => ({ ...s, record: rec })),
  ).sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))

  const handleLogSuccess = () => { fetchRecords() }

  // ── Full-screen sub-views ────────────────────────────────────────────

  if (logScreen) {
    return (
      <CitizenActivityLogScreen
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={logScreen.record.id}
        record={logScreen.record}
        log={null}
        prefill={logScreen.prefillActivity ? { activityType: logScreen.prefillActivity } : undefined}
        onClose={() => setLogScreen(null)}
        onSuccess={handleLogSuccess}
      />
    )
  }

  if (view.kind === 'history') {
    return (
      <FarmerCropHistoryView
        record={view.record}
        onBack={() => setView({ kind: 'home' })}
        onRecordChanged={fetchRecords}
      />
    )
  }

  if (view.kind === 'yield' || view.kind === 'assistance') {
    const isYield = view.kind === 'yield'
    return (
      <CitizenScreen>
        <CitizenSubHeader
          theme={CROP_THEME}
          title={isYield ? labels.farmerHome.secondary.harvestResultsTitle : labels.farmerHome.secondary.assistanceTitle}
          onBack={() => setView({ kind: 'home' })}
        />
        <CitizenBody>
          {isYield ? (
            <MyYieldAnalysisSection
              endpoint="/production/yield-analysis/"
              cropLabel={labels.yieldAnalysis.cropCropLabel}
              cropKey="crop_type"
              dateLabel={labels.yieldAnalysis.cropDateLabel}
              dateKey="date_planted"
            />
          ) : (
            <MyAssistanceHistorySection endpoint="/interventions/my-beneficiary-history/" />
          )}
        </CitizenBody>
      </CitizenScreen>
    )
  }

  // ── Home ─────────────────────────────────────────────────────────────

  return (
    <CitizenScreen>
      <CitizenHomeHeader
        theme={CROP_THEME}
        name={record.label}
        metaLine={`${labels.farmerHome.rsbsaPrefix} ${record.rsbsa_number || labels.common.unknown} · ${record.barangay || labels.common.unknown}`}
        onLogout={onLogout}
      />

      <CitizenBody>
        {isLoading ? (
          <p className="text-[15px] italic text-cz-text-2">{labels.farmerHome.loading}</p>
        ) : (
          <>
            {/* NEEDS ATTENTION */}
            <SectionHeading>{labels.farmerHome.needsAttention.title}</SectionHeading>
            {needsAttention.length === 0 ? (
              <CitizenEmptyState
                icon={Sprout}
                iconClass="text-cz-crop-fill"
                title={labels.farmerHome.needsAttention.emptyTitle}
                body={labels.farmerHome.needsAttention.emptyBody}
              />
            ) : (
              needsAttention.map((task) => {
                const isOverdue = task.status === 'overdue'
                return (
                  <StatusCard
                    key={`${task.record.id}-${task.occurrence_key}`}
                    tone={isOverdue ? 'danger' : 'warning'}
                    badgeIcon={isOverdue ? AlertCircle : Clock}
                    badgeText={isOverdue
                      ? labels.farmerHome.needsAttention.overdueBadgeDays(Math.abs(task.days_diff ?? 0))
                      : labels.farmerHome.needsAttention.dueTodayBadge}
                    title={task.activity_name}
                    context={labels.farmerHome.needsAttention.contextLine(
                      task.record.crop_type_name || labels.yieldAnalysis.cropCropLabel,
                      task.record.farm_location_barangay || labels.common.unknown,
                      task.record.area_planted_ha ?? labels.common.unknown,
                    )}
                    actionIcon={Plus}
                    actionLabel={labels.farmerHome.needsAttention.actionLabel}
                    onAction={() => setLogScreen({ record: task.record, prefillActivity: task.activity_name })}
                  />
                )
              })
            )}

            {/* MY CROPS */}
            <div className="mt-4">
              <SectionHeading>{labels.farmerHome.myCrops.title}</SectionHeading>
            </div>
            {records.length === 0 ? (
              <CitizenEmptyState
                icon={Wheat}
                iconClass="text-cz-text-muted"
                title={labels.farmerHome.myCrops.title}
                body={labels.farmerHome.myCrops.empty}
              />
            ) : (
              records.map((rec) => {
                const progress = cycleProgress(rec.date_planted, rec.expected_harvest_date)
                return (
                  <div
                    key={rec.id}
                    className="mb-[10px] rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[14px]"
                  >
                    <div className="flex items-center gap-[10px]">
                      <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${CROP_THEME.circleBg}`}>
                        <Wheat size={20} className={CROP_THEME.circleIcon} aria-hidden="true" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-[16px] font-medium text-cz-text">
                          {rec.crop_type_name || labels.yieldAnalysis.cropCropLabel}
                        </p>
                        <p className="truncate text-[12px] text-cz-text-2">
                          {labels.farmerHome.myCrops.cardMeta(
                            rec.farm_location_barangay || labels.common.unknown,
                            rec.area_planted_ha ?? labels.common.unknown,
                            rec.season || labels.common.unknown,
                          )}
                        </p>
                      </div>
                    </div>

                    {progress && (
                      <>
                        <div className="mt-3">
                          <ProgressTrack theme={CROP_THEME} pct={progress.pct} height={8} />
                        </div>
                        <div className="mt-1.5 flex items-center justify-between">
                          <span className="text-[12px] text-cz-text-2">
                            {labels.farmerHome.myCrops.progressDayOf(progress.elapsed, progress.total)}
                          </span>
                          <span className={`text-[12px] font-medium ${CROP_THEME.accentText}`}>
                            {labels.farmerHome.myCrops.harvestShort(rec.expected_harvest_date)}
                          </span>
                        </div>
                      </>
                    )}

                    <div className="mt-3 flex gap-2">
                      <button
                        type="button"
                        onClick={() => setLogScreen({ record: rec })}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong px-2 py-[11px] text-cz-text transition-colors hover:bg-cz-page"
                      >
                        <span className="text-[14px] font-medium">{labels.farmerHome.myCrops.logActivity}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setView({ kind: 'history', record: rec })}
                        className="flex min-h-[44px] flex-1 items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong px-2 py-[11px] text-cz-text-2 transition-colors hover:bg-cz-page"
                      >
                        <span className="text-[14px]">{labels.farmerHome.myCrops.viewHistory}</span>
                      </button>
                    </div>
                  </div>
                )
              })
            )}

            {/* SECONDARY ROWS */}
            <SecondaryRows>
              <SecondaryRow
                icon={BarChart3}
                label={labels.farmerHome.secondary.harvestResultsTitle}
                onClick={() => setView({ kind: 'yield' })}
              />
              <SecondaryRow
                icon={Gift}
                label={labels.farmerHome.secondary.assistanceTitle}
                onClick={() => setView({ kind: 'assistance' })}
                isLast
              />
            </SecondaryRows>
          </>
        )}
      </CitizenBody>
    </CitizenScreen>
  )
}
