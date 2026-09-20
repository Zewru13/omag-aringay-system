import { Navigate, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'

function ProtectedRoute({ allowedRoles, children }) {
  const { user, isLoading, isAuthenticated } = useAuth()
  const location = useLocation()

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-slate-600">
        Loading...
      </div>
    )
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }

  // Forced first-login password change: block every other route until the
  // user sets a new password. Applies to every role now — ADMIN/EVALUATOR
  // accounts get a system temp password relayed by email (UserCreateView);
  // CITIZEN accounts (Farmer/Fisherfolk/Organization alike) get a
  // staff-relayed one-time password from SetCitizenPasswordView's "Set Up
  // Account" flow — both are a password someone other than the account's
  // owner initially knew, so both are forced to replace it before doing
  // anything else. must_change_password is only ever set on that first
  // activation (see SetCitizenPasswordView's own comment) — a later
  // credential reissue (RegenerateCitizenPasswordView) does not set it, so
  // this never re-fires after the first successful login. The
  // /change-password route itself is exempt so it can actually render.
  if (user.must_change_password && location.pathname !== '/change-password') {
    return <Navigate to="/change-password" replace />
  }

  if (allowedRoles?.length && !allowedRoles.includes(user.role)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-6">
        <div className="max-w-md rounded-lg border border-red-200 bg-white p-6 text-center shadow-sm">
          <h1 className="text-2xl font-semibold text-red-700">Access Denied</h1>
          <p className="mt-3 text-slate-700">
            Access Denied — You do not have permission to view this page.
          </p>
        </div>
      </div>
    )
  }

  return children
}

export default ProtectedRoute
