import { useEffect, useState } from 'react'
import { Pencil, Plus, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import CitizenReportAssistanceModal from './CitizenReportAssistanceModal.jsx'

// Batch 12: ORGANIZATION citizen's beneficiary-reporting home — a member
// picker scoped to THIS org's actual members (via memberSearchUrl, which
// is IsOwnOrgOrStaff-gated server-side so the org id can't be swapped),
// "Report Assistance" against the picked member, and a read-only-except-
// own-entries list of everything this org has reported. No member profile
// editing, no crop/pond record access — beneficiary reporting only.
export default function MyOrgReportingSection({ domain, orgId }) {
  const { showToast } = useToast()
  const [searchTerm, setSearchTerm] = useState('')
  const [members, setMembers] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)

  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [editEntry, setEditEntry] = useState(null)

  const fetchHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const r = await api.get(domain.historyUrl)
      setHistory(r.data)
    } catch {
      showToast('Unable to load your reporting history.', 'error')
    } finally {
      setIsLoadingHistory(false)
    }
  }

  useEffect(() => {
    fetchHistory()
    setSelectedMember(null)
    setSearchTerm('')
    setMembers([])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [domain.key])

  const handleSearch = async (query) => {
    setSearchTerm(query)
    setSelectedMember(null)
    if (!query.trim()) { setMembers([]); return }
    setIsSearching(true)
    try {
      const r = await api.get(domain.memberSearchUrl(orgId), { params: { search: query } })
      const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      setMembers(rows)
    } catch {
      setMembers([])
    } finally {
      setIsSearching(false)
    }
  }

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-[#E2E8E2] bg-white p-5">
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#7A8E7A] mb-3">
          Report Assistance for a Member
        </h4>
        {!selectedMember ? (
          <div className="relative">
            <input
              type="text"
              className={baseInputClasses}
              placeholder={`Search this organization's ${domain.personLabel.toLowerCase()} members by name...`}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchTerm && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#E2E8E2]">
                {isSearching && <p className="p-3 text-center text-[13px] text-[#7A8E7A]">Searching...</p>}
                {!isSearching && members.length === 0 && (
                  <p className="p-3 text-center text-[13px] text-[#7A8E7A]">No members found.</p>
                )}
                {!isSearching && members.map((m) => (
                  <button
                    key={domain.memberIdOf(m)}
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-[#F9FAF9] transition-colors"
                    onClick={() => { setSelectedMember(m); setSearchTerm(''); setMembers([]) }}
                  >
                    <p className="text-[13px] font-medium text-[#1A2B1A]">{domain.memberLabel(m)}</p>
                    <p className="text-[11px] text-[#7A8E7A]">{domain.memberSubtitle(m)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex items-center justify-between gap-3 rounded-lg bg-[#F0F7F0] border border-[#C8D5C8] px-3 py-2">
            <div>
              <p className="text-[13px] font-medium text-[#1A2B1A]">{domain.memberLabel(selectedMember)}</p>
              <p className="text-[11px] text-[#7A8E7A]">{domain.memberSubtitle(selectedMember)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" icon={Plus} onClick={() => setShowReportModal(true)}>Report Assistance</Button>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-lg p-2 text-[#7A8E7A] hover:bg-white transition-colors"
                aria-label="Clear selection"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-[#7A8E7A] mb-2">
          Your Reporting History
        </h4>
        {isLoadingHistory ? (
          <p className="text-[13px] text-[#7A8E7A] italic">Loading...</p>
        ) : history.length === 0 ? (
          <p className="rounded-xl border border-[#E2E8E2] bg-white p-6 text-[13px] italic text-[#A8BCA8]">
            You haven't reported any assistance yet.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[#E2E8E2] bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[#E2E8E2] text-left text-[11px] uppercase tracking-wider text-[#7A8E7A]">
                  <th className="px-4 py-2">{domain.personLabel}</th>
                  <th className="px-4 py-2">Type</th>
                  <th className="px-4 py-2">Quantity</th>
                  <th className="px-4 py-2">Date Given</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((rec) => (
                  <tr key={rec.id} className="border-b border-[#F0F4F0] last:border-0">
                    <td className="px-4 py-2 text-[#1A2B1A]">
                      {domain.key === 'farmers_org' ? rec.farmer_full_name : rec.fisherfolk_full_name}
                    </td>
                    <td className="px-4 py-2 text-[#4A5E4A]">{rec.assistance_type || (rec.program ? 'Program Distribution' : '—')}</td>
                    <td className="px-4 py-2 text-[#4A5E4A]">{rec.quantity_given ? `${rec.quantity_given} ${rec.unit || ''}` : (rec.quantity || '—')}</td>
                    <td className="px-4 py-2 text-[#4A5E4A]">{rec.date_given}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditEntry(rec)}
                        className="flex items-center gap-1 text-[12px] font-medium text-[#1B4D2E] hover:underline ml-auto"
                      >
                        <Pencil size={12} /> Edit
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showReportModal && selectedMember && (
        <CitizenReportAssistanceModal
          domain={domain}
          member={selectedMember}
          entry={null}
          onClose={() => setShowReportModal(false)}
          onSuccess={fetchHistory}
        />
      )}
      {editEntry && (
        <CitizenReportAssistanceModal
          domain={domain}
          member={null}
          entry={editEntry}
          onClose={() => setEditEntry(null)}
          onSuccess={fetchHistory}
        />
      )}
    </div>
  )
}
