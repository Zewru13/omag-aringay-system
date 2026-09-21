import { useState } from 'react'
import { Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import { baseInputClasses } from '../../components/UI/FormField.jsx'
import { describeRole } from './userRoleHelpers.js'

const labelCls = 'block text-[12px] font-medium text-[#4A5E4A] mb-1'

const SUFFIX_OPTIONS = ['', 'Jr.', 'Sr.', 'II', 'III', 'IV']

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

const validateContact = (value) => {
  if (!value) return ''
  const digits = value.replace(/\D/g, '')
  if (digits.length !== 11) return 'Contact number must be exactly 11 digits.'
  if (!digits.startsWith('09')) return 'Contact number must start with 09.'
  return ''
}

export default function EditUserModal({ user, onClose, onSuccess }) {
  // Farmer/Fisherfolk/Organization all share role=CITIZEN on the raw
  // account — their real type is fixed by how the account was created
  // (which record it's linked to), never something staff pick here, so
  // ADMIN/FOCAL PERSON never applies and role is never sent for them.
  const isCitizen = user.role === 'CITIZEN'

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
        // Never send role for a citizen account — it isn't editable here
        // and must never be overwritten to ADMIN/EVALUATOR by accident.
        ...(isCitizen ? {} : { role }),
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
            {contactError && <p className="mt-1 text-[12px] text-[#C0392B]">{contactError}</p>}
          </div>

          {/* Role — cards for staff; fixed, read-only type for citizens */}
          <div>
            <label className={labelCls}>{isCitizen ? 'Account Type' : 'Role'}</label>
            {isCitizen ? (
              <input
                disabled
                readOnly
                value={describeRole(user).label}
                className={`${baseInputClasses} mt-1.5 cursor-not-allowed bg-[#F5F7F5] text-[#7A8E7A]`}
              />
            ) : (
              <div className="mt-1.5 space-y-2">
                {ROLE_OPTIONS.map(opt => (
                  <div
                    key={opt.value}
                    onClick={() => setRole(opt.value)}
                    className={`cursor-pointer rounded-lg border-2 p-3 transition-all ${
                      role === opt.value
                        ? 'border-[#1B4D2E] bg-[#EBF5EE]'
                        : 'border-[#E2E8E2] bg-white hover:border-[#C8D5C8]'
                    }`}
                  >
                    <p className="text-[13px] font-semibold text-[#1A2B1A]">{opt.label}</p>
                    <p className="text-[12px] text-[#7A8E7A]">{opt.desc}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <label className={labelCls}>Status</label>
            <label className="mt-1.5 flex cursor-pointer items-center gap-2">
              <input type="checkbox" checked={isActive} onChange={e => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded accent-[#1B4D2E]" />
              <span className="text-[13px] font-medium text-[#4A5E4A]">{isActive ? 'Active' : 'Deactivated'}</span>
            </label>
          </div>

          {error && (
            <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 border-t border-[#F0F4F0] pt-4">
            <button type="button" onClick={onClose}
              className="rounded-lg px-4 py-2 text-[13px] font-medium text-[#4A5E4A] border border-[#C8D5C8] hover:bg-[#F5F7F5] transition-colors">
              Cancel
            </button>
            <button type="button" disabled={isSubmitting || !hasChanges} onClick={() => setShowConfirm(true)}
              className="rounded-lg bg-[#1B4D2E] px-4 py-2 text-[13px] font-medium text-white transition-colors hover:bg-[#235E38] disabled:opacity-50">
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
