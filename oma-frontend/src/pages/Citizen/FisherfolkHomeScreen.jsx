import { useEffect, useState } from 'react'
import { AlertTriangle, BarChart3, Check, Clock, DropletOff, Fish, Gift, Home, Repeat, Stethoscope, User } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { FISHERIES_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogScreen from './CitizenActivityLogModal.jsx'
import CitizenDisasterScreen from './CitizenDisasterScreen.jsx'
import CitizenProfileScreen from './CitizenProfileScreen.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { labels } from './labels.js'
import {
  CitizenBody, CitizenCardGrid, CitizenEmptyState, CitizenHomeBody, CitizenHomeHeader,
  CitizenScreen, CitizenSubHeader, CitizenTabBar, FISH_THEME, ProgressTrack, QuickLinksHeading,
  SectionHeading, SecondaryRow, SecondaryRows, StatusCard, cycleProgress,
} from './citizenUI.jsx'

const todayISO = () => new Date().toISOString().split('T')[0]
const ACTIVE_STATUSES = ['Stocked', 'Near Harvest']

// The stored activity CHOICE VALUE for feeding. Deliberately a code
// constant and NOT a labels.js entry: it is written to the database and
// matched server-side against SpeciesActivityStage names, so translating it
// would break that matching (see the note at the top of labels.js). The
// repeat-feeding payload below posts this same literal.
const FEEDING_ACTIVITY = 'Feed Monitoring'

// Batch F built this task-first Fisherfolk home screen; this revision
// re-skins it to the citizen visual specification (phone-shaped column,
// teal domain tint, compact single-container pond list) WITHOUT touching
// what it fetches, what it may do, or the repeat-feeding confirmation
// guard. Every call below still hits the same own-record-scoped
// endpoints, and each repeat still posts one normal FisheriesActivityLog
// through the existing per-pond endpoint.
export default function FisherfolkHomeScreen({ record, onLogout }) {
  const { showToast } = useToast()
  const [ponds, setPonds] = useState([])
  const [stockingRecords, setStockingRecords] = useState([])
  const [lastFeedingByRecord, setLastFeedingByRecord] = useState({}) // recordId -> log | null
  const [isLoading, setIsLoading] = useState(true)

  const [view, setView] = useState({ kind: 'home' }) // 'home' | 'yield' | 'assistance' | 'pondPicker'
  const [logScreen, setLogScreen] = useState(null) // { record, prefillActivity }
  const [disasterScreen, setDisasterScreen] = useState(null) // { record }
  // Evaluator-parity batch: the pond picker (already built for "Log
  // illness or mortality") is reused as-is for "Report disaster" rather
  // than building a second picker — the only thing that differs is what
  // opens once a pond is chosen, which this mode flag drives.
  const [pondPickerMode, setPondPickerMode] = useState('illness') // 'illness' | 'disaster'
  const [confirmGuard, setConfirmGuard] = useState(null) // { repeatable: [...], skippedCount }
  const [isRepeating, setIsRepeating] = useState(false)

  const fetchAll = async () => {
    setIsLoading(true)
    try {
      const [pondsRes, stockingRes] = await Promise.all([
        api.get(`/fisheries/fisherfolk/${record.id}/ponds/`),
        api.get(FISHERIES_DOMAIN.recordsUrl),
      ])
      const pondRows = Array.isArray(pondsRes.data) ? pondsRes.data : (pondsRes.data?.results || [])
      const stockingRows = Array.isArray(stockingRes.data) ? stockingRes.data : (stockingRes.data?.results || [])
      setPonds(pondRows)
      setStockingRecords(stockingRows)

      const dueRows = stockingRows.filter(
        (sr) => ACTIVE_STATUSES.includes(sr.status) && sr.next_feeding_date && sr.next_feeding_date <= todayISO(),
      )
      const results = await Promise.all(
        dueRows.map((sr) =>
          api.get(FISHERIES_DOMAIN.logsUrl(sr.id))
            .then((res) => {
              const logs = Array.isArray(res.data) ? res.data : (res.data?.results || [])
              const lastFeeding = logs
                .filter((l) => l.activity === 'Feed Monitoring')
                .sort((a, b) => new Date(b.date_of_activity) - new Date(a.date_of_activity))[0]
              return [sr.id, lastFeeding || null]
            })
            .catch(() => [sr.id, null]),
        ),
      )
      setLastFeedingByRecord(Object.fromEntries(results))
    } catch {
      showToast(labels.fisherfolkHome.loadError, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchAll()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const dueRecords = stockingRecords.filter(
    (sr) => ACTIVE_STATUSES.includes(sr.status) && sr.next_feeding_date && sr.next_feeding_date <= todayISO(),
  )
  const repeatableDue = dueRecords.filter((sr) => lastFeedingByRecord[sr.id])
  const nonRepeatableDue = dueRecords.filter((sr) => !lastFeedingByRecord[sr.id])

  const activeByPond = {}
  stockingRecords.forEach((sr) => {
    if (ACTIVE_STATUSES.includes(sr.status) && sr.pond) activeByPond[sr.pond] = sr
  })
  const pondRows = ponds.map((p) => ({ pond: p, record: activeByPond[p.id] || null }))

  const handleLogSuccess = () => { fetchAll() }

  // Mobile-only tab bar. Declared here so every early-returning sub-view
  // below can render it; `active` is null on screens that aren't one of the
  // three destinations (Assistance, reached from Quick Links), which simply
  // leaves no tab highlighted rather than lighting a wrong one.
  const tabBar = (active) => (
    <CitizenTabBar
      theme={FISH_THEME}
      active={active}
      items={[
        { key: 'home', icon: Home, label: labels.tabBar.home, onClick: () => setView({ kind: 'home' }) },
        { key: 'harvests', icon: BarChart3, label: labels.tabBar.harvests, onClick: () => setView({ kind: 'yield' }) },
        { key: 'myInfo', icon: User, label: labels.tabBar.myInfo, onClick: () => setView({ kind: 'profile' }) },
      ]}
    />
  )

  const openRepeatConfirm = () => {
    setConfirmGuard({
      repeatable: repeatableDue.map((sr) => ({ record: sr, lastFeeding: lastFeedingByRecord[sr.id] })),
      skippedCount: nonRepeatableDue.length,
    })
  }

  // Per-pond repeat (UI-basis addition). It deliberately routes through the
  // SAME confirmGuard state and the same handleConfirmRepeat submit path as
  // the repeat-all hero action — just with a single-entry list — so the
  // mandatory confirmation step cannot be bypassed by taking the per-pond
  // route. There is no second, guard-free submit path in this file.
  const openRepeatConfirmForPond = (sr) => {
    setConfirmGuard({
      repeatable: [{ record: sr, lastFeeding: lastFeedingByRecord[sr.id] }],
      skippedCount: 0,
    })
  }

  const handleConfirmRepeat = async () => {
    if (!confirmGuard) return
    setIsRepeating(true)
    const outcomes = []
    for (const { record: sr, lastFeeding } of confirmGuard.repeatable) {
      try {
        const res = await api.post(FISHERIES_DOMAIN.logsUrl(sr.id), {
          activity: FEEDING_ACTIVITY,
          activity_other_specify: '',
          date_of_activity: todayISO(),
          water_fish_condition: '',
          feed_type: lastFeeding.feed_type || '',
          feed_quantity_kg: lastFeeding.feed_quantity_kg ?? null,
          feed_brand: lastFeeding.feed_brand || '',
          observed_issue: '',
        })
        outcomes.push({ recordId: sr.id, ok: true, data: res.data })
      } catch (err) {
        outcomes.push({ recordId: sr.id, ok: false, error: err?.response?.data })
      }
    }
    setIsRepeating(false)
    setConfirmGuard(null)
    const okCount = outcomes.filter((o) => o.ok).length
    showToast(
      labels.fisherfolkHome.confirmGuard.partialSuccess(okCount, outcomes.length),
      okCount > 0 ? 'success' : 'error',
    )
    fetchAll()
  }

  // ── Full-screen sub-views ────────────────────────────────────────────

  if (logScreen) {
    return (
      <CitizenActivityLogScreen
        domain={FISHERIES_DOMAIN}
        theme={FISH_THEME}
        recordId={logScreen.record.id}
        record={logScreen.record}
        log={null}
        prefill={logScreen.prefillActivity ? { activityType: logScreen.prefillActivity } : undefined}
        onClose={() => setLogScreen(null)}
        onSuccess={handleLogSuccess}
      />
    )
  }

  if (view.kind === 'yield' || view.kind === 'assistance') {
    const isYield = view.kind === 'yield'
    return (
      <CitizenScreen hasTabBar>
        <CitizenSubHeader
          theme={FISH_THEME}
          title={isYield ? labels.yieldAnalysis.title : labels.farmerHome.secondary.assistanceTitle}
          subtitle={isYield ? labels.yieldAnalysis.subtitle : undefined}
          onBack={() => setView({ kind: 'home' })}
        />
        <CitizenBody>
          {isYield ? (
            <MyYieldAnalysisSection
              endpoint="/fisheries/yield-analysis/"
              cropLabel={labels.yieldAnalysis.fisheriesCropLabel}
              cropKey="species"
              dateKey="date_stocked"
              isFisheries
            />
          ) : (
            <MyAssistanceHistorySection endpoint="/interventions/my-fisherfolk-beneficiary-history/" />
          )}
        </CitizenBody>
        {tabBar(isYield ? 'harvests' : null)}
      </CitizenScreen>
    )
  }

  if (view.kind === 'profile') {
    return (
      <CitizenProfileScreen
        record={record}
        recordType="FISHERFOLK"
        theme={FISH_THEME}
        onBack={() => setView({ kind: 'home' })}
        tabBar={tabBar('myInfo')}
      />
    )
  }

  if (disasterScreen) {
    return (
      <CitizenDisasterScreen
        domain={FISHERIES_DOMAIN}
        theme={FISH_THEME}
        recordId={disasterScreen.record.id}
        record={disasterScreen.record}
        onClose={() => setDisasterScreen(null)}
        onSuccess={handleLogSuccess}
      />
    )
  }

  if (view.kind === 'pondPicker') {
    const activeRecords = stockingRecords.filter((sr) => ACTIVE_STATUSES.includes(sr.status))
    const isDisasterMode = pondPickerMode === 'disaster'
    return (
      <CitizenScreen>
        <CitizenSubHeader
          theme={FISH_THEME}
          title={labels.fisherfolkHome.pondPicker.title}
          subtitle={isDisasterMode ? labels.fisherfolkHome.pondPicker.disasterSubtitle : labels.fisherfolkHome.pondPicker.subtitle}
          onBack={() => setView({ kind: 'home' })}
        />
        <CitizenBody>
          {activeRecords.length === 0 ? (
            <CitizenEmptyState
              icon={DropletOff}
              iconClass="text-cz-text-muted"
              title={labels.fisherfolkHome.pondPicker.title}
              body={labels.fisherfolkHome.pondPicker.noPonds}
            />
          ) : (
            <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
              {activeRecords.map((sr, i) => (
                <button
                  key={sr.id}
                  type="button"
                  onClick={() => {
                    setView({ kind: 'home' })
                    if (isDisasterMode) setDisasterScreen({ record: sr })
                    else setLogScreen({ record: sr, prefillActivity: 'Disease Control' })
                  }}
                  className={`flex min-h-[44px] w-full items-center gap-[10px] px-[14px] py-[13px] text-left transition-colors hover:bg-cz-page ${
                    i < activeRecords.length - 1 ? 'border-b-[0.5px] border-cz-border' : ''
                  }`}
                >
                  <div className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${FISH_THEME.circleBg}`}>
                    <Fish size={18} className={FISH_THEME.circleIcon} aria-hidden="true" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-medium text-cz-text">
                      {labels.fisherfolkHome.myPonds.pondSpecies(
                        sr.pond_name || labels.common.unknown,
                        sr.species_name || labels.yieldAnalysis.fisheriesCropLabel,
                      )}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CitizenBody>
      </CitizenScreen>
    )
  }

  // ── Home ─────────────────────────────────────────────────────────────

  // Single source for both presentations — see FarmerHomeScreen for the
  // same pattern. "Log illness or mortality" leads the list because it is
  // the one entry that starts a task rather than opening a read-only view.
  const quickLinks = [
    { icon: User, label: labels.farmerHome.secondary.profileTitle, onClick: () => setView({ kind: 'profile' }) },
    { icon: Stethoscope, label: labels.fisherfolkHome.secondary.illnessTitle, onClick: () => { setPondPickerMode('illness'); setView({ kind: 'pondPicker' }) } },
    { icon: AlertTriangle, label: labels.fisherfolkHome.secondary.disasterTitle, onClick: () => { setPondPickerMode('disaster'); setView({ kind: 'pondPicker' }) } },
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
    <CitizenScreen hasTabBar>
      <CitizenHomeHeader
        theme={FISH_THEME}
        name={record.label}
        metaLine={`${labels.farmerHome.rsbsaPrefix} ${record.rsbsa_number || labels.common.unknown} · ${record.barangay || labels.common.unknown}`}
        onLogout={onLogout}
      />

      <CitizenHomeBody aside={isLoading ? null : quickLinksAside}>
        {isLoading ? (
          <p className="text-[15px] italic text-cz-text-2">{labels.fisherfolkHome.loading}</p>
        ) : (
          <>
            {/* FEED TODAY */}
            <SectionHeading>{labels.fisherfolkHome.feedToday.title}</SectionHeading>
            {dueRecords.length === 0 ? (
              <CitizenEmptyState
                icon={Fish}
                iconClass="text-cz-fish-fill"
                title={labels.fisherfolkHome.feedToday.emptyTitle}
                body={labels.fisherfolkHome.feedToday.emptyBody}
              />
            ) : (
              <StatusCard
                tone="warningFilled"
                badgeIcon={Clock}
                badgeText={labels.fisherfolkHome.feedToday.dueBadge(dueRecords.length)}
                actionIcon={repeatableDue.length > 0 ? Repeat : undefined}
                actionLabel={repeatableDue.length > 0 ? labels.fisherfolkHome.feedToday.repeatButton : undefined}
                onAction={openRepeatConfirm}
                footer={
                  <button
                    type="button"
                    onClick={() => setLogScreen({ record: dueRecords[0], prefillActivity: 'Feed Monitoring' })}
                    className="min-h-[44px] w-full pt-[10px] text-center text-cz-warn-accent"
                  >
                    <span className="text-[13px]">{labels.fisherfolkHome.feedToday.logSeparatelyLink}</span>
                  </button>
                }
              >
                {/* One line per due pond so the repeat is informed, not blind */}
                <div className="mb-3 space-y-0.5">
                  {dueRecords.map((sr) => {
                    const lastFeeding = lastFeedingByRecord[sr.id]
                    const pondName = sr.pond_name || sr.species_name || labels.common.unknown
                    return (
                      <p key={sr.id} className="text-[13px] leading-[1.5] text-cz-warn-body">
                        {lastFeeding
                          ? labels.fisherfolkHome.feedToday.lastFedPond(pondName, lastFeeding.feed_type, lastFeeding.feed_quantity_kg)
                          : labels.fisherfolkHome.feedToday.noPriorFeedingPond(pondName)}
                      </p>
                    )
                  })}
                </div>
              </StatusCard>
            )}

            {/* MY PONDS — one bordered container, compact rows */}
            <div className="mt-4">
              <SectionHeading>
                {labels.fisherfolkHome.myPonds.title}
                {pondRows.length > 0 && <span className="hidden sm:inline"> ({pondRows.length})</span>}
              </SectionHeading>
            </div>
            {pondRows.length === 0 ? (
              <CitizenEmptyState
                icon={DropletOff}
                iconClass="text-cz-text-muted"
                title={labels.fisherfolkHome.myPonds.title}
                body={labels.fisherfolkHome.myPonds.empty}
              />
            ) : (
              // Below 1024px: Batch F's single bordered container with
              // divider-joined rows, untouched. At >=1024px the container
              // dissolves (border/radius/bg/overflow all cleared) and each row
              // becomes its own compact card in the same capped 2-column grid
              // the crop cards use — so the grid/list boundary sits exactly at
              // the lg breakpoint rather than at a pond count. Splitting by
              // count instead would mean a fisherfolk with 3 ponds saw a
              // different treatment than one with 5, for no reason they could
              // perceive.
              <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface sm:grid sm:grid-cols-2 sm:items-start sm:gap-[10px] sm:overflow-visible sm:rounded-none sm:border-0 sm:bg-transparent">
                {pondRows.map(({ pond, record: sr }, i) => {
                  const isDue = sr && dueRecords.some((d) => d.id === sr.id)
                  const progress = sr ? cycleProgress(sr.date_stocked, sr.expected_harvest_date) : null
                  const divider = i < pondRows.length - 1 ? 'border-b-[0.5px] border-cz-border' : ''
                  const canRepeat = isDue && repeatableDue.some((d) => d.id === sr.id)
                  // The row used to BE a <button>. It can't stay one now that
                  // the basis's per-pond actions sit inside it — a button
                  // inside a button is invalid and breaks keyboard traversal.
                  // The outer element is a plain div and the tap-to-log target
                  // is the inner content button instead, so the whole
                  // identity/progress area still opens the log screen exactly
                  // as before.
                  const ContentTag = sr ? 'button' : 'div'
                  return (
                    <div
                      key={pond.id}
                      className={`block w-full px-[14px] py-[13px] text-left ${divider} sm:rounded-[10px] sm:border-[0.5px] sm:border-cz-border-strong sm:bg-cz-surface sm:p-3`}
                    >
                    <ContentTag
                      {...(sr ? { type: 'button', onClick: () => setLogScreen({ record: sr }) } : {})}
                      className={`block w-full text-left ${
                        sr ? 'min-h-[44px] transition-colors hover:bg-cz-page' : ''
                      }`}
                    >
                      <div className="mb-[9px] flex items-center gap-[10px]">
                        <div
                          className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full ${
                            sr ? FISH_THEME.circleBg : 'bg-cz-page'
                          }`}
                        >
                          {sr
                            ? <Fish size={18} className={FISH_THEME.circleIcon} aria-hidden="true" />
                            : <DropletOff size={18} className="text-cz-text-muted" aria-hidden="true" />}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className={`truncate text-[15px] font-medium ${sr ? 'text-cz-text' : 'text-cz-text-2'}`}>
                            {sr
                              ? labels.fisherfolkHome.myPonds.pondSpecies(
                                  pond.name,
                                  sr.species_name || labels.yieldAnalysis.fisheriesCropLabel,
                                )
                              : pond.name}
                          </p>
                          <p className={`truncate text-[12px] ${sr ? 'text-cz-text-2' : 'text-cz-text-muted'}`}>
                            {sr
                              ? labels.fisherfolkHome.myPonds.areaFingerlings(
                                  sr.area_hectares ?? labels.common.unknown,
                                  sr.number_of_fingerlings ?? labels.common.unknown,
                                )
                              : labels.fisherfolkHome.myPonds.unstockedLabel}
                          </p>
                        </div>
                        {isDue && (
                          <span className="flex shrink-0 items-center gap-1 rounded-[10px] bg-cz-warn-bg px-2 py-[3px] text-[11px] font-medium text-cz-warn-accent">
                            <Clock size={11} aria-hidden="true" />
                            {labels.fisherfolkHome.feedToday.dueTodayBadge}
                          </span>
                        )}
                      </div>

                      {progress && (
                        <>
                          <ProgressTrack theme={FISH_THEME} pct={progress.pct} height={6} />
                          <p className="mt-[5px] text-[11px] text-cz-text-2">
                            {labels.fisherfolkHome.myPonds.progressDayOf(progress.elapsed, progress.total)}
                          </p>
                        </>
                      )}
                    </ContentTag>

                    {/* PER-POND FEEDING ACTIONS (UI basis). Only on ponds that
                        are actually due — putting them on every pond would
                        invite logging a feeding for a pond that isn't due.
                        "Ulitin" only appears when there IS a prior feeding to
                        repeat; otherwise the single "Ibang pakain" button
                        stands alone rather than offering a repeat that would
                        have nothing to copy. */}
                    {isDue && (
                      <div className="mt-[10px] flex gap-2">
                        {canRepeat && (
                          <button
                            type="button"
                            onClick={() => openRepeatConfirmForPond(sr)}
                            className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-[8px] bg-cz-fish-pale px-2 py-[11px] text-cz-fish-deep transition-opacity hover:opacity-90"
                          >
                            <Check size={14} aria-hidden="true" />
                            <span className="text-[14px] font-medium">
                              {labels.fisherfolkHome.feedToday.repeatPond}
                            </span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setLogScreen({ record: sr, prefillActivity: FEEDING_ACTIVITY })}
                          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong px-2 py-[11px] text-cz-text transition-colors hover:bg-cz-page"
                        >
                          <span className="text-[14px]">
                            {labels.fisherfolkHome.feedToday.logDifferentPond}
                          </span>
                        </button>
                      </div>
                    )}
                    </div>
                  )
                })}
              </div>
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

      {/* MANDATORY confirmation guard — shows exactly what will be logged,
          pond by pond, before any repeat submission fires. Re-skinned
          only; the gate itself is unchanged. */}
      {confirmGuard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isRepeating && setConfirmGuard(null)}
        >
          <div
            className="w-full rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[18px] sm:max-w-[420px]"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-[17px] font-medium text-cz-text">{labels.fisherfolkHome.confirmGuard.title}</h2>
            <p className="mt-1.5 text-[13px] leading-[1.5] text-cz-text-2">
              {labels.fisherfolkHome.confirmGuard.body}
            </p>
            <ul className="mt-3 space-y-1.5">
              {confirmGuard.repeatable.map(({ record: sr, lastFeeding }) => (
                <li key={sr.id} className="rounded-[8px] bg-cz-page px-3 py-2.5 text-[14px] text-cz-text">
                  {labels.fisherfolkHome.confirmGuard.pondLine(
                    sr.pond_name || sr.species_name,
                    lastFeeding.feed_type,
                    lastFeeding.feed_quantity_kg,
                  )}
                </li>
              ))}
            </ul>
            {confirmGuard.skippedCount > 0 && (
              <p className="mt-3 text-[13px] leading-[1.5] text-cz-warn-accent">
                {labels.fisherfolkHome.confirmGuard.skippedNote(confirmGuard.skippedCount)}
              </p>
            )}
            <button
              type="button"
              disabled={isRepeating}
              onClick={handleConfirmRepeat}
              className={`mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[8px] px-4 py-[13px] transition-opacity hover:opacity-90 disabled:opacity-50 ${FISH_THEME.solidBtn}`}
            >
              <span className="text-[15px] font-medium">{labels.fisherfolkHome.confirmGuard.confirmButton}</span>
            </button>
            <button
              type="button"
              disabled={isRepeating}
              onClick={() => setConfirmGuard(null)}
              className="mt-1 min-h-[44px] w-full py-[14px] text-center text-cz-text-2"
            >
              <span className="text-[14px]">{labels.fisherfolkHome.confirmGuard.cancelButton}</span>
            </button>
          </div>
        </div>
      )}
      {tabBar('home')}
    </CitizenScreen>
  )
}
