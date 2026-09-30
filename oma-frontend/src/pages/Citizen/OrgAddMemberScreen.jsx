import { useState } from 'react'
import { Info, Search } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useToast } from '../../context/ToastContext.jsx'
import useSuggestSearch from '../../hooks/useSuggestSearch.js'
import OrgAvatar from './OrgAvatar.jsx'
import { labels } from './labels.js'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'
import { ORG_FIELD_LABEL, ORG_SURFACE } from './orgStyles.js'
import { ARINGAY_BARANGAYS } from '../../constants/barangays.js'

// Magdagdag ng Kasapi. Suggestions appear as the officer types — a name (any
// words, any order) or an RSBSA / FishR / LGU number — from the same registry
// endpoint as before, so the only people who can ever be listed, and so added,
// are ones already registered as a farmer / fisherfolk. There is no free-text
// "add": the only Idagdag buttons are on registry results, and the server
// rejects any person id that is not in the registry regardless.
//
// If the server needs someone's main organization resolved before they can be
// added (main_choice_required), the officer only gets an explanation — that
// decision is OMAg staff's, not theirs.

const ALL_BARANGAYS = 'Lahat ng Barangay'

export default function OrgAddMemberScreen({
  domain, orgId, orgName, existingMemberIds, onBack, onNav, onSuccess,
}) {
  const { showToast } = useToast()
  const theme = domain.dashboardTheme
  const [term, setTerm] = useState('')
  const [barangay, setBarangay] = useState('')
  const [active, setActive] = useState(0)
  const [busyId, setBusyId] = useState(null)
  const [errorMessage, setErrorMessage] = useState('')

  const memberIdSet = new Set(existingMemberIds || [])

  const { results: found, isSearching, hasSearched, failed, active: canSearch } = useSuggestSearch(
    term,
    (q) => api.get(domain.addCandidateSearchUrl(orgId), { params: { search: q } })
      .then((r) => (Array.isArray(r.data) ? r.data : (r.data?.results || []))),
  )
  const results = barangay ? found.filter((c) => c.barangay === barangay) : found
  const current = Math.min(active, Math.max(0, results.length - 1))

  const submitAdd = async (candidate) => {
    setBusyId(candidate.id)
    setErrorMessage('')
    try {
      await api.post(domain.membersUrl(orgId), domain.addMemberBody(candidate.id))
      showToast(labels.orgAddMember.addSuccess(candidate.full_name), 'success')
      onSuccess()
    } catch (err) {
      const data = err?.response?.data
      if (data?.main_choice_required) {
        // The person's other memberships have no main and this organization
        // doesn't settle it. The officer must not decide that, so show a
        // plain explanation instead of the server's English sentence.
        setErrorMessage(labels.orgAddMember.mainChoiceRequired(candidate.full_name))
      } else {
        const first = data && typeof data === 'object' ? Object.values(data).flat()[0] : null
        setErrorMessage(first || data?.detail || labels.orgAddMember.addFailed)
      }
    } finally {
      setBusyId(null)
    }
  }

  // Enter adds the highlighted suggestion (never anything that isn't listed).
  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive(Math.min(current + 1, results.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive(Math.max(current - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const cand = results[current]
      if (cand && !memberIdSet.has(cand.id) && busyId === null) submitAdd(cand)
    }
  }

  const fieldBox = `min-h-[46px] w-full rounded-[10px] border-[0.5px] border-cz-border-strong bg-white px-3.5 text-[14px] text-cz-text outline-none ${theme.focusBorder}`
  const fieldLabel = ORG_FIELD_LABEL

  return (
    <OrgShell theme={theme} chipLabel={orgName} active="home" onNav={(key) => (key === 'home' ? onBack() : onNav(key))} wide={false}>
      <OrgPageHeader title={labels.orgAddMember.title} subtitle={labels.orgAddMember.hint(domain.registryName)} onBack={onBack} />

      <div className="max-w-lg space-y-4">
        <div>
          <label className={fieldLabel} htmlFor="add-member-name">{labels.orgAddMember.nameFieldLabel}</label>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-cz-text-muted" aria-hidden="true" />
            <input
              id="add-member-name"
              type="text"
              role="combobox"
              aria-expanded={results.length > 0}
              aria-autocomplete="list"
              autoComplete="off"
              value={term}
              onChange={(e) => { setTerm(e.target.value); setActive(0); setErrorMessage('') }}
              onKeyDown={onKeyDown}
              placeholder={labels.orgAddMember.searchPlaceholder(domain.registryName)}
              className={`${fieldBox} pl-10`}
            />
          </div>
          <p className="mt-1.5 text-[12px] text-cz-text-2">{labels.orgAddMember.registeredOnly}</p>
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

        {/* A plain note with a quiet icon: this is reference information, not an
            alert, so it doesn't get a colored box competing with the results. */}
        <p className="flex gap-2 text-[12.5px] leading-[1.5] text-cz-text-2">
          <Info size={15} className={`mt-0.5 shrink-0 ${theme.accentText}`} aria-hidden="true" />
          <span>
            <span className="font-semibold text-cz-text">{labels.orgAddMember.noticeLabel}:</span>{' '}
            {domain.key === 'farmers_org' ? labels.orgAddMember.noticeFarmers : labels.orgAddMember.noticeFisherfolk}
          </span>
        </p>
      </div>

      <div className="mt-5 max-w-lg space-y-3" aria-live="polite">
        {!canSearch && (
          <p className="text-[13px] text-cz-text-2">
            {term.trim().length === 0 ? labels.orgAddMember.typeToSearch : labels.orgAddMember.minChars}
          </p>
        )}
        {failed && (
          <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
            {labels.orgAddMember.searchFailed}
          </p>
        )}
        {hasSearched && !failed && results.length === 0 && (
          <p className="rounded-[14px] bg-white p-6 text-center text-[13px] italic text-cz-text-muted shadow-[var(--shadow-xs)]">
            {labels.orgAddMember.noResults}
          </p>
        )}

        {errorMessage && (
          <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
            {errorMessage}
          </p>
        )}

        {results.length > 0 && (
          <ul role="listbox" className={`${ORG_SURFACE} transition-opacity duration-150 ${isSearching ? 'opacity-60' : ''}`}>
            {results.map((cand, i) => {
              const already = memberIdSet.has(cand.id)
              const membershipNote = domain.candidateMembershipNote(cand)
              return (
                <li
                  key={cand.id}
                  role="option"
                  aria-selected={i === current}
                  onMouseEnter={() => setActive(i)}
                  className={`flex items-center gap-3 px-4 py-3 ${i === current ? 'bg-cz-page/70' : ''} ${i === results.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
                >
                  <OrgAvatar name={cand.full_name} theme={theme} size={38} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-cz-text">{cand.full_name}</p>
                    <p className="mt-0.5 truncate text-[13px] text-cz-text-2">
                      {[cand.barangay || labels.common.unknown, cand.id_hint].filter(Boolean).join(' · ')}
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
                      onClick={() => submitAdd(cand)}
                      className={`press-scale min-h-[38px] shrink-0 rounded-[9px] px-3.5 text-white transition-opacity hover:opacity-90 disabled:opacity-50 ${theme.solidBtn}`}
                    >
                      <span className="text-[13px] font-semibold">{labels.orgAddMember.addButton}</span>
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        {found.length >= 20 && (
          <p className="text-[11px] text-cz-text-muted">{labels.orgAddMember.capped}</p>
        )}
      </div>
    </OrgShell>
  )
}
