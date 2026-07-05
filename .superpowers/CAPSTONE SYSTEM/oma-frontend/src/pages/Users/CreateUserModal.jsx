import { useState } from 'react'
import { ChevronRight, Shield, User, UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import Button from '../../components/UI/Button.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

const ROLE_OPTIONS = [
  {
    value: 'EVALUATOR',
    label: 'Evaluator',
    desc: 'Can view and record data. Cannot manage users or generate reports.',
    icon: User,
    accent: 'border-[#1E4620] bg-[#f1f8f2]',
    iconBg: 'bg-[#e8f5e9] text-[#1E4620]',
  },
  {
    value: 'ADMIN',
    label: 'Admin',
    desc: 'Full access: manage users, reports, associations, and all data.',
    icon: Shield,
    accent: 'border-[#1565c0] bg-[#e3f2fd]',
    iconBg: 'bg-[#bbdefb] text-[#1565c0]',
  },
]

// Step 1: Role Selection
function StepRole({ selectedRole, onSelect, onNext, onCancel }) {
  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 1 of 3 — Select Role</p>
      <div className="grid gap-3 sm:grid-cols-2">
        {ROLE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const isSelected = selectedRole === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onSelect(opt.value)}
              className={`flex flex-col gap-2 rounded-xl border-2 p-4 text-left transition-all ${
                isSelected ? opt.accent + ' ring-2 ring-offset-1 ring-current' : 'border-slate-200 bg-white hover:border-slate-300'
              }`}
            >
              <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${isSelected ? opt.iconBg : 'bg-slate-100 text-slate-500'}`}>
                <Icon size={18} />
              </span>
              <div>
                <p className="text-sm font-semibold text-slate-800">{opt.label}</p>
                <p className="mt-0.5 text-xs text-slate-500">{opt.desc}</p>
              </div>
            </button>
          )
        })}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-100 pt-4">
        <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={!selectedRole} onClick={onNext}>
          Next <ChevronRight size={15} className="ml-1" />
        </Button>
      </div>
    </div>
  )
}

// Step 2: Account Details
function StepDetails({ role, formData, onFormChange, onBack, onNext, onCancel }) {
  const [passwordError, setPasswordError] = useState('')
  const [formError, setFormError] = useState('')

  const set = (field, value) => {
    onFormChange({ ...formData, [field]: value })
    if (field === 'password' || field === 'confirm_password') setPasswordError('')
  }

  const validate = () => {
    if (!formData.full_name.trim()) { setFormError('Full name is required.'); return false }
    if (!formData.email.trim())     { setFormError('Email is required.'); return false }
    if (formData.password.length < 8) { setPasswordError('Password must be at least 8 characters.'); return false }
    if (formData.password !== formData.confirm_password) { setPasswordError('Passwords do not match.'); return false }
    setFormError(''); setPasswordError('')
    return true
  }

  const handleNext = () => {
    if (validate()) onNext()
  }

  const roleOpt = ROLE_OPTIONS.find((r) => r.value === role)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 2 of 3 — Account Details</p>
        <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${roleOpt?.iconBg}`}>{roleOpt?.label}</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <label className={labelCls}>Full Name <span className="text-rose-500">*</span></label>
          <input className={baseInputClasses} value={formData.full_name} onChange={(e) => set('full_name', e.target.value)} autoFocus />
        </div>
        <div className="sm:col-span-2">
          <label className={labelCls}>Email Address <span className="text-rose-500">*</span></label>
          <input type="email" className={baseInputClasses} value={formData.email} onChange={(e) => set('email', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Password <span className="text-rose-500">*</span></label>
          <input type="password" className={baseInputClasses} value={formData.password} onChange={(e) => set('password', e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Confirm Password <span className="text-rose-500">*</span></label>
          <input type="password" className={baseInputClasses} value={formData.confirm_password} onChange={(e) => set('confirm_password', e.target.value)} />
        </div>
        {passwordError && (
          <p className="sm:col-span-2 text-xs font-medium text-rose-600">{passwordError}</p>
        )}
        <div className="sm:col-span-2">
          <label className={labelCls}>Contact Number</label>
          <input className={baseInputClasses} value={formData.contact_number} onChange={(e) => set('contact_number', e.target.value)} />
        </div>
      </div>

      {formError && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{formError}</p>
      )}

      <div className="flex justify-between border-t border-slate-100 pt-4">
        <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" onClick={handleNext}>
            Review <ChevronRight size={15} className="ml-1" />
          </Button>
        </div>
      </div>
    </div>
  )
}

// Step 3: Review
function StepReview({ role, formData, onBack, onCancel, onSuccess }) {
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formError, setFormError]       = useState('')
  const [showConfirm, setShowConfirm]   = useState(false)

  const roleOpt = ROLE_OPTIONS.find((r) => r.value === role)

  const handleConfirmed = async () => {
    setShowConfirm(false)
    setIsSubmitting(true)
    try {
      await api.post('/accounts/users/create/', {
        full_name:      formData.full_name,
        email:          formData.email,
        password:       formData.password,
        role,
        contact_number: formData.contact_number,
      })
      onSuccess()
    } catch (err) {
      const d = err.response?.data
      setFormError(
        d?.email?.[0] || d?.password?.[0] || d?.non_field_errors?.[0] || d?.detail || 'Unable to create user.'
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  const Row = ({ label, value }) => (
    <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <span className="text-sm font-semibold text-slate-800 text-right">{value || '—'}</span>
    </div>
  )

  return (
    <div className="space-y-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-slate-500">Step 3 of 3 — Review</p>
      <p className="text-xs text-slate-500">Please confirm the account details before creating.</p>

      <div className="space-y-2">
        <Row label="Full Name"      value={formData.full_name} />
        <Row label="Email"          value={formData.email} />
        <Row label="Contact Number" value={formData.contact_number || '—'} />
        <div className="flex items-start justify-between gap-4 rounded-lg border border-slate-100 bg-slate-50 px-4 py-3">
          <span className="text-xs font-medium text-slate-500">Role</span>
          <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${roleOpt?.iconBg}`}>
            {roleOpt?.label}
          </span>
        </div>
        <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
          <p className="text-xs text-amber-700">
            The user will receive their login credentials via email after the account is created.
          </p>
        </div>
      </div>

      {formError && (
        <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{formError}</p>
      )}

      <div className="flex justify-between border-t border-slate-100 pt-4">
        <Button type="button" variant="outline" onClick={onBack}>← Back</Button>
        <div className="flex gap-2">
          <Button type="button" variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button type="button" isLoading={isSubmitting} onClick={() => setShowConfirm(true)}>
            <UserPlus size={15} className="mr-1" /> Add User
          </Button>
        </div>
      </div>

      {showConfirm && (
        <ConfirmDialog
          title="Create Account"
          message={`Create a new ${roleOpt?.label} account for ${formData.full_name}?`}
          confirmLabel="Create"
          onConfirm={handleConfirmed}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </div>
  )
}

// ── Main Modal ────────────────────────────────────────────────────────────────

function CreateUserModal({ onClose, onSuccess }) {
  const [step, setStep] = useState(1)
  const [role, setRole] = useState('')
  const [formData, setFormData] = useState({
    full_name: '', email: '', password: '', confirm_password: '', contact_number: '',
  })

  const handleSuccess = () => {
    onSuccess?.()
    onClose()
  }

  return (
    <ModalShell title="Create Account" subtitle="Set up a new system user" icon={UserPlus} onClose={onClose} maxWidth="max-w-lg">
      {step === 1 && (
        <StepRole
          selectedRole={role}
          onSelect={setRole}
          onNext={() => setStep(2)}
          onCancel={onClose}
        />
      )}
      {step === 2 && (
        <StepDetails
          role={role}
          formData={formData}
          onFormChange={setFormData}
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

export default CreateUserModal
