// An organization account uses the Admin pages for its own organization (inside the same PageLayout / sidebar).
// Its profile and help live here, in English, in the same layout as the farmer and fisherfolk ones. The profile
// carries over what the older organization portal's info screen did: a logo (applies instantly), a contact number
// (instant), a name / barangay / street address change that OMAg staff review, and the account password.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Camera, KeyRound, Lock, Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import PageLayout from '../../components/Layout/PageLayout.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import StatusPill from '../../components/UI/StatusPill.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { ARINGAY_BARANGAYS } from '../../constants/barangays.js'
import { sanitizePhoneDigits, validatePhone } from '../../utils/validation.js'
import { agencyLabel } from '../Organizations/agencyOptions.js'
import CitizenHelpScreen from './CitizenHelpScreen.jsx'
import { CROP_THEME, FISH_THEME } from './citizenUI.jsx'

// ── Help ────────────────────────────────────────────────────────────────────────────────────────────────
// Same shape as FARMER_HELP_EN (what CitizenHelpScreen reads). Contact details are placeholders until the
// official office information is final, exactly as in the other help screens.
const ORG_HELP_EN = {
  title: 'Help',
  subtitle: 'Answers to common questions about your organization account and how to use the system.',
  faqHeading: 'FREQUENTLY ASKED QUESTIONS',
  faq: [
    {
      key: 'add-member',
      q: 'How do I add a member?',
      a: 'Open My Organization and, on the Members tab, click Add Member. Search by name for a registered farmer or fisherfolk and pick them from the list. A person can belong to more than one organization, so someone already in another organization is only shown as information. If the person is in another organization that has no main one yet, OMAg staff set it for them.',
    },
    {
      key: 'deactivate-member',
      q: 'How do I remove a member?',
      a: 'On the Members tab, click Deactivate next to their name and, if you like, give a reason. Their profile and history are not affected and you can reactivate them at any time. If they hold an officer position, deactivating them leaves that position vacant.',
    },
    {
      key: 'assign-officer',
      q: 'How do I assign an officer?',
      a: 'In the Officers table on My Organization, click Assign Officer, choose a position and pick one of your active members. If someone already holds that position, OMAg staff must end their term first. Officer History shows everyone who held each position.',
    },
    {
      key: 'equipment',
      q: 'How do I keep our equipment list?',
      a: 'Open the Equipment Inventory tab on My Organization. Add each item with its quantity and condition, and remove an item when it is no longer yours.',
    },
    {
      key: 'report-assistance',
      q: 'What is the difference between reporting assistance to one member and to all members?',
      a: 'On Assistance, Report to a Member is for assistance given to one member only. Report to All Members gives the same assistance to every current member in one step, and shows a preview of who will receive it before you confirm. A future date schedules the assistance instead of recording it as already given.',
    },
    {
      key: 'confirm-for-members',
      q: 'What is Confirm for Members?',
      a: 'When assistance reaches its date, the member is asked to confirm they received it. For a member who has no working account to confirm with, you can do it here: it sends a confirmation request, with an optional photo, to OMAg staff, who review it before the assistance is marked as received.',
    },
    {
      key: 'status-lifecycle',
      q: 'What do Pending, Awaiting Confirmation, Received and Not Received mean?',
      a: 'Pending means the date is still ahead. On the date it becomes Awaiting Confirmation and the member is asked to confirm. Received means it was confirmed. Not Received means the member said they did not get it, and OMAg staff will follow up.',
    },
    {
      key: 'request-change',
      q: 'How do I request a change to our organization details?',
      a: 'Open My Profile. The logo and contact number change as soon as you save. The name, barangay and street address are reviewed by OMAg staff: click Request change, enter the new value, and it shows as pending until they decide.',
    },
  ],
  contactHeading: 'CONTACT OMAG ARINGAY',
  contactPlaceholderNote: 'The details below are placeholders - the official information is not final yet.',
  contactOfficeLabel: 'Office',
  contactOfficeValue: '[Office name - placeholder]',
  contactAddressLabel: 'Address',
  contactAddressValue: '[Full office address - placeholder]',
  contactPhoneLabel: 'Phone',
  contactPhoneValue: '[Phone number - placeholder]',
  contactHoursLabel: 'Office Hours',
  contactHoursValue: '[Office days and hours - placeholder]',
  behaviorsHeading: 'FIELD BEHAVIORS',
  behaviorInstantLabel: 'Instant edit',
  behaviorInstantDesc: 'Logo, contact number - applied immediately',
  behaviorRequestLabel: 'Request-a-change',
  behaviorRequestDesc: 'Name, barangay, street address - needs staff approval',
  behaviorReadonlyLabel: 'Read-only',
  behaviorReadonlyDesc: 'Registration details - cannot be changed',
  logoutCta: 'Log out',
  backToProfile: 'Back to Profile',
}

