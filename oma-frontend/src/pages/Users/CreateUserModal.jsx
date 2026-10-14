import { useEffect, useRef, useState } from 'react'
import { Check, Copy, UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import EmailInput from '../../components/UI/EmailInput.jsx'
import PhoneInput from '../../components/UI/PhoneInput.jsx'
import { isPhoneComplete } from '../../utils/inputGuards.js'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'

const labelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

const SUFFIX_OPTIONS = ['Jr.', 'Sr.', 'II', 'III', 'IV']

const ROLE_OPTIONS = [
  {
    value: 'ADMIN',
    label: 'ADMIN',
    desc: 'Full system access: manage users, view all reports, and configure system settings.',
  },
  {
    value: 'EVALUATOR',
    label: 'FOCAL PERSON',
    desc: 'OMAg staff for daily data entry, crop monitoring, and record management.',
  },
]

// ── Step 1: Role ──────────────────────────────────────────────────────────────

function StepRole({ selectedRole, onSelect, onNext, onCancel, setFooter }) {
  // Refs so the footer effect only needs to depend on `selectedRole` (what
  // actually changes the footer's disabled state) — onNext/onCancel are
  // fresh closures from the parent every render, and depending on them
  // directly would re-fire this effect (and its setFooter call) every
  // single render, which would loop forever since setFooter's own
  // re-render recreates those same closures again. Synced in an effect
  // (not during render) since writing to a ref's .current outside an
  // effect/event-handler is a render-phase side effect React disallows.
  const onNextRef = useRef(onNext)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    onNextRef.current = onNext
    onCancelRef.current = onCancel
  })

  useEffect(() => {
    setFooter(
      <>
        <button type="button" onClick={() => onCancelRef.current()}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors">
          Cancel
        </button>
        <button type="button" disabled={!selectedRole} onClick={() => onNextRef.current()}
          className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-50">
          Next
        </button>
      </>
    )
    return () => setFooter(null)
  }, [selectedRole, setFooter])

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7A8E7A]">Step 1 of 3 — Select Role</p>
      <div className="space-y-3">
        {ROLE_OPTIONS.map(opt => (
          <div
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`cursor-pointer rounded-lg border-2 p-4 transition-all ${
              selectedRole === opt.value
                ? 'border-[#1B4D2E] bg-[#EBF5EE]'
                : 'border-[#E2E8E2] bg-white hover:border-[#C8D5C8]'
            }`}
          >
            <p className="text-[13px] font-semibold text-[#1A2B1A]">{opt.label}</p>
            <p className="mt-0.5 text-[12px] text-[#7A8E7A]">{opt.desc}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Step 2: Details ───────────────────────────────────────────────────────────

function StepDetails({ role, formData, onChange, onBack, onNext, onCancel, setFooter }) {
  const [error, setError] = useState('')

  const set = (field, value) => onChange({ ...formData, [field]: value })

  // Refs so handleNext (and the footer effect that references it) stay
  // stable — see StepRole's comment for why this avoids a render loop, and
  // why the sync happens in an effect rather than during render.
  const formDataRef = useRef(formData)
  const onNextRef = useRef(onNext)
  const onBackRef = useRef(onBack)
  const onCancelRef = useRef(onCancel)
  useEffect(() => {
    formDataRef.current = formData
    onNextRef.current = onNext
    onBackRef.current = onBack
    onCancelRef.current = onCancel
  })

  const handleNext = () => {
    const fd = formDataRef.current
    if (!fd.lastName.trim())  { setError('Last name is required.'); return }
    if (!fd.firstName.trim()) { setError('First name is required.'); return }
    if (!fd.email.trim())     { setError('Email is required.'); return }
    if (fd.contact_number && !isPhoneComplete(fd.contact_number)) { setError('Mobile number must be 11 digits and start with 09.'); return }
    setError('')
    onNextRef.current()
  }

  useEffect(() => {
    setFooter(
      <div className="flex w-full items-center justify-between">
        <button type="button" onClick={() => onBackRef.current()}
          className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors">
          ← Back
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={() => onCancelRef.current()}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleNext}
            className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]">
            Next
          </button>
        </div>
      </div>
    )
    return () => setFooter(null)
  }, [setFooter])

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7A8E7A]">Step 2 of 3 — Account Details</p>
      <p className="text-[13px] font-medium text-[#1B4D2E]">Please input the name of the staff member</p>

      <div className="space-y-3">
        {/* Last Name + First Name */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelCls}>Last Name <span className="text-rose-500">*</span></label>
            <input className={baseInputClasses} placeholder="e.g. Dela Cruz"
              value={formData.lastName} onChange={e => set('lastName', e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>First Name <span className="text-rose-500">*</span></label>
            <input className={baseInputClasses} placeholder="e.g. Juan"
              value={formData.firstName} onChange={e => set('firstName', e.target.value)} />
          </div>
        </div>

        {/* Suffix + mobile number */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Suffix <span className="text-[#A8BCA8] font-normal">(optional)</span></label>
            <select className={baseInputClasses} value={formData.suffix} onChange={e => set('suffix', e.target.value)}>
              <option value="">None</option>
              {SUFFIX_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div>
            <label className={labelCls}>Mobile Number <span className="text-[#A8BCA8] font-normal">(optional)</span></label>
            <PhoneInput className={baseInputClasses} value={formData.contact_number}
              onChange={v => set('contact_number', v)} />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className={labelCls}>Email Address <span className="text-rose-500">*</span></label>
          <EmailInput className={baseInputClasses} placeholder="e.g. juan@example.com"
            value={formData.email} onChange={v => set('email', v)} />
          <p className="mt-1 text-[11px] text-[#A8BCA8]">
            Double-check this — it's not pre-verified. A mistyped or fake address just means the account
            never gets activated (the link is never received/clicked), which is intentional, not a bug.
          </p>
        </div>

        <div className="rounded-lg bg-[#F9FAF9] border border-[#E2E8E2] px-4 py-3 text-[12px] text-[#7A8E7A]">
          A verification link and a secure random password will be sent to the user's email. The account stays inactive until they verify, then they'll be required to change the password on first login.
        </div>
      </div>

      {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
    </div>
  )
}

// ── Step 3: Review ────────────────────────────────────────────────────────────

function StepReview({ role, formData, onBack, onCancel, onSuccess, setFooter }) {
  const { showToast } = useToast()
  // Display label only — the raw `role` value (ADMIN/EVALUATOR) is what's
  // actually submitted below; this just keeps the Review step and confirm
  // dialog from leaking the internal code value onto the screen.
  const roleLabel = ROLE_OPTIONS.find(o => o.value === role)?.label || role
  const [isSubmitting,   setIsSubmitting]   = useState(false)
  const [error,          setError]          = useState('')
  const [showConfirm,    setShowConfirm]    = useState(false)
  const [currentAdmin,   setCurrentAdmin]   = useState(null)
  const [loadingAdmin,   setLoadingAdmin]   = useState(false)
  const [result,         setResult]         = useState(null)
  const [copiedField,    setCopiedField]    = useState('')

  const fullName = `${formData.lastName}, ${formData.firstName}${formData.suffix ? ' ' + formData.suffix : ''}`

  const onBackRef = useRef(onBack)
  const onCancelRef = useRef(onCancel)
  const onSuccessRef = useRef(onSuccess)

  const openConfirm = async () => {
    if (role === 'ADMIN') {
      setLoadingAdmin(true)
      try {
        const r = await api.get('/accounts/users/', { params: { role: 'ADMIN', is_active: 'true' } })
        const list = Array.isArray(r.data) ? r.data : (r.data.results || [])
        setCurrentAdmin(list[0] || null)
      } catch {
        setCurrentAdmin(null)
      } finally {
        setLoadingAdmin(false)
      }
    }
    setShowConfirm(true)
  }

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      const r = await api.post('/accounts/users/create/', {
        full_name: fullName,
        suffix:    formData.suffix,
        email:     formData.email,
        contact_number: formData.contact_number,
        role,
      })
      if (r.data.email_sent) {
        // Verification email delivered — never show the password in the UI.
        showToast(`Verification email sent to ${formData.email}.`, 'success')
        onSuccess()
      } else {
        // Email failed (or SMTP isn't configured) — show the password and
        // verification link once so the admin can relay them manually. A
        // genuinely fake/mistyped address behaves identically: the link
        // never gets clicked and the account just stays inactive — that's
        // the intended safeguard, not something this UI needs to detect.
        setResult(r.data)
      }
    } catch (err) {
      const d = err.response?.data
      setError(d?.email?.[0] || d?.detail || 'Unable to create user.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const handleCopy = async (field, value) => {
    try {
      await navigator.clipboard.writeText(value)
      setCopiedField(field)
      setTimeout(() => setCopiedField(''), 1500)
    } catch { /* clipboard unavailable — value is still visible to copy manually */ }
  }

  // Ref so the footer effect below can call the latest openConfirm without
  // needing it (freshly recreated every render) in its dependency array.
  // Synced in an effect, not during render — see StepRole's comment.
  const openConfirmRef = useRef(openConfirm)
  useEffect(() => {
    onBackRef.current = onBack
    onCancelRef.current = onCancel
    onSuccessRef.current = onSuccess
    openConfirmRef.current = openConfirm
  })

  useEffect(() => {
    if (result) {
      setFooter(
        <button type="button" onClick={() => onSuccessRef.current()}
          className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38]">
          Done
        </button>
      )
    } else {
      setFooter(
        <div className="flex w-full items-center justify-between">
          <button type="button" onClick={() => onBackRef.current()}
            className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors">
            ← Back
          </button>
          <div className="flex gap-2">
            <button type="button" onClick={() => onCancelRef.current()}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors">
              Cancel
            </button>
            <button type="button" disabled={isSubmitting} onClick={() => openConfirmRef.current()}
              className="flex items-center gap-2 rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-60">
              {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
              Add User
            </button>
          </div>
        </div>
      )
    }
    return () => setFooter(null)
  }, [result, isSubmitting, setFooter])

  const Row = ({ label, value }) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3">
      <span className="text-[12px] font-medium text-[#7A8E7A]">{label}</span>
      <span className="text-right text-[13px] font-semibold text-[#1A2B1A]">{value || '—'}</span>
    </div>
  )

  // ── Result: verification email failed, show the one-time details ──
  if (result) {
    return (
      <div className="space-y-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7A8E7A]">User Created</p>
        <div className="rounded-lg bg-[#FEF3C7] border border-[#FDE68A] px-4 py-3 text-[12px] text-[#92400E]">
          The verification email could not be sent{result.reason ? ` (${result.reason.replace(/[.\s]+$/, '')})` : ''}. Give the user these details directly:
        </div>
        <div>
          <label className={labelCls}>Temporary Password (shown once)</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[13px] font-mono text-[#1A2B1A] break-all">
              {result.default_password}
            </code>
            <button
              type="button"
              onClick={() => handleCopy('password', result.default_password)}
              className="shrink-0 rounded-lg border border-[#C8D5C8] p-2 text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
              title="Copy password"
            >
              {copiedField === 'password' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            </button>
          </div>
        </div>
        <div>
          <label className={labelCls}>Verification Link (shown once)</label>
          <div className="flex items-center gap-2">
            <code className="flex-1 rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-3 py-2 text-[11px] font-mono text-[#1A2B1A] break-all">
              {result.verification_link}
            </code>
            <button
              type="button"
              onClick={() => handleCopy('link', result.verification_link)}
              className="shrink-0 rounded-lg border border-[#C8D5C8] p-2 text-[#4A5E4A] hover:bg-[#F5F7F5] transition-colors"
              title="Copy verification link"
            >
              {copiedField === 'link' ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
            </button>
          </div>
          <p className="text-[11px] text-[#A8BCA8] mt-1">
            The user must open this link — on an office/LAN machine if working offline — to activate their account.
            Then they log in with the password above and set their own. The account stays inactive until the link is opened.
          </p>
        </div>
        <p className="text-[11px] text-[#A8BCA8]">Relay both to {formData.email} directly — they will not be shown again.</p>
      </div>
    )
  }

  const confirmMessage = role === 'ADMIN'
    ? (loadingAdmin
        ? 'Checking current administrator…'
        : currentAdmin
          ? `Creating a new administrator will immediately deactivate the current administrator (${currentAdmin.email}) and log them out. Only one administrator can be active at a time. Continue?`
          : 'Creating a new administrator will immediately deactivate any other active administrator and log them out. Only one administrator can be active at a time. Continue?')
    : `Add new ${roleLabel} user "${fullName}"?`

  return (
    <div className="space-y-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#7A8E7A]">Step 3 of 3 — Review</p>

      <div className="space-y-2">
        <Row label="Email"          value={formData.email} />
        <Row label="Name"           value={fullName} />
        <Row label="Mobile number"  value={formData.contact_number || '—'} />
        <Row label="Role"           value={roleLabel} />
        <div className="rounded-lg bg-[#F9FAF9] border border-[#E2E8E2] px-4 py-3 text-[12px] text-[#7A8E7A]">
          A verification link and a secure random password will be sent to the user's email. The account stays inactive until they click the link.
        </div>
      </div>

      {error && <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}

      {showConfirm && (
        <ConfirmDialog
          title={role === 'ADMIN' ? 'Deactivate Current Administrator?' : 'Confirm Action'}
          message={confirmMessage}
          confirmLabel={role === 'ADMIN' ? 'Yes, Continue' : 'Confirm'}
          danger={role === 'ADMIN'}
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function CreateUserModal({ onClose, onSuccess }) {
  const { user: currentUser, logout } = useAuth()
  const [step,     setStep]     = useState(1)
  const [role,     setRole]     = useState('')
  const [formData, setFormData] = useState({
    lastName: '', firstName: '', suffix: '', email: '', contact_number: '',
  })
  const [footer, setFooter] = useState(null)

  const handleSuccess = () => {
    // Whoever has permission to create an ADMIN is, by definition, the sole
    // currently-active admin — creating another one just deactivated them.
    if (role === 'ADMIN' && currentUser?.role === 'ADMIN') {
      logout()
      return
    }
    onSuccess?.()
    onClose()
  }

  return (
    <ModalShell
      title="Add New User"
      subtitle="Fill in the details below to add a new user."
      icon={UserPlus}
      onClose={onClose}
      maxWidth="max-w-md"
      footer={footer}
    >
      {step === 1 && (
        <StepRole selectedRole={role} onSelect={setRole} onNext={() => setStep(2)} onCancel={onClose} setFooter={setFooter} />
      )}
      {step === 2 && (
        <StepDetails
          role={role}
          formData={formData}
          onChange={setFormData}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          onCancel={onClose}
          setFooter={setFooter}
        />
      )}
      {step === 3 && (
        <StepReview
          role={role}
          formData={formData}
          onBack={() => setStep(2)}
          onCancel={onClose}
          onSuccess={handleSuccess}
          setFooter={setFooter}
        />
      )}
    </ModalShell>
  )
}
