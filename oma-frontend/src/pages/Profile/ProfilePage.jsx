import { useEffect, useRef, useState } from "react"
import { Camera, Edit, KeyRound, Loader2, Lock, X } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import Button from "../../components/UI/Button.jsx"
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx"
import PasswordRequirementChecklist from "../../components/UI/PasswordRequirementChecklist.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import Tabs from "../../components/UI/Tabs.jsx"
import { baseInputClasses, FormLabel } from "../../components/UI/FormField.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"
import { useToast } from "../../context/ToastContext.jsx"

// Rebuilt against the reference (PROFILE BASIS.docx images 1-4): a resting
// two-column view (cover card + a single Account Details card, not the
// previous inline-edit-in-place form) and an Edit Profile modal with
// Profile Info / Change Password tabs. Desktop only — no phone mockup
// exists for this account type.

function formatDate(value) {
  if (!value) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric", year: "numeric" }).format(new Date(value))
}

function ReadOnlyRow({ label, value, readOnly = true }) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-[#F0F4F0] last:border-0">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#A8BCA8]">{label}</p>
        <p className="mt-1 text-[13px] text-[#1A2B1A]">{value || "—"}</p>
      </div>
      {readOnly && (
        <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-[#A8BCA8]">
          <Lock size={11} aria-hidden="true" /> Read-only
        </span>
      )}
    </div>
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

  const [showModal, setShowModal] = useState(false)
  const [activeTab, setActiveTab] = useState("info")
  const [fullName, setFullName] = useState("")
  const [profileError, setProfileError] = useState("")
  const [isSaving, setIsSaving] = useState(false)

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

  const openEdit = () => {
    setFullName(profile?.full_name || "")
    setActiveTab("info")
    setProfileError("")
    setPasswordError("")
    setPasswords({ current_password: "", new_password: "", confirm_new_password: "" })
    setShowModal(true)
  }

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

  const handleSaveInfo = async () => {
    setProfileError("")
    setIsSaving(true)
    try {
      const res = await api.patch("/accounts/me/", { full_name: fullName })
      setProfile(res.data)
      updateUser(res.data)
      showToast("Profile updated successfully.", "success")
      setShowModal(false)
    } catch (err) {
      const data = err.response?.data
      setProfileError(data?.full_name?.[0] || data?.detail || "Unable to save profile. Please try again.")
    } finally {
      setIsSaving(false)
    }
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
          {/* Cover card */}
          <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="h-24 bg-[#1B4D2E]" />
            <div className="px-5 pb-5 -mt-8">
              <Avatar
                initials={initials}
                photoUrl={profile?.profile_picture_url}
                size={64}
                onPick={handlePickPhoto}
                uploading={uploadingPhoto}
              />
              <p className="mt-3 text-[16px] font-semibold text-[#1A2B1A]">{profile?.full_name || "—"}</p>
              <div className="mt-2">
                <StatusPill tone={profile?.role === "ADMIN" ? "green" : "teal"}>{roleLabel}</StatusPill>
              </div>
              <div className="mt-4 flex items-center gap-1.5 border-t border-[#F0F4F0] pt-3 text-[13px] font-medium text-emerald-600">
                <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" aria-hidden="true" />
                {profile?.is_active ? "Active" : "Inactive"}
              </div>
            </div>
          </section>

          {/* Account Details card */}
          <section className="rounded-xl border border-[#E2E8E2] bg-white shadow-[0_1px_3px_rgba(0,0,0,0.04)] overflow-hidden">
            <div className="flex items-center justify-between px-5 py-3.5 bg-[#EBF5EE] border-b border-[#E2E8E2]">
              <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[#1B4D2E]">Account Details</p>
            </div>
            <div className="px-5">
              <ReadOnlyRow label="Full Name" value={profile?.full_name} readOnly={false} />
              <ReadOnlyRow label="Email Address" value={profile?.email} />
              <ReadOnlyRow label="Username" value={profile?.username} />
              <ReadOnlyRow label="Role" value={roleLabel} />
              <ReadOnlyRow label="Date Joined" value={formatDate(profile?.date_joined)} />
            </div>
            <div className="flex items-center justify-between px-5 py-4 border-t border-[#F0F4F0]">
              <div className="flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" aria-hidden="true" />
                Status: {profile?.is_active ? "Active" : "Inactive"}
              </div>
              <Button icon={Edit} onClick={openEdit} type="button" variant="outline">
                Edit Profile
              </Button>
            </div>
          </section>
        </div>
      </PageLayout>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setShowModal(false)}>
          <div
            className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-xl bg-white shadow-[var(--shadow-modal)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between bg-[#1B4D2E] px-6 py-5">
              <div>
                <h2 className="text-[16px] font-semibold text-white">Edit Profile</h2>
                <p className="mt-0.5 text-[12.5px] text-[#C8E6D0]">{profile?.full_name} · {roleLabel}</p>
              </div>
              <button
                type="button"
                onClick={() => setShowModal(false)}
                className="rounded-md p-1 text-white/80 transition-colors hover:bg-white/10 hover:text-white"
                aria-label="Close"
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <Tabs
              tabs={[{ value: "info", label: "Profile Info" }, { value: "password", label: "Change Password" }]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />

            {activeTab === "info" ? (
              <div className="px-6 py-5">
                <div className="flex items-center gap-4">
                  <Avatar
                    initials={initials}
                    photoUrl={profile?.profile_picture_url}
                    size={56}
                    onPick={handlePickPhoto}
                    uploading={uploadingPhoto}
                  />
                  <div>
                    <p className="text-[13px] font-semibold text-[#1A2B1A]">Profile Photo</p>
                    <p className="mt-0.5 text-[12px] text-[#7A8E7A]">Click the camera to upload a new photo</p>
                  </div>
                </div>

                <div className="mt-5">
                  <FormLabel hideIndicator>Full Name</FormLabel>
                  <input
                    className={baseInputClasses}
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                  />
                </div>

                <div className="mt-4 rounded-lg bg-[#F9FAF9] border border-[#F0F4F0] px-4">
                  <ReadOnlyRow label="Email Address" value={profile?.email} />
                  <ReadOnlyRow label="Username" value={profile?.username} />
                  <ReadOnlyRow label="Role" value={roleLabel} />
                  <ReadOnlyRow label="Date Joined" value={formatDate(profile?.date_joined)} />
                </div>

                <div className="mt-4 flex items-center gap-1.5 text-[13px] font-medium text-emerald-600">
                  <span className="h-[7px] w-[7px] rounded-full bg-emerald-500" aria-hidden="true" />
                  Account {profile?.is_active ? "Active" : "Inactive"}
                </div>

                {profileError && (
                  <p className="mt-3 rounded-lg bg-[#FEE2E2] border border-[#FCA5A5] px-3 py-2 text-[13px] font-medium text-[#991B1B]">
                    {profileError}
                  </p>
                )}

                <div className="mt-5 flex justify-end gap-3 border-t border-[#F0F4F0] pt-4">
                  <Button onClick={() => setShowModal(false)} type="button" variant="ghost">Cancel</Button>
                  <Button isLoading={isSaving} onClick={handleSaveInfo} type="button" variant="primary">Save Changes</Button>
                </div>
              </div>
            ) : (
              <form className="px-6 py-5" onSubmit={handlePasswordSubmit}>
                <div className="flex items-start gap-3 rounded-lg bg-[#F9FAF9] border border-[#F0F4F0] px-4 py-3.5">
                  <div
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                    style={{ backgroundColor: "var(--color-cz-warn-accent)" }}
                  >
                    <KeyRound size={16} className="text-white" aria-hidden="true" />
                  </div>
                  <div>
                    <p className="text-[13px] font-semibold text-[#1A2B1A]">Voluntary password change</p>
                    <p className="mt-0.5 text-[12px] leading-[1.5] text-[#7A8E7A]">
                      Confirm your current password first. This is separate from the forced first-login reset.
                    </p>
                  </div>
                </div>

                <div className="mt-4 space-y-4">
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

                <button
                  type="submit"
                  disabled={isChangingPassword}
                  className="press-scale mt-5 flex h-11 w-full items-center justify-center gap-2 rounded-[var(--radius-sm)] text-[13px] font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  style={{ backgroundColor: "var(--color-cz-warn-accent)" }}
                >
                  {isChangingPassword && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
                  Update Password
                </button>
              </form>
            )}
          </div>
        </div>
      )}

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
