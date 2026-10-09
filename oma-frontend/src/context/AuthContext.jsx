import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import api from '../api/axiosInstance.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const restoreSession = async () => {
      const accessToken = localStorage.getItem('accessToken')
      const refreshToken = localStorage.getItem('refreshToken')

      if (!accessToken || !refreshToken) {
        setIsLoading(false)
        return
      }

      try {
        const response = await api.get('/accounts/me/')
        setUser(response.data)
      } catch {
        localStorage.clear()
        setUser(null)
      } finally {
        setIsLoading(false)
      }
    }

    restoreSession()
  }, [])

  const login = async (email, password) => {
    try {
      const response = await api.post('/accounts/login/', {
        email,
        password,
      })

      localStorage.setItem('accessToken', response.data.access)
      localStorage.setItem('refreshToken', response.data.refresh)
      setUser(response.data.user)

      return response.data.user
    } catch (error) {
      const message = error.response?.data?.detail || 'Invalid email or password.'
      const wrapped = new Error(message)
      // Lets LoginPage distinguish "email not verified" (with a resend
      // action) from a plain wrong-password/no-account error.
      wrapped.code = error.response?.data?.code
      // undefined when the server never answered (network down); lets LoginPage tell a server fault
      // from a wrong password.
      wrapped.status = error.response?.status
      throw wrapped
    }
  }

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')

    try {
      if (refreshToken) {
        // Best-effort: the token may already be dead server-side (e.g. this
        // account was just deactivated or its password just changed), in
        // which case blacklisting fails harmlessly — we clear local state
        // and redirect either way.
        await api.post('/accounts/logout/', {
          refresh: refreshToken,
        })
      }
    } catch {
      // ignore — local logout still proceeds below
    } finally {
      localStorage.clear()
      setUser(null)
    }
  }

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser)
  }, [])

  const value = useMemo(() => {
    const isOrgAccount = user?.role === 'CITIZEN'
      && (user?.linked_record_type === 'FARMERS_ORG' || user?.linked_record_type === 'FISHERFOLK_ORG')
    return {
    user,
    isLoading,
    login,
    logout,
    updateUser,
    isAdmin: user?.role === 'ADMIN',
    isEvaluator: user?.role === 'EVALUATOR',
    isCitizen: user?.role === 'CITIZEN',
    // A citizen account linked to a Fisherfolk record: uses the Admin Fisheries pages, with the backend
    // limiting every response to their own records.
    isFisherfolk: user?.role === 'CITIZEN' && user?.linked_record_type === 'FISHERFOLK',
    // A citizen account linked to a Farmer record: uses the Admin crop pages, with the backend limiting every
    // response to their own records (accounts/permissions.py farmer_scope).
    isFarmer: user?.role === 'CITIZEN' && user?.linked_record_type === 'FARMER',
    // A citizen account linked to an Organization (farmers' or fisherfolk): uses the Admin pages in an
    // "own organization" mode, with the backend limiting every response to that organization.
    isOrg: isOrgAccount,
    orgType: isOrgAccount ? user.linked_record_type : null,
    isFisherfolkOrg: isOrgAccount && user.linked_record_type === 'FISHERFOLK_ORG',
    isAuthenticated: Boolean(user),
    }
  }, [user, isLoading, updateUser])

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider')
  }

  return context
}