export function OrgHelpPage() {
  const { isFisherfolkOrg } = useAuth()
  return (
    <PageLayout title="Help" subtitle="How to use your organization account.">
      <CitizenHelpScreen theme={isFisherfolkOrg ? FISH_THEME : CROP_THEME} L={ORG_HELP_EN} bare />
    </PageLayout>
  )
}

// ── Profile ─────────────────────────────────────────────────────────────────────────────────────────────
const REQUESTABLE = [
  { field: 'name', label: 'Organization Name' },
  { field: 'barangay', label: 'Barangay' },
  { field: 'street_address', label: 'Street Address' },
]
const FIELD_LABELS = Object.fromEntries(REQUESTABLE.map((r) => [r.field, r.label]))
const hasValue = (v) => v !== null && v !== undefined && String(v).trim() !== ''
const fmtDate = (v) => (v ? new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${v}T00:00:00`)) : '')

const CARD = 'rounded-xl border border-border bg-surface'
const ACTION = 'text-[13px] font-medium text-primary hover:underline disabled:opacity-50'

function CardTitle({ children }) {
  return <h2 className="border-b border-border px-5 py-3 text-[13px] font-semibold uppercase tracking-wider text-text-secondary">{children}</h2>
}

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-3 last:border-0">
      <div className="min-w-0">
        <p className="text-[12px] text-text-secondary">{label}</p>
        <p className="mt-0.5 break-words text-[14px] font-medium text-text-primary">{value}</p>
      </div>
      <Lock size={13} className="mt-1 shrink-0 text-text-muted" aria-hidden="true" />
    </div>
  )
}

const firstError = (err, fallback) => {
  const d = err?.response?.data
  const first = d?.message || (d && typeof d === 'object' ? Object.values(d).flat()[0] : null)
  return (typeof first === 'string' && first) || fallback
}

export function OrgProfilePage() {
  const { user, updateUser, logout, isFisherfolkOrg } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const fileRef = useRef(null)
  const record = user?.linked_record

  const [logoUrl, setLogoUrl] = useState(record?.logo_url || null)
  const [isUploading, setIsUploading] = useState(false)
  const [logoFailed, setLogoFailed] = useState(false)
  const [contact, setContact] = useState(record?.contact_number || '')
  const [editingContact, setEditingContact] = useState(false)
  const [contactDraft, setContactDraft] = useState(record?.contact_number || '')
  const [requests, setRequests] = useState([])
  const [requestField, setRequestField] = useState(null)
  const [requestDraft, setRequestDraft] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwordForm, setPasswordForm] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [changingPassword, setChangingPassword] = useState(false)

  const loadRequests = useCallback(() => {
    api.get('/profile/change-requests/')
      .then((r) => setRequests(Array.isArray(r.data) ? r.data : []))
      .catch(() => setRequests([]))
  }, [])
  useEffect(() => { loadRequests() }, [loadRequests])

  // Keep the signed-in user (and so the header, sidebar and other pages) in step after an instant change.
  const refreshUser = () => api.get('/accounts/me/').then((r) => updateUser(r.data)).catch(() => {})

  const pendingFor = (field) => requests.find((r) => r.field_name === field && r.status === 'PENDING')
  const accent = isFisherfolkOrg ? '#1B5E7B' : '#1B4D2E'
  const typeBadge = isFisherfolkOrg ? 'Fisherfolk Organization' : 'Farmers Organization'
  const name = record?.label || record?.name || 'Organization'

  const handleFile = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setIsUploading(true)
    setErrorMessage('')
    try {
      const fd = new FormData()
      fd.append('image', file)
      const r = await api.post('/profile/image/', fd, { headers: { 'Content-Type': 'multipart/form-data' } })
      setLogoUrl(r.data.image_url)
      setLogoFailed(false)
      showToast('Logo updated.', 'success')
      refreshUser()
    } catch (err) {
      setErrorMessage(firstError(err, 'The logo could not be uploaded.'))
    } finally {
      setIsUploading(false)
    }
  }

  const contactError = editingContact ? validatePhone(contactDraft) : null
  const saveContact = async () => {
    if (validatePhone(contactDraft)) { setErrorMessage(validatePhone(contactDraft)); return }
    setIsBusy(true)
    setErrorMessage('')
    try {
      const r = await api.patch('/profile/contact-number/', { contact_number: contactDraft })
      setContact(r.data.contact_number)
      setEditingContact(false)
      showToast('Contact number updated.', 'success')
      refreshUser()
    } catch (err) {
      setErrorMessage(firstError(err, 'The contact number could not be saved.'))
    } finally {
      setIsBusy(false)
    }
  }

  const submitRequest = async () => {
    if (!requestDraft.trim()) { setErrorMessage('Enter the new value first.'); return }
    setIsBusy(true)
    setErrorMessage('')
    try {
      await api.post('/profile/change-requests/', { field_name: requestField, requested_value: requestDraft })
      showToast('Change request sent to OMAg staff.', 'success')
      setRequestField(null)
      setRequestDraft('')
      loadRequests()
    } catch (err) {
      setErrorMessage(firstError(err, 'The request could not be sent.'))
    } finally {
      setIsBusy(false)
    }
  }

  const changePassword = async () => {
    setPasswordError('')
    if (passwordForm.next !== passwordForm.confirm) { setPasswordError('The new passwords do not match.'); return }
    setChangingPassword(true)
    try {
      await api.post('/accounts/change-password/', {
        current_password: passwordForm.current,
        new_password: passwordForm.next,
        confirm_new_password: passwordForm.confirm,
      })
      showToast('Password changed. Please sign in again.', 'success')
      // The backend just ended every session for this account, so the only valid next step is a fresh login.
      setTimeout(() => { logout(); navigate('/login') }, 800)
    } catch (err) {
      const d = err?.response?.data
      setPasswordError(d?.new_password?.[0] || d?.non_field_errors?.[0] || d?.detail || (typeof d === 'string' ? d : null) || 'The password could not be changed.')
    } finally {
      setChangingPassword(false)
    }
  }

  const readonlyRows = [
    ['Registration Number', record?.registration_number],
    ['Registration Agency', record?.registration_agency ? agencyLabel(record.registration_agency) : ''],
    ['Date Organized', fmtDate(record?.date_organized)],
    ['Date Registered', fmtDate(record?.date_registered)],
    ['Contact Person', record?.contact_person],
    ['Email', record?.email_address],
  ].filter(([, v]) => hasValue(v))
  const currentValue = (field) => (field === 'name' ? name : record?.[field] || '')

  return (
    <PageLayout title="My Profile" subtitle="Your organization's details and account.">
      <div className="mx-auto max-w-3xl space-y-4">
        {errorMessage && (
          <p role="alert" className="rounded-lg bg-rose-50 px-4 py-3 text-[13px] font-medium text-rose-700">{errorMessage}</p>
        )}

        <section className={`${CARD} flex flex-wrap items-center gap-4 p-5`}>
          <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl border-2 bg-white text-[20px] font-semibold"
            style={{ color: accent, borderColor: accent }}>
            {logoUrl && !logoFailed
              ? <img src={logoUrl} alt={`${name} logo`} className="h-full w-full object-cover" onError={() => setLogoFailed(true)} />
              : name.trim()[0]?.toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="break-words text-[17px] font-semibold text-text-primary">{name}</h2>
            <p className="mt-0.5 text-[13px] text-text-secondary">{typeBadge}</p>
          </div>
          <div className="w-full sm:w-auto">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
            <Button variant="outline" size="sm" icon={Camera} isLoading={isUploading} onClick={() => fileRef.current?.click()}>
              Change logo
            </Button>
          </div>
        </section>

        {readonlyRows.length > 0 && (
          <section className={CARD}>
            <CardTitle>Registration Details</CardTitle>
            {readonlyRows.map(([label, value]) => <ReadOnlyRow key={label} label={label} value={value} />)}
          </section>
        )}

        <section className={CARD}>
          <CardTitle>Name and Address</CardTitle>
          {REQUESTABLE.map(({ field, label }) => {
            const pending = pendingFor(field)
            return (
              <div key={field} className="border-b border-border px-5 py-3 last:border-0">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[12px] text-text-secondary">{label}</p>
                    <p className="mt-0.5 break-words text-[14px] font-medium text-text-primary">{currentValue(field) || '—'}</p>
                  </div>
                  {pending ? (
                    <StatusPill tone="amber">Pending review</StatusPill>
                  ) : (
                    <button type="button" className={ACTION} disabled={isBusy}
                      onClick={() => { setRequestField(field); setRequestDraft(currentValue(field)); setErrorMessage('') }}>
                      Request change
                    </button>
                  )}
                </div>
                {pending && <p className="mt-1 text-[12px] text-text-secondary">Requested: {pending.requested_value}</p>}
                {requestField === field && (
                  <div className="mt-3 space-y-2">
                    {field === 'barangay' ? (
                      <select aria-label={`New ${label}`} className={baseInputClasses} value={requestDraft} onChange={(e) => setRequestDraft(e.target.value)}>
                        <option value="">Select barangay</option>
                        {ARINGAY_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </select>
                    ) : (
                      <input aria-label={`New ${label}`} className={baseInputClasses} value={requestDraft} onChange={(e) => setRequestDraft(e.target.value)} />
                    )}
                    <div className="flex gap-2">
                      <Button size="sm" isLoading={isBusy} onClick={submitRequest}>Send request</Button>
                      <Button size="sm" variant="outline" onClick={() => { setRequestField(null); setErrorMessage('') }}>Cancel</Button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </section>

        <section className={CARD}>
          <CardTitle>Contact Number</CardTitle>
          <div className="px-5 py-3">
            {editingContact ? (
              <div className="space-y-2">
                <input aria-label="Contact number" className={baseInputClasses} inputMode="numeric" placeholder="09XXXXXXXXX" value={contactDraft}
                  onChange={(e) => setContactDraft(sanitizePhoneDigits(e.target.value))} />
                {contactError && contactDraft && <p className="text-[12px] text-rose-600">{contactError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" isLoading={isBusy} onClick={saveContact}>Save</Button>
                  <Button size="sm" variant="outline" onClick={() => { setEditingContact(false); setContactDraft(contact); setErrorMessage('') }}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between gap-3">
                <p className="text-[14px] font-medium text-text-primary">{contact || '—'}</p>
                <button type="button" className={`${ACTION} inline-flex items-center gap-1`}
                  onClick={() => { setContactDraft(contact); setEditingContact(true); setErrorMessage('') }}>
                  <Pencil size={13} aria-hidden="true" /> Edit
                </button>
              </div>
            )}
          </div>
        </section>

        <section className={CARD}>
          <CardTitle>Account Password</CardTitle>
          <div className="space-y-3 px-5 py-3">
            <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-[12.5px] leading-relaxed text-amber-800">
              This is a shared organization account. Changing the password affects everyone who uses it, so tell your
              officers the new password before you change it.
            </p>
            {showPasswordForm ? (
              <div className="space-y-2">
                {[['current', 'Current password'], ['next', 'New password'], ['confirm', 'Confirm new password']].map(([key, label]) => (
                  <input key={key} type="password" autoComplete={key === 'current' ? 'current-password' : 'new-password'}
                    aria-label={label} className={baseInputClasses} placeholder={label} value={passwordForm[key]}
                    onChange={(e) => setPasswordForm((f) => ({ ...f, [key]: e.target.value }))} />
                ))}
                {passwordError && <p className="text-[12px] text-rose-600">{passwordError}</p>}
                <div className="flex gap-2">
                  <Button size="sm" isLoading={changingPassword} onClick={changePassword}>Change password</Button>
                  <Button size="sm" variant="outline"
                    onClick={() => { setShowPasswordForm(false); setPasswordForm({ current: '', next: '', confirm: '' }); setPasswordError('') }}>
                    Cancel
                  </Button>
                </div>
              </div>
            ) : (
              <Button variant="outline" size="sm" icon={KeyRound} onClick={() => setShowPasswordForm(true)}>Change password</Button>
            )}
          </div>
        </section>

        <section className={CARD}>
          <CardTitle>Change Requests</CardTitle>
          {requests.length === 0 ? (
            <p className="px-5 py-3 text-[13px] text-text-secondary">You have not requested any changes yet.</p>
          ) : (
            requests.map((r) => (
              <div key={r.id} className="border-b border-border px-5 py-3 last:border-0">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-[13px] font-medium text-text-primary">{FIELD_LABELS[r.field_name] || r.field_name}</p>
                  <StatusPill tone={r.status === 'APPROVED' ? 'green' : r.status === 'REJECTED' ? 'rose' : 'amber'}>
                    {r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Pending review'}
                  </StatusPill>
                </div>
                <p className="mt-1 text-[12.5px] text-text-secondary">
                  <span className="line-through">{r.old_value}</span> → {r.requested_value}
                </p>
                {r.status === 'REJECTED' && r.rejection_reason && (
                  <p className="mt-1 text-[12px] text-rose-700">Reason: {r.rejection_reason}</p>
                )}
              </div>
            ))
          )}
        </section>
      </div>
    </PageLayout>
  )
}
