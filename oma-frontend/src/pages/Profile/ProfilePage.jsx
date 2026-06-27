import { useEffect, useState } from "react"
import { Edit } from "lucide-react"
import { useNavigate } from "react-router-dom"
import PageLayout from "../../components/Layout/PageLayout.jsx"
import Button from "../../components/UI/Button.jsx"
import ConfirmDialog from "../../components/UI/ConfirmDialog.jsx"
import StatusPill from "../../components/UI/StatusPill.jsx"
import { baseInputClasses } from "../../components/UI/FormField.jsx"
import api from "../../api/axiosInstance.js"
import { useAuth } from "../../context/AuthContext.jsx"
import { useToast } from "../../context/ToastContext.jsx"

const labelCls = "block text-xs font-medium text-slate-600"

function ProfilePage() {
  const { updateUser, logout } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()

  const [profile, setProfile] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  const [isEditing, setIsEditing] = useState(false)
  const [form, setForm] = useState({ full_name: "", email: "", contact_number: "" })
  const [passwords, setPasswords] = useState({
    current_password: "",
    new_password: "",
    confirm_new_password: "",
  })
  const [profileError, setProfileError] = useState("")
  const [passwordError, setPasswordError] = useState("")
  const [isSaving, setIsSaving] = useState(false)
  const [showPwConfirm, setShowPwConfirm] = useState(false)

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.get("/accounts/me/")
        setProfile(res.data)
        setForm({
          full_name: res.data.full_name || "",
          email: res.data.email || "",
          contact_number: res.data.contact_number || "",
        })
      } catch {
        // profile remains null
      } finally {
        setIsLoading(false)
      }
    }
    fetchProfile()
  }, [])

  const handleStartEdit = () => {
    setPasswords({ current_password: "", new_password: "", confirm_new_password: "" })
    setProfileError("")
    setPasswordError("")
    setIsEditing(true)
  }

  const handleCancel = () => {
    setForm({
      full_name: profile?.full_name || "",
      email: profile?.email || "",
      contact_number: profile?.contact_number || "",
    })
    setPasswords({ current_password: "", new_password: "", confirm_new_password: "" })
    setProfileError("")
    setPasswordError("")
    setIsEditing(false)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setProfileError("")
    setPasswordError("")

    const isChangingPw = passwords.new_password.trim() !== ""

    if (isChangingPw) {
      if (!passwords.current_password) {
        setPasswordError("Current password is required to set a new password.")
        return
      }
      if (passwords.new_password !== passwords.confirm_new_password) {
        setPasswordError("New passwords do not match.")
        return
      }
      if (passwords.new_password.length < 8) {
        setPasswordError("New password must be at least 8 characters.")
        return
      }
      // Show confirm dialog before proceeding with password change
      setShowPwConfirm(true)
      return
    }

    await doSave(false)
  }

  const doSave = async (isChangingPw) => {
    setShowPwConfirm(false)
    setIsSaving(true)
    try {
      const res = await api.patch("/accounts/me/", form)
      setProfile(res.data)
      setForm({
        full_name: res.data.full_name || "",
        email: res.data.email || "",
        contact_number: res.data.contact_number || "",
      })
      updateUser(res.data)

      if (isChangingPw) {
        try {
          await api.post("/accounts/change-password/", passwords)
          setTimeout(() => { logout(); navigate("/login") }, 500)
          return
        } catch (err) {
          const data = err.response?.data
          setPasswordError(
            data?.non_field_errors?.[0] ||
            data?.detail ||
            "Profile saved, but unable to update password."
          )
          setIsSaving(false)
          return
        }
      } else {
        showToast("Profile updated successfully.", "success")
      }

      setIsEditing(false)
      setPasswords({ current_password: "", new_password: "", confirm_new_password: "" })
    } catch (err) {
      const data = err.response?.data
      setProfileError(
        data?.email?.[0] ||
        data?.full_name?.[0] ||
        data?.non_field_errors?.[0] ||
        data?.detail ||
        "Unable to save profile. Please try again."
      )
    } finally {
      setIsSaving(false)
    }
  }

  const initials = profile?.full_name
    ? profile.full_name
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0].toUpperCase())
        .join("")
    : "?"

  if (isLoading) {
    return (
      <PageLayout title="My Profile" subtitle="View and update your account information">
        <div className="flex min-h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-100 border-t-green-600" />
        </div>
      </PageLayout>
    )
  }

  return (
    <>
    <PageLayout title="My Profile" subtitle="View and update your account information">
      <div className="mx-auto max-w-2xl">
        <section className="rounded-2xl border border-slate-100 bg-white p-6">
          {/* Avatar + name + role + edit button */}
          <div className="mb-6 flex items-start justify-between">
            <div className="flex items-center gap-4">
              <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[#1E4620] text-lg font-semibold text-white">
                {initials}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {profile?.full_name || "—"}
                </p>
                <div className="mt-1">
                  <StatusPill tone={profile?.role === "ADMIN" ? "green" : "blue"}>
                    {profile?.role === "ADMIN" ? "Admin" : "Evaluator"}
                  </StatusPill>
                </div>
              </div>
            </div>
            {!isEditing && (
              <Button icon={Edit} onClick={handleStartEdit} type="button" variant="outline">
                Edit Profile
              </Button>
            )}
          </div>

          <form className="space-y-4" onSubmit={handleSave}>
            {/* Profile fields */}
            <div>
              {isEditing ? (
                <>
                  <label className={labelCls}>Full Name</label>
                  <input
                    className={`${baseInputClasses} mt-1`}
                    type="text"
                    value={form.full_name}
                    onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                  />
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-400">Full Name</p>
                  <p className="mt-1 text-sm text-slate-900">{profile?.full_name || "—"}</p>
                </>
              )}
            </div>

            <div>
              {isEditing ? (
                <>
                  <label className={labelCls}>Email Address</label>
                  <input
                    className={`${baseInputClasses} mt-1`}
                    required
                    type="email"
                    value={form.email}
                    onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  />
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-400">Email Address</p>
                  <p className="mt-1 text-sm text-slate-900">{profile?.email || "—"}</p>
                </>
              )}
            </div>

            <div>
              {isEditing ? (
                <>
                  <label className={labelCls}>Contact Number</label>
                  <input
                    className={`${baseInputClasses} mt-1`}
                    type="text"
                    value={form.contact_number}
                    onChange={(e) => setForm((f) => ({ ...f, contact_number: e.target.value }))}
                  />
                </>
              ) : (
                <>
                  <p className="text-xs font-medium text-slate-400">Contact Number</p>
                  <p className="mt-1 text-sm text-slate-900">{profile?.contact_number || "—"}</p>
                </>
              )}
            </div>

            {/* Change Password — only shown in edit mode */}
            {isEditing && (
              <>
                <div className="border-t border-slate-100 pt-5">
                  <p className="mb-1 text-xs font-medium uppercase tracking-wide text-slate-400">
                    Change Password
                  </p>
                  <p className="mb-4 text-xs text-slate-400">
                    Leave blank to keep your current password.
                  </p>

                  <div className="space-y-4">
                    <div>
                      <label className={labelCls} htmlFor="cp_current">
                        Current Password
                      </label>
                      <input
                        autoComplete="current-password"
                        className={`${baseInputClasses} mt-1`}
                        id="cp_current"
                        type="password"
                        value={passwords.current_password}
                        onChange={(e) =>
                          setPasswords((p) => ({ ...p, current_password: e.target.value }))
                        }
                      />
                    </div>

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div>
                        <label className={labelCls} htmlFor="cp_new">
                          New Password
                        </label>
                        <input
                          autoComplete="new-password"
                          className={`${baseInputClasses} mt-1`}
                          id="cp_new"
                          type="password"
                          value={passwords.new_password}
                          onChange={(e) =>
                            setPasswords((p) => ({ ...p, new_password: e.target.value }))
                          }
                        />
                      </div>

                      <div>
                        <label className={labelCls} htmlFor="cp_confirm">
                          Confirm New Password
                        </label>
                        <input
                          autoComplete="new-password"
                          className={`${baseInputClasses} mt-1`}
                          id="cp_confirm"
                          type="password"
                          value={passwords.confirm_new_password}
                          onChange={(e) =>
                            setPasswords((p) => ({ ...p, confirm_new_password: e.target.value }))
                          }
                        />
                      </div>
                    </div>
                  </div>
                </div>

                {passwordError && (
                  <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                    {passwordError}
                  </p>
                )}
              </>
            )}

            {profileError && (
              <p className="rounded-xl bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700">
                {profileError}
              </p>
            )}

            {isEditing && (
              <div className="flex justify-end gap-3 border-t border-slate-100 pt-4">
                <Button onClick={handleCancel} type="button" variant="ghost">
                  Cancel
                </Button>
                <Button isLoading={isSaving} type="submit" variant="primary">
                  Save Changes
                </Button>
              </div>
            )}
          </form>
        </section>
      </div>
    </PageLayout>

    {showPwConfirm && (
      <ConfirmDialog
        title="Change Password"
        message="Your current session will end after the password is changed and you will need to log in again."
        confirmLabel="Change Password"
        onConfirm={() => doSave(true)}
        onCancel={() => setShowPwConfirm(false)}
      />
    )}
    </>
  )
}

export default ProfilePage
