import { useState } from 'react'
import { Pencil } from 'lucide-react'
import api from '../../api/axiosInstance.js'
import Button from '../../components/UI/Button.jsx'
import ConfirmDialog from '../../components/UI/ConfirmDialog.jsx'
import ModalShell from '../../components/UI/ModalShell.jsx'
import DraftBanner from '../../components/UI/DraftBanner.jsx'
import useDraftForm, { useDraftField } from '../../hooks/useDraftForm.js'
import { tidyPhone } from '../../utils/inputGuards.js'
import { describeRole } from './userRoleHelpers.js'
import { composeFullName, splitFullName, validateUserForm } from './userForm.js'
import UserFormSections from './UserFormSections.jsx'

export default function EditUserModal({ user, onClose, onSuccess }) {
  // Farmer/Fisherfolk/Organization all share role=CITIZEN on the raw
  // account — their real type is fixed by how the account was created
  // (which record it's linked to), never something staff pick here, so
  // ADMIN/FOCAL PERSON never applies and role is never sent for them.
  const isCitizen = user.role === 'CITIZEN'

  const { lastName: originalLast, firstName: originalFirst } = splitFullName(user.full_name, user.suffix)
  const originalData = {
    email:     user.email || '',
    lastName:  originalLast,
    firstName: originalFirst,
    suffix:    user.suffix || '',
    contact:   tidyPhone(user.contact_number || ''),   // an older number with dashes opens in the plain format
    role:      user.role || 'EVALUATOR',
    isActive:  user.is_active,
  }

  // What is typed is a draft: still here when the form is opened again (see hooks/useDraftForm.js).
  const draft = useDraftForm(`edit-user:${user.id}`)
  const [email,     setEmail]     = useDraftField(draft, 'email', originalData.email)
  const [lastName,  setLastName]  = useDraftField(draft, 'lastName', originalData.lastName)
  const [firstName, setFirstName] = useDraftField(draft, 'firstName', originalData.firstName)
  const [suffix,    setSuffix]    = useDraftField(draft, 'suffix', originalData.suffix)
  const [contact,   setContact]   = useDraftField(draft, 'contact', originalData.contact)
  const [role,      setRole]      = useDraftField(draft, 'role', originalData.role)
  const [isActive,  setIsActive]  = useDraftField(draft, 'isActive', originalData.isActive)
  const [errors,       setErrors]       = useState({})
  const [error,        setError]        = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [showConfirm,  setShowConfirm]  = useState(false)

  const values = { email, lastName, firstName, suffix, contact, role, isActive }
  const hasChanges = JSON.stringify(values) !== JSON.stringify(originalData)

  const setters = { email: setEmail, lastName: setLastName, firstName: setFirstName, suffix: setSuffix, contact: setContact, role: setRole, isActive: setIsActive }
  const set = (field, value) => {
    setters[field](value)
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }))
  }

  const askToSave = () => {
    const found = validateUserForm(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setShowConfirm(true)
  }

  const handleSave = async () => {
    setShowConfirm(false)
    setError('')
    setIsSubmitting(true)
    try {
      await api.patch(`/accounts/users/${user.id}/`, {
        email,
        full_name:      composeFullName(lastName, firstName, suffix),
        suffix,
        contact_number: contact,
        // Never send role for a citizen account — it isn't editable here
        // and must never be overwritten to ADMIN/EVALUATOR by accident.
        ...(isCitizen ? {} : { role }),
        is_active:      isActive,
      })
      draft.clear()
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
      <ModalShell
        title="Edit User"
        subtitle={user.full_name}
        icon={Pencil}
        onClose={onClose}
        maxWidth="max-w-3xl"
        footer={
          <>
            <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
            <Button type="button" isLoading={isSubmitting} disabled={!hasChanges} onClick={askToSave}>Save Changes</Button>
          </>
        }
      >
        <div className="space-y-3">
          <DraftBanner draft={draft} />
          <UserFormSections mode="edit" values={values} set={set} errors={errors} accountType={isCitizen ? describeRole(user).label : ''} />
          {error && (
            <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
              {error}
            </p>
          )}
        </div>
      </ModalShell>

      {showConfirm && (
        <ConfirmDialog variant="primary"
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
