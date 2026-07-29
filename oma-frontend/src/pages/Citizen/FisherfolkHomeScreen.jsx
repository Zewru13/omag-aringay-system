import { useEffect, useState } from 'react'
import { BarChart3, Clock, DropletOff, Fish, Gift, Repeat, Stethoscope } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import { FISHERIES_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogScreen from './CitizenActivityLogModal.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { labels } from './labels.js'
import {
  CitizenBody, CitizenEmptyState, CitizenHomeHeader, CitizenScreen, CitizenSubHeader,
  FISH_THEME, ProgressTrack, SectionHeading, SecondaryRow, SecondaryRows, StatusCard,
  cycleProgress,
} from './citizenUI.jsx'

const todayISO = () => new Date().toISOString().split('T')[0]
const ACTIVE_STATUSES = ['Stocked', 'Near Harvest']

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

  const openRepeatConfirm = () => {
    setConfirmGuard({
      repeatable: repeatableDue.map((sr) => ({ record: sr, lastFeeding: lastFeedingByRecord[sr.id] })),
      skippedCount: nonRepeatableDue.length,
    })
  }

  const handleConfirmRepeat = async () => {
    if (!confirmGuard) return
    setIsRepeating(true)
    const outcomes = []
    for (const { record: sr, lastFeeding } of confirmGuard.repeatable) {
      try {
        const res = await api.post(FISHERIES_DOMAIN.logsUrl(sr.id), {
          activity: 'Feed Monitoring',
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
      <CitizenScreen>
        <CitizenSubHeader
          theme={FISH_THEME}
          title={isYield ? labels.farmerHome.secondary.harvestResultsTitle : labels.farmerHome.secondary.assistanceTitle}
          onBack={() => setView({ kind: 'home' })}
        />
        <CitizenBody>
          {isYield ? (
            <MyYieldAnalysisSection
              endpoint="/fisheries/yield-analysis/"
              cropLabel={labels.yieldAnalysis.fisheriesCropLabel}
              cropKey="species"
              dateLabel={labels.yieldAnalysis.fisheriesDateLabel}
              dateKey="date_stocked"
            />
          ) : (
            <MyAssistanceHistorySection endpoint="/interventions/my-fisherfolk-beneficiary-history/" />
          )}
        </CitizenBody>
      </CitizenScreen>
    )
  }

  if (view.kind === 'pondPicker') {
    const activeRecords = stockingRecords.filter((sr) => ACTIVE_STATUSES.includes(sr.status))
    return (
      <CitizenScreen>
        <CitizenSubHeader
          theme={FISH_THEME}
          title={labels.fisherfolkHome.pondPicker.title}
          subtitle={labels.fisherfolkHome.pondPicker.subtitle}
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
                  onClick={() => { setView({ kind: 'home' }); setLogScreen({ record: sr, prefillActivity: 'Disease Control' }) }}
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

  return (
    <CitizenScreen>
      <CitizenHomeHeader
        theme={FISH_THEME}
        name={record.label}
        metaLine={`${labels.farmerHome.rsbsaPrefix} ${record.rsbsa_number || labels.common.unknown} · ${record.barangay || labels.common.unknown}`}
        onLogout={onLogout}
      />

      <CitizenBody>
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
              <SectionHeading>{labels.fisherfolkHome.myPonds.title}</SectionHeading>
            </div>
            {pondRows.length === 0 ? (
              <CitizenEmptyState
                icon={DropletOff}
                iconClass="text-cz-text-muted"
                title={labels.fisherfolkHome.myPonds.title}
                body={labels.fisherfolkHome.myPonds.empty}
              />
            ) : (
              <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
                {pondRows.map(({ pond, record: sr }, i) => {
                  const isDue = sr && dueRecords.some((d) => d.id === sr.id)
                  const progress = sr ? cycleProgress(sr.date_stocked, sr.expected_harvest_date) : null
                  const divider = i < pondRows.length - 1 ? 'border-b-[0.5px] border-cz-border' : ''
                  const RowTag = sr ? 'button' : 'div'
                  return (
                    <RowTag
                      key={pond.id}
                      {...(sr ? { type: 'button', onClick: () => setLogScreen({ record: sr }) } : {})}
                      className={`block w-full px-[14px] py-[13px] text-left ${divider} ${
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
                    </RowTag>
                  )
                })}
              </div>
            )}

            {/* SECONDARY ROWS */}
            <SecondaryRows>
              <SecondaryRow
                icon={Stethoscope}
                label={labels.fisherfolkHome.secondary.illnessTitle}
                onClick={() => setView({ kind: 'pondPicker' })}
              />
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

      {/* MANDATORY confirmation guard — shows exactly what will be logged,
          pond by pond, before any repeat submission fires. Re-skinned
          only; the gate itself is unchanged. */}
      {confirmGuard && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => !isRepeating && setConfirmGuard(null)}
        >
          <div
            className="w-full max-w-[340px] rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-[18px]"
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
    </CitizenScreen>
  )
}
