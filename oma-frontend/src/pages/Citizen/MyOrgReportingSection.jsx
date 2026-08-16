import { useEffect, useState } from 'react'
import { Pencil, Plus, Users, X } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import CitizenDistributeToOrgModal from './CitizenDistributeToOrgModal.jsx'
import CitizenReportAssistanceModal from './CitizenReportAssistanceModal.jsx'
import { labels } from './labels.js'

// Batch 12: ORGANIZATION citizen's beneficiary-reporting home — a member
// picker scoped to THIS org's actual members (via memberSearchUrl, which
// is IsOwnOrgOrStaff-gated server-side so the org id can't be swapped),
// "Report Assistance" against the picked member, and a read-only-except-
// own-entries list of everything this org has reported. No member profile
// editing, no crop/pond record access — beneficiary reporting only.
export default function MyOrgReportingSection({ domain, orgId, orgName }) {
  const { showToast } = useToast()
  // Batch 2: the two domain-tinted spots below (selected-member strip, edit
  // link) follow the org's own colour rather than a fixed green, so a
  // Fisherfolk Organization reads teal like the rest of its screens.
  const theme = domain.theme
  const [searchTerm, setSearchTerm] = useState('')
  const [members, setMembers] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [selectedMember, setSelectedMember] = useState(null)
  const [showReportModal, setShowReportModal] = useState(false)
  const [showDistributeModal, setShowDistributeModal] = useState(false)

  const [history, setHistory] = useState([])
  const [isLoadingHistory, setIsLoadingHistory] = useState(true)
  const [editEntry, setEditEntry] = useState(null)

  const fetchHistory = async () => {
    setIsLoadingHistory(true)
    try {
      const r = await api.get(domain.historyUrl)
      setHistory(r.data)
    } catch {
      showToast(labels.orgReporting.errors.loadHistoryFailed, 'error')
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
      <section className="rounded-xl border border-[0.5px] border-cz-border-strong bg-white p-5">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h4 className="text-[12px] font-semibold uppercase tracking-wider text-cz-text-2">
            {labels.orgReporting.reportForMemberTitle}
          </h4>
          <Button size="sm" variant="outline" icon={Users} onClick={() => setShowDistributeModal(true)}>
            {labels.orgReporting.distributeToOrg}
          </Button>
        </div>
        {!selectedMember ? (
          <div className="relative">
            <input
              type="text"
              className={baseInputClasses}
              placeholder={labels.orgReporting.searchPlaceholder(domain.personLabel.toLowerCase())}
              value={searchTerm}
              onChange={(e) => handleSearch(e.target.value)}
            />
            {searchTerm && (
              <div className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[0.5px] border-cz-border-strong">
                {isSearching && <p className="p-3 text-center text-[13px] text-cz-text-2">{labels.orgReporting.searching}</p>}
                {!isSearching && members.length === 0 && (
                  <p className="p-3 text-center text-[13px] text-cz-text-2">{labels.orgReporting.noMembersFound}</p>
                )}
                {!isSearching && members.map((m) => (
                  <button
                    key={domain.memberIdOf(m)}
                    type="button"
                    className="block w-full px-3 py-2 text-left hover:bg-cz-page transition-colors"
                    onClick={() => { setSelectedMember(m); setSearchTerm(''); setMembers([]) }}
                  >
                    <p className="text-[13px] font-medium text-cz-text">{domain.memberLabel(m)}</p>
                    <p className="text-[11px] text-cz-text-2">{domain.memberSubtitle(m)}</p>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className={`flex items-center justify-between gap-3 rounded-lg ${theme.tileSelectedBg} border border-cz-border-strong px-3 py-2`}>
            <div>
              <p className="text-[13px] font-medium text-cz-text">{domain.memberLabel(selectedMember)}</p>
              <p className="text-[11px] text-cz-text-2">{domain.memberSubtitle(selectedMember)}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" icon={Plus} onClick={() => setShowReportModal(true)}>{labels.orgReporting.reportAssistance}</Button>
              <button
                type="button"
                onClick={() => setSelectedMember(null)}
                className="rounded-lg p-2 text-cz-text-2 hover:bg-white transition-colors"
                aria-label={labels.orgReporting.clearSelection}
              >
                <X size={14} />
              </button>
            </div>
          </div>
        )}
      </section>

      <section>
        <h4 className="text-[12px] font-semibold uppercase tracking-wider text-cz-text-2 mb-2">
          {labels.orgReporting.historyTitle}
        </h4>
        {isLoadingHistory ? (
          <p className="text-[13px] text-cz-text-2 italic">{labels.orgReporting.loading}</p>
        ) : history.length === 0 ? (
          <p className="rounded-xl border border-[0.5px] border-cz-border-strong bg-white p-6 text-[13px] italic text-cz-text-muted">
            {labels.orgReporting.historyEmpty}
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[0.5px] border-cz-border-strong bg-white">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="border-b border-[0.5px] border-cz-border-strong text-left text-[11px] uppercase tracking-wider text-cz-text-2">
                  <th className="px-4 py-2">{domain.personLabel}</th>
                  <th className="px-4 py-2">{labels.orgReporting.columns.type}</th>
                  <th className="px-4 py-2">{labels.orgReporting.columns.quantity}</th>
                  <th className="px-4 py-2">{labels.orgReporting.columns.dateGiven}</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {history.map((rec) => (
                  <tr key={rec.id} className="border-b border-cz-border last:border-0">
                    <td className="px-4 py-2 text-cz-text">
                      {domain.key === 'farmers_org' ? rec.farmer_full_name : rec.fisherfolk_full_name}
                    </td>
                    <td className="px-4 py-2 text-cz-text-2">{rec.assistance_type || labels.common.unknown}</td>
                    <td className="px-4 py-2 text-cz-text-2">{rec.quantity || '—'}</td>
                    <td className="px-4 py-2 text-cz-text-2">{labels.common.formatDate(rec.date_given)}</td>
                    <td className="px-4 py-2 text-right">
                      <button
                        type="button"
                        onClick={() => setEditEntry(rec)}
                        className={`ml-auto flex items-center gap-1 text-[12px] font-medium ${theme.accentText} hover:underline`}
                      >
                        <Pencil size={12} /> {labels.common.edit}
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
      {showDistributeModal && (
        <CitizenDistributeToOrgModal
          domain={domain}
          orgId={orgId}
          orgName={orgName}
          onClose={() => setShowDistributeModal(false)}
          onSuccess={fetchHistory}
        />
      )}
    </div>
  )
}
