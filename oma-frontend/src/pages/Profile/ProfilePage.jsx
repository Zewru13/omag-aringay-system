import { useEffect, useRef, useState } from "react"
import { Camera, Edit } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import Button from "../../components/UI/Button.jsx"
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx"
import ModalShell from "../../components/UI/ModalShell.jsx"
import PasswordRequirementChecklist from "../../components/UI/PasswordRequirementChecklist.jsx"
import { passwordMeetsRules } from "../../utils/passwordRules.js"
import StatusPill from "../../components/UI/StatusPill.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"
import { DetailTable, FormCell, FormRow, FormRows, FormSection } from "../../components/UI/FormTable.jsx"
import { formatDate } from "../../utils/dateFormat.js"
import EmailInput from "../../components/UI/EmailInput.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"
import { useToast } from "../../context/ToastContext.jsx"

// Restructured per the explicit follow-up brief: one merged info section
// (the previous "Account Information" and "Profile Information" cards
// duplicated Email/Username/Date Joined), the full name moved directly INTO
// the green header instead of below the photo, the "Active" status display
// removed outright, and every edit (full name, email, username, password)
// consolidated behind a single pencil icon in the header that opens one
// modal — replacing both the old inline full-name pencil and the standalone
// Change Password card.
//
// EMAIL/USERNAME EDITABILITY REVERSES an earlier decision in this same
// project to keep both read-only on this page. They are independent fields
// here (not mirrored to each other) because LoginView's identifier
// resolution already treats them as two separate, real login identifiers —
// see accounts/serializers.py's MeUpdateSerializer for the full reasoning.
// Changing either now requires re-entering the current password (checked in
// accounts/views.py's MeView.patch): email in particular is tied into this
// account's verification/reset flow, so a bare PATCH without proof of
// current possession of the account felt like too light a bar.

