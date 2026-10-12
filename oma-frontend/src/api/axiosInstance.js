import axios from 'axios'
import { isAuthEndpoint } from '../utils/authRequests.js'
import { createSessionRefresher, shouldRefreshAfter401 } from './refreshSession.js'

const BASE_URL = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api'

const api = axios.create({
  baseURL: BASE_URL,
})

// Plain axios (not `api`) so a failing refresh cannot trigger the interceptor below again.
const refreshSession = createSessionRefresher({
  storage: localStorage,
  post: async (refresh) => (await axios.post(`${BASE_URL}/accounts/token/refresh/`, { refresh })).data,
})

api.interceptors.request.use((config) => {
  const accessToken = localStorage.getItem('accessToken')

  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }

  return config
})

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config

    if (error.response?.status === 401 && !originalRequest._retry && !isAuthEndpoint(originalRequest.url)) {
      originalRequest._retry = true

      try {
        // A refresh may already have finished while this request was in flight; then just send it again.
        const currentAccess = localStorage.getItem('accessToken')
        const accessToken = shouldRefreshAfter401(originalRequest.headers?.Authorization, currentAccess)
          ? await refreshSession()
          : currentAccess
        originalRequest.headers.Authorization = `Bearer ${accessToken}`

        return api(originalRequest)
      } catch (refreshError) {
        localStorage.clear()
        window.location.href = '/login'
        return Promise.reject(refreshError)
      }
    }

    return Promise.reject(error)
  },
)

export default api
