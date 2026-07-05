import { useState } from "react"
import api from "../../api/axiosInstance.js"
import ModalShell from "../../components/UI/ModalShell.jsx"
import Button from "../../components/UI/Button.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"

const labelCls = "block text-xs font-medium text-slate-600"

function EditUserModal({ user, onClose, onSuccess }) {
  const [fullName, setFullName] = useState(user.full_name || "")
  const [contactNumber, setContactNumber] = useState(user.contact_number || "")
  const [role, setRole] = useState(user.role)
  const [isActive, setIsActive] = useState(user.is_active)
  const [errorMessage, setErrorMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setErrorMessage("")
    setIsSubmitting(true)

    try {
      await api.patch(`/accounts/users/${user.id}/`, {
        full_name: fullName,
        contact_number: contactNumber,
        role,
        is_active: isActive,
      })
      onSuccess()
      onClose()
    } catch (error) {
      const errorData = error.response?.data
      let message = "Unable to update user"
      if (errorData?.non_field_errors) {
        message = errorData.non_field_errors[0]
      } else if (errorData?.detail) {
        message = errorData.detail
      }
      setErrorMessage(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <ModalShell title="Edit User" onClose={onClose}>
      <p className="mb-4 text-sm text-slate-500">{user.full_name}</p>
      <form className="space-y-4" onSubmit={handleSubmit}>
        <div>
          <label className={labelCls}>Email Address</label>
          <input
            className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-100 px-3 py-2 text-sm text-slate-500"
            disabled
            type="email"
            value={user.email}
          />
        </div>

        <div>
          <label className={labelCls}>Full Name</label>
          <input
            className={`${baseInputClasses} mt-1`}
            type="text"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Contact Number</label>
          <input
            className={`${baseInputClasses} mt-1`}
            type="text"
            value={contactNumber}
            onChange={(e) => setContactNumber(e.target.value)}
          />
        </div>

        <div>
          <label className={labelCls}>Role</label>
          <select
            className={`${baseInputClasses} mt-1`}
            value={role}
            onChange={(e) => setRole(e.target.value)}
          >
            <option value="EVALUATOR">Evaluator</option>
            <option value="ADMIN">Admin</option>
          </select>
        </div>

        <div>
          <label className={labelCls}>Status</label>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm font-medium text-slate-700">
            <input
              checked={isActive}
              className="h-4 w-4 rounded accent-green-600"
              type="checkbox"
              onChange={(e) => setIsActive(e.target.checked)}
            />
            {isActive ? "Active" : "Inactive"}
          </label>
        </div>

        {errorMessage && (
          <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
            {errorMessage}
          </p>
        )}

        <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
          <Button onClick={onClose} type="button" variant="ghost">
            Cancel
          </Button>
          <Button isLoading={isSubmitting} type="submit" variant="primary">
            Save Changes
          </Button>
        </div>
      </form>
    </ModalShell>
  )
}

export default EditUserModal
