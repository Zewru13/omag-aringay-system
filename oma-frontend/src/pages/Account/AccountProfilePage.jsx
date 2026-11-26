import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, KeyRound, LogOut } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import EmailInput from '../../components/UI/EmailInput.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import PasswordRequirementChecklist from '../../components/UI/PasswordRequirementChecklist.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import { ARINGAY_BARANGAYS } from '../../constants/barangays.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import { waitingText } from '../../utils/approvalStatus.js'
import { formatDate } from '../../utils/dateFormat.js'
import { tidyPhone } from '../../utils/inputGuards.js'
import { passwordMeetsRules } from '../../utils/passwordRules.js'
import { validatePhone } from '../../utils/validation.js'
import AccountPage from './AccountPage.jsx'
import { accountKind } from './accountNav.js'
import { approvalText, pendingByField, profileHeader, profileSections } from './profileFields.js'
import ProfileRow from './ProfileRow.jsx'
import StatusBadge from './StatusBadge.jsx'

// The one profile page of farmer, fisherfolk and organization accounts (/my-profile). The photo or logo and the contact number change
// at once; the name, barangay and an organization's other details are sent to the office as a change request (an organization's needs
// an Admin and a Focal Person); the rest is fixed. Then the change requests sent so far, Change password and Log out. Every save uses
// the same endpoint as before.

const firstError = (err, fallback) => {
  const d = err?.response?.data
  if (typeof d === 'string') return d
  const first = d?.message || d?.detail || (d && typeof d === 'object' ? Object.values(d).flat()[0] : null)
  return (typeof first === 'string' && first) || fallback
}

const FIELD_LABEL = {
  first_name: 'First name', middle_name: 'Middle name', last_name: 'Last name', barangay: 'Barangay', name: 'Cooperative name',
  street_address: 'Street address', email_address: 'Email address', contact_person: 'Contact person',
}
const REQUEST_TONE = { APPROVED: 'green', REJECTED: 'red' }
const CARD = 'overflow-hidden rounded-[var(--radius-md)] border border-border bg-surface'
const SECTION_TITLE = 'border-b border-border bg-surface-2 px-4 py-2.5 text-[14px] font-semibold text-text-primary'

