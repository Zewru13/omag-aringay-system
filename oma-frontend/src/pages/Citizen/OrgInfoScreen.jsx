import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, Check, Clock, HelpCircle, KeyRound, LogOut, Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { OrgScreen, OrgSectionLabel } from './OrgDashboardParts.jsx'
import { labels } from './labels.js'

const INPUT = 'min-w-0 flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong bg-cz-page px-3 py-[10px] text-[14px] text-cz-text focus:border-cz-text-2 focus:outline-none disabled:opacity-50'

// Batch: the Organization equivalent of Farmer/Fisherfolk's "My Profile" —
// the home for the profile self-editing backend committed in ab07388.
//
// The two-tier split is the whole point of this screen and the copy has to
// carry it:
//   INSTANT   logo, contact number      -> saved as soon as you finish
//   REVIEWED  name, barangay, address   -> filed as a ProfileChangeRequest
//                                          and shown as pending until the
//                                          office resolves it
//
// A field with a pending request must NOT look editable again — that is the
// single most misleading state this screen could have, so the request action
// is replaced outright by the pending chip rather than merely disabled.

const REQUESTABLE = ['name', 'barangay', 'street_address']

// Purely read-only — not part of REQUESTABLE, no change-request path, just
// the registered record shown as-is (Org parity batch: this payload didn't
// even reach the frontend before — see accounts/serializers.py).
const READONLY_DETAILS = [
  'registration_number', 'contact_person', 'date_organized',
  'date_registered', 'registration_agency', 'email_address',
]

