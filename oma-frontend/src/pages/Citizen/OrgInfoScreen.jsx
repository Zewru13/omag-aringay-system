import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, Camera, Check, Clock, HelpCircle, KeyRound, Lock, LogOut, Pencil, RefreshCw } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ARINGAY_BARANGAYS } from '../../constants/barangays.js'
import { sanitizePhoneDigits, validatePhone } from '../../utils/validation.js'
import { OrgPageHeader, OrgShell } from './OrgDashboardParts.jsx'
import { ORG_SURFACE } from './orgStyles.js'
import { EditLegend } from './citizenUI.jsx'
import { labels } from './labels.js'

// Rebuilt against PROFILE REFERENCE!.docx (images 4/5/8/11 — "Impormasyon
// ng Samahan"): a cover-banner identity card + registration-number
// highlight box, matching CitizenProfileScreen.jsx's proven-correct
// pattern for Farmer/Fisherfolk, adapted for an organization's field set
// (logo instead of a person's photo, a type badge instead of a role, a
// colored change-request history log). The previous version of this file
// predated that reference entirely — a plain single-column, uncolored
// card stack with no cover, no history-status badges, and no institutional-
// account warning styled to match. All state/handlers below are unchanged
// from that version; only the JSX changed.
//
// THREE field behaviours live on this screen, and each keeps its own
// consistent affordance rather than three ad-hoc styles:
//   PLAIN READ-ONLY   registration facts, contact person, email
//                     -> label + value, no action at all
//   INSTANT           contact number -> saved as soon as you finish
//                     -> Pencil "I-edit" affordance
//   REVIEWED          name, barangay, address -> filed as a
//                     ProfileChangeRequest, shown pending until resolved
//                     -> SquarePen "Humiling ng Pagbabago" affordance,
//                        replaced outright by a pending chip while a
//                        request is open (never merely disabled — a
//                        pending field must not read as "editable but
//                        greyed out")

const REQUESTABLE = ['name', 'barangay', 'street_address']
const REGISTERED_INFO_FIELDS = ['registration_number', 'date_organized', 'date_registered', 'registration_agency']
const CONTACT_READONLY_FIELDS = ['contact_person', 'email_address']

const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== ''

const CARD = ORG_SURFACE

