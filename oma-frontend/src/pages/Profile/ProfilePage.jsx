import { useEffect, useRef, useState } from "react"
import { Camera, Check, Edit, KeyRound, Loader2, Lock, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import Button from "../../components/UI/Button.jsx"
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx"
import PasswordRequirementChecklist from "../../components/UI/PasswordRequirementChecklist.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import { baseInputClasses, FormLabel } from "../../components/UI/FormField.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"
import { useToast } from "../../context/ToastContext.jsx"

// Rebuilt against PROFILE REFERENCE!.docx (image 2 — "A — Staff / Staff
// Profile"): two cards per column (cover + Account Information on the
// left, Profile Information + Change Password on the right), Full Name
// edited inline via its own pencil icon, password changed via the Change
// Password card expanding in place — no modal. An earlier pass here used a
// modal, following the older PROFILE BASIS.docx mockup instead; this
// reference supersedes that.

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
      <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8]">
        <Lock size={11} aria-hidden="true" /> Read-only
      </span>
    </div>
  )
}

function IconButton({ icon: Icon, onClick, tone = "primary", "aria-label": ariaLabel }) {
  const bg = tone === "primary" ? "bg-[#1B4D2E]" : "bg-[#A8BCA8]"
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={ariaLabel}
      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90 ${bg}`}
    >
      <Icon size={13} aria-hidden="true" />
    </button>
  )
}

function Avatar({ initials, photoUrl, size = 56, onPick, uploading }) {
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

  const [editingName, setEditingName] = useState(false)
  const [fullName, setFullName] = useState("")
  const [profileError, setProfileError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

  const [showPasswordForm, setShowPasswordForm] = useState(false)
  const [passwords, setPasswords] = useState({ current_password: "", new_password: "", confirm_new_password: "" })
  const [passwordError, setPasswordError] = useState("")
  const [isChangingPassword, setIsChangingPassword] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)

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

  const startEditName = () => {
    setFullName(profile?.full_name || "")
    setProfileError("")
    setEditingName(true)
  }

  const cancelEditName = () => {
    setEditingName(false)
    setProfileError("")
  }

  const saveFullName = async () => {
    setProfileError("")
    setIsSaving(true)
    try {
      const res = await api.patch("/accounts/me/", { full_name: fullName })
      setProfile(res.data)
      updateUser(res.data)
      showToast("Profile updated successfully.", "success")
      setEditingName(false)
    } catch (err) {
      const data = err.response?.data
      setProfileError(data?.full_name?.[0] || data?.detail || "Unable to save profile. Please try again.")
    } finally {
      setIsSaving(false)
    }
  }

  const openPasswordForm = () => {
    setPasswords({ current_password: "", new_password: "", confirm_new_password: "" })
    setPasswordError("")
    setShowPasswordForm(true)
  }

  const handlePasswordSubmit = (e) => {
    e.preventDefault()
    setPasswordError("")
    if (!passwords.current_password) {
      setPasswordError("Current password is required.")
      return
    }
    if (passwords.new_password !== passwords.confirm_new_password) {
      setPasswordError("New passwords do not match.")
      return
    }
    if (passwords.new_password.length < 15) {
      setPasswordError("New password must be at least 15 characters.")
      return
    }
    setShowPwConfirm(true)
  }

  const doChangePassword = async () => {
    setShowPwConfirm(false)
    setIsChangingPassword(true)
    try {
      await api.post("/accounts/change-password/", passwords)
      setTimeout(() => { logout(); navigate("/login") }, 500)
    } catch (err) {
      const data = err.response?.data
      setPasswordError(data?.new_password?.[0] || data?.non_field_errors?.[0] || data?.detail || "Unable to update password.")
      setIsChangingPassword(false)
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

        <div className="grid gap-5 lg:grid-cols-[320px_1fr] items-start">
          {/* Left column: cover card + Account Information */}
          <div className="space-y-5">
            <section className={CARD}>
              <div className="h-24 bg-[#1B4D2E]" />
              <div className="px-5 pb-5 -mt-8">
                <Avatar
                  initials={initials}
                  photoUrl={profile?.profile_picture_url}
                  size={64}
                  onPick={handlePickPhoto}
                  uploading={uploadingPhoto}
                />
                <p className={`mt-3 ${MINI_LABEL}`}>Full Name</p>
                <p className="mt-1 text-[16px] font-semibold text-[#1A2B1A]">{profile?.full_name || "—"}</p>
                <p className={`mt-3 ${MINI_LABEL}`}>Role</p>
                <div className="mt-1">
                  <StatusPill tone={profile?.role === "ADMIN" ? "green" : "teal"}>{roleLabel}</StatusPill>
                </div>
              </div>
            </section>

            <section className={CARD}>
              <div className={CARD_HEADER}><p className={CARD_HEADER_TEXT}>Account Information</p></div>
              <div className="px-5">
                <ReadOnlyRow label="Email Address" value={profile?.email} />
                <ReadOnlyRow label="Username" value={profile?.username} />
                <ReadOnlyRow label="Date Joined" value={formatDate(profile?.date_joined)} />
                <div className="flex items-center gap-1.5 py-3">
                  <div>
                    <p className={MINI_LABEL}>Status</p>
                    <p className="mt-1 flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                      <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" aria-hidden="true" />
                      {profile?.is_active ? "Active" : "Inactive"}
                    </p>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right column: Profile Information + Change Password */}
          <div className="space-y-5">
            <section className={CARD}>
              <div className={CARD_HEADER}><p className={CARD_HEADER_TEXT}>Profile Information</p></div>
              <div className="px-5">
                {editingName ? (
                  <div className="py-3 border-b border-[#F0F4F0]">
                    <FormLabel hideIndicator className={`${MINI_LABEL} mb-1.5 block`}>Full Name</FormLabel>
                    <div className="flex items-center gap-2">
                      <input
                        autoFocus
                        className={baseInputClasses}
                        type="text"
                        value={fullName}
                        onChange={(e) => setFullName(e.target.value)}
                      />
                      {isSaving ? (
                        <Loader2 size={16} className="shrink-0 animate-spin text-[#1B4D2E]" aria-hidden="true" />
                      ) : (
                        <>
                          <IconButton icon={Check} onClick={saveFullName} aria-label="Save full name" />
                          <IconButton icon={X} onClick={cancelEditName} tone="muted" aria-label="Cancel" />
                        </>
                      )}
                    </div>
                    {profileError && <p className="mt-1.5 text-[12px] font-medium text-rose-600">{profileError}</p>}
                  </div>
                ) : (
                  <div className="flex items-center justify-between py-3 border-b border-[#F0F4F0]">
                    <div>
                      <p className={MINI_LABEL}>Full Name</p>
                      <p className="mt-1 text-[13px] text-[#1A2B1A]">{profile?.full_name || "—"}</p>
                    </div>
                    <IconButton icon={Edit} onClick={startEditName} aria-label="Edit full name" />
                  </div>
                )}
                <ReadOnlyRow label="Email Address" value={profile?.email} />
                <ReadOnlyRow label="Username" value={profile?.username} />
                <ReadOnlyRow label="Role" value={roleLabel} />
                <ReadOnlyRow label="Date Joined" value={formatDate(profile?.date_joined)} />
              </div>
            </section>

            <section className={CARD}>
              <div className={CARD_HEADER}><p className={CARD_HEADER_TEXT}>Change Password</p></div>
              <div className="px-5 py-4">
                {!showPasswordForm ? (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-start gap-3">
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                        style={{ backgroundColor: "var(--color-cz-warn-accent)" }}
                      >
                        <KeyRound size={16} className="text-white" aria-hidden="true" />
                      </div>
                      <div>
                        <p className="text-[13px] font-semibold text-[#1A2B1A]">Update your login password</p>
                        <p className="mt-0.5 max-w-md text-[12px] leading-[1.5] text-[#7A8E7A]">
                          You will be asked to confirm your current password first. This is the voluntary change flow — separate from the forced first-login reset.
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={openPasswordForm}
                      className="press-scale shrink-0 rounded-[var(--radius-sm)] px-4 py-2 text-[13px] font-medium text-white transition-opacity hover:opacity-90"
                      style={{ backgroundColor: "var(--color-cz-warn-accent)" }}
                    >
                      Change
                    </button>
                  </div>
                ) : (
                  <form onSubmit={handlePasswordSubmit}>
                    <div className="space-y-4">
                      <div>
                        <FormLabel hideIndicator>Current Password</FormLabel>
                        <input
                          autoComplete="current-password"
                          className={baseInputClasses}
                          type="password"
                          value={passwords.current_password}
                          onChange={(e) => setPasswords((p) => ({ ...p, current_password: e.target.value }))}
                        />
                      </div>
                      <div className="grid gap-4 sm:grid-cols-2">
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
                      </div>
                      {passwords.new_password && <PasswordRequirementChecklist password={passwords.new_password} />}
                    </div>

                    {passwordError && (
                      <p className="mt-3 rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
                        {passwordError}
                      </p>
                    )}

                    <div className="mt-4 flex justify-end gap-3">
                      <Button onClick={() => setShowPasswordForm(false)} type="button" variant="ghost">Cancel</Button>
                      <button
                        type="submit"
                        disabled={isChangingPassword}
                        className="press-scale flex h-10 items-center justify-center gap-2 rounded-[var(--radius-sm)] px-4 text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                        style={{ backgroundColor: "var(--color-cz-warn-accent)" }}
                      >
                        {isChangingPassword && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                        Update Password
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </section>
          </div>
        </div>
      </PageLayout>

      {showPwConfirm && (
        <ConfirmDialog
          title="Change Password"
          message="Your current session will end after the password is changed and you will need to log in again."
          confirmLabel="Change Password"
          onConfirm={doChangePassword}
          onCancel={() => setShowPwConfirm(false)}
        />
      )}
    </>
  )
}

export default ProfilePage
