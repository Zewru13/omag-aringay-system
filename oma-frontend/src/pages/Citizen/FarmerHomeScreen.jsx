import { useEffect, useState } from 'react'
import { AlertCircle, AlertTriangle, BarChart3, Clock, Gift, Plus, Sprout, User, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogScreen from './CitizenActivityLogModal.jsx'
import CitizenDisasterScreen from './CitizenDisasterScreen.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import FarmerCropHistoryView from './FarmerCropHistoryView.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { labels } from './labels.js'
import {
  CROP_THEME, CitizenBody, CitizenCardGrid, CitizenEmptyState, CitizenHomeBody,
  CitizenHomeHeader, CitizenScreen, CitizenSubHeader, ProgressTrack, QuickLinksHeading,
  SectionHeading, SecondaryRow, SecondaryRows, StatusCard, cycleProgress,
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
  const [disasterScreen, setDisasterScreen] = useState(null) // { record }

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

  if (disasterScreen) {
    return (
      <CitizenDisasterScreen
        domain={CROP_DOMAIN}
        theme={CROP_THEME}
        recordId={disasterScreen.record.id}
        record={disasterScreen.record}
        onClose={() => setDisasterScreen(null)}
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

  if (view.kind === 'profile') {
    return (
      <CitizenProfileScreen
        record={record}
        recordType="FARMER"
        theme={CROP_THEME}
        onBack={() => setView({ kind: 'home' })}
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

  // One definition, two presentations: the mobile SecondaryRows list and the
  // >=1024px Quick Links sidebar render from this same array, so the two can
  // never drift out of sync as entries are added.
  const quickLinks = [
    { icon: User, label: labels.farmerHome.secondary.profileTitle, onClick: () => setView({ kind: 'profile' }) },
    { icon: BarChart3, label: labels.farmerHome.secondary.harvestResultsTitle, onClick: () => setView({ kind: 'yield' }) },
    { icon: Gift, label: labels.farmerHome.secondary.assistanceTitle, onClick: () => setView({ kind: 'assistance' }) },
  ]

  const quickLinksAside = (
    <>
      <QuickLinksHeading>{labels.farmerHome.secondary.quickLinksTitle}</QuickLinksHeading>
      {quickLinks.map((l, i) => (
        <SecondaryRow
          key={l.label}
          icon={l.icon}
          label={l.label}
          onClick={l.onClick}
          isLast={i === quickLinks.length - 1}
          hideChevron
        />
      ))}
    </>
  )

  return (
    <CitizenScreen>
      <CitizenHomeHeader
        theme={CROP_THEME}
        name={record.label}
        metaLine={`${labels.farmerHome.rsbsaPrefix} ${record.rsbsa_number || labels.common.unknown} · ${record.barangay || labels.common.unknown}`}
        onLogout={onLogout}
      />

      <CitizenHomeBody aside={isLoading ? null : quickLinksAside}>
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
              <SectionHeading>
                {labels.farmerHome.myCrops.title}
                {records.length > 0 && <span className="hidden sm:inline"> ({records.length})</span>}
              </SectionHeading>
            </div>
            {records.length === 0 ? (
              <CitizenEmptyState
                icon={Wheat}
                iconClass="text-cz-text-muted"
                title={labels.farmerHome.myCrops.title}
                body={labels.farmerHome.myCrops.empty}
              />
            ) : (
              <CitizenCardGrid>
              {records.map((rec) => {
                const progress = cycleProgress(rec.date_planted, rec.expected_harvest_date)
                return (
                  <div
                    key={rec.id}
                    className="mb-[10px] rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[14px] sm:mb-0"
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
                    {/* Evaluator-parity batch: its own full-width row rather
                        than a 3rd flex-1 slot next to Log activity/View
                        history — a rarer, more consequential action reads
                        better with its own visual weight (danger tone) than
                        squeezed to a third of the row's width on a 340px
                        card. */}
                    <button
                      type="button"
                      onClick={() => setDisasterScreen({ record: rec })}
                      className="mt-2 flex min-h-[44px] w-full items-center justify-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-danger-border px-2 py-[11px] text-cz-danger-accent transition-colors hover:bg-cz-danger-bg"
                    >
                      <AlertTriangle size={14} aria-hidden="true" />
                      <span className="text-[13px] font-medium">{labels.farmerHome.myCrops.reportDisaster}</span>
                    </button>
                  </div>
                )
              })}
              </CitizenCardGrid>
            )}

            {/* SECONDARY ROWS — mobile/tablet only; at >=1024px these same
                entries render in the Quick Links sidebar instead. */}
            <div className="lg:hidden">
              <SecondaryRows>
                {quickLinks.map((l, i) => (
                  <SecondaryRow
                    key={l.label}
                    icon={l.icon}
                    label={l.label}
                    onClick={l.onClick}
                    isLast={i === quickLinks.length - 1}
                  />
                ))}
              </SecondaryRows>
            </div>
          </>
        )}
      </CitizenHomeBody>
    </CitizenScreen>
  )
}
