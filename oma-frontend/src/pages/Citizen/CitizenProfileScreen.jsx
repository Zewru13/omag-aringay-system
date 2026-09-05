import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight, HelpCircle, Hourglass, KeyRound, Phone, SquarePen } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { labels } from './labels.js'
import { CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader, FISH_THEME } from './citizenUI.jsx'

// ─── Aking Profile (frames 3, 8) ───────────────────────────────────────────
// Everything shown comes from /accounts/me/'s `linked_record`, which only
// ever resolves the caller's own record, so this screen adds no new data
// access. Re-built against the Desktop POV reference's actual layout: an
// identity card, a Contact Number card that saves instantly, a change-
// request card with inline "Humiling" actions per field (replacing the
// previous floating-button + bottom-sheet pattern, which had no frame of
// its own), and a read-only Government IDs card.
//
// NAME is one box in the reference ("Buong Pangalan") but the backend's
// ProfileChangeRequest.REQUESTABLE_FIELDS only ever accepts the three real
// model fields (first_name/middle_name/last_name) -- an aggregate
// "full_name" would fail server-side validation and, if it somehow didn't,
// the approval path's `setattr(record, field_name, value)` has no such
// attribute to set. So this keeps three inputs under one "Buong Pangalan"
// heading and one Humiling action that submits whichever parts changed --
// visually one field, mechanically the three the backend actually has.
//
// HIDE-EMPTY RULE, kept from the previous version: a field renders only when
// its value is real. 'Unspecified' is a stored choice meaning "not
// determined from the import source", not a person's answer, so it counts as
// empty. civil_status is 'Unspecified' for 3556 of 3568 farmers and
// highest_education is blank for essentially everyone -- rendering
// placeholders would bury the two or three fields that ARE real.
// (This rule now only governs the read-only Government IDs card; the
// editable identity fields always render since a citizen must always be
// able to request a correction, even from an empty value.)

const BLANK = new Set(['', 'Unspecified'])
const hasValue = (v) => v !== null && v !== undefined && !BLANK.has(String(v).trim())

const initialsOf = (rec) => {
  const a = (rec?.first_name || '').trim()[0] || ''
  const b = (rec?.middle_name || rec?.last_name || '').trim()[0] || ''
  return (a + b).toUpperCase() || '—'
}

const CARD = 'rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface px-4 py-4'
const INPUT = 'min-w-0 flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-page px-3 py-[10px] text-[14px] text-cz-text focus:border-cz-text-2 focus:outline-none disabled:opacity-50'

function PendingNote({ pending }) {
  const P = labels.ffNew.profile
  if (!pending) return null
  return (
    <div className="mt-2 rounded-[8px] border-[0.5px] border-cz-warn-accent/30 bg-cz-warn-bg px-3 py-2.5">
      <p className="flex items-center gap-1.5 text-[12.5px] font-semibold text-cz-warn-accent">
        <Hourglass size={12} aria-hidden="true" />
        {P.pendingHeading}
      </p>
      <p className="mt-0.5 text-[12.5px] leading-[1.5] text-cz-text">{P.pendingRequested(pending.requested_value)}</p>
    </div>
  )
}