export default function AccountProfilePage() {
  const auth = useAuth()
  const { user, updateUser, logout } = auth
  const { showToast } = useToast()
  const navigate = useNavigate()
  const kind = accountKind(auth)
  const isOrg = kind === 'orgFarm' || kind === 'orgFish'
  const record = user?.linked_record
  const fileRef = useRef(null)

  const [requests, setRequests] = useState([])
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [open, setOpen] = useState(null)        // { kind: 'contact' | 'request' | 'password' | 'logout', row? }
  const [draft, setDraft] = useState({})
  const [password, setPassword] = useState({ current: '', next: '', confirm: '' })
  const [passwordError, setPasswordError] = useState('')
  const [imageBroken, setImageBroken] = useState(false)

  const loadRequests = useCallback(() => {
    api.get('/profile/change-requests/')
      .then((res) => setRequests(Array.isArray(res.data) ? res.data : (res.data?.results || [])))
      .catch(() => setRequests([]))
  }, [])
  // The signed-in record is read again on open (an approved change is written by the office while this page is closed) and after an
  // instant change, so the header, the menu and this page stay in step.
  const refreshUser = useCallback(() => api.get('/accounts/me/').then((res) => updateUser(res.data)).catch(() => {}), [updateUser])
  useEffect(() => { loadRequests(); refreshUser() }, [loadRequests, refreshUser])

  const pending = useMemo(() => pendingByField(requests), [requests])
  const sections = profileSections(kind, record, pending)
  const header = profileHeader(kind, record)
  const imageUrl = isOrg ? record?.logo_url : record?.profile_picture_url
  const initials = header.name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase()
  const isMember = !isOrg && (record?.organization_names?.length || 0) > 0
  const close = () => { setOpen(null); setError('') }

  const changeImage = async (event) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setBusy(true)
    setError('')
    try {
      const body = new FormData()
      body.append('image', file)
      await api.post('/profile/image/', body, { headers: { 'Content-Type': 'multipart/form-data' } })
      setImageBroken(false)
      showToast(isOrg ? 'Logo changed.' : 'Photo changed.', 'success')
      await refreshUser()
    } catch (err) {
      setError(firstError(err, isOrg ? 'The logo could not be uploaded. Try again.' : 'The photo could not be uploaded. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const openContact = () => { setDraft({ contact: tidyPhone(record?.contact_number || '') }); setOpen({ kind: 'contact' }) }
  const saveContact = async () => {
    const value = draft.contact || ''
    if (isOrg && !value.trim()) { setError('Enter your cooperative’s contact number.'); return }
    if (value.trim() && validatePhone(value)) { setError(validatePhone(value)); return }
    setBusy(true)
    setError('')
    try {
      await api.patch('/profile/contact-number/', { contact_number: value })
      showToast('Contact number saved.', 'success')
      await refreshUser()
      close()
    } catch (err) {
      setError(firstError(err, 'The contact number could not be saved. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const openRequest = (row) => {
    setDraft(Object.fromEntries(row.fields.map((f) => [f, (f === 'name' ? (record?.name || record?.label) : record?.[f]) || ''])))
    setOpen({ kind: 'request', row })
  }
  const sendRequest = async () => {
    const { row } = open
    const changed = row.fields.filter((f) => (draft[f] || '').trim() !== ((f === 'name' ? (record?.name || record?.label) : record?.[f]) || '').trim())
    if (changed.length === 0) { setError('Change something first, or press Cancel.'); return }
    setBusy(true)
    setError('')
    try {
      // The office reviews each part on its own (a name is three parts), as before.
      for (const field of changed) await api.post('/profile/change-requests/', { field_name: field, requested_value: draft[field].trim() })
      showToast('Change request sent to the office.', 'success')
      loadRequests()
      close()
    } catch (err) {
      setError(firstError(err, 'The request could not be sent. Try again.'))
    } finally {
      setBusy(false)
    }
  }

  const changePassword = async () => {
    setPasswordError('')
    if (password.next !== password.confirm) { setPasswordError('The new passwords do not match.'); return }
    if (!passwordMeetsRules(password.next)) { setPasswordError('The new password needs at least 8 characters, 1 capital letter, 1 special character and 3 numbers.'); return }
    setBusy(true)
    try {
      await api.post('/accounts/change-password/', { current_password: password.current, new_password: password.next, confirm_new_password: password.confirm })
      showToast('Password changed. Sign in again with the new one.', 'success')
      // The server just ended every session of this account, so the next step is a new sign-in.
      setTimeout(() => { logout(); navigate('/login') }, 800)
    } catch (err) {
      const d = err?.response?.data
      setPasswordError(d?.new_password?.[0] || d?.non_field_errors?.[0] || d?.detail || (typeof d === 'string' ? d : null) || 'The password could not be changed.')
    } finally {
      setBusy(false)
    }
  }

  const fieldInput = (field) => {
    const common = { 'aria-label': FIELD_LABEL[field], className: baseInputClasses, value: draft[field] || '' }
    if (field === 'barangay') {
      return (
        <select {...common} onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))}>
          <option value="">Choose a barangay</option>
          {ARINGAY_BARANGAYS.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )
    }
    if (field === 'email_address') return <EmailInput {...common} onChange={(v) => setDraft((d) => ({ ...d, [field]: v }))} />
    return <input {...common} maxLength={field === 'contact_person' ? 150 : undefined} onChange={(e) => setDraft((d) => ({ ...d, [field]: e.target.value }))} />
  }

  return (
    <AccountPage title={isOrg ? 'Cooperative profile' : 'My profile'} helper={isOrg ? 'Your cooperative’s details and account.' : 'What the office has on record about you.'}>
      <div className="max-w-3xl space-y-4">
        {error && !open && <p role="alert" className="rounded-[var(--radius-md)] border border-[#F5C6C6] bg-[#FCEBEB] px-4 py-3 text-[14px] text-[#791F1F]">{error}</p>}

        <section className={`${CARD} flex flex-col gap-4 p-4 sm:flex-row sm:items-center`}>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary-light text-[20px] font-bold text-primary">
              {imageUrl && !imageBroken
                ? <img src={imageUrl} alt="" className="h-full w-full object-cover" onError={() => setImageBroken(true)} />
                : initials}
            </div>
            <div className="min-w-0">
              <h2 className="break-words text-[18px] font-bold leading-tight text-text-primary">{header.name}</h2>
              <p className="mt-0.5 text-[14px] text-text-secondary">{header.kind}</p>
              {header.id && <p className="text-[13px] text-text-muted">{header.id}</p>}
            </div>
          </div>
          <div className="sm:ml-auto">
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={changeImage} />
            <Button variant="outline" icon={Camera} isLoading={busy && !open} className="w-full min-h-[44px] sm:w-auto" onClick={() => fileRef.current?.click()}>
              {isOrg ? 'Change logo' : 'Change photo'}
            </Button>
          </div>
        </section>

        {sections.map((section) => (
          <section key={section.key} className={CARD}>
            <h2 className={SECTION_TITLE}>{section.title}</h2>
            <ul>{section.rows.map((row) => <ProfileRow key={row.key} row={row} onEdit={openContact} onRequest={openRequest} />)}</ul>
          </section>
        ))}

        {isMember && (
          <Link to="/my-equipment" className={`${CARD} flex min-h-[52px] items-center justify-between px-4 py-3 transition-colors hover:bg-surface-2`}>
            <span className="text-[15px] font-medium text-text-primary">Borrow equipment</span>
            <ChevronRight size={18} className="text-text-muted" aria-hidden="true" />
          </Link>
        )}

        <section className={CARD}>
          <h2 className={SECTION_TITLE}>Your change requests</h2>
          {requests.length === 0 ? (
            <p className="px-4 py-3 text-[14px] text-text-secondary">You have not asked for a change yet.</p>
          ) : (
            <ul>
              {requests.map((r) => (
                <li key={r.id} className="border-b border-border px-4 py-3 last:border-b-0">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-[14px] font-medium text-text-primary">{FIELD_LABEL[r.field_name] || r.field_name}</p>
                    <StatusBadge tone={REQUEST_TONE[r.status] || 'amber'}>{r.status === 'APPROVED' ? 'Approved' : r.status === 'REJECTED' ? 'Rejected' : 'Waiting for approval'}</StatusBadge>
                  </div>
                  <p className="mt-1 break-words text-[13px] text-text-secondary">
                    <span className="line-through">{r.old_value || '—'}</span> → {r.requested_value || '—'}
                    {r.created_at && <span className="text-text-muted"> · asked {formatDate(r.created_at)}</span>}
                  </p>
                  {r.status === 'PENDING' && <p className="text-[13px] text-text-secondary">{waitingText(r)}</p>}
                  {approvalText(r).map((line) => <p key={line} className="text-[13px] text-text-secondary">{line}</p>)}
                  {r.status === 'REJECTED' && r.rejection_reason && <p className="mt-1 text-[13px] text-[#791F1F]">Reason: {r.rejection_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className={`${CARD} p-4`}>
          <h2 className="text-[15px] font-semibold text-text-primary">Password</h2>
          <p className="mt-1 text-[13px] text-text-secondary">
            {isOrg ? 'This is a shared cooperative account: a new password changes it for everyone who uses it, so tell your officers first.' : 'Optional. Change it whenever you like.'}
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button variant="outline" icon={KeyRound} className="min-h-[44px]" onClick={() => { setPassword({ current: '', next: '', confirm: '' }); setPasswordError(''); setOpen({ kind: 'password' }) }}>Change password</Button>
            <Button variant="outline" icon={LogOut} className="min-h-[44px] !text-[#A32D2D]" onClick={() => setOpen({ kind: 'logout' })}>Log out</Button>
          </div>
        </section>
      </div>

      {open?.kind === 'contact' && (
        <ModalShell title="Contact number" subtitle="Saved at once." onClose={close} maxWidth="max-w-sm"
          footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button isLoading={busy} onClick={saveContact}>Save</Button></>}>
          {error && <p role="alert" className="mb-2 text-[13px] text-[#791F1F]">{error}</p>}
          <PhoneInput aria-label="Contact number" className={baseInputClasses} value={draft.contact || ''} onChange={(v) => setDraft({ contact: v })} />
        </ModalShell>
      )}
      {open?.kind === 'request' && (
        <ModalShell title={`Request a change: ${open.row.label}`} subtitle="The office checks it first. Until then the old value stays." onClose={close} maxWidth="max-w-sm"
          footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button isLoading={busy} onClick={sendRequest}>Send request</Button></>}>
          {error && <p role="alert" className="mb-2 text-[13px] text-[#791F1F]">{error}</p>}
          <div className="space-y-3">
            {open.row.fields.map((field) => (
              <label key={field} className="block">
                <span className="mb-1 block text-[13px] text-text-secondary">{FIELD_LABEL[field]}</span>
                {fieldInput(field)}
              </label>
            ))}
          </div>
        </ModalShell>
      )}
      {open?.kind === 'password' && (
        <ModalShell title="Change password" subtitle="You will sign in again with the new password." onClose={close} maxWidth="max-w-sm"
          footer={<><Button variant="outline" onClick={close}>Cancel</Button><Button isLoading={busy} onClick={changePassword}>Change password</Button></>}>
          <div className="space-y-3">
            {[['current', 'Current password', 'current-password'], ['next', 'New password', 'new-password'], ['confirm', 'New password again', 'new-password']].map(([key, label, auto]) => (
              <label key={key} className="block">
                <span className="mb-1 block text-[13px] text-text-secondary">{label}</span>
                <input type="password" autoComplete={auto} aria-label={label} className={baseInputClasses} value={password[key]} onChange={(e) => setPassword((p) => ({ ...p, [key]: e.target.value }))} />
              </label>
            ))}
            {password.next && <PasswordRequirementChecklist password={password.next} />}
            {passwordError && <p role="alert" className="text-[13px] text-[#791F1F]">{passwordError}</p>}
          </div>
        </ModalShell>
      )}
      {open?.kind === 'logout' && (
        <ConfirmDialog title="Log out" message="Are you sure you want to log out?" confirmLabel="Log out" onCancel={close}
          onConfirm={async () => { close(); await logout(); navigate('/login', { replace: true }) }} />
      )}
    </AccountPage>
  )
}
