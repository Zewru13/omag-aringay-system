import { useState } from 'react'
import { Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'

const labelCls = 'block text-xs font-medium text-slate-600 mb-1'

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV']

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

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
}

export default function EditUserModal({ user, onClose, onSuccess }) {
  const originalData = {
    email:          user.email || '',
    full_name:      user.full_name || '',
    suffix:         user.suffix || '',
    contact_number: user.contact_number || '',
    role:           user.role || 'EVALUATOR',
    is_active:      user.is_active,
  }

  const [email,        setEmail]        = useState(originalData.email)
  const [fullName,     setFullName]     = useState(originalData.full_name)
  const [suffix,       setSuffix]       = useState(originalData.suffix)
  const [contact,      setContact]      = useState(originalData.contact_number)
  const [contactError, setContactError] = useState('')
  const [role,         setRole]         = useState(originalData.role)
  const [isActive,     setIsActive]     = useState(originalData.is_active)
  const [error,        setError]        = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  const currentData = { email, full_name: fullName, suffix, contact_number: contact, role, is_active: isActive }
  const hasChanges = JSON.stringify(currentData) !== JSON.stringify(originalData)

  const handleContactChange = (e) => {
    const digits = e.target.value.replace(/\D/g, '').slice(0, 11)
    setContact(digits)
    setContactError(validateContact(digits))
  }

  const handleSave = async () => {
    setShowConfirm(false)
    if (contact && validateContact(contact)) {
      setContactError(validateContact(contact))
      return
    }
    setError('')
    setIsSubmitting(true)
    try {
      await api.patch(`/accounts/users/${user.id}/`, {
        email,
        full_name:      fullName,
        suffix,
        contact_number: contact,
        role,
        is_active:      isActive,
      })
      onSuccess()
      onClose()
    } catch (err) {
      const d = err.response?.data
      setError(d?.email?.[0] || d?.non_field_errors?.[0] || d?.detail || 'Unable to update user.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <>
      <ModalShell title="Edit User" subtitle={user.full_name} icon={Pencil} onClose={onClose} maxWidth="max-w-md">
        <div className="space-y-4">
          {/* Email */}
          <div>
            <label className={labelCls}>Email Address</label>
            <input type="email" className={baseInputClasses} value={email} onChange={e => setEmail(e.target.value)} />
          </div>

          {/* Full Name + Suffix */}
          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className={labelCls}>Full Name</label>
              <input className={baseInputClasses} value={fullName} onChange={e => setFullName(e.target.value)} />
            </div>
            <div>
              <label className={labelCls}>Suffix</label>
              <select className={baseInputClasses} value={suffix} onChange={e => setSuffix(e.target.value)}>
                {SUFFIX_OPTIONS.map(s => <option key={s} value={s}>{s || 'None'}</option>)}
              </select>
            </div>
          </div>

          {/* Contact */}
          <div>
            <label className={labelCls}>Contact Number</label>
            <input type="tel" inputMode="numeric" maxLength={11} className={baseInputClasses}
              placeholder="09XXXXXXXXX"
              onKeyPress={e => { if (!/[0-9]/.test(e.key)) e.preventDefault() }}
              value={contact}
              onChange={handleContactChange} />
            {contactError && <p className="mt-1 text-xs text-rose-600">{contactError}</p>}
          </div>

          {/* Role — cards */}
          <div>
            <label className={labelCls}>Role</label>
            <div className="mt-1 space-y-2">
              {ROLE_OPTIONS.map(opt => (
                <div
                  key={opt.value}
                  onClick={() => setRole(opt.value)}
                  className={`cursor-pointer rounded-xl border-2 p-3 transition-all ${
                    role === opt.value
                      ? 'border-[#1E4620] bg-[#f0f7f0]'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-slate-900">{opt.label}</p>
                  <p className="text-xs text-slate-500">{opt.desc}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <label className="mt-1 flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded accent-green-600" />
              <span className="text-sm font-medium text-slate-700">{isActive ? 'Active' : 'Inactive'}</span>
            </label>
          </div>

          {error && <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">{error}</p>}

          <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
            <button type="button" onClick={onClose}
              className="rounded-xl px-4 py-2.5 text-sm text-slate-600 hover:bg-slate-100 transition-colors">
              Cancel
            </button>
            <button type="button" disabled={isSubmitting || !hasChanges} onClick={() => setShowConfirm(true)}
              className="rounded-xl bg-[#1E4620] px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#2D6A31] disabled:opacity-50">
              Save Changes
            </button>
          </div>
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog
          title="Confirm Action"
          message={`Save changes to "${user.full_name}"?`}
          confirmLabel="Confirm"
          onConfirm={handleSave}
          onCancel={() => setShowConfirm(false)}
        />
      )}
    </>
  )
}
