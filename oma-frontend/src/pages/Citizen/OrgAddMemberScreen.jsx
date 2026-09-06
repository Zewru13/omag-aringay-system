import { useState } from 'react'
import { AlertTriangle, Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'
import { ARINGAY_BARANGAYS } from '../../constants/barangays.js'

// Organization Reference rebuild — Magdagdag ng Kasapi (image4/15): Pangalan
// input + Barangay dropdown + an explicit "Hanapin" button (search-on-
// click, not live/incremental search), and the blue info notice about
// single-org membership. Same search endpoint, reassignment warning, and
// 409 backstop as before — only the search interaction changed.

const MIN_SEARCH_LENGTH = 2
const ALL_BARANGAYS = 'Lahat ng Barangay'

export default function OrgAddMemberScreen({
  domain, orgId, orgName, existingMemberIds, onBack, onNav, onSuccess,
}) {
  const { showToast } = useToast()
  const theme = domain.dashboardTheme
  const [term, setTerm] = useState('')
  const [barangay, setBarangay] = useState('')
  const [hasSearched, setHasSearched] = useState(false)
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [pendingReassign, setPendingReassign] = useState(null)
  const [busyId, setBusyId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const memberIdSet = new Set(existingMemberIds || [])

  const runSearch = async (e) => {
    e.preventDefault()
    setErrorMessage('')
    setHasSearched(true)
    if (term.trim().length < MIN_SEARCH_LENGTH) {
      setResults([])
      return
    }
    setIsSearching(true)
    try {
      const r = await api.get(domain.addCandidateSearchUrl(orgId), {
        params: { search: term.trim() },
      })
      const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
      setResults(barangay ? rows.filter((c) => c.barangay === barangay) : rows)
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

  const fieldBox = `min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 text-[14px] text-cz-text outline-none ${theme.focusBorder}`
  const fieldLabel = 'mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.06em] text-cz-text-2'

  return (
    <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={(key) => (key === 'home' ? onBack() : onNav(key))} wide={false}>
      <OrgPageHeader title={labels.orgAddMember.title} subtitle={labels.orgAddMember.hint(domain.registryName)} onBack={onBack} />

      <form onSubmit={runSearch} className="max-w-lg space-y-4">
        <div>
          <label className={fieldLabel} htmlFor="add-member-name">{labels.orgAddMember.nameFieldLabel}</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cz-text-muted" aria-hidden="true" />
            <input
              id="add-member-name"
              type="text"
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder={labels.orgAddMember.searchPlaceholder}
              className={`${fieldBox} pl-10`}
            />
          </div>
        </div>

        <div>
          <label className={fieldLabel} htmlFor="add-member-barangay">{labels.orgAddMember.barangayFieldLabel}</label>
          <select
            id="add-member-barangay"
            className={fieldBox}
            value={barangay}
            onChange={(e) => setBarangay(e.target.value)}
          >
            <option value="">{ALL_BARANGAYS}</option>
            {ARINGAY_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        <button
          type="submit"
          className={`flex min-h-[46px] w-full items-center justify-center rounded-[10px] text-[14px] font-semibold text-white transition-opacity hover:opacity-90 ${theme.solidBtn}`}
        >
          {labels.orgAddMember.searchButton}
        </button>

        <div className="rounded-[10px] border-[0.5px] border-cz-tile-blue-fg/30 bg-cz-tile-blue-bg px-3.5 py-3">
          <p className="text-[12.5px] leading-[1.5] text-cz-tile-blue-fg">
            <span className="font-semibold">{labels.orgAddMember.noticeLabel}:</span>{' '}
            {domain.key === 'farmers_org' ? labels.orgAddMember.noticeFarmers : labels.orgAddMember.noticeFisherfolk}
          </p>
        </div>
      </form>

      <div className="mt-5 max-w-lg space-y-3">
        {isSearching && <p className="text-[13px] italic text-cz-text-2">{labels.orgAddMember.searching}</p>}
        {!isSearching && hasSearched && term.trim().length < MIN_SEARCH_LENGTH && (
          <p className="text-[13px] text-cz-text-2">{labels.orgAddMember.minChars}</p>
        )}
        {!isSearching && hasSearched && term.trim().length >= MIN_SEARCH_LENGTH && results.length === 0 && (
          <p className="rounded-[12px] border-[0.5px] border-cz-border-strong bg-white p-6 text-center text-[13px] italic text-cz-text-muted">
            {labels.orgAddMember.noResults}
          </p>
        )}

        {errorMessage && (
          <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        {results.length > 0 && (
          <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            {results.map((cand, i) => {
              const already = memberIdSet.has(cand.id)
              const membershipNote = domain.candidateMembershipNote(cand)
              return (
                <li
                  key={cand.id}
                  className={`flex items-center gap-3 px-4 py-3 ${i === results.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
                >
                  <OrgAvatar name={cand.full_name} theme={theme} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-cz-text">{cand.full_name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-cz-text-2">
                      {cand.barangay || labels.common.unknown}
                      {membershipNote ? ` · ${labels.orgAddMember.currentOrgLabel(membershipNote)}` : ''}
                    </p>
                  </div>
                  {already ? (
                    <span className="shrink-0 rounded-full bg-cz-tile-slate-bg px-2.5 py-1 text-[11px] font-semibold text-cz-tile-slate-fg">
                      {labels.orgAddMember.alreadyMember}
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busyId === cand.id}
                      onClick={() => handleAdd(cand)}
                      className={`min-h-[38px] shrink-0 rounded-[9px] px-3.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`}
                    >
                      <span className="text-[13px] font-semibold">{labels.orgAddMember.addButton}</span>
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
      </div>

      {pendingReassign && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-[440px] rounded-t-[16px] bg-white p-5 sm:rounded-[16px]">
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
              className={`mt-4 flex min-h-[46px] w-full items-center justify-center rounded-[10px] text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`}
            >
              <span className="text-[15px] font-semibold">{labels.orgAddMember.reassignConfirm}</span>
            </button>
            <button
              type="button"
              onClick={() => setPendingReassign(null)}
              className="mt-2 flex min-h-[46px] w-full items-center justify-center rounded-[10px] border-[0.5px] border-cz-border-strong"
            >
              <span className="text-[14px] text-cz-text-2">{labels.common.cancel}</span>
            </button>
          </div>
        </div>
      )}
    </OrgShell>
  )
}
