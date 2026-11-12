import { useState } from 'react'
import { UserPlus } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import { FormCell, FormRow, FormRows, FormSection } from '../../components/UI/FormTable.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { useToast } from '../../context/ToastContext.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { ROLE_OPTIONS, composeFullName, validateUserForm } from './userForm.js'
import UserFormSections from './UserFormSections.jsx'
import CopyLine from './CopyLine.jsx'

// One window: the role, the name and the contact details of the new staff member, then a confirmation. When the verification
// e-mail cannot be sent the same window turns into the one-time details to hand over.
export default function CreateUserModal({ onClose, onSuccess }) {
  const { user: currentUser, logout } = useAuth()
  const { showToast } = useToast()
  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm('create-user')
  const [role,      setRole]      = useDraftField(draft, 'role', '')
  const [lastName,  setLastName]  = useDraftField(draft, 'lastName', '')
  const [firstName, setFirstName] = useDraftField(draft, 'firstName', '')
  const [suffix,    setSuffix]    = useDraftField(draft, 'suffix', '')
  const [email,     setEmail]     = useDraftField(draft, 'email', '')
  const [contact,   setContact]   = useDraftField(draft, 'contact', '')
  const [errors,        setErrors]        = useState({})
  const [error,         setError]         = useState('')
  const [isSubmitting,  setIsSubmitting]  = useState(false)
  const [showConfirm,   setShowConfirm]   = useState(false)
  const [currentAdmin,  setCurrentAdmin]  = useState(null)
  const [loadingAdmin,  setLoadingAdmin]  = useState(false)
  const [result,        setResult]        = useState(null)

  const values = { role, lastName, firstName, suffix, email, contact }
  const setters = { role: setRole, lastName: setLastName, firstName: setFirstName, suffix: setSuffix, email: setEmail, contact: setContact }
  const set = (field, value) => {
    setters[field](value)
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const fullName = composeFullName(lastName, firstName, suffix)
  // Display label only — the raw `role` value (ADMIN/EVALUATOR) is what is submitted.
  const roleLabel = ROLE_OPTIONS.find((option) => option.value === role)?.label || role

  const finish = () => {
    // Whoever has permission to create an ADMIN is, by definition, the sole
    // currently-active admin — creating another one just deactivated them.
    if (role === 'ADMIN' && currentUser?.role === 'ADMIN') {
      logout()
      return
    }
    onSuccess?.()
    onClose()
  }

  const openConfirm = async () => {
    const found = validateUserForm(values)
    if (!role) found.role = 'Choose a role.'
    setErrors(found)
    if (Object.keys(found).length) return
    setError('')
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
        suffix,
        email,
        contact_number: contact,
        role,
      })
      draft.clear()   // the account exists: the typed details are no longer a draft
      if (r.data.email_sent) {
        // Verification email delivered — never show the password in the UI.
        showToast(`Verification email sent to ${email}.`, 'success')
        finish()
      } else {
        // Email failed (or SMTP isn't configured) — show the password and verification link once so the admin can relay
        // them. A mistyped address behaves identically: the link is never clicked and the account stays inactive.
        setResult(r.data)
      }
    } catch (err) {
      const d = err.response?.data
      setError(d?.email?.[0] || d?.detail || 'Unable to create user.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const confirmMessage = role === 'ADMIN'
    ? (loadingAdmin
        ? 'Checking current administrator…'
        : currentAdmin
          ? `Creating a new administrator will immediately deactivate the current administrator (${currentAdmin.email}) and log them out. Only one administrator can be active at a time. Continue?`
          : 'Creating a new administrator will immediately deactivate any other active administrator and log them out. Only one administrator can be active at a time. Continue?')
    : `Add new ${roleLabel} user "${fullName}"?`

  // ── The verification e-mail could not be sent: the one-time details.
  if (result) {
    return (
      <ModalShell title="User Created" subtitle={fullName} icon={UserPlus} onClose={finish} maxWidth="max-w-2xl"
        footer={<Button type="button" onClick={finish}>Done</Button>}>
        <div className="space-y-3">
          <div className="rounded-lg border border-[#FDE68A] bg-[#FEF3C7] px-4 py-3 text-[12px] text-[#92400E]">
            The verification email could not be sent{result.reason ? ` (${result.reason.replace(/[.\s]+$/, '')})` : ''}. Give the user these details directly:
          </div>
          <FormSection title="Details to give them">
            <FormRows label="Details to give them">
              <FormRow>
                <FormCell label="Temporary Password (shown once)" wide>
                  <CopyLine label="Temporary password" value={result.default_password} />
                </FormCell>
              </FormRow>
              <FormRow>
                <FormCell label="Verification Link (shown once)" wide
                  hint={<p className="mt-1 text-[11.5px] text-[#7A8E7A]">The user must open this link (on an office or LAN machine if working offline) to activate the account. Then they sign in with the password above and set their own.</p>}>
                  <CopyLine label="Verification link" value={result.verification_link} mono="text-[11px]" />
                </FormCell>
              </FormRow>
            </FormRows>
          </FormSection>
          <p className="text-[11px] text-[#7A8E7A]">Relay both to {email} directly — they will not be shown again.</p>
        </div>
      </ModalShell>
    )
  }

  return (
    <>
      <ModalShell
        title="Add New User"
        subtitle="Fill in the details below to add a new user."
        icon={UserPlus}
        onClose={onClose}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" isLoading={isSubmitting || loadingAdmin} onClick={openConfirm}>Add User</Button>
          </>
        }
      >
        <div className="space-y-3">
          <DraftBanner draft={draft} />
          <UserFormSections mode="create" values={values} set={set} errors={errors} />
          <div className="rounded-lg border border-[#E2E8E2] bg-[#F9FAF9] px-4 py-3 text-[12px] text-[#7A8E7A]">
            A verification link and a secure random password will be sent to the user's email. The account stays inactive until they verify, then they will be asked to change the password on first login.
          </div>
          {error && <p className="rounded-lg border border-[#FCA5A5] bg-[#FEE2E2] px-3 py-2 text-[13px] font-medium text-[#991B1B]">{error}</p>}
        </div>
      </ModalShell>

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
    </>
  )
}
