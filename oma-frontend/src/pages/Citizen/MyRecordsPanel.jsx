import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Pencil, Plus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import CitizenActivityLogModal from './CitizenActivityLogModal.jsx'
import CitizenHarvestModal from './CitizenHarvestModal.jsx'

// Batch 11: lists the citizen's own crop/stocking records (staff-created —
// this page never lets them start a new cycle) with expandable activity/
// harvest history. Every list/detail call here hits an endpoint already
// scoped server-side to the caller's own linked_record (see
// production/fisheries views.py) — there is no client-side filtering of
// someone else's data, the API simply never returns it.
export default function MyRecordsPanel({ domain }) {
  const { user } = useAuth()
  const { showToast } = useToast()
  const [records, setRecords] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [expandedId, setExpandedId] = useState(null)
  const [logsByRecord, setLogsByRecord] = useState({})
  const [harvestsByRecord, setHarvestsByRecord] = useState({})
  const [modal, setModal] = useState(null) // { kind: 'log' | 'harvest', record, entry }

  const fetchRecords = async () => {
    setIsLoading(true)
    try {
      const r = await api.get(domain.recordsUrl)
      setRecords(Array.isArray(r.data) ? r.data : r.data?.results || [])
    } catch {
      showToast(`Unable to load your ${domain.recordLabel.toLowerCase()}s.`, 'error')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchRecords()
    setExpandedId(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.key])

  const fetchDetail = async (record) => {
    const logsPromise = api.get(domain.logsUrl(record.id))
    const harvestsPromise = domain.key === 'crop'
      ? (record.harvest_record_id
          ? api.get(domain.harvestDetailUrl(record.harvest_record_id)).then((r) => [r.data])
          : Promise.resolve([]))
      : api.get(domain.harvestListUrl(record.id)).then((r) => r.data)

    const [logsRes, harvests] = await Promise.all([logsPromise, harvestsPromise])
    setLogsByRecord((m) => ({ ...m, [record.id]: logsRes.data }))
    setHarvestsByRecord((m) => ({ ...m, [record.id]: harvests }))
  }

  const toggleExpand = async (record) => {
    if (expandedId === record.id) { setExpandedId(null); return }
    setExpandedId(record.id)
    try {
      await fetchDetail(record)
    } catch {
      showToast('Unable to load activity/harvest history.', 'error')
    }
  }

  const refreshAfterChange = async (record) => {
    await Promise.all([fetchRecords(), fetchDetail(record)])
  }

  if (isLoading) {
    return <p className="text-[13px] text-[#7A8E7A] italic">Loading your {domain.recordLabel.toLowerCase()}s...</p>
  }

  if (records.length === 0) {
    return (
      <p className="rounded-xl border border-[#E2E8E2] bg-white p-6 text-[13px] italic text-[#A8BCA8]">
        You don't have any {domain.recordLabel.toLowerCase()}s on file yet. Visit the office to have one started.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      {records.map((record) => {
        const isOpen = expandedId === record.id
        const logs = logsByRecord[record.id] || []
        const harvests = harvestsByRecord[record.id] || []
        return (
          <div key={record.id} className="rounded-xl border border-[#E2E8E2] bg-white overflow-hidden">
            <button
              type="button"
              onClick={() => toggleExpand(record)}
              className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left hover:bg-[#F9FAF9] transition-colors"
            >
              <div>
                <p className="text-[14px] font-semibold text-[#1A2B1A]">{domain.recordTitle(record)}</p>
                <p className="text-[12px] text-[#7A8E7A]">{domain.recordSubtitle(record)}</p>
              </div>
              <div className="flex items-center gap-2">
                <StatusPill status={record.status}>{record.status}</StatusPill>
                {isOpen ? <ChevronUp size={16} className="text-[#7A8E7A]" /> : <ChevronDown size={16} className="text-[#7A8E7A]" />}
              </div>
            </button>

            {isOpen && (
              <div className="border-t border-[#E2E8E2] px-4 py-4 space-y-5">
                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#7A8E7A]">Activity Log</h4>
                    <Button size="sm" variant="outline" icon={Plus} onClick={() => setModal({ kind: 'log', record, entry: null })}>
                      Log Activity
                    </Button>
                  </div>
                  {logs.length === 0 ? (
                    <p className="text-[12px] italic text-[#A8BCA8]">No activity logged yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {logs.map((log) => {
                        const isMine = log[domain.creatorField] === user?.id
                        return (
                          <li key={log.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F9FAF9] px-3 py-2">
                            <div>
                              <p className="text-[13px] font-medium text-[#1A2B1A]">{log[domain.activityField]}</p>
                              <p className="text-[11px] text-[#7A8E7A]">{log.date_of_activity}{log.is_late ? ' · Late' : ''}</p>
                            </div>
                            {isMine ? (
                              <button
                                type="button"
                                onClick={() => setModal({ kind: 'log', record, entry: log })}
                                className="flex items-center gap-1 text-[12px] font-medium text-[#1B4D2E] hover:underline"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#A8BCA8] italic">Logged by staff</span>
                            )}
                          </li>
                        )
                      })}
                    </ul>
                  )}
                </section>

                <section>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#7A8E7A]">Harvest</h4>
                    {(domain.key === 'fisheries' || !record.harvest_record_id) && (
                      <Button size="sm" variant="outline" icon={Plus} onClick={() => setModal({ kind: 'harvest', record, entry: null })}>
                        Record Harvest
                      </Button>
                    )}
                  </div>
                  {harvests.length === 0 ? (
                    <p className="text-[12px] italic text-[#A8BCA8]">No harvest recorded yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {harvests.map((h) => {
                        const isMine = h[domain.creatorField] === user?.id
                        return (
                          <li key={h.id} className="flex items-center justify-between gap-3 rounded-lg bg-[#F9FAF9] px-3 py-2">
                            <div>
                              <p className="text-[13px] font-medium text-[#1A2B1A]">
                                {domain.key === 'crop' ? `${h.volume_kg} kg` : `${h.quantity_kg} kg`}
                              </p>
                              <p className="text-[11px] text-[#7A8E7A]">{domain.key === 'crop' ? h.harvest_start_date : h.harvest_date}</p>
                            </div>
                            {isMine ? (
                              <button
                                type="button"
                                onClick={() => setModal({ kind: 'harvest', record, entry: h })}
                                className="flex items-center gap-1 text-[12px] font-medium text-[#1B4D2E] hover:underline"
                              >
                                <Pencil size={12} /> Edit
                              </button>
                            ) : (
                              <span className="text-[11px] text-[#A8BCA8] italic">Logged by staff</span>
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
        )
      })}

      {modal?.kind === 'log' && (
        <CitizenActivityLogModal
          domain={domain}
          recordId={modal.record.id}
          log={modal.entry}
          onClose={() => setModal(null)}
          onSuccess={() => refreshAfterChange(modal.record)}
        />
      )}
      {modal?.kind === 'harvest' && (
        <CitizenHarvestModal
          domain={domain}
          record={modal.record}
          harvest={modal.entry}
          onClose={() => setModal(null)}
          onSuccess={() => refreshAfterChange(modal.record)}
        />
      )}
    </div>
  )
}
