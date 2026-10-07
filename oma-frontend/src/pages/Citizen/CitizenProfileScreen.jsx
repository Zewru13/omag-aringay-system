import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeftRight, Camera, Check, ChevronRight, Clock, HelpCircle, KeyRound, Lock, LogOut, Pencil, RefreshCw } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ARINGAY_BARANGAYS } from '../../constants/barangays.js'
import PasswordRequirementChecklist from '../../components/UI/PasswordRequirementChecklist.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import { passwordMeetsRules } from '../../utils/passwordRules.js'
import { tidyPhone } from '../../utils/inputGuards.js'
import { validatePhone } from '../../utils/validation.js'
import { labels } from './labels.js'
import { CROP_THEME, CitizenBody, CitizenScreen, CitizenSubHeader, EditLegend, FISH_THEME } from './citizenUI.jsx'

// ─── Aking Profile (Farmer/Fisherfolk) ─────────────────────────────────────
// Rebuilt against PROFILE REFERENCE!.docx frames 2-5 (own-profile, both
// breakpoints): an identity card with a role pill and Barangay/Contact mini
// fields, a field-status legend bar, one merged "Personal na Impormasyon"
// card whose rows each carry their own status icon (green pencil = instant,
// orange refresh = needs approval, gray lock = read-only), a "Reference
// Information" card for the demographic fields the previous version never
// surfaced at all (birthdate, civil status, education, PWD/4Ps), and a
// collapsed-by-default password card — matching the organization profile's
// (OrgAccountPages.jsx) pattern for the same three field behaviors, rather than three separate
// cards named after what kind of edit they allow.
//
// NAME stays three inputs under one "Buong Pangalan" request (see the
// modal below) for the same reason the previous version kept them: the
// backend's ProfileChangeRequest.REQUESTABLE_FIELDS only accepts the real
// model fields (first_name/middle_name/last_name), not a composed
// full_name -- an aggregate field would fail server-side validation.
//
// HIDE-EMPTY RULE, kept from the previous version: a read-only field
// renders only when its value is real. 'Unspecified' is a stored choice
// meaning "not determined from the import source", not a person's answer,
// so it counts as empty alongside '' and null.

const BLANK = new Set(['', 'Unspecified'])
const hasValue = (v) => v !== null && v !== undefined && !BLANK.has(String(v).trim())

const initialsOf = (rec) => {
  const a = (rec?.first_name || '').trim()[0] || ''
  const b = (rec?.middle_name || rec?.last_name || '').trim()[0] || ''
  return (a + b).toUpperCase() || '—'
}

const CARD = 'overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface'

function CardHeader({ theme, children, note }) {
  return (
    <div className={`px-4 py-3 border-b-[0.5px] border-cz-border ${theme.tileSelectedBg}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${theme.tileSelectedText}`}>{children}</p>
      {note && <p className="mt-0.5 text-[10.5px] text-cz-text-muted sm:hidden">{note}</p>}
    </div>
  )
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2.5 border-b-[0.5px] border-cz-border last:border-0">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{label}</p>
        <p className="mt-0.5 truncate text-[14px] font-medium text-cz-text">{value}</p>
      </div>
      <Lock size={13} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
    </div>
  )
}

