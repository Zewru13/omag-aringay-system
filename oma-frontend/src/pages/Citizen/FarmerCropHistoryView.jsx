import { useEffect, useState } from 'react'
import { ArrowLeft, Pencil, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { CROP_DOMAIN } from './citizenDomainConfig.js'
import CitizenActivityLogModal from './CitizenActivityLogModal.jsx'
import CitizenHarvestModal from './CitizenHarvestModal.jsx'
import { labels } from './labels.js'

// Batch E — "View History" destination for a single crop record from the
// new Farmer home screen. Same data/actions as the old MyRecordsPanel
// accordion row (own-entry edit only, staff entries read-only) — just
// presented as its own full page instead of an expand-in-place row, to
// match the new single-scroll, no-tabs navigation model.
export default function FarmerCropHistoryView({ record, onBack, onRecordChanged }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [logs, setLogs] = useState([])
  const [harvests, setHarvests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [modal, setModal] = useState(null) // { kind: 'log' | 'harvest', entry }

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
      showToast(labels.myRecordsPanel.loadError(CROP_DOMAIN.recordLabel.toLowerCase()), 'error')
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

  return (
    <div className="min-h-screen bg-[#F5F7F5]">
      <div className="mx-auto max-w-lg px-4 py-6">
        <button
          type="button"
          onClick={onBack}
          className="mb-4 flex min-h-[44px] items-center gap-1.5 text-[15px] font-medium text-[#4A5E4A]"
        >
          <ArrowLeft size={18} /> {labels.farmerHome.secondary.backToHome}
        </button>

        <h1 className="text-[18px] font-semibold text-[#1A2B1A]">{labels.farmerHome.history.title(CROP_DOMAIN.recordTitle(record))}</h1>

        {isLoading ? (
          <p className="mt-6 text-[15px] text-[#7A8E7A] italic">{labels.farmerHome.history.loading}</p>
        ) : (
          <div className="mt-5 space-y-5">
            <section className="rounded-2xl border border-[#E2E8E2] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#7A8E7A]">{labels.farmerHome.history.activityLogTitle}</h2>
                <Button size="sm" variant="outline" icon={Plus} onClick={() => setModal({ kind: 'log', entry: null })}>
                  {labels.farmerHome.history.logActivity}
                </Button>
              </div>
              {logs.length === 0 ? (
                <p className="text-[14px] italic text-[#A8BCA8]">{labels.farmerHome.history.noActivity}</p>
              ) : (
                <ul className="space-y-2">
                  {logs.map((log) => {
                    const isMine = log[CROP_DOMAIN.creatorField] === user?.id
                    return (
                      <li key={log.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#F9FAF9] px-3 py-3">
                        <div>
                          <p className="text-[15px] font-medium text-[#1A2B1A]">{log[CROP_DOMAIN.activityField]}</p>
                          <p className="text-[13px] text-[#7A8E7A]">{log.date_of_activity}{log.is_late ? labels.myRecordsPanel.lateSuffix : ''}</p>
                        </div>
                        {isMine ? (
                          <button
                            type="button"
                            onClick={() => setModal({ kind: 'log', entry: log })}
                            className="flex min-h-[44px] items-center gap-1 px-2 text-[13px] font-medium text-[#1B4D2E]"
                          >
                            <Pencil size={14} /> {labels.common.edit}
                          </button>
                        ) : (
                          <span className="text-[12px] text-[#A8BCA8] italic">{labels.common.loggedByStaff}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>

            <section className="rounded-2xl border border-[#E2E8E2] bg-white p-4">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-[13px] font-semibold uppercase tracking-wider text-[#7A8E7A]">{labels.farmerHome.history.harvestTitle}</h2>
                {!record.harvest_record_id && (
                  <Button size="sm" variant="outline" icon={Plus} onClick={() => setModal({ kind: 'harvest', entry: null })}>
                    {labels.farmerHome.history.recordHarvest}
                  </Button>
                )}
              </div>
              {harvests.length === 0 ? (
                <p className="text-[14px] italic text-[#A8BCA8]">{labels.farmerHome.history.noHarvest}</p>
              ) : (
                <ul className="space-y-2">
                  {harvests.map((h) => {
                    const isMine = h[CROP_DOMAIN.creatorField] === user?.id
                    return (
                      <li key={h.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#F9FAF9] px-3 py-3">
                        <div>
                          <p className="text-[15px] font-medium text-[#1A2B1A]">{h.volume_kg} kg</p>
                          <p className="text-[13px] text-[#7A8E7A]">{h.harvest_start_date}</p>
                        </div>
                        {isMine ? (
                          <button
                            type="button"
                            onClick={() => setModal({ kind: 'harvest', entry: h })}
                            className="flex min-h-[44px] items-center gap-1 px-2 text-[13px] font-medium text-[#1B4D2E]"
                          >
                            <Pencil size={14} /> {labels.common.edit}
                          </button>
                        ) : (
                          <span className="text-[12px] text-[#A8BCA8] italic">{labels.common.loggedByStaff}</span>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </div>
        )}
      </div>

      {modal?.kind === 'log' && (
        <CitizenActivityLogModal
          domain={CROP_DOMAIN}
          recordId={record.id}
          record={record}
          log={modal.entry}
          onClose={() => setModal(null)}
          onSuccess={refreshAfterChange}
        />
      )}
      {modal?.kind === 'harvest' && (
        <CitizenHarvestModal
          domain={CROP_DOMAIN}
          record={record}
          harvest={modal.entry}
          onClose={() => setModal(null)}
          onSuccess={refreshAfterChange}
        />
      )}
    </div>
  )
}
