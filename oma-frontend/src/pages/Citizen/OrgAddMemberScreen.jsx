import { useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'
import { CITIZEN_GUTTER, CitizenBody, CitizenScreen, CitizenSubHeader } from './citizenUI.jsx'

// Batch 2: Add Member. Search -> select -> add, against Batch 1's
// domain-scoped candidate endpoint (2-char minimum, 20-row cap, name /
// barangay / current-org only).
//
// REASSIGNMENT: a Farmers Organization membership is a single-valued FK,
// so adding someone who already belongs elsewhere REMOVES them from that
// other organization. The warning is raised here, from the search result's
// own current_organization_name, so the user sees it before anything is
// sent. The server's 409 is still handled below as a backstop — the two
// checks are independent, and only the server's is authoritative if the
// person's membership changed between the search and the submit.
//
// Fisherfolk Organizations use a real join table, so multi-membership is
// legitimate and there is no warning branch at all for them (their
// domain's candidateCurrentOrgName returns null by construction).

const MIN_SEARCH_LENGTH = 2

export default function OrgAddMemberScreen({
  domain, orgId, existingMemberIds, onBack, onSuccess,
}) {
  const { showToast } = useToast()
  const theme = domain.theme
  const [term, setTerm] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [pendingReassign, setPendingReassign] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const memberIdSet = new Set(existingMemberIds || [])

  const runSearch = async (value) => {
    setTerm(value)
    setErrorMessage('')
    if (value.trim().length < MIN_SEARCH_LENGTH) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const r = await api.get(domain.addCandidateSearchUrl(orgId), {
        params: { search: value.trim() },
      })
      setResults(Array.isArray(r.data) ? r.data : (r.data?.results || []))
    } catch {
      setResults([])
      setErrorMessage(labels.orgAddMember.addFailed)
    } finally {
      setIsSearching(false)
    }
  }

  const submitAdd = async (candidate, confirmReassignment) => {
    setBusyId(candidate.id)
    setErrorMessage('')
    try {
      await api.post(
        domain.membersUrl(orgId),
        domain.addMemberBody(candidate.id, confirmReassignment),
      )
      showToast(labels.orgAddMember.addSuccess(candidate.full_name), 'success')
      setPendingReassign(null)
      onSuccess()
    } catch (err) {
      // Backstop for the race the client pre-check cannot see: the person
      // joined another organization after this search returned.
      if (err?.response?.status === 409) {
        const d = err.response.data || {}
        setPendingReassign({
          candidate,
          currentOrgName: d.current_organization_name || labels.common.unknown,
        })
      } else {
        const data = err?.response?.data
        const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
        setErrorMessage(first || data?.detail || labels.orgAddMember.addFailed)
      }
    } finally {
      setBusyId(null)
    }
  }

  const handleAdd = (candidate) => {
    const currentOrg = domain.candidateCurrentOrgName(candidate)
    if (currentOrg) {
      setPendingReassign({ candidate, currentOrgName: currentOrg })
      return
    }
    submitAdd(candidate, false)
  }

  const tooShort = term.trim().length > 0 && term.trim().length < MIN_SEARCH_LENGTH

  return (
    <CitizenScreen>
      <CitizenSubHeader theme={theme} title={labels.orgAddMember.title} onBack={onBack} />

      <div className={`${CITIZEN_GUTTER} mt-3`}>
        <div className="flex items-center gap-2 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3">
          <Search size={16} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
          <input
            type="text"
            value={term}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={labels.orgAddMember.searchPlaceholder}
            aria-label={labels.orgAddMember.searchPlaceholder}
            className="min-h-[44px] w-full bg-transparent text-[14px] text-cz-text outline-none placeholder:text-cz-text-muted"
          />
        </div>
      </div>

      <CitizenBody>
        {term.trim().length === 0 && (
          <p className="px-1 text-center text-[13px] leading-[1.5] text-cz-text-2">
            {labels.orgAddMember.hint(domain.personLabel.toLowerCase())}
          </p>
        )}
        {tooShort && (
          <p className="px-1 text-center text-[13px] text-cz-text-2">{labels.orgAddMember.minChars}</p>
        )}
        {isSearching && (
          <p className="text-[13px] italic text-cz-text-2">{labels.orgAddMember.searching}</p>
        )}
        {!isSearching && !tooShort && term.trim().length >= MIN_SEARCH_LENGTH && results.length === 0 && (
          <p className="rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface p-6 text-center text-[13px] italic text-cz-text-muted">
            {labels.orgAddMember.noResults}
          </p>
        )}

        {errorMessage && (
          <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        {results.length > 0 && (
          <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border-strong bg-cz-surface">
            {results.map((cand, i) => {
              const already = memberIdSet.has(cand.id)
              const membershipNote = domain.candidateMembershipNote(cand)
              return (
                <li
                  key={cand.id}
                  className={`flex items-center gap-3 px-[14px] py-[11px] ${
                    i === results.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'
                  }`}
                >
                  <OrgAvatar name={cand.full_name} id={cand.id} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[14px] font-medium text-cz-text">{cand.full_name}</p>
                    <p className="truncate text-[12px] text-cz-text-2">
                      {cand.barangay || labels.common.unknown}
                      {membershipNote ? ` · ${labels.orgAddMember.currentOrgLabel(membershipNote)}` : ''}
                    </p>
                  </div>
                  {already ? (
                    <span className="shrink-0 rounded-full bg-cz-page px-2 py-[3px] text-[10px] font-medium text-cz-text-2">
                      {labels.orgAddMember.alreadyMember}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === cand.id}
                      onClick={() => handleAdd(cand)}
                      className={`min-h-[36px] shrink-0 rounded-[8px] px-3 ${theme.solidBtn} transition-opacity hover:opacity-90 disabled:opacity-50`}
                    >
                      <span className="text-[13px] font-medium">{labels.orgAddMember.addButton}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {results.length >= 20 && (
          <p className="text-[11px] text-cz-text-muted">{labels.orgAddMember.capped}</p>
        )}
      </CitizenBody>

      {pendingReassign && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
            <div className="flex gap-2">
              <AlertTriangle size={18} className="mt-px shrink-0 text-cz-warn-accent" aria-hidden="true" />
              <div>
                <h2 className="text-[17px] font-medium text-cz-text">{labels.orgAddMember.reassignTitle}</h2>
                <p className="mt-2 text-[13px] leading-[1.55] text-cz-text-2">
                  {labels.orgAddMember.reassignBody(
                    pendingReassign.candidate.full_name,
                    pendingReassign.currentOrgName,
                  )}
                </p>
                <p className="mt-2 text-[13px] leading-[1.55] text-cz-warn-body">
                  {labels.orgAddMember.reassignOfficerNote}
                </p>
              </div>
            </div>
            <button
              type="button"
              disabled={busyId === pendingReassign.candidate.id}
              onClick={() => submitAdd(pendingReassign.candidate, true)}
              className={`mt-4 flex min-h-[44px] w-full items-center justify-center rounded-[8px] ${theme.solidBtn} transition-opacity hover:opacity-90 disabled:opacity-50`}
            >
              <span className="text-[15px] font-medium">{labels.orgAddMember.reassignConfirm}</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingReassign(null)}
              className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong"
            >
              <span className="text-[14px] text-cz-text-2">{labels.common.cancel}</span>
            </button>
          </div>
        </div>
      )}
    </CitizenScreen>
  )
}