function Avatar({ initials, photoUrl, size = 64, onPick, uploading }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex items-center justify-center rounded-full bg-white text-[#1B4D2E] font-semibold overflow-hidden"
        style={{ width: size, height: size, fontSize: size * 0.32 }}
      >
        {photoUrl ? (
          <img src={photoUrl} alt="" className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {onPick && (
        <button
          type="button"
          onClick={onPick}
          disabled={uploading}
          className="absolute bottom-0 right-0 flex h-6 w-6 items-center justify-center rounded-full bg-[#1B4D2E] text-white ring-2 ring-white transition-opacity hover:opacity-90 disabled:opacity-50"
          aria-label="Upload a new photo"
        >
          <Camera size={12} aria-hidden="true" />
        </button>
      )}
    </div>
  )
}

function ProfilePage() {
  const { updateUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [uploadingPhoto, setUploadingPhoto] = useState(false)

  // Single edit modal — full name, email, username, and password, all
  // together, replacing the previous inline full-name pencil and the
  // separate Change Password card.
  const [isEditOpen, setIsEditOpen] = useState(false)
  const [form, setForm] = useState({ full_name: "", email: "", username: "" })
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_new_password: "" })
  const [formError, setFormError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)
  const [pendingPasswordChange, setPendingPasswordChange] = useState(null)

  const fetchProfile = async () => {
    try {
      const res = await api.get("/accounts/me/")
      setProfile(res.data)
    } catch {
      // profile remains null
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { fetchProfile() }, [])

  const roleLabel = profile?.role === "ADMIN" ? "Admin" : "Focal Person"
  const initials = profile?.full_name
    ? profile.full_name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join("")
    : "?"

  const handlePickPhoto = () => fileInputRef.current?.click()

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = ""
    if (!file) return
    setUploadingPhoto(true)
    try {
      const formData = new FormData()
      formData.append("image", file)
      const res = await api.post("/accounts/me/photo/", formData, {
        headers: { "Content-Type": "multipart/form-data" },
      })
      setProfile((p) => ({ ...p, profile_picture_url: res.data.image_url }))
      showToast("Photo updated.", "success")
    } catch (err) {
      showToast(err.response?.data?.image?.[0] || "Unable to upload photo.", "error")
    } finally {
      setUploadingPhoto(false)
    }
  }

  const openEditModal = () => {
    setForm({
      full_name: profile?.full_name || "",
      email: profile?.email || "",
      username: profile?.username || "",
    })
    setPasswords({ current_password: "", new_password: "", confirm_new_password: "" })
    setFormError("")
    setIsEditOpen(true)
  }

  const closeEditModal = () => {
    setIsEditOpen(false)
    setFormError("")
  }

  const applyProfileChanges = async (changedFields, currentPasswordIfNeeded) => {
    const payload = { ...changedFields }
    if (currentPasswordIfNeeded) payload.current_password = currentPasswordIfNeeded
    const res = await api.patch("/accounts/me/", payload)
    setProfile(res.data)
    updateUser(res.data)
  }

  const doChangePassword = async () => {
    if (!pendingPasswordChange) return
    setShowPwConfirm(false)
    setIsSaving(true)
    try {
      await api.post("/accounts/change-password/", pendingPasswordChange)
      showToast("Profile updated. Signing you out to log in with your new password…", "success")
      setTimeout(() => { logout(); navigate("/login") }, 800)
    } catch (err) {
      const data = err.response?.data
      setFormError(data?.new_password?.[0] || data?.non_field_errors?.[0] || data?.detail || "Unable to update password.")
      setIsSaving(false)
      setIsEditOpen(true)
    } finally {
      setPendingPasswordChange(null)
    }
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setFormError("")

    const changedFields = {}
    if (form.full_name !== (profile?.full_name || "")) changedFields.full_name = form.full_name
    if (form.email !== (profile?.email || "")) changedFields.email = form.email
    if (form.username !== (profile?.username || "")) changedFields.username = form.username
    const identityChanged = "email" in changedFields || "username" in changedFields

    const wantsPasswordChange = Boolean(passwords.new_password || passwords.confirm_new_password)

    if (wantsPasswordChange) {
      if (passwords.new_password !== passwords.confirm_new_password) {
        setFormError("New passwords do not match.")
        return
      }
      if (!passwordMeetsRules(passwords.new_password)) {
        setFormError("New password must have at least 8 characters, 1 capital letter, 1 special character and 3 numbers.")
        return
      }
    }

    const needsCurrentPassword = identityChanged || wantsPasswordChange
    if (needsCurrentPassword && !passwords.current_password) {
      setFormError("Current password is required to change your email, username, or password.")
      return
    }

    if (Object.keys(changedFields).length === 0 && !wantsPasswordChange) {
      closeEditModal()
      return
    }

    setIsSaving(true)
    try {
      if (Object.keys(changedFields).length > 0) {
        await applyProfileChanges(changedFields, identityChanged ? passwords.current_password : undefined)
      }

      if (wantsPasswordChange) {
        setPendingPasswordChange(passwords)
        setIsEditOpen(false)
        setShowPwConfirm(true)
        setIsSaving(false)
        return
      }

      showToast("Profile updated successfully.", "success")
      closeEditModal()
    } catch (err) {
      const data = err.response?.data
      setFormError(
        data?.email?.[0] || data?.username?.[0] || data?.full_name?.[0]
        || data?.current_password?.[0] || data?.detail || "Unable to save profile. Please try again."
      )
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <PageLayout title="My Profile" subtitle="View and update your account information">
        <div className="flex min-h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E2E8E2] border-t-[#1B4D2E]" />
        </div>
      </PageLayout>
    )
  }

  return (
    <>
      <PageLayout title="My Profile" subtitle="View and update your account information">
        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />

        <div className="space-y-5">
          {/* Header — photo + full name live here directly, with the single
              edit entry point for the whole page. */}
          <section className="relative overflow-hidden rounded-xl border border-[#E2E8E2] bg-[#1B4D2E] px-5 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
            <button
              type="button"
              onClick={openEditModal}
              aria-label="Edit profile"
              className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white transition-colors hover:bg-white/25"
            >
              <Edit size={16} aria-hidden="true" />
            </button>
            <div className="flex items-center gap-4 pr-12">
              <Avatar
                initials={initials}
                photoUrl={profile?.profile_picture_url}
                onPick={handlePickPhoto}
                uploading={uploadingPhoto}
              />
              <div className="min-w-0">
                <h1 className="truncate text-[20px] font-semibold text-white">{profile?.full_name || "—"}</h1>
                <div className="mt-1.5">
                  <StatusPill tone={profile?.role === "ADMIN" ? "green" : "teal"}>{roleLabel}</StatusPill>
                </div>
              </div>
            </div>
          </section>

          {/* Account Information — the previous Account Information and
              Profile Information cards merged; they duplicated Email,
              Username, and Date Joined between them. */}
          <DetailTable title="Account Information" fields={[
            { label: "Full Name", value: profile?.full_name },
            { label: "Email Address", value: profile?.email },
            { label: "Username", value: profile?.username },
            { label: "Role", value: roleLabel },
            { label: "Date Joined", value: formatDate(profile?.date_joined) },
          ]} />
        </div>
      </PageLayout>

      {isEditOpen && (
        <ModalShell
          title="Edit Profile"
          subtitle="Update your account details or password"
          icon={Edit}
          onClose={closeEditModal}
          maxWidth="max-w-3xl"
          footer={(
            <>
              <Button onClick={closeEditModal} type="button" variant="outline">Cancel</Button>
              <Button type="submit" form="edit-profile-form" isLoading={isSaving}>Save Changes</Button>
            </>
          )}
        >
          <form id="edit-profile-form" onSubmit={handleSave} className="space-y-3">
            <FormSection title="Account">
              <FormRows label="Account">
                <FormRow>
                  <FormCell label="Full Name" wide>
                    <input
                      className={baseInputClasses}
                      type="text"
                      value={form.full_name}
                      onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                    />
                  </FormCell>
                </FormRow>
                <FormRow>
                  <FormCell label="Email Address">
                    <EmailInput
                      className={baseInputClasses}
                      value={form.email}
                      onChange={(v) => setForm((f) => ({ ...f, email: v }))}
                    />
                  </FormCell>
                  <FormCell label="Username">
                    <input
                      className={baseInputClasses}
                      type="text"
                      value={form.username}
                      onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
                    />
                  </FormCell>
                </FormRow>
              </FormRows>
            </FormSection>

            <FormSection title="Change Password">
              <FormRows label="Change Password">
                <FormRow>
                  <FormCell label="New Password">
                    <input
                      autoComplete="new-password"
                      className={baseInputClasses}
                      type="password"
                      value={passwords.new_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))}
                    />
                  </FormCell>
                  <FormCell label="Confirm New Password">
                    <input
                      autoComplete="new-password"
                      className={baseInputClasses}
                      type="password"
                      value={passwords.confirm_new_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, confirm_new_password: e.target.value }))}
                    />
                  </FormCell>
                </FormRow>
                {passwords.new_password && (
                  <FormRow>
                    <FormCell label="Requirements" wide>
                      <PasswordRequirementChecklist password={passwords.new_password} />
                    </FormCell>
                  </FormRow>
                )}
              </FormRows>
              <p className="border-t border-[#F0F4F0] px-3 py-2 text-[11.5px] text-[#7A8E7A]">Leave both empty to keep your password.</p>
            </FormSection>

            <FormSection title="Confirm It Is You">
              <FormRows label="Confirm it is you">
                <FormRow>
                  <FormCell label="Current Password" wide
                    hint={<p className="mt-1 text-[11.5px] leading-[1.5] text-[#7A8E7A]">Required only if you change your email, username, or password above.</p>}>
                    <input
                      autoComplete="current-password"
                      className={baseInputClasses}
                      type="password"
                      value={passwords.current_password}
                      onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))}
                    />
                  </FormCell>
                </FormRow>
              </FormRows>
            </FormSection>

            {formError && (
              <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
                {formError}
              </p>
            )}
          </form>
        </ModalShell>
      )}

      {showPwConfirm && (
        <ConfirmDialog variant="primary"
          title="Change Password"
          message="Your other profile changes have been saved. Your current session will end after the password is changed and you will need to log in again."
          confirmLabel="Change Password"
          onConfirm={doChangePassword}
          onCancel={() => { setShowPwConfirm(false); setPendingPasswordChange(null) }}
        />
      )}
    </>
  )
}

export default ProfilePage
