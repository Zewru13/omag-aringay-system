import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import BARANGAYS from '../../constants/barangays.js'

const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

const SUFFIX_OPTIONS = ['Jr.', 'Sr.', 'II', 'III', 'IV']

const ROLE_OPTIONS = [
  {
    value: 'ADMIN',
    label: 'ADMIN',
    desc: 'Full system access: manage users, view all reports, and configure system settings.',
  },
  {
    value: 'EVALUATOR',
    label: 'EVALUATOR',
    desc: 'OMAg staff for daily data entry, crop monitoring, and record management.',
  },
]

function generatePassword() {
  const chars = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

// ── Step 1: Role ──────────────────────────────────────────────────────────────

function StepRole({ selectedRole, onSelect, onNext, onCancel }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 1 of 3 — Select Role</p>
      <div className="space-y-3">
        {ROLE_OPTIONS.map(opt => (
          <div
            key={opt.value}
            onClick={() => onSelect(opt.value)}
            className={`cursor-pointer rounded-xl border-2 p-4 transition-all ${
              selectedRole === opt.value
                ? 'border-[#1E4620] bg-[#f0f7f0]'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
            <p className="mt-0.5 text-xs text-slate-500">{opt.desc}</p>
          </div>
        ))}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <button type="button" onClick={onCancel}
          className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
          Cancel
        </button>
        <button type="button" disabled={!selectedRole} onClick={onNext}
          className="rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31] disabled:opacity-50">
          Next
        </button>
      </div>
    </div>
  )
}

// ── Step 2: Details ───────────────────────────────────────────────────────────

function StepDetails({ role, formData, onChange, onBack, onNext, onCancel }) {
  const [error, setError] = useState('')

  const set = (field, value) => onChange({ ...formData, [field]: value })

  const handleNext = () => {
    if (!formData.lastName.trim())  { setError('Last name is required.'); return }
    if (!formData.firstName.trim()) { setError('First name is required.'); return }
    if (!formData.barangay)         { setError('Barangay is required.'); return }
    if (!formData.email.trim())     { setError('Email is required.'); return }
    setError('')
    onNext()
  }

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 2 of 3 — Account Details</p>
      <p className="text-sm font-medium text-[#1E4620]">Please input the name of the staff member</p>

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

        {/* Suffix */}
        <div>
          <label className={labelCls}>Suffix <span className="text-slate-400 font-normal">(optional)</span></label>
          <select className={baseInputClasses} value={formData.suffix} onChange={e => set('suffix', e.target.value)}>
            <option value="">None</option>
            {SUFFIX_OPTIONS.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>

        {/* Barangay */}
        <div>
          <label className={labelCls}>Barangay <span className="text-rose-500">*</span></label>
          <select className={baseInputClasses} value={formData.barangay} onChange={e => set('barangay', e.target.value)}>
            <option value="" disabled>Select barangay...</option>
            {BARANGAYS.map(b => <option key={b} value={b}>{b}</option>)}
          </select>
        </div>

        {/* Email */}
        <div>
          <label className={labelCls}>Email Address <span className="text-rose-500">*</span></label>
          <input type="email" className={baseInputClasses} placeholder="e.g. juan@example.com"
            value={formData.email} onChange={e => set('email', e.target.value)} />
        </div>

        {/* Contact */}
        <div>
          <label className={labelCls}>Contact Number <span className="text-slate-400 font-normal">(optional)</span></label>
          <input type="tel" inputMode="numeric" maxLength={11} className={baseInputClasses}
            placeholder="09XXXXXXXXX"
            onKeyPress={e => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
            value={formData.contact_number}
            onChange={e => set('contact_number', e.target.value.replace(/\D/g, '').slice(0, 11))} />
        </div>

        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          A secure random password will be generated and sent to the user's email. The user will be required to change it on first login.
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

      <div className="flex justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={onBack}
          className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
          ← Back
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="button" onClick={handleNext}
            className="rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31]">
            Next
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Step 3: Review ────────────────────────────────────────────────────────────

function StepReview({ role, formData, onBack, onCancel, onSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error,        setError]        = useState('')
  const [showConfirm,  setShowConfirm]  = useState(false)

  const fullName = `${formData.lastName}, ${formData.firstName}${formData.suffix ? ' ' + formData.suffix : ''}`

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post('/accounts/users/create/', {
        full_name:      fullName,
        suffix:         formData.suffix,
        email:          formData.email,
        password:       generatePassword(),
        role,
        contact_number: formData.contact_number,
      })
      onSuccess()
    } catch (err) {
      const d = err.response?.data
      setError(d?.email?.[0] || d?.detail || 'Unable to create user.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const Row = ({ label, value }) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-right text-sm font-semibold text-slate-800">{value || '—'}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 3 of 3 — Review</p>

      <div className="space-y-2">
        <Row label="Email"          value={formData.email} />
        <Row label="Contact Number" value={formData.contact_number || '—'} />
        <Row label="Name"           value={fullName} />
        <Row label="Role"           value={role} />
        <Row label="Barangay"       value={formData.barangay} />
        <div className="rounded-xl bg-slate-50 px-4 py-3 text-xs text-slate-500">
          A secure random password will be generated and sent to the user's email.
        </div>
      </div>

      {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

      <div className="flex justify-between border-t border-slate-100 pt-4">
        <button type="button" onClick={onBack}
          className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
          ← Back
        </button>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel}
            className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
            Cancel
          </button>
          <button type="button" disabled={isSubmitting} onClick={() => setShowConfirm(true)}
            className="flex items-center gap-2 rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31] disabled:opacity-60">
            {isSubmitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />}
            Add User
          </button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message={`Add new ${role} user "${fullName}"?`}
          confirmLabel="Confirm"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

export default function CreateUserModal({ onClose, onSuccess }) {
  const [step,     setStep]     = useState(1)
  const [role,     setRole]     = useState('')
  const [formData, setFormData] = useState({
    lastName: '', firstName: '', suffix: '', barangay: '', email: '', contact_number: '',
  })

  const handleSuccess = () => { onSuccess?.(); onClose() }

  return (
    <ModalShell
      title="Add New User"
      subtitle="Fill in the details below to add a new user."
      icon={UserPlus}
      onClose={onClose}
      maxWidth="max-w-md"
    >
      {step === 1 && (
        <StepRole selectedRole={role} onSelect={setRole} onNext={() => setStep(2)} onCancel={onClose} />
      )}
      {step === 2 && (
        <StepDetails
          role={role}
          formData={formData}
          onChange={setFormData}
          onBack={() => setStep(1)}
          onNext={() => setStep(3)}
          onCancel={onClose}
        />
      )}
      {step === 3 && (
        <StepReview
          role={role}
          formData={formData}
          onBack={() => setStep(2)}
          onCancel={onClose}
          onSuccess={handleSuccess}
        />
      )}
    </ModalShell>
  )
}