export default function CitizenProfileScreen({ record, recordType, onBack, onHelp, tabBar, bare = false }) {
  const P = labels.ffNew.profile
  const { showToast } = useToast()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const isFisherfolk = recordType === 'FISHERFOLK'
  const theme = isFisherfolk ? FISH_THEME : CROP_THEME

  const [requests, setRequests] = useState([])
  const [reloadKey, setReloadKey] = useState(0)

  const [contactValue, setContactValue] = useState(record?.contact_number || '')
  const [savingContact, setSavingContact] = useState(false)

  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const [nameForm, setNameForm] = useState({
    first_name: record?.first_name || '',
    middle_name: record?.middle_name || '',
    last_name: record?.last_name || '',
  })
  const [barangayValue, setBarangayValue] = useState(record?.barangay || '')
  const [submittingGroup, setSubmittingGroup] = useState(null) // 'name' | 'barangay' | null

  useEffect(() => {
    let cancelled = false
    api.get('/profile/change-requests/')
      .then((r) => {
        if (cancelled) return
        const rows = Array.isArray(r.data) ? r.data : (r.data?.results || [])
        setRequests(rows.filter((x) => x.status === 'PENDING'))
      })
      .catch(() => { if (!cancelled) setRequests([]) })
    return () => { cancelled = true }
  }, [reloadKey])

  const pendingFor = (field) => requests.find((r) => r.field_name === field) || null
  const NAME_FIELDS = ['first_name', 'middle_name', 'last_name']
  const pendingName = NAME_FIELDS.map(pendingFor).find(Boolean) || null
  const pendingBarangay = pendingFor('barangay')
  const namePending = Boolean(pendingName)
  const barangayPending = Boolean(pendingBarangay)

  const fullName = [record?.first_name, record?.middle_name, record?.last_name]
    .filter(Boolean).join(' ') || record?.label || labels.common.unknown

  const saveContact = async () => {
    if (contactValue === (record?.contact_number || '')) return
    setSavingContact(true)
    try {
      await api.patch('/profile/contact-number/', { contact_number: contactValue })
      showToast(P.editContactSaved, 'success')
    } catch (err) {
      const d = err?.response?.data
      showToast(typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError, 'error')
    } finally {
      setSavingContact(false)
    }
  }

  const changePassword = async () => {
    setPasswordError('')
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError(P.passwordMismatch)
      return
    }
    setChangingPassword(true)
    try {
      await api.post('/accounts/change-password/', {
        current_password: passwordForm.current,
        new_password: passwordForm.next,
        confirm_new_password: passwordForm.confirm,
      })
      showToast(P.passwordChanged, 'success')
      // The backend just blacklisted every token for this account — the
      // only valid next step is a fresh login with the new password.
      setTimeout(() => { logout(); navigate('/login') }, 800)
    } catch (err) {
      const d = err?.response?.data
      setPasswordError(
        d?.new_password?.[0] || d?.non_field_errors?.[0] || d?.detail ||
        (typeof d === 'string' ? d : null) || labels.common.genericSaveError
      )
    } finally {
      setChangingPassword(false)
    }
  }

  const requestNameChange = async () => {
    const changed = NAME_FIELDS.filter((f) => (nameForm[f] || '') !== (record?.[f] || ''))
    if (changed.length === 0) { showToast(P.editNothing, 'info'); return }
    setSubmittingGroup('name')
    try {
      for (const f of changed) {
        await api.post('/profile/change-requests/', { field_name: f, requested_value: nameForm[f] })
      }
      showToast(P.editSubmitted, 'success')
      setReloadKey((k) => k + 1)
    } catch (err) {
      const d = err?.response?.data
      showToast(typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError, 'error')
    } finally {
      setSubmittingGroup(null)
    }
  }

  const requestBarangayChange = async () => {
    if (barangayValue === (record?.barangay || '')) { showToast(P.editNothing, 'info'); return }
    setSubmittingGroup('barangay')
    try {
      await api.post('/profile/change-requests/', { field_name: 'barangay', requested_value: barangayValue })
      showToast(P.editSubmitted, 'success')
      setReloadKey((k) => k + 1)
    } catch (err) {
      const d = err?.response?.data
      showToast(typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError, 'error')
    } finally {
      setSubmittingGroup(null)
    }
  }

  // Farmer has no "type" field on the backend; is_farm_laborer is the
  // closest real distinction, so the reference's "Uri ng Magsasaka" row
  // is derived from that boolean rather than a field that doesn't exist.
  const farmerTypeLabel = record?.is_farm_laborer ? P.farmLaborer : P.regularFarmer

  const govIds = isFisherfolk
    ? [[P.rsbsa, record?.rsbsa_number], [P.fishr, record?.fishr_number], [P.lguReg, record?.lgu_registration_number],
       [P.barangay, record?.barangay], [P.activityTypeFullFisherfolk, record?.fisherfolk_type]]
    : [[P.rsbsa, record?.rsbsa_number], [P.barangay, record?.barangay], [P.activityTypeFullFarmer, farmerTypeLabel]]

  const identityCard = (
    <div className="w-full shrink-0 lg:w-[280px]">
      <div className={`overflow-hidden rounded-[12px] border-[0.5px] border-cz-border`}>
        <div className={`${theme.header} px-4 pb-5 pt-4`}>
          <div className={`flex h-[56px] w-[56px] items-center justify-center overflow-hidden rounded-[10px] bg-white/15`}>
            {record?.profile_picture_url
              ? <img src={record.profile_picture_url} alt="" className="h-full w-full object-cover" />
              : <span className="text-[18px] font-bold text-white">{initialsOf(record)}</span>}
          </div>
          <p className="mt-3 text-[17px] font-bold leading-[1.2] text-white">{fullName}</p>
          <p className={`text-[13px] ${theme.name}`}>{isFisherfolk ? P.verifiedFisherfolk : P.verifiedFarmer}</p>
        </div>
        <div className="space-y-2 bg-cz-surface px-4 py-3.5">
          {hasValue(record?.barangay) && (
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-cz-text-2">{P.barangay}</span>
              <span className="font-medium text-cz-text">{record.barangay}</span>
            </div>
          )}
          {hasValue(record?.contact_number) && (
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-cz-text-2">{P.contact}</span>
              <span className="font-medium text-cz-text">{record.contact_number}</span>
            </div>
          )}
          {(isFisherfolk ? hasValue(record?.fisherfolk_type) : true) && (
            <div className="flex items-center justify-between gap-3 text-[13px]">
              <span className="text-cz-text-2">{isFisherfolk ? P.activityTypeMiniFisherfolk : P.activityTypeMiniFarmer}</span>
              <span className="font-medium text-cz-text">{isFisherfolk ? record.fisherfolk_type : farmerTypeLabel}</span>
            </div>
          )}
        </div>
      </div>

      {hasValue(record?.rsbsa_number) && (
        <div className={`${CARD} mt-3`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.rsbsa}</p>
          <p className="mt-1 text-[15px] font-semibold text-cz-text">{record.rsbsa_number}</p>
          <p className="mt-1 text-[12px] leading-[1.5] text-cz-text-muted">{P.rsbsaNote}</p>
        </div>
      )}
    </div>
  )

  const detailCards = (
    <div className="min-w-0 flex-1 space-y-4">
      {/* CONTACT NUMBER — saves instantly, no review. */}
      <div className={CARD}>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-cz-text">
          <span className={`h-[10px] w-[3px] rounded-full ${theme.header}`} aria-hidden="true" />
          {P.contactCardHeading}
        </p>
        <div className="flex items-center gap-2">
          <span className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-[8px] bg-cz-page">
            <Phone size={16} className="text-cz-text-2" aria-hidden="true" />
          </span>
          <input
            type="tel"
            value={contactValue}
            onChange={(e) => setContactValue(e.target.value)}
            className={INPUT}
          />
          <button
            type="button"
            onClick={saveContact}
            disabled={savingContact}
            className="shrink-0 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-[10px] text-[13px] font-medium text-cz-text transition-colors hover:bg-cz-page disabled:opacity-50"
          >
            {P.contactSaveCta}
          </button>
        </div>
        <p className="mt-1.5 text-[12px] text-cz-text-muted">{P.editContactNote}</p>
      </div>

      {/* PASSWORD — voluntary self-service, not a forced first-login step.
          Staff already generated and relayed the first password in person
          via "Set Up Account"; this just makes changing it later a real,
          reachable option instead of something only staff can do. */}
      <div className={CARD}>
        <p className="mb-2 flex items-center gap-1.5 text-[13px] font-semibold text-cz-text">
          <span className={`h-[10px] w-[3px] rounded-full ${theme.header}`} aria-hidden="true" />
          {P.passwordCardHeading}
        </p>
        <div className="space-y-2">
          <input
            type="password"
            autoComplete="current-password"
            placeholder={P.passwordCurrentLabel}
            value={passwordForm.current}
            onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
            className={INPUT}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={P.passwordNewLabel}
            value={passwordForm.next}
            onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
            className={INPUT}
          />
          <input
            type="password"
            autoComplete="new-password"
            placeholder={P.passwordConfirmLabel}
            value={passwordForm.confirm}
            onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
            className={INPUT}
          />
        </div>
        {passwordError && <p className="mt-1.5 text-[12px] font-medium text-rose-600">{passwordError}</p>}
        <button
          type="button"
          onClick={changePassword}
          disabled={changingPassword || !passwordForm.current || !passwordForm.next || !passwordForm.confirm}
          className="mt-2 flex items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-2 text-[13px] font-medium text-cz-text transition-colors hover:bg-cz-page disabled:opacity-50"
        >
          <KeyRound size={13} aria-hidden="true" />
          {P.passwordChangeCta}
        </button>
        <p className="mt-1.5 text-[12px] text-cz-text-muted">{P.passwordCardNote}</p>
      </div>

      {/* FIELDS REQUIRING A REQUEST — name and barangay go through staff
          review; each Humiling action submits only what actually changed. */}
      <div className={CARD}>
        <p className="mb-3 text-[13px] font-semibold text-cz-text">{P.requestCardHeading}</p>

        <div className="mb-4">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.fullName}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="text"
              value={nameForm.first_name}
              disabled={namePending}
              onChange={(e) => setNameForm((f) => ({ ...f, first_name: e.target.value }))}
              placeholder={P.editFirstName}
              className={INPUT}
            />
            <input
              type="text"
              value={nameForm.middle_name}
              disabled={namePending}
              onChange={(e) => setNameForm((f) => ({ ...f, middle_name: e.target.value }))}
              placeholder={P.editMiddleName}
              className={INPUT}
            />
            <input
              type="text"
              value={nameForm.last_name}
              disabled={namePending}
              onChange={(e) => setNameForm((f) => ({ ...f, last_name: e.target.value }))}
              placeholder={P.editLastName}
              className={INPUT}
            />
          </div>
          <button
            type="button"
            onClick={requestNameChange}
            disabled={namePending || submittingGroup === 'name'}
            className="mt-2 flex items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-2 text-[13px] font-medium text-cz-text transition-colors hover:bg-cz-page disabled:opacity-50"
          >
            <SquarePen size={13} aria-hidden="true" />
            {P.requestCta}
          </button>
          <PendingNote pending={pendingName} />
        </div>

        <div>
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.barangayFieldLabel}</p>
          <div className="flex gap-2">
            <input
              type="text"
              value={barangayValue}
              disabled={barangayPending}
              onChange={(e) => setBarangayValue(e.target.value)}
              className={INPUT}
            />
            <button
              type="button"
              onClick={requestBarangayChange}
              disabled={barangayPending || submittingGroup === 'barangay'}
              className="shrink-0 flex items-center gap-1.5 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3.5 py-[10px] text-[13px] font-medium text-cz-text transition-colors hover:bg-cz-page disabled:opacity-50"
            >
              <SquarePen size={13} aria-hidden="true" />
              {P.requestCta}
            </button>
          </div>
          <PendingNote pending={pendingBarangay} />
        </div>

        <p className="mt-3 text-[12px] leading-[1.5] text-cz-text-muted">{P.editReviewNote}</p>
      </div>

      {/* GOVERNMENT IDs — read-only, hide-empty. */}
      {govIds.some(([, v]) => hasValue(v)) && (
        <div className={CARD}>
          <p className="mb-3 text-[13px] font-semibold text-cz-text">{P.extraHeading}</p>
          <div className="grid grid-cols-2 gap-3">
            {govIds.filter(([, v]) => hasValue(v)).map(([label, value]) => (
              <div key={label}>
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{label}</p>
                <p className="mt-0.5 text-[14.5px] font-semibold text-cz-text">{value}</p>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[12px] leading-[1.5] text-cz-text-muted">{P.govIdsNote}</p>
        </div>
      )}

      {/* TULONG — always last, matches every reference frame's ordering. */}
      {onHelp && (
        <button
          type="button"
          onClick={onHelp}
          className={`${CARD} flex w-full items-center gap-2.5 text-left transition-colors hover:bg-cz-page`}
        >
          <HelpCircle size={18} className="shrink-0 text-cz-text-2" aria-hidden="true" />
          <span className="flex-1 text-[14px] font-medium text-cz-text">{P.helpRowLabel}</span>
          <ChevronRight size={17} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
        </button>
      )}
    </div>
  )

  const body = (
    <div className={bare ? '' : `${theme.header} px-4 pb-6 pt-4 sm:px-6`}>
      <div className={bare ? 'flex items-start gap-5' : 'flex flex-col gap-4 rounded-[12px] bg-cz-page p-4 lg:flex-row lg:items-start sm:p-5'}>
        {identityCard}
        {detailCards}
      </div>
      <p className="mt-6 text-center text-[12.5px] leading-[1.6] text-cz-text-muted">
        {P.footerLine1}
        <br />
        {P.footerLine2}
      </p>
    </div>
  )

  if (bare) return body

  return (
    <CitizenScreen hasTabBar>
      <CitizenSubHeader
        theme={theme}
        title={P.title}
        subtitle={P.subtitle}
        onBack={onBack}
      />
      <CitizenBody className="!px-0 !pt-0">{body}</CitizenBody>
      {tabBar}
    </CitizenScreen>
  )
}
