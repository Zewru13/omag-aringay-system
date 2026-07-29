import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Clock, HeartHandshake, LogOut, ShieldAlert, Waves, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { FISHERIES_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogModal from './CitizenActivityLogModal.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { labels } from './labels.js'

const todayISO = () => new Date().toISOString().split('T')[0]
const ACTIVE_STATUSES = ['Stocked', 'Near Harvest']

// Batch F — task-first, single-scroll Fisherfolk home screen, mirroring
// FarmerHomeScreen's structure (Batch E) adapted for multiple ponds and
// daily feeding. Presentation-only: every fetch below hits either an
// endpoint Batch 11 already scoped to the caller's own fisherfolk record
// (stocking records, activity logs, yield analysis, assistance history),
// or one widened this batch the same way Batch E widened the crop
// suggestion endpoint — GET /fisheries/fisherfolk/<id>/ponds/ (own ponds
// only, via IsStaffOrOwnRecordCitizen) and GET /fisheries/feed-types/
// (shared reference data, IsAuthenticated) — see fisheries/views.py. No
// new permission, validation, or create/edit capability beyond that.
export default function FisherfolkHomeScreen({ record, onLogout }) {
  const { showToast } = useToast()
  const [ponds, setPonds] = useState([])
  const [stockingRecords, setStockingRecords] = useState([])
  const [lastFeedingByRecord, setLastFeedingByRecord] = useState({}) // recordId -> log | null
  const [isLoading, setIsLoading] = useState(true)

  const [view, setView] = useState({ kind: 'home' }) // 'home' | 'yield' | 'assistance' | 'pondPicker'
  const [logModal, setLogModal] = useState(null) // { record, prefillActivity }
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
    if (okCount === outcomes.length) {
      showToast(labels.fisherfolkHome.confirmGuard.partialSuccess(okCount, outcomes.length), 'success')
    } else {
      showToast(labels.fisherfolkHome.confirmGuard.partialSuccess(okCount, outcomes.length), okCount > 0 ? 'success' : 'error')
    }
    fetchAll()
  }

  if (view.kind === 'yield' || view.kind === 'assistance') {
    const isYield = view.kind === 'yield'
    return (
      <div className="min-h-screen bg-[#F5F7F5]">
        <div className="mx-auto max-w-lg px-4 py-6">
          <button
            type="button"
            onClick={() => setView({ kind: 'home' })}
            className="mb-4 flex min-h-[44px] items-center gap-1.5 text-[15px] font-medium text-[#4A5E4A]"
          >
            <ChevronRight size={18} className="rotate-180" /> {labels.farmerHome.secondary.backToHome}
          </button>
          <h1 className="mb-4 text-[18px] font-semibold text-[#1A2B1A]">
            {isYield ? labels.farmerHome.secondary.harvestResultsTitle : labels.farmerHome.secondary.assistanceTitle}
          </h1>
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
        </div>
      </div>
    )
  }

  if (view.kind === 'pondPicker') {
    const activeRecords = stockingRecords.filter((sr) => ACTIVE_STATUSES.includes(sr.status))
    return (
      <div className="min-h-screen bg-[#F5F7F5]">
        <div className="mx-auto max-w-lg px-4 py-6">
          <button
            type="button"
            onClick={() => setView({ kind: 'home' })}
            className="mb-4 flex min-h-[44px] items-center gap-1.5 text-[15px] font-medium text-[#4A5E4A]"
          >
            <ChevronRight size={18} className="rotate-180" /> {labels.farmerHome.secondary.backToHome}
          </button>
          <h1 className="text-[18px] font-semibold text-[#1A2B1A]">{labels.fisherfolkHome.pondPicker.title}</h1>
          <p className="mt-1 text-[14px] text-[#7A8E7A]">{labels.fisherfolkHome.pondPicker.subtitle}</p>

          {activeRecords.length === 0 ? (
            <p className="mt-5 rounded-2xl border border-[#E2E8E2] bg-white p-5 text-[15px] italic text-[#A8BCA8]">
              {labels.fisherfolkHome.pondPicker.noPonds}
            </p>
          ) : (
            <div className="mt-5 space-y-2">
              {activeRecords.map((sr) => (
                <button
                  key={sr.id}
                  type="button"
                  onClick={() => { setView({ kind: 'home' }); setLogModal({ record: sr, prefillActivity: 'Disease Control' }) }}
                  className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 text-left hover:bg-[#F9FAF9] transition-colors"
                >
                  <ShieldAlert size={18} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />
                  <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-medium text-[#1A2B1A]">{FISHERIES_DOMAIN.recordTitle(sr)}</p>
                    <p className="text-[13px] text-[#7A8E7A]">{sr.pond_name || labels.common.unknown}</p>
                  </div>
                  <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7F5]">
      {/* Header — deep teal band, distinguishes the fisheries domain from crop's #173404 */}
      <header className="bg-[#04342C] px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-lg items-start justify-between">
          <div>
            <p className="text-[13px] text-[#9FD4C7]">{labels.farmerHome.headerGreeting}</p>
            <h1 className="text-[20px] font-semibold leading-tight text-white">{record.label}</h1>
            <p className="mt-1 text-[13px] text-[#9FD4C7]">
              {labels.farmerHome.rsbsaPrefix} {record.rsbsa_number || labels.common.unknown} · {record.barangay || labels.common.unknown}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label={labels.header.logOut}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#9FD4C7] hover:bg-white/10 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-5 sm:px-6">
        {isLoading ? (
          <p className="text-[15px] text-[#7A8E7A] italic">{labels.fisherfolkHome.loading}</p>
        ) : (
          <div className="space-y-6">
            {/* FEED TODAY — the hero */}
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#4A5E4A]">
                {labels.fisherfolkHome.feedToday.title}
              </h2>
              {dueRecords.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#B9E4DA] bg-[#EAF7F3] px-4 py-5">
                  <Waves size={28} className="shrink-0 text-[#04342C]" aria-hidden="true" />
                  <div>
                    <p className="text-[16px] font-semibold text-[#04342C]">{labels.fisherfolkHome.feedToday.emptyTitle}</p>
                    <p className="mt-0.5 text-[14px] text-[#3C6E63]">{labels.fisherfolkHome.feedToday.emptyBody}</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <div className="mb-2 flex items-center gap-1.5">
                    <Clock size={16} className="text-amber-600" aria-hidden="true" />
                    <span className="text-[12px] font-bold uppercase tracking-wide text-amber-700">
                      {labels.fisherfolkHome.feedToday.dueSummary(dueRecords.length)}
                    </span>
                  </div>
                  <ul className="space-y-2 mb-3">
                    {dueRecords.map((sr) => {
                      const lastFeeding = lastFeedingByRecord[sr.id]
                      const isOverdue = sr.next_feeding_date < todayISO()
                      return (
                        <li key={sr.id} className="rounded-xl bg-white/70 px-3 py-2">
                          <div className="flex items-center gap-1.5">
                            {isOverdue
                              ? <AlertTriangle size={14} className="text-rose-600" aria-hidden="true" />
                              : <Clock size={14} className="text-amber-600" aria-hidden="true" />}
                            <span className={`text-[11px] font-bold uppercase tracking-wide ${isOverdue ? 'text-rose-700' : 'text-amber-700'}`}>
                              {isOverdue ? labels.fisherfolkHome.feedToday.overdueBadge : labels.fisherfolkHome.feedToday.dueTodayBadge}
                            </span>
                          </div>
                          <p className="text-[15px] font-semibold text-[#1A2B1A]">{sr.pond_name || sr.species_name}</p>
                          <p className="text-[13px] text-[#4A5E4A]">
                            {lastFeeding
                              ? labels.fisherfolkHome.feedToday.lastFed(lastFeeding.feed_type, lastFeeding.feed_quantity_kg, lastFeeding.date_of_activity)
                              : labels.fisherfolkHome.feedToday.noPriorFeeding}
                          </p>
                        </li>
                      )
                    })}
                  </ul>
                  {repeatableDue.length > 0 && (
                    <button
                      type="button"
                      onClick={openRepeatConfirm}
                      className="flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#04342C] px-4 text-[15px] font-semibold text-white hover:bg-[#032722] transition-colors"
                    >
                      {labels.fisherfolkHome.feedToday.repeatButton}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setLogModal({ record: dueRecords[0], prefillActivity: 'Feed Monitoring' })}
                    className="mt-2 flex min-h-[44px] w-full items-center justify-center text-[13px] font-medium text-[#4A5E4A] underline"
                  >
                    {labels.fisherfolkHome.feedToday.logSeparatelyLink}
                  </button>
                </div>
              )}
            </section>

            {/* MY PONDS — compact list */}
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#4A5E4A]">
                {labels.fisherfolkHome.myPonds.title}
              </h2>
              {pondRows.length === 0 ? (
                <p className="rounded-2xl border border-[#E2E8E2] bg-white p-5 text-[15px] italic text-[#A8BCA8]">
                  {labels.fisherfolkHome.myPonds.empty}
                </p>
              ) : (
                <div className="divide-y divide-[#E2E8E2] rounded-2xl border border-[#E2E8E2] bg-white overflow-hidden">
                  {pondRows.map(({ pond, record: sr }) => {
                    const isDue = sr && dueRecords.some((d) => d.id === sr.id)
                    return (
                      <button
                        key={pond.id}
                        type="button"
                        onClick={() => sr && setLogModal({ record: sr })}
                        disabled={!sr}
                        className={`flex w-full min-h-[44px] items-center gap-3 px-4 py-3 text-left transition-colors ${
                          sr ? 'hover:bg-[#F9FAF9]' : 'opacity-50 cursor-default'
                        }`}
                      >
                        <Waves size={18} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[15px] font-medium text-[#1A2B1A] truncate">{pond.name}</p>
                            {isDue && (
                              <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-amber-700">
                                {labels.fisherfolkHome.feedToday.dueTodayBadge}
                              </span>
                            )}
                          </div>
                          {sr ? (
                            <>
                              <p className="text-[13px] text-[#7A8E7A]">
                                {labels.fisherfolkHome.myPonds.speciesArea(sr.species_name, sr.area_hectares ?? '—')} · {labels.fisherfolkHome.myPonds.fingerlings(sr.number_of_fingerlings ?? '—')}
                              </p>
                              {sr.date_stocked && sr.expected_harvest_date && (
                                <div className="mt-1.5 h-1.5 w-full max-w-[200px] overflow-hidden rounded-full bg-slate-200">
                                  <MiniProgressBar startDate={sr.date_stocked} expectedHarvestDate={sr.expected_harvest_date} />
                                </div>
                              )}
                            </>
                          ) : (
                            <p className="text-[13px] text-[#A8BCA8] italic">{labels.fisherfolkHome.myPonds.unstockedLabel}</p>
                          )}
                        </div>
                        {sr && <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </section>

            {/* QUIET SECONDARY ROWS */}
            <section className="space-y-2">
              <button
                type="button"
                onClick={() => setView({ kind: 'pondPicker' })}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 text-left hover:bg-[#F9FAF9] transition-colors"
              >
                <ShieldAlert size={18} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-[#1A2B1A]">{labels.fisherfolkHome.secondary.illnessTitle}</p>
                  <p className="text-[13px] text-[#7A8E7A]">{labels.fisherfolkHome.secondary.illnessSubtitle}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setView({ kind: 'yield' })}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 text-left hover:bg-[#F9FAF9] transition-colors"
              >
                <Wheat size={18} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-[#1A2B1A]">{labels.farmerHome.secondary.harvestResultsTitle}</p>
                  <p className="text-[13px] text-[#7A8E7A]">{labels.farmerHome.secondary.harvestResultsSubtitle}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={() => setView({ kind: 'assistance' })}
                className="flex min-h-[44px] w-full items-center gap-3 rounded-xl border border-[#E2E8E2] bg-white px-4 py-3 text-left hover:bg-[#F9FAF9] transition-colors"
              >
                <HeartHandshake size={18} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />
                <div className="flex-1 min-w-0">
                  <p className="text-[15px] font-medium text-[#1A2B1A]">{labels.farmerHome.secondary.assistanceTitle}</p>
                  <p className="text-[13px] text-[#7A8E7A]">{labels.farmerHome.secondary.assistanceSubtitle}</p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[#A8BCA8]" aria-hidden="true" />
              </button>
            </section>
          </div>
        )}
      </main>

      {/* MANDATORY confirmation guard — shows exactly what will be logged,
          pond by pond, before any repeat submission fires. */}
      {confirmGuard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => !isRepeating && setConfirmGuard(null)}>
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-lg" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-[17px] font-semibold text-[#1A2B1A]">{labels.fisherfolkHome.confirmGuard.title}</h2>
            <p className="mt-1 text-[14px] text-[#4A5E4A]">{labels.fisherfolkHome.confirmGuard.body}</p>
            <ul className="mt-3 space-y-1.5">
              {confirmGuard.repeatable.map(({ record: sr, lastFeeding }) => (
                <li key={sr.id} className="rounded-lg bg-[#F5F7F5] px-3 py-2 text-[14px] text-[#1A2B1A]">
                  {labels.fisherfolkHome.confirmGuard.pondLine(sr.pond_name || sr.species_name, lastFeeding.feed_type, lastFeeding.feed_quantity_kg)}
                </li>
              ))}
            </ul>
            {confirmGuard.skippedCount > 0 && (
              <p className="mt-3 text-[13px] text-amber-700">{labels.fisherfolkHome.confirmGuard.skippedNote(confirmGuard.skippedCount)}</p>
            )}
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setConfirmGuard(null)} disabled={isRepeating}>
                {labels.fisherfolkHome.confirmGuard.cancelButton}
              </Button>
              <Button type="button" isLoading={isRepeating} onClick={handleConfirmRepeat}>
                {labels.fisherfolkHome.confirmGuard.confirmButton}
              </Button>
            </div>
          </div>
        </div>
      )}

      {logModal && (
        <CitizenActivityLogModal
          domain={FISHERIES_DOMAIN}
          recordId={logModal.record.id}
          record={logModal.record}
          log={null}
          prefill={logModal.prefillActivity ? { activityType: logModal.prefillActivity } : undefined}
          onClose={() => setLogModal(null)}
          onSuccess={handleLogSuccess}
        />
      )}
    </div>
  )
}

// Slim inline progress bar for the compact pond list — GrowthProgressBar
// (used on the crop side) renders a full labeled block; this row only has
// room for the bar itself.
function MiniProgressBar({ startDate, expectedHarvestDate }) {
  const start = new Date(startDate + 'T00:00:00')
  const target = new Date(expectedHarvestDate + 'T00:00:00')
  const totalDays = Math.round((target - start) / 86400000)
  if (!totalDays || totalDays <= 0) return null
  const daysElapsed = Math.round((new Date(new Date().toDateString()) - start) / 86400000)
  const pct = Math.min(100, Math.max(0, (daysElapsed / totalDays) * 100))
  const barColor = pct < 70 ? 'bg-emerald-500' : pct < 100 ? 'bg-amber-500' : 'bg-slate-400'
  return <div className={`h-full rounded-full transition-all ${barColor}`} style={{ width: `${pct}%` }} />
}
