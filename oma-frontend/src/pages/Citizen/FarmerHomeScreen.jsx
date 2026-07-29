import { useEffect, useState } from 'react'
import { AlertTriangle, ChevronRight, Clock, HeartHandshake, LogOut, Sprout, Wheat } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import GrowthProgressBar from '../../components/UI/GrowthProgressBar.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogModal from './CitizenActivityLogModal.jsx'
import FarmerCropHistoryView from './FarmerCropHistoryView.jsx'
import MyYieldAnalysisSection from './MyYieldAnalysisSection.jsx'
import MyAssistanceHistorySection from './MyAssistanceHistorySection.jsx'
import { labels } from './labels.js'

// Batch E — task-first, single-scroll Farmer home screen, replacing the
// old admin-style tab bar. Presentation-only: every fetch below hits the
// exact same own-record-scoped endpoints Batch 11 already built (plus the
// suggestions endpoint, widened to IsStaffOrOwnRecordCitizen this batch —
// see production/views.py CropActivitySuggestionsView) — no new
// permission, validation, or create/edit capability is introduced here.
export default function FarmerHomeScreen({ record, onLogout }) {
  const { showToast } = useToast()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [tasksByRecord, setTasksByRecord] = useState({}) // recordId -> [{...suggestion}]

  const [view, setView] = useState({ kind: 'home' }) // 'home' | 'yield' | 'assistance' | { kind: 'history', record }
  const [logModal, setLogModal] = useState(null) // { record, prefillActivity }

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
  // each tagged with the crop record it belongs to.
  const needsAttention = records.flatMap((rec) =>
    (tasksByRecord[rec.id] || [])
      .filter((s) => s.status === 'overdue' || s.status === 'due_now')
      .map((s) => ({ ...s, record: rec })),
  ).sort((a, b) => (a.status === b.status ? 0 : a.status === 'overdue' ? -1 : 1))

  const handleLogSuccess = () => {
    fetchRecords()
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
              endpoint="/production/yield-analysis/"
              cropLabel={labels.yieldAnalysis.cropCropLabel}
              cropKey="crop_type"
              dateLabel={labels.yieldAnalysis.cropDateLabel}
              dateKey="date_planted"
            />
          ) : (
            <MyAssistanceHistorySection endpoint="/interventions/my-beneficiary-history/" />
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#F5F7F5]">
      {/* Header — dark green band, identity confirmation after RSBSA login */}
      <header className="bg-[#173404] px-4 py-5 sm:px-6">
        <div className="mx-auto flex max-w-lg items-start justify-between">
          <div>
            <p className="text-[13px] text-[#B7D9A8]">{labels.farmerHome.headerGreeting}</p>
            <h1 className="text-[20px] font-semibold leading-tight text-white">{record.label}</h1>
            <p className="mt-1 text-[13px] text-[#B7D9A8]">
              {labels.farmerHome.rsbsaPrefix} {record.rsbsa_number || labels.common.unknown} · {record.barangay || labels.common.unknown}
            </p>
          </div>
          <button
            type="button"
            onClick={onLogout}
            aria-label={labels.header.logOut}
            className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg text-[#B7D9A8] hover:bg-white/10 transition-colors"
          >
            <LogOut size={20} />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-lg px-4 py-5 sm:px-6">
        {isLoading ? (
          <p className="text-[15px] text-[#7A8E7A] italic">{labels.farmerHome.loading}</p>
        ) : (
          <div className="space-y-6">
            {/* NEEDS ATTENTION — the hero */}
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#4A5E4A]">
                {labels.farmerHome.needsAttention.title}
              </h2>
              {needsAttention.length === 0 ? (
                <div className="flex items-center gap-3 rounded-2xl border border-[#C8E6C9] bg-[#F0F7F0] px-4 py-5">
                  <Sprout size={28} className="shrink-0 text-[#1B4D2E]" aria-hidden="true" />
                  <div>
                    <p className="text-[16px] font-semibold text-[#1B4D2E]">{labels.farmerHome.needsAttention.emptyTitle}</p>
                    <p className="mt-0.5 text-[14px] text-[#4A5E4A]">{labels.farmerHome.needsAttention.emptyBody}</p>
                  </div>
                </div>
              ) : (
                <div className="space-y-3">
                  {needsAttention.map((task) => {
                    const isOverdue = task.status === 'overdue'
                    return (
                      <div
                        key={`${task.record.id}-${task.occurrence_key}`}
                        className={`rounded-2xl border p-4 ${isOverdue ? 'border-rose-300 bg-rose-50' : 'border-amber-300 bg-amber-50'}`}
                      >
                        <div className="mb-2 flex items-center gap-1.5">
                          {isOverdue
                            ? <AlertTriangle size={16} className="text-rose-600" aria-hidden="true" />
                            : <Clock size={16} className="text-amber-600" aria-hidden="true" />}
                          <span className={`text-[12px] font-bold uppercase tracking-wide ${isOverdue ? 'text-rose-700' : 'text-amber-700'}`}>
                            {isOverdue ? labels.farmerHome.needsAttention.overdueBadge : labels.farmerHome.needsAttention.dueTodayBadge}
                          </span>
                        </div>
                        <p className="text-[17px] font-semibold text-[#1A2B1A]">{task.activity_name}</p>
                        <p className="mt-0.5 text-[14px] text-[#4A5E4A]">
                          {labels.farmerHome.needsAttention.contextLine(
                            task.record.crop_type_name || 'Crop',
                            task.record.farm_location_barangay || labels.common.unknown,
                            task.record.area_planted_ha ?? '—',
                          )}
                        </p>
                        <button
                          type="button"
                          onClick={() => setLogModal({ record: task.record, prefillActivity: task.activity_name })}
                          className="mt-3 flex min-h-[44px] w-full items-center justify-center rounded-xl bg-[#1B4D2E] px-4 text-[15px] font-semibold text-white hover:bg-[#153f25] transition-colors"
                        >
                          {labels.farmerHome.needsAttention.actionLabel}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </section>

            {/* MY CROPS */}
            <section>
              <h2 className="mb-3 text-[13px] font-semibold uppercase tracking-wider text-[#4A5E4A]">
                {labels.farmerHome.myCrops.title}
              </h2>
              {records.length === 0 ? (
                <p className="rounded-2xl border border-[#E2E8E2] bg-white p-5 text-[15px] italic text-[#A8BCA8]">
                  {labels.farmerHome.myCrops.empty}
                </p>
              ) : (
                <div className="space-y-3">
                  {records.map((rec) => (
                    <div key={rec.id} className="rounded-2xl border border-[#E2E8E2] bg-white p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-[17px] font-semibold text-[#1A2B1A]">{rec.crop_type_name || 'Crop'}</p>
                          <p className="text-[14px] text-[#7A8E7A]">
                            {rec.farm_location_barangay || labels.common.unknown} · {rec.area_planted_ha ?? '—'} ha · {labels.farmerHome.myCrops.seasonYear(rec.season, rec.year)}
                          </p>
                        </div>
                        <Wheat size={22} className="shrink-0 text-[#7A8E7A]" aria-hidden="true" />
                      </div>

                      {rec.date_planted && rec.expected_harvest_date && (
                        <div className="mt-3">
                          <GrowthProgressBar startLabel="Planted" startDate={rec.date_planted} expectedHarvestDate={rec.expected_harvest_date} />
                        </div>
                      )}
                      {rec.expected_harvest_date && (
                        <p className="mt-2 text-[13px] text-[#7A8E7A]">{labels.farmerHome.myCrops.expectedHarvest(rec.expected_harvest_date)}</p>
                      )}

                      <div className="mt-3 flex gap-2">
                        <button
                          type="button"
                          onClick={() => setLogModal({ record: rec })}
                          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[#1B4D2E] px-3 text-[14px] font-semibold text-[#1B4D2E] hover:bg-[#F0F7F0] transition-colors"
                        >
                          {labels.farmerHome.myCrops.logActivity}
                        </button>
                        <button
                          type="button"
                          onClick={() => setView({ kind: 'history', record: rec })}
                          className="flex min-h-[44px] flex-1 items-center justify-center rounded-xl border border-[#C8D5C8] px-3 text-[14px] font-semibold text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
                        >
                          {labels.farmerHome.myCrops.viewHistory}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* QUIET SECONDARY ROWS */}
            <section className="space-y-2">
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

      {logModal && (
        <CitizenActivityLogModal
          domain={CROP_DOMAIN}
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