export default function CitizenProfileScreen({ record, recordType, onBack, onHelp, tabBar, bare = false }) {
  const P = labels.ffNew.profile
  const { showToast } = useToast()
  const { logout, user } = useAuth()
  const navigate = useNavigate()
  const isFisherfolk = recordType === 'FISHERFOLK'
  const theme = isFisherfolk ? FISH_THEME : CROP_THEME
  const fileRef = useRef(null)

  // Switchable-identity feature, Phase 4: other_linked_records is a real,
  // server-computed field (accounts.serializers.UserSerializer) — empty for
  // every single-domain citizen, so this chip renders for NOBODY else. Only
  // one other domain is possible today (Farmer<->Fisherfolk), so [0] is the
  // whole list for now; the backend already supports more than one row per
  // user if that ever changes.
  const otherLink = user?.other_linked_records?.[0] || null
  const otherTheme = otherLink?.record_type === 'FISHERFOLK' ? FISH_THEME : CROP_THEME
  const [isSwitching, setIsSwitching] = useState(false)

  const handleSwitchDomain = async () => {
    if (!otherLink || isSwitching) return
    setIsSwitching(true)
    try {
      await api.post('/accounts/me/switch-domain/', { record_type: otherLink.record_type })
      // Full page reload, not an in-place context update (confirmed
      // design) — the next /accounts/me/ fetch on load re-resolves
      // linked_record_type fresh against the row this call just activated
      // (Phase 3), and CitizenHomePage routes off that exact same value,
      // so this never becomes a second, driftable routing decision.
      //
      // '/my-account' specifically, NOT '/' — found live while testing
      // this: bare '/' renders App.jsx's HomeRedirect, which checks
      // isAuthenticated without waiting for AuthContext's isLoading flag
      // first, so a hard reload lands there mid-session-restore and
      // bounces even a valid session to /login. ProtectedRoute (what
      // '/my-account' actually uses) already waits for isLoading
      // correctly — this sidesteps a real, pre-existing bug rather than
      // working around it in place, since fixing HomeRedirect itself is
      // unrelated to this feature.
      window.location.href = '/my-account'
    } catch {
      showToast(labels.common.genericSaveError, 'error')
      setIsSwitching(false)
    }
  }

  const [photoUrl, setPhotoUrl] = useState(record?.profile_picture_url || null)
  const [isUploading, setIsUploading] = useState(false)

  const [requests, setRequests] = useState([])
  const [reloadKey, setReloadKey] = useState(0)

  const [contact, setContact] = useState(record?.contact_number || '')
  const [editingContact, setEditingContact] = useState(false)
  const [contactDraft, setContactDraft] = useState(contact)
  const [savingContact, setSavingContact] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [requestField, setRequestField] = useState(null) // 'fullName' | 'barangay' | null
  const [nameDraft, setNameDraft] = useState({ first_name: '', middle_name: '', last_name: '' })
  const [barangayDraft, setBarangayDraft] = useState('')
  const [isBusy, setIsBusy] = useState(false)

  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

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

  const fullName = [record?.first_name, record?.middle_name, record?.last_name]
    .filter(Boolean).join(' ') || record?.label || labels.common.unknown

  // Farmer has no "type" field on the backend; is_farm_laborer is the
  // closest real distinction, so the identity card's mini "Uri" row is
  // derived from that boolean rather than a field that doesn't exist.
  const farmerTypeLabel = record?.is_farm_laborer ? P.farmLaborer : P.regularFarmer

  const civilStatusDisplay = P.civilStatusOptions[record?.civil_status] || record?.civil_status

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIsUploading(true)
    setErrorMessage('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const r = await api.post('/profile/image/', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      setPhotoUrl(r.data.image_url)
      showToast(labels.profileEdit.uploadSuccess, 'success')
    } catch (err) {
      const d = err?.response?.data
      const first = d && typeof d === 'object' ? Object.values(d).flat()[0] : null
      setErrorMessage(first || labels.profileEdit.uploadFailed)
    } finally {
      setIsUploading(false)
    }
  }

  const saveContact = async () => {
    setSavingContact(true)
    setErrorMessage('')
    try {
      const r = await api.patch('/profile/contact-number/', { contact_number: contactDraft })
      setContact(r.data.contact_number)
      setEditingContact(false)
      showToast(P.editContactSaved, 'success')
    } catch (err) {
      const d = err?.response?.data
      setErrorMessage(typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError)
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
    if (!passwordMeetsRules(passwordForm.next)) {
      setPasswordError('The new password needs at least 8 characters, 1 capital letter, 1 special character and 3 numbers.')
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

  const openNameRequest = () => {
    setNameDraft({
      first_name: record?.first_name || '',
      middle_name: record?.middle_name || '',
      last_name: record?.last_name || '',
    })
    setErrorMessage('')
    setRequestField('fullName')
  }

  const openBarangayRequest = () => {
    setBarangayDraft(record?.barangay || '')
    setErrorMessage('')
    setRequestField('barangay')
  }

  const submitNameRequest = async () => {
    const changed = NAME_FIELDS.filter((f) => (nameDraft[f] || '') !== (record?.[f] || ''))
    if (changed.length === 0) { showToast(P.editNothing, 'info'); return }
    setIsBusy(true)
    setErrorMessage('')
    try {
      for (const f of changed) {
        await api.post('/profile/change-requests/', { field_name: f, requested_value: nameDraft[f] })
      }
      showToast(P.editSubmitted, 'success')
      setRequestField(null)
      setReloadKey((k) => k + 1)
    } catch (err) {
      const d = err?.response?.data
      setErrorMessage(typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError)
    } finally {
      setIsBusy(false)
    }
  }

  const submitBarangayRequest = async () => {
    if (barangayDraft === (record?.barangay || '')) { showToast(P.editNothing, 'info'); return }
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.post('/profile/change-requests/', { field_name: 'barangay', requested_value: barangayDraft })
      showToast(P.editSubmitted, 'success')
      setRequestField(null)
      setReloadKey((k) => k + 1)
    } catch (err) {
      const d = err?.response?.data
      setErrorMessage(typeof d === 'string' ? d : Object.values(d || {}).flat().join(' ') || labels.common.genericSaveError)
    } finally {
      setIsBusy(false)
    }
  }

  const identityCard = (
    <div className="w-full shrink-0 lg:sticky lg:top-20 lg:w-[280px]">
      <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
        {/* Name now lives IN the photo header, beside the avatar — not
            below it (2026-09-07 direct request) — so the banner grows to
            fit both rather than staying a fixed decorative strip. */}
        <div className={`flex items-center gap-3 px-4 py-4 ${theme.header}`}>
          <div className="relative h-14 w-14 shrink-0">
            <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[14px] border-2 border-white/40 bg-white text-[16px] font-semibold text-cz-text shadow-sm">
              {photoUrl ? <img src={photoUrl} alt="" className="h-full w-full object-cover" /> : initialsOf(record)}
            </div>
            <input
              ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
              onChange={handleFile} className="hidden"
            />
            <button
              type="button"
              disabled={isUploading}
              aria-label={labels.profileEdit.changePhoto}
              onClick={() => fileRef.current?.click()}
              className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${theme.solidBtn} shadow-md transition-transform press-scale hover:scale-105 disabled:opacity-50`}
            >
              <Camera size={11} aria-hidden="true" />
            </button>
          </div>
          <div className="min-w-0">
            <p className={`text-[10.5px] font-semibold uppercase tracking-[0.06em] ${theme.brand}`}>{P.identityNameEyebrow}</p>
            <h1 className="mt-0.5 truncate text-[16px] font-bold leading-[1.2] text-white">{fullName}</h1>
          </div>
        </div>
        <div className="px-4 pb-4 pt-3">
          <div className="flex items-center gap-2">
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
              {isFisherfolk ? P.roleBadgeFisherfolk : P.roleBadgeFarmer}
            </span>
            <span className="text-[12px] text-cz-text-2">{isFisherfolk ? P.roleSubtitleFisherfolk : P.roleSubtitleFarmer}</span>
          </div>

          {/* Switchable-identity chip — only ever rendered when
              other_linked_records is non-empty (see otherLink above), so
              this is invisible for every single-domain citizen. Styled in
              the OTHER domain's theme, not this one, as a visual preview of
              what tapping it switches to. */}
          {otherLink && (
            <button
              type="button"
              onClick={handleSwitchDomain}
              disabled={isSwitching}
              className={`mt-2 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ${otherTheme.tileSelectedBg} ${otherTheme.tileSelectedText} disabled:opacity-50`}
            >
              <ArrowLeftRight size={11} aria-hidden="true" />
              {isSwitching ? P.switchDomainSwitching : P.switchDomainCta(otherLink.label)}
            </button>
          )}

          {/* Barangay/Contact used to repeat here in a compact mini-grid AND
              again below in the full "Personal na Impormasyon" card — removed
              (2026-09-07) since that card already shows both, with edit
              affordances this read-only summary didn't have. */}
          {isUploading && <p className="mt-2.5 text-[12px] text-cz-text-2">{labels.profileEdit.uploading}</p>}
        </div>
      </div>

      {hasValue(record?.rsbsa_number) && (
        <div className={`mt-3 rounded-[12px] border-[0.5px] border-cz-border px-4 py-3 ${theme.tileSelectedBg}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${theme.tileSelectedText}`}>{P.rsbsa}</p>
          <p className="mt-1 flex items-center gap-1.5 text-[14px] font-semibold text-cz-text">
            <Lock size={12} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
            {record.rsbsa_number}
          </p>
          <p className="mt-1 text-[12px] leading-[1.5] text-cz-text-muted">{P.rsbsaNote}</p>
        </div>
      )}
    </div>
  )

  const detailCards = (
    <div className="min-w-0 flex-1 space-y-4 lg:sticky lg:top-20">
      {errorMessage && (
        <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
          {errorMessage}
        </p>
      )}

      {/* PERSONAL NA IMPORMASYON — every editable field in one card, each
          row carrying its own status icon rather than being grouped by
          which kind of edit it allows. */}
      <section className={CARD}>
        <CardHeader theme={theme}>{P.personalInfoHeading}</CardHeader>
        <div className="px-4">
          <div className="py-2.5 border-b-[0.5px] border-cz-border">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.fullName}</p>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-cz-text">{fullName}</p>
              {pendingName ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cz-tile-amber-bg px-2.5 py-1 text-[11px] font-medium text-cz-tile-amber-fg">
                  <Clock size={12} aria-hidden="true" />
                  {labels.profileEdit.pendingReview}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={openNameRequest}
                  aria-label={labels.profileEdit.requestChange}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--color-cz-warn-accent)' }}
                >
                  <RefreshCw size={12} className="text-white" aria-hidden="true" />
                </button>
              )}
            </div>
            {pendingName && (
              <p className="mt-1 text-[12px] text-cz-text-2">{labels.profileEdit.pendingNote(pendingName.requested_value)}</p>
            )}
          </div>

          <div className="py-2.5 border-b-[0.5px] border-cz-border">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.barangay}</p>
            <div className="mt-0.5 flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-cz-text">{record?.barangay || labels.common.unknown}</p>
              {pendingBarangay ? (
                <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cz-tile-amber-bg px-2.5 py-1 text-[11px] font-medium text-cz-tile-amber-fg">
                  <Clock size={12} aria-hidden="true" />
                  {labels.profileEdit.pendingReview}
                </span>
              ) : (
                <button
                  type="button"
                  onClick={openBarangayRequest}
                  aria-label={labels.profileEdit.requestChange}
                  className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                  style={{ backgroundColor: 'var(--color-cz-warn-accent)' }}
                >
                  <RefreshCw size={12} className="text-white" aria-hidden="true" />
                </button>
              )}
            </div>
            {pendingBarangay && (
              <p className="mt-1 text-[12px] text-cz-text-2">{labels.profileEdit.pendingNote(pendingBarangay.requested_value)}</p>
            )}
          </div>

          <div className="py-2.5">
            <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.contact}</p>
            {editingContact ? (
              <div className="mt-1.5">
                <div className="flex gap-2">
                  <PhoneInput
                    value={contactDraft}
                    placeholder={labels.profileEdit.contactPlaceholder}
                    onChange={setContactDraft}
                    className="min-h-[40px] flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
                  />
                  <button
                    type="button" disabled={savingContact || !!validatePhone(contactDraft)} onClick={saveContact}
                    className={`min-h-[40px] rounded-[8px] px-3 ${theme.solidBtn} disabled:opacity-50`}
                  >
                    <span className="text-[13px] font-medium">{P.contactEditSave}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingContact(false); setContactDraft(contact); setErrorMessage('') }}
                    className="min-h-[40px] rounded-[8px] border-[0.5px] border-cz-border-strong px-3"
                  >
                    <span className="text-[13px] text-cz-text-2">{P.contactEditCancel}</span>
                  </button>
                </div>
                {validatePhone(contactDraft) && (
                  <p className="mt-1 text-[12px] text-cz-danger-accent">{labels.profileEdit.contactInvalid}</p>
                )}
              </div>
            ) : (
              <div className="mt-0.5 flex items-center justify-between gap-3">
                <p className="text-[14px] font-medium text-cz-text">{contact || labels.common.unknown}</p>
                <button
                  type="button"
                  onClick={() => { setContactDraft(tidyPhone(contact)); setEditingContact(true) }}
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${theme.solidBtn}`}
                  aria-label={labels.profileEdit.editAction}
                >
                  <Pencil size={12} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* REFERENCE INFORMATION — read-only demographic data the previous
          version never displayed at all. Always rendered (never gated on
          hasValue like its individual rows) because organization
          membership must always show, even a "not a member" state. */}
      <section className={CARD}>
        <CardHeader theme={theme} note={P.referenceInfoReadOnlyNote}>{P.referenceInfoHeading}</CardHeader>
          <div className="px-4">
            {hasValue(record?.birthdate) && (
              <ReadOnlyRow label={P.birthdateLabel} value={labels.common.formatDate(record.birthdate)} />
            )}
            {hasValue(civilStatusDisplay) && (
              <ReadOnlyRow label={P.civilStatusLabel} value={civilStatusDisplay} />
            )}
            {hasValue(record?.highest_education) && (
              <ReadOnlyRow
                label={<>
                  <span className="hidden sm:inline">{P.educationLabelDesktop}</span>
                  <span className="sm:hidden">{P.educationLabelMobile}</span>
                </>}
                value={record.highest_education}
              />
            )}
            {/* Organization membership — always rendered, never silently
                omitted, unlike the fields above. A fisherfolk can belong to
                more than one organization at once (unlike Farmer), so this
                joins whatever organization_names the backend resolved. */}
            <ReadOnlyRow
              label={P.organizationLabel}
              value={
                record?.organization_names?.length > 0
                  ? record.organization_names.join(', ')
                  : <span className="italic text-cz-text-muted">{P.organizationNone}</span>
              }
            />
            {(record?.is_pwd || record?.is_4ps_beneficiary) && (
              <div className="py-2.5">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{P.statusFlagsLabel}</p>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {record?.is_pwd && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
                      {P.pwdLabel}
                    </span>
                  )}
                  {record?.is_4ps_beneficiary && (
                    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[12px] font-semibold ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
                      {P.fourPsLabel}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>
      </section>

      {/* PASSWORD — collapsed summary row, expands in place. Voluntary
          self-service, not a forced first-login step. */}
      <section className={CARD}>
        <div className="flex items-center gap-3 p-4">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${theme.solidBtn}`}>
            <KeyRound size={16} aria-hidden="true" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-cz-text">{P.passwordChangeCta}</p>
            <p className="mt-0.5 text-[12px] text-cz-text-2">{P.passwordCardNote}</p>
          </div>
          <button
            type="button"
            onClick={() => setShowPasswordForm((v) => !v)}
            className={`shrink-0 rounded-[8px] px-3.5 py-2 text-[13px] font-medium ${theme.solidBtn}`}
          >
            {showPasswordForm ? labels.common.cancel : labels.common.edit}
          </button>
        </div>

        {showPasswordForm && (
          <div className="border-t-[0.5px] border-cz-border p-4">
            <div className="space-y-2">
              <input
                type="password"
                autoComplete="current-password"
                placeholder={P.passwordCurrentLabel}
                value={passwordForm.current}
                onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                className="min-h-[40px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
              />
              <input
                type="password"
                autoComplete="new-password"
                placeholder={P.passwordNewLabel}
                value={passwordForm.next}
                onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
                className="min-h-[40px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
              />
              {passwordForm.next && <PasswordRequirementChecklist password={passwordForm.next} />}
              <input
                type="password"
                autoComplete="new-password"
                placeholder={P.passwordConfirmLabel}
                value={passwordForm.confirm}
                onChange={(e) => setPasswordForm((f) => ({ ...f, confirm: e.target.value }))}
                className="min-h-[40px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
              />
            </div>
            {passwordError && <p className="mt-1.5 text-[12px] font-medium text-rose-600">{passwordError}</p>}
            <button
              type="button"
              onClick={changePassword}
              disabled={changingPassword || !passwordForm.current || !passwordForm.next || !passwordForm.confirm}
              className={`mt-2 flex w-full items-center justify-center gap-1.5 rounded-[8px] px-3.5 py-2.5 text-[13px] font-medium ${theme.solidBtn} disabled:opacity-50`}
            >
              <KeyRound size={13} aria-hidden="true" />
              {P.passwordChangeCta}
            </button>
          </div>
        )}
      </section>

      {/* TULONG — always last, matches every reference frame's ordering. */}
      {onHelp && (
        <button
          type="button"
          onClick={onHelp}
          className={`${CARD} press-scale flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-cz-page`}
        >
          <HelpCircle size={18} className="shrink-0 text-cz-text-2" aria-hidden="true" />
          <span className="flex-1 text-[14px] font-medium text-cz-text">{P.helpRowLabel}</span>
          <ChevronRight size={17} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
        </button>
      )}

      {/* MAG-LOG OUT — moved here from the header (2026-09-07 direct
          request): the header no longer carries a logout icon at all, so
          this is now the only place to sign out on mobile. */}
      <button
        type="button"
        onClick={() => { logout(); navigate('/login') }}
        className={`${CARD} press-scale flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-cz-danger-accent transition-colors hover:bg-cz-danger-bg`}
      >
        <LogOut size={18} className="shrink-0" aria-hidden="true" />
        <span className="flex-1 text-[14px] font-medium">{labels.header.logOut}</span>
      </button>
    </div>
  )

  const body = (
    <div className={bare ? '' : 'bg-white px-4 pb-6 pt-4 sm:px-6'}>
      <div className={bare ? '' : 'rounded-[12px] bg-white p-4 sm:p-5'}>
        <EditLegend theme={theme} />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          {identityCard}
          {detailCards}
        </div>
      </div>
      <p className="mt-6 text-center text-[12.5px] leading-[1.6] text-cz-text-muted">
        {P.footerLine1}
        <br />
        {P.footerLine2}
      </p>
    </div>
  )

  const modal = requestField && (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
        <h2 className="text-[17px] font-semibold text-cz-text">
          {labels.profileEdit.requestTitle(requestField === 'fullName' ? P.fullName : P.barangay)}
        </h2>

        {requestField === 'fullName' ? (
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
            <input
              type="text" value={nameDraft.first_name}
              onChange={(e) => setNameDraft((f) => ({ ...f, first_name: e.target.value }))}
              placeholder={P.editFirstName}
              className="min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
            />
            <input
              type="text" value={nameDraft.middle_name}
              onChange={(e) => setNameDraft((f) => ({ ...f, middle_name: e.target.value }))}
              placeholder={P.editMiddleName}
              className="min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
            />
            <input
              type="text" value={nameDraft.last_name}
              onChange={(e) => setNameDraft((f) => ({ ...f, last_name: e.target.value }))}
              placeholder={P.editLastName}
              className="min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
            />
          </div>
        ) : (
          <>
            <p className="mt-2 text-[12px] text-cz-text-2">
              {P.requestModalCurrentLabel}: {record?.barangay || labels.common.unknown}
            </p>
            <label className="mt-3 block text-[12px] font-medium text-cz-text-2">{P.requestModalNewLabel}</label>
            <select
              value={barangayDraft}
              onChange={(e) => setBarangayDraft(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 text-[14px] text-cz-text outline-none"
            >
              <option value="" disabled>{labels.profileEdit.barangaySelectPlaceholder}</option>
              {ARINGAY_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
            </select>
          </>
        )}

        {errorMessage && (
          <p className="mt-2 rounded-[8px] bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">{errorMessage}</p>
        )}

        <button
          type="button" disabled={isBusy}
          onClick={requestField === 'fullName' ? submitNameRequest : submitBarangayRequest}
          className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] ${theme.solidBtn} disabled:opacity-50`}
        >
          <Check size={16} aria-hidden="true" />
          <span className="text-[15px] font-medium">{P.requestModalSubmit}</span>
        </button>
        <button
          type="button"
          onClick={() => { setRequestField(null); setErrorMessage('') }}
          className="mt-2 flex min-h-[44px] w-full items-center justify-center rounded-[8px] border-[0.5px] border-cz-border-strong"
        >
          <span className="text-[14px] text-cz-text-2">{labels.common.cancel}</span>
        </button>
      </div>
    </div>
  )

  if (bare) return <>{body}{modal}</>

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
      {modal}
    </CitizenScreen>
  )
}
