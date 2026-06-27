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
      throw new Error(message)
    }
  }

  const logout = async () => {
    const refreshToken = localStorage.getItem('refreshToken')

    try {
      if (refreshToken) {
        await api.post('/accounts/logout/', {
          refresh: refreshToken,
        })
      }
    } finally {
      localStorage.clear()
      setUser(null)
    }
  }

  const updateUser = useCallback((updatedUser) => {
    setUser(updatedUser)
  }, [])

  const value = useMemo(() => ({
    user,
    isLoading,
    login,
    logout,
    updateUser,
    isAdmin: user?.role === 'ADMIN',
    isEvaluator: user?.role === 'EVALUATOR',
    isAuthenticated: Boolean(user),
  }), [user, isLoading, updateUser])

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