export default function OrgInfoScreen({ record, domain, onBack, tabBar, onRecordChanged, active, onNav, railCollapsed, onToggleRail }) {
  const theme = domain.theme
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

  return (
    <OrgScreen
      title={labels.orgInfo.title} chipLabel={record?.label} onBack={onBack} theme={theme} tabBar={tabBar}
      active={active} onNav={onNav} railCollapsed={railCollapsed} onToggleRail={onToggleRail}
    >
        <div className="mx-auto max-w-[560px] space-y-4">

          {/* Logo — instant. Camera badge sits ON the image, lower-left,
              always visible (not just as an empty-state placeholder), so
              "how do I change this" never depends on whether one is set. */}
          <section className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-5 text-center shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
            <div className="relative mx-auto h-24 w-24">
              <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-cz-tile-slate-bg">
                {logoUrl
                  ? <img src={logoUrl} alt="" className="h-full w-full object-cover" />
                  : <Camera size={28} className="text-cz-text-muted" aria-hidden="true" />}
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
                className={`absolute -bottom-1 -left-1 flex h-9 w-9 items-center justify-center rounded-full border-2 border-cz-surface ${theme.solidBtn} shadow-md transition-transform press-scale hover:scale-105 disabled:opacity-50`}
              >
                <Camera size={15} aria-hidden="true" />
              </button>
            </div>
            {isUploading && <p className="mt-2.5 text-[12px] text-cz-text-2">{labels.profileEdit.uploading}</p>}
            <p className="mt-2.5 text-[11px] text-cz-text-muted">{labels.profileEdit.photoHint}</p>
          </section>

          {errorMessage && (
            <p className="rounded-[8px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg px-3 py-2 text-[13px] text-cz-danger-body">
              {errorMessage}
            </p>
          )}

          {/* Contact number — instant */}
          <section>
            <OrgSectionLabel>{labels.orgInfo.groups.contact}</OrgSectionLabel>
            <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
                {labels.profileEdit.contactLabel}
              </p>
              {editingContact ? (
                <div className="mt-2 flex gap-2">
                  <input
                    type="tel" value={contactDraft}
                    onChange={(e) => setContactDraft(e.target.value)}
                    placeholder={labels.profileEdit.contactPlaceholder}
                    className="min-h-[42px] flex-1 rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
                  />
                  <button
                    type="button" disabled={isBusy} onClick={saveContact}
                    className={`min-h-[42px] rounded-[8px] px-3 ${theme.solidBtn} disabled:opacity-50`}
                  >
                    <span className="text-[13px] font-medium">{labels.profileEdit.contactSave}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEditingContact(false); setContactDraft(contact); setErrorMessage('') }}
                    className="min-h-[42px] rounded-[8px] border-[0.5px] border-cz-border-strong px-3"
                  >
                    <span className="text-[13px] text-cz-text-2">{labels.profileEdit.contactCancel}</span>
                  </button>
                </div>
              ) : (
                <div className="mt-1 flex items-center justify-between gap-3">
                  <p className="text-[15px] text-cz-text">{contact || labels.common.unknown}</p>
                  <button
                    type="button"
                    onClick={() => { setContactDraft(contact); setEditingContact(true) }}
                    className={`inline-flex items-center gap-1.5 text-[13px] font-medium ${theme.accentText}`}
                  >
                    <Pencil size={13} aria-hidden="true" /> {labels.profileEdit.editAction}
                  </button>
                </div>
              )}
            </div>
          </section>

          {/* Password — voluntary self-service, mirrors the Farmer/
              Fisherfolk card (CitizenProfileScreen.jsx), same endpoint. One
              real addition: this account is shared/institutional, not
              personal — passwordSharedAccountNote says so explicitly so
              whichever officer is changing it understands the blast
              radius, rather than reusing copy written for a single owner. */}
          <section>
            <OrgSectionLabel>{labels.orgInfo.groups.password}</OrgSectionLabel>
            <div className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-4 shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
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
                  className={INPUT}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={labels.profileEdit.passwordNewLabel}
                  value={passwordForm.next}
                  onChange={(e) => setPasswordForm((f) => ({ ...f, next: e.target.value }))}
                  className={INPUT}
                />
                <input
                  type="password"
                  autoComplete="new-password"
                  placeholder={labels.profileEdit.passwordConfirmLabel}
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
                className={`mt-2 flex items-center gap-1.5 rounded-[8px] px-3.5 py-2 text-[13px] font-medium ${theme.solidBtn} disabled:opacity-50`}
              >
                <KeyRound size={13} aria-hidden="true" />
                {labels.profileEdit.passwordChangeCta}
              </button>
              <p className="mt-1.5 text-[12px] text-cz-text-muted">{labels.profileEdit.passwordCardNote}</p>
            </div>
          </section>

          {/* Registered details — read-only, no edit path of any kind (not
              even a change request). Purely informational; the office's own
              registry is the record of truth for these. */}
          <section>
            <OrgSectionLabel>{labels.orgInfo.groups.registeredDetails}</OrgSectionLabel>
            <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              {READONLY_DETAILS.map((field, i) => (
                <div
                  key={field}
                  className={`px-4 py-3 ${i === READONLY_DETAILS.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
                    {labels.orgInfo.readonlyFieldLabels[field]}
                  </p>
                  <p className="mt-1 truncate text-[15px] text-cz-text">
                    {readonlyValue(field) || labels.common.unknown}
                  </p>
                </div>
              ))}
            </div>
          </section>

          {/* Reviewed fields */}
          <section>
            <OrgSectionLabel>{labels.orgInfo.groups.identity}</OrgSectionLabel>
            <p className="mb-2 rounded-[8px] border-[0.5px] border-cz-warn-border bg-cz-warn-bg px-3 py-2 text-[12px] leading-[1.5] text-cz-warn-body">
              {labels.profileEdit.reviewNotice}
            </p>
            <div className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
              {REQUESTABLE.map((field, i) => {
                const pending = pendingFor(field)
                return (
                  <div
                    key={field}
                    className={`px-4 py-3 ${i === REQUESTABLE.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}
                  >
                    <p className="text-[11px] font-semibold uppercase tracking-[0.05em] text-cz-text-2">
                      {labels.profileEdit.fieldLabels[field]}
                    </p>
                    <div className="mt-1 flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[15px] text-cz-text">
                        {currentValue(field) || labels.common.unknown}
                      </p>
                      {pending ? (
                        // Deliberately NOT a disabled button: a pending field
                        // must not read as "editable but greyed out".
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
                          className={`shrink-0 text-[13px] font-medium ${theme.accentText}`}
                        >
                          {labels.profileEdit.requestChange}
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
          </section>

          {/* Request history */}
          <section>
            <OrgSectionLabel>{labels.profileEdit.historyTitle}</OrgSectionLabel>
            {requests.length === 0 ? (
              <p className="rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface p-5 text-center text-[13px] italic text-cz-text-muted">
                {labels.profileEdit.historyEmpty}
              </p>
            ) : (
              <ul className="overflow-hidden rounded-[12px] border-[0.5px] border-cz-border bg-cz-surface">
                {requests.map((r, i) => (
                  <li key={r.id} className={`px-4 py-3 ${i === requests.length - 1 ? '' : 'border-b-[0.5px] border-cz-border'}`}>
                    <div className="flex items-center justify-between gap-3">
                      <p className="min-w-0 flex-1 truncate text-[14px] text-cz-text">
                        {labels.profileEdit.fieldLabels[r.field_name] || r.field_name}: {r.requested_value}
                      </p>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${
                        r.status === 'APPROVED' ? 'bg-cz-badge-green text-[#15803D]'
                          : r.status === 'REJECTED' ? 'bg-cz-danger-bg text-cz-danger-accent'
                            : 'bg-cz-tile-amber-bg text-cz-tile-amber-fg'}`}
                      >
                        {r.status === 'APPROVED' ? labels.profileEdit.statusApproved
                          : r.status === 'REJECTED' ? labels.profileEdit.statusRejected
                            : labels.profileEdit.statusPending}
                      </span>
                    </div>
                    {r.status === 'REJECTED' && r.rejection_reason && (
                      <p className="mt-1 text-[12px] text-cz-text-2">
                        {labels.profileEdit.rejectionReason(r.rejection_reason)}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* Help + Logout — direct entry points, always reachable from
              this screen without going through the profile-chip dropdown. */}
          <section className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
            <button
              type="button"
              onClick={() => onNav?.('help')}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] border-[0.5px] border-cz-border-strong bg-cz-surface text-[14px] font-medium text-cz-text transition-colors press-scale hover:bg-cz-org-panel"
            >
              <HelpCircle size={16} className="text-cz-text-2" aria-hidden="true" /> {labels.orgHome.accountHelp}
            </button>
            <button
              type="button"
              onClick={() => { logout(); navigate('/login') }}
              className="flex min-h-[48px] items-center justify-center gap-2 rounded-[10px] border-[0.5px] border-cz-danger-border bg-cz-danger-bg text-[14px] font-medium text-cz-danger-accent transition-colors press-scale hover:opacity-90"
            >
              <LogOut size={16} aria-hidden="true" /> {labels.orgHome.accountLogout}
            </button>
          </section>
        </div>

      {requestField && (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center">
          <div className="w-full max-w-[440px] rounded-t-[16px] bg-cz-surface p-5 sm:rounded-[16px]">
            <h2 className="text-[17px] font-semibold text-cz-text">
              {labels.profileEdit.requestTitle(labels.profileEdit.fieldLabels[requestField])}
            </h2>
            <p className="mt-2 text-[12px] text-cz-text-2">
              {labels.profileEdit.requestCurrent}: {currentValue(requestField) || labels.common.unknown}
            </p>
            <label className="mt-3 block text-[12px] font-medium text-cz-text-2">
              {labels.profileEdit.requestNew}
            </label>
            <input
              type="text" value={requestDraft}
              onChange={(e) => setRequestDraft(e.target.value)}
              className="mt-1 min-h-[44px] w-full rounded-[8px] border-[0.5px] border-cz-border-strong px-3 text-[14px] text-cz-text outline-none"
            />
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
    </OrgScreen>
  )
}