function CardHeader({ theme, children }) {
  return (
    <div className={`px-4 py-3 border-b-[0.5px] border-cz-border ${theme.tileSelectedBg}`}>
      <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${theme.tileSelectedText}`}>{children}</p>
    </div>
  )
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b-[0.5px] border-cz-border last:border-0">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{label}</p>
        <p className="mt-0.5 truncate text-[14px] font-medium text-cz-text">{value}</p>
      </div>
      <Lock size={13} className="shrink-0 text-cz-text-muted" aria-hidden="true" />
    </div>
  )
}

// Reference draws REHISTRADONG IMPORMASYON and CONTACT's read-only pairs
// two-up on desktop (single column below sm) rather than one full-width
// row per field — this is that 2-up variant, used only for those two cards.
function ReadOnlyGridRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-2 py-2.5">
      <div className="min-w-0">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{label}</p>
        <p className="mt-0.5 truncate text-[14px] font-medium text-cz-text">{value}</p>
      </div>
      <Lock size={13} className="mt-0.5 shrink-0 text-cz-text-muted" aria-hidden="true" />
    </div>
  )
}

export default function OrgInfoScreen({ record, domain, onBack, tabBar, onRecordChanged, active, onNav }) {
  // Phase 2 color-consistency fix (2026-09-07): this screen used to read
  // `domain.theme` (CROP_THEME/FISH_THEME, the individual-citizen palette),
  // which drifted from the Cultivated Ground/Tide palette every other
  // Organization screen already uses. `dashboardTheme` has the identical
  // shape (same keys), so this is a pure colour-source swap — no layout,
  // content, or structural change to this screen.
  const theme = domain.dashboardTheme
  const isFisherfolk = domain.personLabel === 'Fisherfolk'
  const L = labels.orgInfo
  const typeBadge = isFisherfolk ? L.typeBadgeFisherfolk : L.typeBadgeFarmers
  const samahanSubtitle = isFisherfolk ? L.samahanSubtitleFisherfolk : L.samahanSubtitleFarmers
  const { showToast } = useToast()
  const { logout } = useAuth()
  const navigate = useNavigate()
  const fileRef = useRef(null)

  const [logoUrl, setLogoUrl] = useState(record?.logo_url || null)
  const [isUploading, setIsUploading] = useState(false)
  const [contact, setContact] = useState(record?.contact_number || '')
  const [editingContact, setEditingContact] = useState(false)
  const [contactDraft, setContactDraft] = useState(contact)
  const [requests, setRequests] = useState([])
  const [requestField, setRequestField] = useState(null)
  const [requestDraft, setRequestDraft] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')

  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)
  const [showPasswordForm, setShowPasswordForm] = useState(false)

  const loadRequests = useCallback(() => {
    api.get('/profile/change-requests/')
      .then((r) => setRequests(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRequests([]))
  }, [])

  useEffect(() => { loadRequests() }, [loadRequests])

  const pendingFor = (field) =>
    requests.find((r) => r.field_name === field && r.status === 'PENDING')

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
      setLogoUrl(r.data.image_url)
      showToast(labels.profileEdit.uploadSuccess, 'success')
      onRecordChanged?.()
    } catch (err) {
      const d = err?.response?.data
      const first = d && typeof d === 'object' ? Object.values(d).flat()[0] : null
      setErrorMessage(first || labels.profileEdit.uploadFailed)
    } finally {
      setIsUploading(false)
    }
  }

  const saveContact = async () => {
    setIsBusy(true)
    setErrorMessage('')
    try {
      const r = await api.patch('/profile/contact-number/', { contact_number: contactDraft })
      setContact(r.data.contact_number)
      setEditingContact(false)
      showToast(labels.profileEdit.contactSuccess, 'success')
      onRecordChanged?.()
    } catch (err) {
      const d = err?.response?.data
      const first = d && typeof d === 'object' ? Object.values(d).flat()[0] : null
      setErrorMessage(first || labels.profileEdit.contactFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const changePassword = async () => {
    setPasswordError('')
    if (passwordForm.next !== passwordForm.confirm) {
      setPasswordError(labels.profileEdit.passwordMismatch)
      return
    }
    setChangingPassword(true)
    try {
      await api.post('/accounts/change-password/', {
        current_password: passwordForm.current,
        new_password: passwordForm.next,
        confirm_new_password: passwordForm.confirm,
      })
      showToast(labels.profileEdit.passwordChanged, 'success')
      // Same reasoning as CitizenProfileScreen's identical block: the
      // backend just blacklisted every token for this account, so the
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

  const submitRequest = async () => {
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.post('/profile/change-requests/', {
        field_name: requestField,
        requested_value: requestDraft,
      })
      showToast(labels.profileEdit.requestSuccess, 'success')
      setRequestField(null)
      setRequestDraft('')
      loadRequests()
    } catch (err) {
      const d = err?.response?.data
      const first = d?.message
        || (d && typeof d === 'object' ? Object.values(d).flat()[0] : null)
      setErrorMessage(first || labels.profileEdit.requestFailed)
    } finally {
      setIsBusy(false)
    }
  }

  const currentValue = (field) => {
    if (field === 'name') return record?.label || record?.name || ''
    if (field === 'barangay') return record?.barangay || ''
    return record?.street_address || ''
  }

  const readonlyValue = (field) => {
    const raw = record?.[field]
    if (!raw) return ''
    if (field.startsWith('date_')) return labels.common.formatDate(raw)
    return raw
  }

  const registeredInfoRows = REGISTERED_INFO_FIELDS
    .map((field) => [field, readonlyValue(field)])
    .filter(([, v]) => hasValue(v))
  const contactReadonlyRows = CONTACT_READONLY_FIELDS
    .map((field) => [field, readonlyValue(field)])
    .filter(([, v]) => hasValue(v))

  const initials = (record?.label || record?.name || '?').trim()[0]?.toUpperCase() || '?'

  return (
    <OrgShell theme={theme} chipLabel={record?.label} active={active} onNav={onNav} tabBar={tabBar} wide>
      <OrgPageHeader title={L.title} onBack={onBack} />
      <div className="lg:grid lg:grid-cols-[320px_1fr] lg:items-start lg:gap-4">
        {/* Identity card + registration number box */}
        <div className="lg:sticky lg:top-20">
          <section className={CARD}>
            {/* Name now lives IN the logo header, beside the mark — not
                below it (2026-09-07, matching CitizenProfileScreen's same
                change for Farmer/Fisherfolk). */}
            <div className={`flex items-center gap-3 px-4 py-4 ${theme.header}`}>
              <div className="relative h-14 w-14 shrink-0">
                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-[14px] border-2 border-white/40 bg-white text-[16px] font-semibold text-cz-text shadow-sm">
                  {logoUrl ? <img src={logoUrl} alt="" className="h-full w-full object-cover" /> : initials}
                </div>
                <input
                  ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp"
                  onChange={handleFile} className="hidden"
                />
                <button
                  type="button"
                  disabled={isUploading}
                  aria-label={labels.profileEdit.changeLogo}
                  onClick={() => fileRef.current?.click()}
                  className={`absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full border-2 border-white ${theme.solidBtn} shadow-md transition-transform press-scale hover:scale-105 disabled:opacity-50`}
                >
                  <Camera size={11} aria-hidden="true" />
                </button>
              </div>
              <div className="min-w-0">
                <p className={`text-[10.5px] font-semibold uppercase tracking-[0.06em] ${theme.brand}`}>{labels.profileEdit.fieldLabels.name}</p>
                <h1 className="mt-0.5 truncate text-[15px] font-semibold text-white">{record?.label || record?.name}</h1>
              </div>
            </div>
            <div className="px-4 pb-4 pt-3">
              <p className="text-[12px] text-cz-text-2">{samahanSubtitle}</p>
              <div className="mt-1.5">
                <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ${theme.tileSelectedBg} ${theme.tileSelectedText}`}>
                  {typeBadge}
                </span>
              </div>

              {isUploading && <p className="mt-2.5 text-[12px] text-cz-text-2">{labels.profileEdit.uploading}</p>}
            </div>
          </section>

          {/* Registration-number highlight — the one fact worth surfacing
              here even though REHISTRADONG IMPORMASYON (right column) also
              lists it; the rest of that card's fields (agency, dates) used
              to be duplicated in a "PAGKAKAKILANLAN" mini-grid right below
              the identity card too — removed (2026-09-07) since it repeated
              the exact same 4 fields the right column already shows, with
              nothing distinguishing the two beyond layout. */}
          <div className={`mt-3 rounded-[12px] border-[0.5px] border-cz-border px-4 py-3 ${theme.tileSelectedBg}`}>
            <p className={`text-[11px] font-semibold uppercase tracking-[0.06em] ${theme.tileSelectedText}`}>{L.registrationNumber}</p>
            <p className="mt-1 text-[14px] font-semibold text-cz-text">{record?.registration_number}</p>
          </div>
        </div>

        <div className="mt-4 space-y-4 lg:sticky lg:top-20 lg:mt-0">
          <EditLegend theme={theme} />

          {errorMessage && (
            <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
              {errorMessage}
            </p>
          )}

          {/* Rehistradong Impormasyon — pure read-only facts */}
          {registeredInfoRows.length > 0 && (
            <section className={CARD}>
              <CardHeader theme={theme}>{L.groups.registeredDetails}</CardHeader>
              <div className="grid grid-cols-1 gap-x-4 px-4 sm:grid-cols-2">
                {registeredInfoRows.map(([field, value]) => (
                  <ReadOnlyGridRow key={field} label={L.readonlyFieldLabels[field]} value={value} />
                ))}
              </div>
            </section>
          )}

          {/* Contact — contact person and email are plain read-only; contact
              number is the one instantly-editable field here. */}
          <section className={CARD}>
            <CardHeader theme={theme}>{L.groups.contact}</CardHeader>
            <div className="px-4">
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {contactReadonlyRows.map(([field, value]) => (
                  <ReadOnlyGridRow key={field} label={L.readonlyFieldLabels[field]} value={value} />
                ))}
              </div>

              <div className="py-2.5 border-t-[0.5px] border-cz-border">
                <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{labels.profileEdit.contactLabel}</p>
                {editingContact ? (
                  <div className="mt-1.5">
                    <div className="flex gap-2">
                      <input
                        type="tel" inputMode="numeric" value={contactDraft}
                        onChange={(e) => setContactDraft(sanitizePhoneDigits(e.target.value))}
                        placeholder={labels.profileEdit.contactPlaceholder}
                        className="min-h-[40px] flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
                      />
                      <button
                        type="button" disabled={isBusy || !!validatePhone(contactDraft)} onClick={saveContact}
                        className={`min-h-[40px] rounded-[8px] px-3 ${theme.solidBtn} disabled:opacity-50`}
                      >
                        <span className="text-[13px] font-medium">{labels.profileEdit.contactSave}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => { setEditingContact(false); setContactDraft(contact); setErrorMessage('') }}
                        className="min-h-[40px] rounded-[8px] border-[0.5px] border-cz-border-strong px-3"
                      >
                        <span className="text-[13px] text-cz-text-2">{labels.profileEdit.contactCancel}</span>
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
                      onClick={() => { setContactDraft(contact); setEditingContact(true) }}
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

          {/* Pangalan at Address — request-based fields, plus request history */}
          <section className={CARD}>
            <CardHeader theme={theme}>{L.groups.identity}</CardHeader>
            <div className="px-4 py-3">
              <div className="grid grid-cols-1 gap-x-4 sm:grid-cols-2">
                {REQUESTABLE.map((field) => {
                  const pending = pendingFor(field)
                  return (
                    <div key={field} className="py-2 border-b-[0.5px] border-cz-border sm:border-0">
                      <p className="text-[10.5px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{labels.profileEdit.fieldLabels[field]}</p>
                      <div className="mt-0.5 flex items-center justify-between gap-3">
                        <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-cz-text">
                          {currentValue(field) || labels.common.unknown}
                        </p>
                        {pending ? (
                          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-cz-tile-amber-bg px-2.5 py-1 text-[11px] font-medium text-cz-tile-amber-fg">
                            <Clock size={12} aria-hidden="true" />
                            {labels.profileEdit.pendingReview}
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setRequestField(field)
                              setRequestDraft(currentValue(field))
                              setErrorMessage('')
                            }}
                            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
                            style={{ backgroundColor: 'var(--color-cz-warn-accent)' }}
                            aria-label={labels.profileEdit.requestChange}
                          >
                            <RefreshCw size={12} className="text-white" aria-hidden="true" />
                          </button>
                        )}
                      </div>
                      {pending && (
                        <p className="mt-1 text-[12px] text-cz-text-2">
                          {labels.profileEdit.pendingNote(pending.requested_value)}
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>

              <div className="mt-3 border-t-[0.5px] border-cz-border pt-3">
                <p className="mb-2 text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">{L.historyHeading}</p>
                {requests.length === 0 ? (
                  <p className="text-[12.5px] italic text-cz-text-muted">{labels.profileEdit.historyEmpty}</p>
                ) : (
                  <ul className="space-y-2">
                    {requests.map((r) => {
                      const tone = r.status === 'APPROVED'
                        ? { border: 'border-cz-border', bg: 'bg-cz-badge-green/20', pill: 'bg-cz-badge-green text-[#15803D]' }
                        : r.status === 'REJECTED'
                          ? { border: 'border-cz-danger-border', bg: 'bg-cz-danger-bg', pill: 'bg-cz-danger-bg text-cz-danger-accent' }
                          : { border: 'border-cz-border', bg: 'bg-cz-page', pill: 'bg-cz-tile-amber-bg text-cz-tile-amber-fg' }
                      return (
                        <li key={r.id} className={`rounded-[10px] border-[0.5px] px-3 py-2.5 ${tone.border} ${tone.bg}`}>
                          <div className="flex items-center justify-between gap-3">
                            <p className="min-w-0 flex-1 truncate text-[13px] font-semibold text-cz-text">
                              {labels.profileEdit.fieldLabels[r.field_name] || r.field_name}
                            </p>
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${tone.pill}`}>
                              {r.status === 'APPROVED' ? labels.profileEdit.statusApproved
                                : r.status === 'REJECTED' ? labels.profileEdit.statusRejected
                                  : labels.profileEdit.statusPending}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12.5px] text-cz-text-2">
                            <span className="line-through">{r.old_value}</span> → {r.requested_value}
                          </p>
                          {r.status === 'REJECTED' && r.rejection_reason && (
                            <p className="mt-0.5 text-[12px] text-cz-text-2">
                              {labels.profileEdit.rejectionReason(r.rejection_reason)}
                            </p>
                          )}
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            </div>
          </section>

          {/* Institutional-account warning + password */}
          <div className="rounded-[12px] border border-[#F5E0A3] bg-cz-alert-bg px-4 py-3.5">
            <div className="flex gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0 text-cz-alert-accent" aria-hidden="true" />
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-cz-alert-title">{L.institutionalAccountTitle}</p>
                <p className="mt-0.5 text-[12.5px] leading-[1.5] text-cz-alert-title/80">{L.institutionalAccountBody}</p>
              </div>
            </div>
          </div>

          <section className={CARD}>
            <div className="flex items-center gap-3 p-4">
              <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] ${theme.solidBtn}`}>
                <KeyRound size={16} aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[13.5px] font-semibold text-cz-text">{labels.profileEdit.passwordChangeCta}</p>
                <p className="mt-0.5 text-[12px] text-cz-text-2">{L.passwordForInstitutional}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowPasswordForm((v) => !v)}
                className={`shrink-0 rounded-[8px] px-3.5 py-2 text-[13px] font-medium ${theme.solidBtn}`}
              >
                {showPasswordForm ? labels.common.cancel : 'Baguhin'}
              </button>
            </div>

            {showPasswordForm && (
              <div className="border-t-[0.5px] border-cz-border p-4">
                <p className="mb-2 rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg px-3 py-2 text-[12px] leading-[1.5] text-cz-warn-body">
                  {labels.profileEdit.passwordSharedAccountNote}
                </p>
                <div className="space-y-2">
                  <input
                    type="password"
                    autoComplete="current-password"
                    placeholder={labels.profileEdit.passwordCurrentLabel}
                    value={passwordForm.current}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, current: e.target.value }))}
                    className="min-h-[40px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={labels.profileEdit.passwordNewLabel}
                    value={passwordForm.next}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
                    className="min-h-[40px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
                  />
                  <input
                    type="password"
                    autoComplete="new-password"
                    placeholder={labels.profileEdit.passwordConfirmLabel}
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
                  {labels.profileEdit.passwordChangeCta}
                </button>
              </div>
            )}
          </section>

          {/* Tulong — matches Farmer/Fisherfolk's own profile screen row */}
          <button
            type="button"
            onClick={() => onNav?.('help')}
            className={`${CARD} press-scale flex w-full items-center gap-2.5 px-4 py-3.5 text-left transition-colors hover:bg-cz-page`}
          >
            <HelpCircle size={18} className="shrink-0 text-cz-text-2" aria-hidden="true" />
            <span className="flex-1 text-[14px] font-medium text-cz-text">{labels.orgHome.accountHelp}</span>
          </button>

          {/* Mag-log out — mobile's only logout affordance now that OrgTopBar's
              mobile icon goes straight to this screen instead of a dropdown
              (2026-09-07 direct request). Desktop keeps OrgAccountBadge's own
              dropdown logout, untouched. */}
          <button
            type="button"
            onClick={() => { logout(); navigate('/login') }}
            className={`${CARD} press-scale flex w-full items-center gap-2.5 px-4 py-3.5 text-left text-cz-danger-accent transition-colors hover:bg-cz-danger-bg`}
          >
            <LogOut size={18} className="shrink-0" aria-hidden="true" />
            <span className="flex-1 text-[14px] font-medium">{labels.orgHome.accountLogout}</span>
          </button>
        </div>
      </div>

      {requestField && (
        <div className="org-backdrop fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="org-sheet w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
            <h2 className="text-[17px] font-semibold text-cz-text">
              {labels.profileEdit.requestTitle(labels.profileEdit.fieldLabels[requestField])}
            </h2>
            <p className="mt-2 text-[12px] text-cz-text-2">
              {labels.profileEdit.requestCurrent}: {currentValue(requestField) || labels.common.unknown}
            </p>
            <label className="mt-3 block text-[12px] font-medium text-cz-text-2">
              {labels.profileEdit.requestNew}
            </label>
            {requestField === 'barangay' ? (
              <select
                value={requestDraft}
                onChange={(e) => setRequestDraft(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-surface px-3 text-[14px] text-cz-text outline-none"
              >
                <option value="" disabled>{labels.profileEdit.barangaySelectPlaceholder}</option>
                {ARINGAY_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
              </select>
            ) : (
              <input
                type="text" value={requestDraft}
                onChange={(e) => setRequestDraft(e.target.value)}
                className="mt-1 min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
              />
            )}
            {errorMessage && (
              <p className="mt-2 rounded-[8px] bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
                {errorMessage}
              </p>
            )}
            <button
              type="button" disabled={isBusy} onClick={submitRequest}
              className={`mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[8px] ${theme.solidBtn} disabled:opacity-50`}
            >
              <Check size={16} aria-hidden="true" />
              <span className="text-[15px] font-medium">{labels.profileEdit.requestSubmit}</span>
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
      )}
    </OrgShell>
  )
}
