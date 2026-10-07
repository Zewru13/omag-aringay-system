import { useEffect, useRef, useState } from "react"
import { Camera, Edit, Loader2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import Button from "../../components/UI/Button.jsx"
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx"
import ModalShell from "../../components/UI/ModalShell.jsx"
import PasswordRequirementChecklist from "../../components/UI/PasswordRequirementChecklist.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import { baseInputClasses, FormLabel } from "../../components/UI/FormField.jsx"
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

function formatDate(value) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value))
}

const CARD = "rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden"
const CARD_HEADER = "px-5 py-3.5 bg-[#EBF5EE] border-b border-[#E2E8E2]"
const CARD_HEADER_TEXT = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]"
const MINI_LABEL = "text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]"

function ReadOnlyRow({ label, value }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#F0F4F0] last:border-0">
      <div>
        <p className={MINI_LABEL}>{label}</p>
        <p className="mt-1 text-[13px] text-[#1A2B1A]">{value || "—"}</p>
      </div>
    </div>
  )
}

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
      if (passwords.new_password.length < 15) {
        setFormError("New password must be at least 15 characters.")
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
          <section className={CARD}>
            <div className={CARD_HEADER}><p className={CARD_HEADER_TEXT}>Account Information</p></div>
            <div className="px-5">
              <ReadOnlyRow label="Full Name" value={profile?.full_name} />
              <ReadOnlyRow label="Email Address" value={profile?.email} />
              <ReadOnlyRow label="Username" value={profile?.username} />
              <ReadOnlyRow label="Role" value={roleLabel} />
              <ReadOnlyRow label="Date Joined" value={formatDate(profile?.date_joined)} />
            </div>
          </section>
        </div>
      </PageLayout>

      {isEditOpen && (
        <ModalShell
          title="Edit Profile"
          subtitle="Update your account details or password"
          icon={Edit}
          onClose={closeEditModal}
          maxWidth="max-w-lg"
          footer={(
            <>
              <Button onClick={closeEditModal} type="button" variant="ghost">Cancel</Button>
              <button
                type="submit"
                form="edit-profile-form"
                disabled={isSaving}
                className="press-scale flex h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] bg-[#1B4D2E] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                {isSaving && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                Save Changes
              </button>
            </>
          )}
        >
          <form id="edit-profile-form" onSubmit={handleSave} className="space-y-4">
            <div>
              <FormLabel hideIndicator>Full Name</FormLabel>
              <input
                className={baseInputClasses}
                type="text"
                value={form.full_name}
                onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
              />
            </div>
            <div>
              <FormLabel hideIndicator>Email Address</FormLabel>
              <EmailInput
                className={baseInputClasses}
                value={form.email}
                onChange={(v) => setForm((f) => ({ ...f, email: v }))}
              />
            </div>
            <div>
              <FormLabel hideIndicator>Username</FormLabel>
              <input
                className={baseInputClasses}
                type="text"
                value={form.username}
                onChange={(e) => setForm((f) => ({ ...f, username: e.target.value }))}
              />
            </div>

            <div className="border-t border-[#F0F4F0] pt-4">
              <p className="mb-3 text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]">
                Change Password <span className="normal-case font-normal text-[#A8BCA8]">(optional)</span>
              </p>
              <div className="space-y-4">
                <div>
                  <FormLabel hideIndicator>New Password</FormLabel>
                  <input
                    autoComplete="new-password"
                    className={baseInputClasses}
                    type="password"
                    value={passwords.new_password}
                    onChange={(e) => setPasswords((p) => ({ ...p, new_password: e.target.value }))}
                  />
                </div>
                <div>
                  <FormLabel hideIndicator>Confirm New Password</FormLabel>
                  <input
                    autoComplete="new-password"
                    className={baseInputClasses}
                    type="password"
                    value={passwords.confirm_new_password}
                    onChange={(e) => setPasswords((p) => ({ ...p, confirm_new_password: e.target.value }))}
                  />
                </div>
                {passwords.new_password && <PasswordRequirementChecklist password={passwords.new_password} />}
              </div>
            </div>

            <div className="border-t border-[#F0F4F0] pt-4">
              <FormLabel hideIndicator>Current Password</FormLabel>
              <input
                autoComplete="current-password"
                className={baseInputClasses}
                type="password"
                value={passwords.current_password}
                onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))}
              />
              <p className="mt-1.5 text-[12px] leading-[1.5] text-[#7A8E7A]">
                Required only if you change your email, username, or password above.
              </p>
            </div>

            {formError && (
              <p className="rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
                {formError}
              </p>
            )}
          </form>
        </ModalShell>
      )}

      {showPwConfirm && (
        <ConfirmDialog
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
